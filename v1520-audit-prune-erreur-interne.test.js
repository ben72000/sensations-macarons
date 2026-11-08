'use strict';
// v1520 — « _auditPrune — AN INTERNAL ERROR WAS ENCOUNTERED IN THE INDEXED DATABASE SERVER » (journal santé, 06/11 06:25, écran accueil, v1518,
// classé IMPORTANT). Ben : « étudier cette erreur, dire d'où vient le problème et le corriger ».
//
// CAUSE : la rétention du journal d'audit tournait AU DÉMARRAGE, en même temps que les migrations, et supprimait ses lignes UNE PAR UNE (dexie.min.js
// `bulkDelete` = une transaction par clé). Après une longue veille, le serveur IndexedDB de WebKit répond alors par cette erreur interne transitoire
// (UnknownError). Aucune donnée n'est perdue : la rétention est de l'entretien. Mais l'erreur était journalisée comme un incident de base.
// CORRECTIFS : ① bulkDelete en UNE transaction par paquet de 400 (chemin rapide : sans hook de suppression, hors transaction explicite) ; ② la
// rétention supprime au plus 500 lignes par passage ; ③ elle est lancée 6 s APRÈS le démarrage ; ④ une reprise unique après une pause ; ⑤ échec
// persistant → entretien reporté, trace NON grave ; ⑥ les LECTURES (get/toArray/count/_all) sont rejouées une fois après réouverture sur cette erreur
// interne — jamais une écriture (on ne sait pas si elle a eu lieu : un rejeu pourrait la dupliquer).
// LEÇONS : une erreur transitoire d'entretien ne doit pas se déguiser en incident de base · compter les transactions plutôt que supposer · ne rejouer que
// l'idempotent.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeFakeIndexedDB } = require('./_fakeidb');
const { APP } = require('./_extract');

const DEXIE_PATH = path.join(__dirname, '..', 'dexie.min.js');
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
const attendre = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT ' + (ms || 2000) + ' ms')), ms || 2000))]);
const erreurInterne = () => new DOMException('An internal error was encountered in the Indexed Database server', 'UnknownError');

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


async function monde(n){
  const w = chargerDexie(DEXIE_PATH);
  const db = new w.Dexie('audit_test');
  db.version(1).stores({ auditLog: '++id, ts, tbl', recipes: '++id, name' });
  await db.recipes.count();
  for(let i = 1; i <= n; i++) await db.auditLog.add({ ts: i, tbl: 'x' });
  return Object.assign(w, { db });
}
// compte les transactions réellement ouvertes sur la connexion courante
function espionTx(w){
  const idb = w.db._idb; const orig = idb.transaction.bind(idb); const c = { n: 0, modes: [] };
  idb.transaction = (s, m) => { c.n++; c.modes.push(m); return orig(s, m); };
  return c;
}

(async () => {
  // ---------- A. bulkDelete : UNE transaction par paquet, résultat identique ----------
  {
    const w = await monde(1000); const c = espionTx(w);
    const ids = Array.from({ length: 900 }, (_, i) => i + 1);
    await attendre(w.db.auditLog.bulkDelete(ids), 5000);
    const reste = await w.db.auditLog.count();
    check('A. 900 clés supprimées : il en reste exactement 100', reste === 100);
    check('A. la ligne 901 (non demandée) est INTACTE, la 900 a bien disparu', !!(await w.db.auditLog.get(901)) && !(await w.db.auditLog.get(900)));
    const ecritures = c.modes.filter(m => m === 'readwrite').length;
    check('A. SEULEMENT 3 transactions d\'écriture pour 900 suppressions (paquets de 400) au lieu de 900', ecritures === 3);
    await w.db.auditLog.bulkDelete([]);
    check('A. liste vide : aucun plantage', true);
  }
  // avec un hook de suppression : comportement d'avant (ligne à ligne, hooks tirés)
  {
    const w = await monde(10); let vus = 0;
    w.db.auditLog.hook('deleting', () => { vus++; });
    await w.db.auditLog.bulkDelete([1, 2, 3]);
    check('A. avec hook de suppression : les hooks sont toujours tirés pour chaque ligne', vus === 3 && (await w.db.auditLog.count()) === 7);
  }
  // dans une transaction explicite : pas de chemin rapide, atomicité conservée
  {
    const w = await monde(10);
    await w.db.transaction('rw', w.db.auditLog, async () => { await w.db.auditLog.bulkDelete([1, 2]); });
    check('A. bulkDelete dans une transaction explicite : fonctionne et supprime', (await w.db.auditLog.count()) === 8);
  }

  // ---------- B. lectures rejouées sur erreur interne ; écritures JAMAIS ----------
  {
    const w = await monde(5);
    let essais = 0; const idb = w.db._idb; const orig = idb.transaction.bind(idb);
    idb.transaction = (s, m) => { essais++; if(essais === 1) throw erreurInterne(); return orig(s, m); };
    const n = await attendre(w.db.auditLog.count());
    check('B. count() : erreur interne → connexion rouverte, lecture rejouée UNE fois, bon résultat (5)', n === 5);
  }
  {
    const w = await monde(5);
    const idb = w.db._idb; let essais = 0; const orig = idb.transaction.bind(idb);
    idb.transaction = (s, m) => { essais++; throw erreurInterne(); };
    let err = null; try{ await attendre(w.db.auditLog.add({ ts: 99, tbl: 'x' })); }catch(e){ err = e; }
    check('B. ÉCRITURE (add) sur erreur interne : erreur remontée, UNE seule tentative (jamais rejouée → jamais dupliquée)', !!err && err.name === 'UnknownError' && essais === 1);
  }
  {
    const w = await monde(5);
    const idb = w.db._idb; idb.transaction = () => { throw erreurInterne(); };
    // la réouverture remplace la connexion : la 2e tentative réussit (connexion saine), donc la lecture aboutit
    const tous = await attendre(w.db.auditLog.toArray());
    check('B. toArray() rejoué après réouverture : 5 lignes', tous.length === 5);
  }
  {
    const w = await monde(3); const idb = w.db._idb; let essais = 0;
    idb.transaction = () => { essais++; throw new DOMException('quota', 'QuotaExceededError'); };
    let err = null; try{ await attendre(w.db.auditLog.count()); }catch(e){ err = e; }
    check('B. toute AUTRE erreur n\'est jamais rejouée', !!err && err.name === 'QuotaExceededError' && essais === 1);
  }

  // ---------- C. la VRAIE _auditPrune (code d'app.js) ----------
  const iP = APP.indexOf('async function _auditPrune(essai){'); const srcPrune = APP.slice(iP, APP.indexOf('\n}\n', iP) + 3);
  const lignePaquet = APP.slice(APP.indexOf('const AUDIT_PRUNE_PAQUET'), APP.indexOf('\n', APP.indexOf('const AUDIT_PRUNE_PAQUET')));
  const reGrave = new Function(APP.slice(APP.indexOf('const _SM_CTX_GRAVE'), APP.indexOf('\n', APP.indexOf('const _SM_CTX_GRAVE'))) + '\nreturn _SM_CTX_GRAVE;')();
  check('C. _auditPrune et sa constante retrouvées', srcPrune.length > 300 && /AUDIT_PRUNE_PAQUET *= *500/.test(lignePaquet));
  function prune(db, vus){
    return new Function('db','swallow','AUDIT_MAX_ENTREES','setTimeout', lignePaquet + '\n' + srcPrune + '\nreturn _auditPrune;')(db, (e, ctx) => vus.push({ e, ctx }), 2000, (f) => f());
  }
  {
    const w = await monde(2600); const vus = [];
    const r = await prune(w.db, vus)();
    check('C. 2 600 lignes (surplus 600) : supprime 500 au plus par passage → 2 100 restent, la plus ANCIENNE part en premier', r === 500 && (await w.db.auditLog.count()) === 2100 && !(await w.db.auditLog.get(500)) && !!(await w.db.auditLog.get(501)));
    const r2 = await prune(w.db, vus)();
    check('C. 2e passage : ramène à 2 000 pile', r2 === 100 && (await w.db.auditLog.count()) === 2000 && vus.length === 0);
    check('C. sous le seuil : ne supprime rien', (await prune(w.db, vus)()) === 0);
  }
  {
    const vus = []; let appels = 0;
    const faux = { auditLog: { count: async () => { appels++; if(appels === 1) throw erreurInterne(); return 10; } } };
    const r = await prune(faux, vus)();
    check('C. erreur interne transitoire puis succès : reprise unique, AUCUN incident journalisé', r === 0 && appels === 2 && vus.length === 0);
  }
  {
    const vus = []; let appels = 0;
    const faux = { auditLog: { count: async () => { appels++; throw erreurInterne(); } } };
    const r = await prune(faux, vus)();
    check('C. échec persistant : UNE reprise seulement (2 tentatives), puis report silencieux', r === 0 && appels === 2);
    check('C. … la trace laissée n\'est PAS grave (plus classée « important — base »)', vus.length === 1 && !reGrave.test(vus[0].ctx));
  }

  // ---------- D. DÉMARRAGE : plus de rétention en concurrence avec les migrations ----------
  {
    check('D. la rétention n\'est plus lancée en direct au démarrage mais différée de 6 s', /setTimeout\(\(\) => \{ _auditPrune\(\)\.catch\(\(\)=>\{\}\); \}, 6000\)/.test(APP) && !/try\{ _auditPrune\(\); \}catch/.test(APP));
    check('D. le service worker a changé de version de cache', /sm-iphone-v550/.test(fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8')));
  }

  console.log(`v1520 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.log('ERREUR', e && e.stack || e); process.exit(1); });
