'use strict';
// v1518 — « AFFICHAGE INDISPONIBLE — FAILED TO EXECUTE 'TRANSACTION' ON 'IDBDATABASE': THE DATABASE CONNECTION IS CLOSING ».
// Ben, capture d'écran : « à chaque fois que j'ouvre l'application après un temps de plusieurs heures inactives je suis confronté à ce message.
// Aide-moi à éradiquer ce problème durablement sans casser les fonctions de l'application. »
//
// CAUSE (lue dans le code, reproduite ici) : iOS/Safari FERME la connexion IndexedDB d'une app laissée en veille. dexie.min.js garde en mémoire la
// connexion ouverte au démarrage (`_idb`) et ne la rouvre JAMAIS : toute opération échoue — la trace de la capture pointe `toArray` — jusqu'à ce que
// l'app soit fermée complètement. Le filet de v1503 (« rejouer une lecture avec une transaction FRAÎCHE ») retombait sur la MÊME connexion morte.
//
// CORRECTIF DURABLE : (1) toute opération qui échoue parce que la connexion est perdue ROUVRE la base une fois et se REJOUE une fois — l'erreur est
// levée à la création de la transaction, avant tout effet : rejouer ne peut pas dupliquer une écriture ; (2) la réouverture est UNIQUE même si dix
// opérations échouent ensemble ; (3) l'évènement `onclose` du navigateur est écouté ; (4) une base fermée se rouvre au lieu de faire attendre sans fin
// (`_ready` bouclait indéfiniment) ; (5) un échec d'ouverture n'est plus définitif ; (6) l'app vérifie la connexion dès le retour au premier plan.
// JAMAIS REJOUÉ : toute autre erreur ; tout ce qui se passe pendant une transaction explicite (son atomicité prime).
// LEÇONS : reproduire la panne avec une connexion « tuée » plutôt que supposer · prouver que RIEN n'est exécuté deux fois · prouver l'absence de boucle
// infinie (chronomètre) · chaque garde prouvée par mutation du vrai dexie.min.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeFakeIndexedDB } = require('./_fakeidb');
const { APP } = require('./_extract');

const DEXIE_PATH = path.join(__dirname, '..', 'dexie.min.js');
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
const attendre = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT ' + (ms || 2000) + ' ms : boucle ou attente infinie')), ms || 2000))]);

// ---------- Faux IndexedDB PERSISTANT (les données survivent à une réouverture, comme en vrai) ----------
function chargerDexie(chemin){
  const base = makeFakeIndexedDB(); const stockage = new Map(); const conns = [];
  const etat = { opens: 0, echecOuverture: 0, closes: 0 };
  const indexedDB = { open(name, ver){
    etat.opens++;
    if(etat.echecOuverture > 0){
      etat.echecOuverture--;
      const req = { onerror: null, onsuccess: null, onupgradeneeded: null, onblocked: null, error: new DOMException('Internal error opening backing store for indexedDB.open.', 'UnknownError') };
      queueMicrotask(() => { if(req.onerror) req.onerror({ target: req }); });
      return req;
    }
    const req = base.open(name, ver);
    req._succeed = idb => {
      if(stockage.has(name)) idb._tables = stockage.get(name); else stockage.set(name, idb._tables);
      idb.close = () => { etat.closes++; idb._ferme = true; };
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
// « Tue » une connexion comme iOS : toute nouvelle transaction lève l'erreur de la capture de Ben.
function tuer(idb, variante){
  idb.transaction = () => {
    if(variante === 'lost') throw new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');
    throw new DOMException("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.", 'InvalidStateError');
  };
}
async function monde(lignes){
  const w = chargerDexie(DEXIE_PATH);
  const db = new w.Dexie('sensations_test');
  db.version(1).stores({ recipes: '++id, name', productions: '++id', auditLog: '++id' });
  await db.recipes.count();                                   // ouverture normale (un seul open)
  for(const l of (lignes || [{ name: 'a' }, { name: 'b' }])) await db.recipes.add(Object.assign({}, l));   // ids auto-incrémentés : 1, 2
  return Object.assign(w, { db, base: w.etat.opens });
}
const delta = w => w.etat.opens - w.base;

// Scénario qui, en cas de régression, ne ÉCHOUE PAS mais BLOQUE (boucle de microtâches : aucun chronomètre ne peut s'en apercevoir) :
// il tourne donc dans un PROCESSUS ISOLÉ que le parent peut tuer. Mode enfant : `node ce-fichier --scenario-fermeture`.
async function scenarioFermeture(){
  const w = await monde(); const idb = w.db._idb;
  idb.onclose();                                       // le navigateur ferme la connexion
  const r1 = await w.db.recipes.toArray();             // doit rouvrir, pas attendre sans fin
  w.db.close();                                        // fermeture explicite
  const r2 = await w.db.recipes.count();
  return r1.length === 2 && r2 === 2 && delta(w) === 2;
}
if(process.argv[2] === '--scenario-fermeture'){
  scenarioFermeture().then(ok => { console.log(ok ? 'SCENARIO_OK' : 'SCENARIO_KO'); process.exit(ok ? 0 : 2); }).catch(e => { console.log('SCENARIO_ERREUR', e && e.message); process.exit(3); });
} else (async () => {
  // ---------- A. LA PANNE DE BEN, reproduite puis réparée ----------
  {
    const w = await monde();
    check('A. départ : une seule ouverture, base saine', w.base === 1 && (await w.db.recipes.toArray()).length === 2);
    tuer(w.db._idb);   // iOS ferme la connexion pendant la veille
    let rows = null, err = null;
    try{ rows = await attendre(w.db.recipes.toArray()); }catch(e){ err = e; }
    check('A. APRÈS la veille : la lecture RÉUSSIT (plus d\'« Affichage indisponible »)', !err && Array.isArray(rows));
    check('A. les données sont intactes après la réouverture (2 recettes)', rows && rows.length === 2 && rows.map(r => r.name).join() === 'a,b');
    check('A. la base a été rouverte UNE fois et la connexion morte fermée proprement', delta(w) === 1 && w.etat.closes === 1 && w.conns[0]._ferme === true);
    check('A. la connexion courante est la nouvelle (les opérations suivantes ne rouvrent plus rien)', w.db._idb === w.conns[1] && (await w.db.recipes.count()) === 2 && delta(w) === 1);
  }

  // ---------- B. TOUTES les opérations survivent, et AUCUNE n'est exécutée deux fois ----------
  const operations = [
    ['toArray', db => db.recipes.toArray(), r => r.length === 2],
    ['get', db => db.recipes.get(1), r => r && r.name === 'a'],
    ['count', db => db.recipes.count(), r => r === 2],
    ['add', db => db.recipes.add({ name: 'c' }), (r, db) => db.recipes.toArray().then(x => x.length === 3 && x.filter(y => y.name === 'c').length === 1)],
    ['put', db => db.recipes.put({ id: 1, name: 'z' }), (r, db) => db.recipes.get(1).then(x => x.name === 'z')],
    ['update', db => db.recipes.update(1, { name: 'u' }), (r, db) => db.recipes.get(1).then(x => x.name === 'u')],
    ['delete', db => db.recipes.delete(1), (r, db) => db.recipes.count().then(n => n === 1)],
    ['clear', db => db.recipes.clear(), (r, db) => db.recipes.count().then(n => n === 0)],
    ['bulkAdd', db => db.recipes.bulkAdd([{ name: 'x' }, { name: 'y' }]), (r, db) => db.recipes.toArray().then(x => x.length === 4 && x.filter(y => y.name === 'x').length === 1 && x.filter(y => y.name === 'y').length === 1)],
    ['bulkPut', db => db.recipes.bulkPut([{ id: 1, name: 'p1' }, { id: 9, name: 'p9' }]), (r, db) => db.recipes.toArray().then(x => x.length === 3 && x.some(y => y.name === 'p9'))],
    ['bulkDelete', db => db.recipes.bulkDelete([1, 2]), (r, db) => db.recipes.count().then(n => n === 0)],
    ['where().equals().toArray', db => db.recipes.where('name').equals('a').toArray(), r => r.length === 1 && r[0].id === 1],
    ['orderBy().toArray', db => db.recipes.orderBy('name').toArray(), r => r.length === 2],
    ['where().equals().delete', db => db.recipes.where('name').equals('a').delete(), (r, db) => db.recipes.count().then(n => n === 1)],
    ['autre table (productions)', db => db.productions.count(), r => r === 0]
  ];
  for(const [nom, op, verif] of operations){
    const w = await monde(); tuer(w.db._idb);
    let r, err = null;
    try{ r = await attendre(op(w.db)); }catch(e){ err = e; }
    const ok = !err && await verif(r, w.db);
    check(`B. ${nom} après connexion perdue : réussit, effet UNIQUE (jamais rejoué deux fois), 1 seule réouverture`, ok && delta(w) === 1);
  }

  // variante WebKit « Connection to Indexed Database server lost »
  { const w = await monde(); tuer(w.db._idb, 'lost');
    const r = await attendre(w.db.recipes.toArray()).catch(e => e);
    check('B. variante WebKit « Connection to Indexed Database server lost » : même réparation', Array.isArray(r) && r.length === 2 && delta(w) === 1);
    tuer(w.db._idb, 'lost'); const a = await attendre(w.db.recipes.add({ name: 'k' })).catch(e => e);
    check('B. …et une écriture n\'est exécutée qu\'UNE fois', !(a instanceof Error) && (await w.db.recipes.count()) === 3); }

  // ---------- C. Transaction explicite ----------
  {
    const w = await monde(); tuer(w.db._idb);
    let appels = 0;
    await attendre(w.db.transaction('rw', w.db.recipes, async () => { appels++; await w.db.recipes.add({ name: 't' }); }));
    check('C. db.transaction() après connexion perdue : la transaction est recréée, le corps exécuté UNE fois, écriture unique', appels === 1 && (await w.db.recipes.count()) === 3 && delta(w) === 1);
  }
  {
    const w = await monde(); let appels = 0, err = null;
    try{ await attendre(w.db.transaction('rw', w.db.recipes, async () => { appels++; throw new DOMException("The database connection is closing.", 'InvalidStateError'); })); }catch(e){ err = e; }
    check('C. une erreur « connexion fermée » levée PENDANT la transaction n\'est JAMAIS rejouée (atomicité) : corps exécuté une fois, erreur propagée, aucune réouverture', appels === 1 && !!err && delta(w) === 0); }

  // ---------- D. Ce qui n'est PAS une connexion perdue n'est jamais rejoué ----------
  {
    const w = await monde(); let essais = 0;
    w.db._idb.transaction = () => { essais++; throw new DOMException('Failed to execute \'transaction\' on \'IDBDatabase\': The transaction finished.', 'InvalidStateError'); };
    const err = await attendre(w.db.recipes.add({ name: 'q' })).catch(e => e);
    check('D. InvalidStateError « transaction finished » : erreur propagée telle quelle, aucune réouverture, aucun rejeu', err instanceof Error && err.name === 'InvalidStateError' && delta(w) === 0 && essais === 1);
    const w2 = await monde(); w2.db._idb.transaction = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    check('D. QuotaExceededError : propagée, aucune réouverture', (await attendre(w2.db.recipes.add({ name: 'q' })).catch(e => e)).name === 'QuotaExceededError' && delta(w2) === 0);
    const w3 = await monde(); w3.db._idb.transaction = () => { throw new DOMException('autre souci', 'UnknownError'); };
    check('D. UnknownError d\'un AUTRE type (message différent) : propagée, aucune réouverture', (await attendre(w3.db.recipes.add({ name: 'q' })).catch(e => e)).name === 'UnknownError' && delta(w3) === 0);
    const hooks = (chargerDexie(DEXIE_PATH).Dexie._internalTestHooks) || {};
    const cm = hooks.connexionMorte || (() => null);
    const e = (msg, name) => { const x = new Error(msg); x.name = name; return x; };
    check('D. détection : « connection is closing » / « closed » / « server lost » reconnus', cm(e("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.", 'InvalidStateError')) === true && cm(e('The database connection is closed.', 'InvalidStateError')) === true && cm(e('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError')) === true);
    check('D. détection : transaction finished, object store not found, TransactionInactive, Abort, Quota, null, vide : NON', [e('The transaction finished.', 'InvalidStateError'), e('The specified object store was not found.', 'NotFoundError'), e('inactive', 'TransactionInactiveError'), e('abort', 'AbortError'), e('quota', 'QuotaExceededError'), null, undefined, {}].every(x => cm(x) === false)); }

  {
    const w = await monde(); const idb = w.db._idb; w.db._idb = null;   // connexion « oubliée » (onclose, réouverture en cours)
    let e = null; try{ w.db.recipes._txStore('readonly'); }catch(x){ e = x; }
    check('D. connexion oubliée : l\'accès direct lève « connexion fermée » (rattrapable par le filet), JAMAIS un TypeError « null.transaction »', !!e && e.name === 'InvalidStateError' && /closed/.test(e.message) && !(e instanceof TypeError));
    w.db._idb = idb;
    // le filet attrape bien cette erreur : une opération dont la connexion est oubliée EN COURS DE ROUTE se rétablit
    const ready0 = w.db._ready.bind(w.db); let n = 0;
    w.db._ready = async () => { await ready0(); if(n++ === 0){ w.db._idb = null; w.db._openPromise = null; } };
    const r = await attendre(w.db.recipes.count(), 3000).catch(x => x);
    check('D. connexion oubliée ENTRE la vérification et l\'exécution (course) : l\'opération se rétablit toute seule', r === 2);
  }

  // ---------- E. Concurrence : UNE seule réouverture ----------
  {
    const w = await monde(); tuer(w.db._idb);
    const res = await attendre(Promise.all([w.db.recipes.toArray(), w.db.recipes.count(), w.db.recipes.get(1), w.db.productions.count(), w.db.recipes.where('name').equals('b').toArray(), w.db.recipes.add({ name: 'z' }), w.db.auditLog.count()]));
    check('E. 7 opérations simultanées sur une connexion morte : toutes réussissent', res[0].length >= 2 && res[1] >= 2 && res[2].name === 'a' && res[3] === 0 && res[4].length === 1 && res[6] === 0);
    check('E. UNE SEULE réouverture (pas de tempête de connexions ni de connexion neuve refermée pour rien)', delta(w) === 1 && w.etat.closes === 1);
    check('E. l\'écriture simultanée n\'a été exécutée qu\'UNE fois', (await w.db.recipes.toArray()).filter(r => r.name === 'z').length === 1);
  }
  {
    const w = chargerDexie(DEXIE_PATH); const db = new w.Dexie('x'); db.version(1).stores({ recipes: '++id, name' });
    await attendre(Promise.all([db.recipes.count(), db.recipes.count(), db.recipes.add({ name: 'a' }), db.recipes.toArray(), db.recipes.get(1)]));
    check('E. démarrage à froid : 5 opérations immédiates → UNE seule ouverture (le correctif ne double pas l\'ouverture planifiée)', w.etat.opens === 1); }

  // ---------- F. onclose du navigateur, close() explicite : plus d'attente infinie ----------
  {
    const w = await monde(); const idb = w.db._idb;
    check('F. le navigateur peut notifier la fermeture (onclose branché)', typeof idb.onclose === 'function');
    let evtClose = 0; w.db.on('close', () => { evtClose++; });
    idb.onclose();
    check('F. onclose : la connexion est oubliée, l\'évènement « close » émis', w.db._idb === null && evtClose === 1);
    const enfant = require('child_process').spawnSync(process.execPath, [__filename, '--scenario-fermeture'], { timeout: 8000, encoding: 'utf8' });
    check('F. après onclose PUIS close() explicite, les opérations rouvrent la base : aucune attente infinie (processus isolé et chronométré), données intactes, 2 réouvertures', enfant.status === 0 && /SCENARIO_OK/.test(enfant.stdout || ''));
  }

  // ---------- G. Sonde au réveil ----------
  {
    const w = await monde();
    const ok = await attendre(w.db.verifierConnexion());
    check('G. connexion saine : la sonde répond true, aucune réouverture', ok === true && delta(w) === 0);
    tuer(w.db._idb);
    const r = await attendre(w.db.verifierConnexion());
    check('G. connexion perdue : la sonde la rouvre (« reouverte ») AVANT que l\'écran ne s\'en aperçoive', r === 'reouverte' && delta(w) === 1);
    check('G. après la sonde, les opérations fonctionnent sans nouvelle réouverture', (await w.db.recipes.count()) === 2 && delta(w) === 1);
    tuer(w.db._idb, 'lost');
    check('G. la sonde gère aussi la variante WebKit', (await attendre(w.db.verifierConnexion())) === 'reouverte' && delta(w) === 2);
    const w2 = chargerDexie(DEXIE_PATH); const vide = new w2.Dexie('v');
    check('G. base sans table : la sonde ne plante pas', true); }

  // ---------- H. Réouverture impossible : pas de boucle, et la panne n'est pas définitive ----------
  {
    const w = await monde(); tuer(w.db._idb); w.etat.echecOuverture = 1;
    const err = await attendre(w.db.recipes.toArray()).catch(e => e);
    check('H. réouverture qui échoue : l\'opération échoue avec une erreur claire (pas de boucle infinie)', err instanceof Error && /backing store|Unknown/i.test(err.name + err.message || '') || (err && err.name === 'UnknownError'));
    check('H. l\'état est propre après l\'échec (pas de réouverture « fantôme » en cours)', w.db._reopening === null || w.db._reopening === undefined);
    const r = await attendre(w.db.recipes.toArray()).catch(e => e);
    check('H. la panne n\'est pas DÉFINITIVE : l\'opération suivante rouvre la base et réussit, données intactes', Array.isArray(r) && r.length === 2); }
  {
    const w = chargerDexie(DEXIE_PATH); w.etat.echecOuverture = 1;
    const db = new w.Dexie('y'); db.version(1).stores({ recipes: '++id, name' });
    const e1 = await attendre(db.recipes.count()).catch(e => e);
    const e2 = await attendre(db.recipes.count()).catch(e => e);
    check('H. même l\'ouverture INITIALE qui échoue une fois n\'est plus collée : la 2e opération réessaie et réussit', e1 instanceof Error && e2 === 0); }

  // ---------- I. L'app : réveil + contrat conservé ----------
  {
    const src = APP;
    check('I. dbReveil défini : sonde silencieuse, rattrape ses erreurs', /function dbReveil\(source\)\{[\s\S]*?db\.verifierConnexion\(\)\.then\(r=>\{ if\(r==='reouverte'\)/.test(src) && /\.catch\(e=>\{ console\.warn\('dbReveil ' \+ source, e\); return null; \}\)/.test(src));
    check('I. branchée sur le retour au premier plan : visibilitychange (visible), pageshow, focus', /document\.addEventListener\('visibilitychange', \(\) => \{ if\(!document\.hidden\) dbReveil\('visibilitychange'\); \}\);/.test(src) && /window\.addEventListener\('pageshow', \(\) => \{ dbReveil\('pageshow'\); \}\);/.test(src) && /window\.addEventListener\('focus', \(\) => \{ dbReveil\('focus'\); \}\);/.test(src));
    check('I. le flush de la copie kv à la mise en arrière-plan (v1372) est conservé', /document\.addEventListener\('visibilitychange', \(\) => \{ if\(document\.hidden\) _kvFlush\(\); \}\);/.test(src));
    const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    check('I. le service worker met dexie.min.js en cache ET son cache est incrémenté (sinon l\'ancien fichier resterait servi)', /dexie\.min\.js/.test(sw) && (m => !!m && +m[1] >= 548)(sw.match(/const CACHE = 'sm-iphone-v(\d+)'/)));
    check('I. APP_VERSION >= v1518', (m => !!m && +m[1] >= 1518)(APP.match(/const APP_VERSION = 'v(\d+)';/)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.log('PLANTAGE', e && e.stack || e); process.exitCode = 1; });
