'use strict';
// v1532 — « AN INTERNAL ERROR WAS ENCOUNTERED IN THE INDEXED DATABASE SERVER », SUITE ET FIN DU MALENTENDU.
// Ben, capture du journal « Santé de l'app » (16/11 00:07, écran calendrier, v1531) : « entretien reporté » 2×, « GLOBAL promesse » 2×,
// « majLiensTrace » 4× — toutes avec ce même message, toutes rangées en « mineur — affichage, rendu ». « À toi de faire le nécessaire. »
//
// CAUSE : la v1520 rouvrait la base et rejouait UNE fois, AUSSITÔT. Après une longue veille, le serveur IndexedDB d'iOS (processus séparé)
// met quelques secondes à revenir : la connexion neuve tombait sur le même serveur encore en panne → échec quand même. Le journal lui-même le
// prouve : ces incidents ont été ÉCRITS en base quelques secondes après — la panne était passagère, la reprise trop pressée.
// Deux autres trous : la sonde de réveil ouvrait une transaction VIDE (qui aboutit même serveur en panne : elle ne voyait rien) ; et une
// promesse rejetée d'origine inconnue venant de la base était classée « mineure » alors qu'elle peut être une écriture perdue.
//
// CORRECTIFS : ① reprises ESPACÉES (immédiate, +0,4 s, +1,2 s, +2,5 s), connexion neuve à chaque fois ; ② écritures IDEMPOTENTES rejouées
// (update, delete, bulkDelete, clear, put/bulkPut AVEC clé) — jamais add/bulkAdd ni put sans clé (doublon) ; ③ sonde de réveil = vraie
// lecture, et les opérations l'ATTENDENT ; ④ panne durable → évènement « panne » → bandeau « Recharger » + UNE trace importante ;
// « retablie » efface le bandeau ; ⑤ « GLOBAL » + message de base → important ; ⑥ l'écran santé montre où l'erreur est née (pile).
//
// PREUVE PAR MUTATION : les sections dexie sont rejouées contre la v1531 d'origine (env SM_DEXIE) — elles doivent y échouer.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeFakeIndexedDB } = require('./_fakeidb');
const { APP, extractFunction } = require('./_extract');

const DEXIE_PATH = process.env.SM_DEXIE || path.join(__dirname, '..', 'dexie.min.js');
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
const attendre = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT ' + (ms || 3000) + ' ms')), ms || 3000))]);
const MSG = 'An internal error was encountered in the Indexed Database server';
const erreurInterne = () => new DOMException(MSG, 'UnknownError');

// ---------- Faux IndexedDB PERSISTANT, avec un « serveur » qui peut être en panne pour TOUTES les connexions ----------
// etat.panne = nombre de transactions à venir (toutes connexions confondues, neuves comprises) dont CHAQUE requête échouera avec l'erreur
// interne — exactement ce que fait iOS tant que son serveur IndexedDB n'est pas revenu. -1 = panne permanente.
function chargerDexie(chemin){
  const base = makeFakeIndexedDB(); const stockage = new Map(); const conns = [];
  const etat = { opens: 0, closes: 0, panne: 0, txEnPanne: 0, txTotal: 0, creationPanne: 0 };
  const indexedDB = { open(name, ver){
    etat.opens++;
    const req = base.open(name, ver);
    req._succeed = idb => {
      if(stockage.has(name)) idb._tables = stockage.get(name); else stockage.set(name, idb._tables);
      idb.close = () => { etat.closes++; idb._ferme = true; };
      const txOrig = idb.transaction.bind(idb);
      idb.transaction = (s, m) => {
        etat.txTotal++;
        if(etat.creationPanne > 0){ etat.creationPanne--; throw erreurInterne(); }
        const tx = txOrig(s, m);
        if(etat.panne !== 0){
          if(etat.panne > 0) etat.panne--;
          etat.txEnPanne++;
          tx.objectStore = () => {
            // comme une vraie IndexedDB : la requête échoue, l'erreur remonte à la transaction, qui avorte (rien n'est écrit)
            const fausse = () => { const r = { onsuccess: null, onerror: null, error: erreurInterne() };
              queueMicrotask(() => { if(r.onerror) r.onerror({ target: r }); if(!tx._finished){ tx.error = r.error; tx._emit('error'); tx.abort(); } }); return r; };
            return { get: fausse, getAll: fausse, count: fausse, put: fausse, add: fausse, delete: fausse, clear: fausse };
          };
        }
        return tx;
      };
      conns.push(idb);
      req.result = idb; queueMicrotask(() => { if(req.onsuccess) req.onsuccess({ target: req }); });
    };
    return req;
  } };
  const src = fs.readFileSync(chemin, 'utf8');
  const sandboxSelf = { indexedDB, DOMException, WeakMap, WeakSet, console, setTimeout, clearTimeout, queueMicrotask };
  const sandbox = { self: sandboxSelf, indexedDB, WeakMap, WeakSet, DOMException, console, setTimeout, clearTimeout, queueMicrotask };
  vm.createContext(sandbox); vm.runInContext(src, sandbox, { filename: chemin });
  return { Dexie: sandboxSelf.Dexie, etat, conns };
}
async function monde(){
  const w = chargerDexie(DEXIE_PATH);
  const db = new w.Dexie('sm_test');
  db.version(1).stores({ recipes: '++id, name', auditLog: '++id, ts' });
  db._reprisesMs = [20, 40, 60];               // mêmes paliers, en accéléré
  await db.recipes.count();
  await db.recipes.add({ name: 'a' }); await db.recipes.add({ name: 'b' });
  const evts = { panne: 0, retablie: 0 };
  try{ db.on('panne', () => { evts.panne++; }); db.on('retablie', () => { evts.retablie++; }); }catch(_){}
  return Object.assign(w, { db, evts, base: w.etat.opens });
}
const delta = w => w.etat.opens - w.base;

(async () => {
  // ---------- A. LA PANNE DE BEN : serveur en panne quelques instants, connexions neuves comprises ----------
  {
    const w = await monde(); w.etat.panne = 3;   // 1re tentative + 2 reprises tombent encore dans la panne
    const r = await attendre(w.db.recipes.toArray()).catch(e => e);
    check('A. lecture (toArray) pendant une panne passagère de 3 transactions : elle ABOUTIT au lieu d\'échouer', Array.isArray(r) && r.length === 2);
    check('A. une connexion NEUVE à chaque reprise (3 réouvertures), anciennes refermées', delta(w) === 3 && w.etat.closes === 3);
    check('A. aucune panne annoncée pour une panne passagère', w.evts.panne === 0);
  }
  {
    const w = await monde(); w.etat.panne = 2;
    const t0 = Date.now(); const n = await attendre(w.db.recipes.count()).catch(e => e); const dt = Date.now() - t0;
    check('A. les reprises sont ESPACÉES (paliers respectés : ≥ 20 ms avant la 2e reprise), pas enchaînées aussitôt', n === 2 && dt >= 18);
  }
  {
    const w = await monde(); w.etat.panne = 3;   // le cas exact de majLiensTrace : db.orderItems.toArray() → ici where/orderBy (_all)
    const r = await attendre(w.db.recipes.orderBy('name').toArray()).catch(e => e);
    check('A. une lecture par collection (orderBy/where → _all) survit aussi', Array.isArray(r) && r.length === 2 && r[0].name === 'a');
    w.etat.panne = 3;
    const k = await attendre(w.db.auditLog.orderBy('ts').limit(5).primaryKeys()).catch(e => e);
    check('A. le chemin de la rétention (orderBy().limit().primaryKeys(), « entretien reporté ») survit aussi', Array.isArray(k) && k.length === 0);
  }

  // ---------- B. Écritures : idempotentes rejouées, non-idempotentes JAMAIS ----------
  const idempotentes = [
    ['update', db => db.recipes.update(1, { name: 'u' }), async db => (await db.recipes.get(1)).name === 'u' && (await db.recipes.count()) === 2],
    ['delete', db => db.recipes.delete(1), async db => (await db.recipes.count()) === 1],
    ['put AVEC clé', db => db.recipes.put({ id: 2, name: 'p' }), async db => (await db.recipes.get(2)).name === 'p' && (await db.recipes.count()) === 2],
    ['bulkDelete', db => db.recipes.bulkDelete([1, 2]), async db => (await db.recipes.count()) === 0],
    ['clear', db => db.recipes.clear(), async db => (await db.recipes.count()) === 0],
    ['bulkPut AVEC clés', db => db.recipes.bulkPut([{ id: 1, name: 'x' }, { id: 7, name: 'y' }]), async db => (await db.recipes.count()) === 3 && (await db.recipes.get(7)).name === 'y']
  ];
  for(const [nom, op, verif] of idempotentes){
    const w = await monde(); w.etat.panne = 2;
    const r = await attendre(op(w.db)).catch(e => e);
    check(`B. ${nom} pendant une panne passagère : rejoué jusqu'au succès, état final juste et unique`, !(r instanceof Error) && await verif(w.db));
  }
  const nonIdem = [
    ['add', db => db.recipes.add({ name: 'n' })],
    ['bulkAdd', db => db.recipes.bulkAdd([{ name: 'n' }])],
    ['put SANS clé (clé auto)', db => db.recipes.put({ name: 'n' })]
  ];
  for(const [nom, op] of nonIdem){
    const w = await monde(); w.etat.panne = 1; const tx0 = w.etat.txTotal;
    const r = await attendre(op(w.db)).catch(e => e);
    check(`B. ${nom} : JAMAIS rejoué (une seule tentative, erreur remontée → aucun doublon possible)`, r instanceof Error && /internal error/i.test(r.message) && w.etat.txTotal - tx0 === 1 && (await w.db.recipes.count()) === 2);
  }
  {
    const hooks = chargerDexie(DEXIE_PATH).Dexie._internalTestHooks || {};
    const rj = hooks.rejouable || (() => null); const t = { schema: { key: 'id' } };
    check('B. table de décision : lectures et écritures idempotentes oui ; add/bulkAdd/put sans clé non',
      rj(t, 'get', []) === true && rj(t, 'update', [1, {}]) === true && rj(t, 'put', [{ id: 3 }]) === true && rj(t, 'put', [{}]) === false &&
      rj(t, 'bulkPut', [[{ id: 1 }, { id: 2 }]]) === true && rj(t, 'bulkPut', [[{ id: 1 }, {}]]) === false && rj(t, 'add', [{}]) === false && rj(t, 'bulkAdd', [[]]) === false);
    const ei = hooks.erreurInterneIdb || (() => null);
    const e = (m, n) => { const x = new Error(m); x.name = n; return x; };
    check('B. l\'erreur interne est reconnue à son MESSAGE même quand WebKit la remonte sous AbortError', ei(e(MSG, 'AbortError')) === true && ei(e(MSG, 'UnknownError')) === true && ei(e('autre', 'UnknownError')) === false && ei(null) === false);
  }

  // ---------- C. Panne DURABLE : bornée, annoncée une fois, puis rétablissement annoncé ----------
  {
    const w = await monde(); w.etat.panne = -1; const tx0 = w.etat.txTotal;
    const t0 = Date.now(); const err = await attendre(w.db.recipes.toArray()).catch(e => e); const dt = Date.now() - t0;
    check('C. panne permanente : l\'opération finit par échouer (pas de boucle infinie)', err instanceof Error && /internal error/i.test(err.message) && dt < 2000);
    check('C. nombre de tentatives BORNÉ : 1 + 4 reprises = 5', w.etat.txTotal - tx0 === 5);
    check('C. l\'évènement « panne » est émis UNE fois', w.evts.panne === 1);
    w.etat.panne = 0;
    const r = await attendre(w.db.recipes.count()).catch(e => e);
    check('C. quand le serveur revient, l\'opération suivante réussit et « retablie » est émis (le bandeau s\'efface)', r === 2 && w.evts.retablie === 1);
    await w.db.recipes.count();
    check('C. « retablie » n\'est pas ré-émis à chaque opération', w.evts.retablie === 1);
  }
  {
    const w = await monde(); w.etat.panne = -1; const tx0 = w.etat.txTotal;
    const err = await attendre(w.db.recipes.bulkPut([{ id: 1, name: 'x' }, { id: 2, name: 'y' }]), 3000).catch(e => e);
    check('C. couches imbriquées (bulkPut → put) : les reprises ne se MULTIPLIENT pas (5 tentatives, pas 25)', err instanceof Error && w.etat.txTotal - tx0 === 5 && w.evts.panne === 1);
  }

  // ---------- D. Sonde de réveil : vraie lecture, et les écrans l'attendent ----------
  {
    const w = await monde();
    check('D. base saine : la sonde répond true, aucune réouverture', (await attendre(w.db.verifierConnexion())) === true && delta(w) === 0);
    w.etat.panne = 2;
    const r = await attendre(w.db.verifierConnexion()).catch(e => e);
    check('D. serveur en panne interne au réveil : la sonde le VOIT (une transaction vide ne le voyait pas) et rouvre (« reouverte »)', r === 'reouverte' && delta(w) >= 1 && w.etat.panne === 0);
  }
  {
    const w = await monde(); w.etat.panne = 2; const ordre = [];
    const s = w.db.verifierConnexion(); const s2 = w.db.verifierConnexion();
    const ecran = w.db.recipes.toArray().then(x => { ordre.push('ecran'); return x; });
    await attendre(s).then(() => ordre.push('sonde')).catch(() => {});
    const rows = await attendre(ecran).catch(e => e);
    check('D. plusieurs déclencheurs simultanés (visibilitychange, pageshow, focus) → UNE seule sonde', s === s2);
    check('D. un écran qui lit pendant la sonde l\'ATTEND, puis lit sur la base rétablie (aucune erreur à l\'écran)', Array.isArray(rows) && rows.length === 2 && ordre[0] === 'sonde');
    check('D. la sonde terminée, plus rien n\'attend', !w.db._sonde);
  }
  {
    const w = await monde(); w.etat.panne = 2; let appels = 0;
    const s = w.db.verifierConnexion();
    await attendre(w.db.transaction('rw', w.db.recipes, async () => { appels++; await w.db.recipes.add({ name: 't' }); })).catch(e => e);
    await s.catch(() => {});
    check('D. une transaction explicite lancée pendant la sonde l\'attend aussi : corps exécuté une fois, écriture unique', appels === 1 && (await w.db.recipes.count()) === 3);
  }

  // ---------- E. Transaction explicite : erreur interne à la CRÉATION → recréée (rien n'avait été exécuté) ----------
  {
    const w = await monde(); w.etat.creationPanne = 1; let appels = 0;
    const r = await attendre(w.db.transaction('rw', w.db.recipes, async () => { appels++; await w.db.recipes.add({ name: 't' }); })).catch(e => e);
    check('E. db.transaction() : erreur interne à la création → transaction recréée, corps exécuté UNE fois, écriture unique', !(r instanceof Error) && appels === 1 && (await w.db.recipes.count()) === 3);
  }

  // ---------- F. App : classement des incidents ----------
  {
    const ligneGrave = APP.slice(APP.indexOf('const _SM_CTX_GRAVE'), APP.indexOf('\n', APP.indexOf('const _SM_CTX_GRAVE')));
    const ligneBase = APP.indexOf('const _SM_MSG_BASE') > -1 ? APP.slice(APP.indexOf('const _SM_MSG_BASE'), APP.indexOf('\n', APP.indexOf('const _SM_MSG_BASE'))) : '';
    let g = () => null;
    try{ const fn = extractFunction('_smGravite'); g = new Function(ligneGrave + '\n' + ligneBase + '\n' + fn + '\nreturn _smGravite;')(); }catch(_){}
    check('F. « GLOBAL promesse » + erreur de base (le cas de la capture) → IMPORTANT', g('GLOBAL promesse', MSG) === 'grave');
    check('F. « GLOBAL onerror » + connexion fermée → important', g('GLOBAL onerror @app.js:1', "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.") === 'grave');
    check('F. « GLOBAL promesse » sans rapport avec la base (TypeError d\'écran) → reste mineur', g('GLOBAL promesse', "undefined is not an object (evaluating 'x.y')") === 'normal');
    check('F. majLiensTrace (lecture d\'écran) → reste mineur ; « entretien reporté » → reste non grave', g('majLiensTrace', MSG) === 'normal' && g('entretien reporté', MSG) === 'normal');
    check('F. la panne durable annoncée par la couche base → IMPORTANT', g('dexie : base indisponible après reprises', MSG) === 'grave');
    check('F. les contextes déjà graves le restent (non-régression)', g('_kvFlush', 'x') === 'grave' && g('saveOrder', 'x') === 'grave');
    check('F. swallow() transmet le message au classement', /grav: _smGravite\(ctx, msg\),/.test(APP));
  }

  // ---------- G. App : bandeau de panne, rétablissement, pile visible ----------
  {
    check('G. « panne » → trace importante + bandeau ; « retablie » → bandeau retiré',
      /db\.on\('panne', e => \{ swallow\(e, 'dexie : base indisponible après reprises'\); dbPanneBandeau\(\); \}\);/.test(APP) &&
      /db\.on\('retablie', \(\) => \{ dbPanneRetiree\(\); \}\);/.test(APP));
    // rendu réel du bandeau sur un DOM minimal
    const enfants = []; let recharge = 0;
    const mkEl = () => ({ children: [], style: {}, attrs: {}, setAttribute(k, v){ this.attrs[k] = v; }, appendChild(c){ this.children.push(c); }, remove(){ const i = enfants.indexOf(this); if(i > -1) enfants.splice(i, 1); } });
    const document = { body: { appendChild(c){ enfants.push(c); } }, createElement: () => mkEl(), getElementById: id => enfants.find(e => e.id === id) || null };
    const location = { reload(){ recharge++; } };
    let api = null;
    try{
      const src = extractFunction('dbPanneBandeau') + '\n' + extractFunction('dbPanneRetiree') + '\nreturn { dbPanneBandeau, dbPanneRetiree };';
      api = new Function('document', 'location', src)(document, location);
    }catch(_){}
    if(api){
      api.dbPanneBandeau(); api.dbPanneBandeau();
      const b = enfants[0];
      check('G. bandeau affiché UNE fois (deux pannes ne l\'empilent pas), message honnête', enfants.length === 1 && /ne répond plus/.test(b.children[0].textContent) && /en sécurité/.test(b.children[0].textContent));
      b.children[1].onclick();
      check('G. le bouton « Recharger » recharge l\'app (seul remède fiable connu de ce bug WebKit)', b.children[1].textContent === 'Recharger' && recharge === 1);
      api.dbPanneRetiree();
      check('G. rétablissement : bandeau retiré', enfants.length === 0);
    } else { check('G. bandeau extractible', false); }
    check('G. l\'écran santé montre OÙ l\'erreur est née (pile dans un dépliant)', /<summary[^>]*>où c'est arrivé<\/summary>/.test(APP) && /esc\(String\(r\.pile\)\)/.test(APP));
    check('G. APP_VERSION >= v1532', (m => !!m && +m[1] >= 1532)(APP.match(/const APP_VERSION = 'v(\d+)';/)));
    const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    check('G. cache du service worker incrémenté (sinon l\'ancien dexie.min.js resterait servi)', (m => !!m && +m[1] >= 562)(sw.match(/const CACHE = 'sm-iphone-v(\d+)'/)));
  }

  // ---------- H. Journal santé : un incident survenu pendant la panne n'est plus perdu ----------
  {
    let api = null; const minuteurs = [];
    try{
      const src = 'const _SM_ERR_QUEUE = [];\nlet _smErrFlushEnCours = false;\nlet _smErrFlushArme = false;\nconst SM_ERR_MAX_BASE = 300;\nconst SM_ERR_REPRISE_MS = 15000;\n'
        + extractFunction('_smErrFlush') + '\nreturn { _smErrFlush, q: _SM_ERR_QUEUE, arme: () => _smErrFlushArme };';
      const ecrits = []; let enPanne = true;
      const errLog = {
        where: () => ({ equals: () => ({ first: async () => { if(enPanne) throw new Error(MSG); return undefined; } }) }),
        add: async e => { ecrits.push(e); }, update: async () => {}, count: async () => ecrits.length
      };
      api = new Function('db', 'setTimeout', src)({ errLog }, (f, ms) => { minuteurs.push({ f, ms }); });
      api.q.push({ sig: 'a|x', ts: 1 }, { sig: 'b|y', ts: 2 });
      await api._smErrFlush();
      check('H. base en panne : les incidents restent en file (AVANT : abandonnés), dans leur ordre', api.q.length === 2 && api.q[0].sig === 'a|x' && ecrits.length === 0);
      check('H. un nouvel essai est programmé (15 s), une seule fois', minuteurs.length === 1 && minuteurs[0].ms === 15000 && api.arme() === true);
      enPanne = false; minuteurs[0].f(); await new Promise(r => setTimeout(r, 20));
      check('H. la base revenue : les deux incidents sont écrits, file vide', ecrits.length === 2 && api.q.length === 0);
    }catch(e){ check('H. _smErrFlush extractible et rejouable (' + (e && e.message) + ')', false); }
  }

  console.log(`v1532 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.log('ERREUR', e && e.stack || e); process.exit(1); });
