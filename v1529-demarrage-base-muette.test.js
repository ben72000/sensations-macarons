'use strict';
// v1529 — « Parfois à l'ouverture je n'arrive plus à naviguer : les boutons sont cliquables puis deviennent inactifs et les pages ne se chargent pas. »
// CAUSE : indexedDB.open() qui ne revient jamais (ni succès, ni erreur, ni blocked) → toute lecture de la base et tout le boot attendaient pour toujours.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeFakeIndexedDB } = require('./_fakeidb');
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
const DEXIE = path.join(__dirname, '..', 'dexie.min.js');
const attendre = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))]);
function charger(silencieuses){
  const base = makeFakeIndexedDB(); const etat = { opens: 0, succes: 0, fermees: 0 };
  let restantes = silencieuses; const stock = new Map();
  const indexedDB = { open(name, ver){
    etat.opens++;
    if(restantes > 0){ restantes--; return { onerror: null, onsuccess: null, onupgradeneeded: null, onblocked: null }; }   // MUETTE : aucun événement, jamais
    const req = base.open(name, ver);
    req._succeed = idb => { if(stock.has(name)) idb._tables = stock.get(name); else stock.set(name, idb._tables); const f = idb.close; idb.close = () => { etat.fermees++; }; etat.succes++; req.result = idb; queueMicrotask(() => { if(req.onsuccess) req.onsuccess({ target: req }); }); };
    return req;
  } };
  const src = fs.readFileSync(DEXIE, 'utf8');
  const self_ = { indexedDB, DOMException, WeakMap, WeakSet, console, setTimeout, clearTimeout, queueMicrotask };
  const sb = { self: self_, indexedDB, WeakMap, WeakSet, DOMException, console, setTimeout, clearTimeout, queueMicrotask };
  vm.createContext(sb); vm.runInContext(src, sb, { filename: DEXIE });
  return { Dexie: self_.Dexie, etat };
}
(async () => {
  // A. une ouverture muette est relancée
  {
    const w = charger(1); const db = new w.Dexie('t'); db._stallMs = 40;
    db.version(1).stores({ recipes: '++id, name' });
    let ok = false, msg = '';
    try { await attendre(db.recipes.add({ name: 'a' }), 1500); const n = await attendre(db.recipes.count(), 1500); ok = n === 1; } catch(e){ msg = e.message; }
    check('A. première ouverture muette : relancée, la base répond (avant : attente infinie)' + msg, ok);
    check('A. deux appels à indexedDB.open (la muette + la relance)', w.etat.opens === 2);
  }
  {
    const w = charger(3); const db = new w.Dexie('t2'); db._stallMs = 30;
    db.version(1).stores({ recipes: '++id, name' });
    let ok = false;
    try { await attendre(db.recipes.add({ name: 'a' }), 2000); ok = (await db.recipes.count()) === 1; } catch(e){}
    check('A. trois ouvertures muettes de suite : la 4e (dernière tentative) aboutit', ok && w.etat.opens === 4);
  }
  {
    const w = charger(0); const db = new w.Dexie('t3'); db._stallMs = 30;
    db.version(1).stores({ recipes: '++id, name' });
    await db.recipes.add({ name: 'a' }); await new Promise(r => setTimeout(r, 200));
    check('A. ouverture saine : UNE seule ouverture, aucune relance inutile', w.etat.opens === 1);
  }
  {
    // la lente finit par répondre APRÈS la relance : une seule connexion gardée, l'autre refermée
    const base = makeFakeIndexedDB(); let n = 0; const stock = new Map(); let fermees = 0;
    const indexedDB = { open(name, ver){
      n++; const lente = n === 1;
      const req = base.open(name, ver);
      req._succeed = idb => {
        if(stock.has(name)) idb._tables = stock.get(name); else stock.set(name, idb._tables);
        idb.close = () => { fermees++; }; req.result = idb;
        const livrer = () => { if(req.onsuccess) req.onsuccess({ target: req }); };
        if(lente) setTimeout(livrer, 120); else queueMicrotask(livrer);   // la 1re répond TARD, la relance tout de suite
      };
      return req;
    } };
    const src = fs.readFileSync(DEXIE, 'utf8'); const self_ = { indexedDB, DOMException, WeakMap, WeakSet, console, setTimeout, clearTimeout, queueMicrotask };
    const sb = { self: self_, indexedDB, WeakMap, WeakSet, DOMException, console, setTimeout, clearTimeout, queueMicrotask };
    vm.createContext(sb); vm.runInContext(src, sb);
    const db = new self_.Dexie('t4'); db._stallMs = 30;
    db.version(1).stores({ recipes: '++id' });
    await attendre(db.recipes.add({}), 1500); await new Promise(r => setTimeout(r, 300));
    check('A. la 1re ouverture répond après la relance : sa connexion est refermée, une seule reste active (' + n + ' ouvertures, ' + fermees + ' fermée)', n === 2 && fermees === 1);
  }
  // B. le démarrage de l'app
  const iBoot = APP.indexOf("(async()=>{\n  // Le rendu ne doit JAMAIS"); const BOOT = APP.slice(iBoot);
  check('B. la préparation du démarrage est isolée (_prep) et attendue avec un délai', /const _prep = \(async\(\)=>\{/.test(BOOT) && /await bootAttendre\(_prep, BOOT_PREP_MAX_MS\)/.test(BOOT));
  check('B. le premier rendu a lieu même si la préparation traîne', BOOT.indexOf('bootAttendre(_prep') < BOOT.indexOf('try{ if(!opened) render(); }') );
  check('B. la barre « Réessayer / Recharger » est affichée quand c\'est lent', /if\(_lent\)\{ bootLentAfficher\(_prep\); \}/.test(BOOT));
  const iFn = APP.indexOf('function bootAttendre('); const fnSrc = APP.slice(iFn, APP.indexOf('function bootLentAfficher'));
  const bootAttendre = new Function(fnSrc + '\nreturn bootAttendre;')();
  const lent = new Promise(() => {});                      // ne se termine jamais : la base muette
  check('B. une préparation qui ne finit jamais : rendue la main après le délai (true)', (await bootAttendre(lent, 40)) === true);
  check('B. une préparation rapide : false, sans attendre le délai', (await bootAttendre(Promise.resolve(1), 5000)) === false);
  check('B. une préparation qui échoue ne bloque pas non plus', (await bootAttendre(Promise.reject(new Error('x')), 5000)) === false);
  check('B. repli fourni : la valeur de la promesse est rendue', (await bootAttendre(Promise.resolve('ok'), 5000, 'defaut')) === 'ok' && (await bootAttendre(lent, 30, 'defaut')) === 'defaut');
  check('B. le délai de préparation est inférieur à 10 s', /const BOOT_PREP_MAX_MS = [1-9]\d{0,3};/.test(APP));
  const bar = APP.slice(APP.indexOf('function bootLentAfficher'), APP.indexOf('let _clockTimer'));
  check('B. la barre se retire et re-rend dès que la base répond', /Promise\.resolve\(prep\)\.then\(\(\)=>\{[^}]*bar\.remove\(\)[\s\S]*render\(\)/.test(bar));
  check('B. « Réessayer » ferme, rouvre la base puis re-rend', /db\.close\(\)[\s\S]*db\.open\(\)[\s\S]*render\(\)/.test(bar));
  check('APP_VERSION v1529', /const APP_VERSION = 'v15\d\d'/.test(APP));
  check('cache SW v559 et dexie.min.js toujours précaché', /sm-iphone-v5\d\d/.test(fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8')) && /dexie\.min\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8')));
  console.log(`v1529 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
})().catch(e => { console.error('PLANTAGE', e); process.exit(1); });
