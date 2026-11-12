'use strict';
// v1524 — « l'application n'affiche que les boutons, le reste est blanc ».
// ① stockParMatiere référençait une variable `actifs` jamais définie → ReferenceError à CHAQUE appel (avalée par le
//    tableau de bord : stock à 0 pour toutes les matières, alertes DLC muettes, journal d'erreurs saturé).
// ② Filet de démarrage dans index.html : si #main reste vide, un message lisible + « Réparer » (cache seulement,
//    jamais les données) s'affiche au lieu d'une page blanche.
const fs = require('fs'), path = require('path');
const { APP } = require('./_extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }

// ---------- A. stockParMatiere ----------
const i = APP.indexOf('async function stockParMatiere(materialId){'), j = APP.indexOf('\n}\n', i) + 3;
const src = APP.slice(i, j);
const round3 = x => Math.round((+x + Number.EPSILON) * 1000) / 1000;
const monde = lots => new Function('lotsDeMatiere', 'round3', src + '\nreturn stockParMatiere;')(async () => lots, round3);
(async () => {
  let r = await monde([{ qteRestante: 500, dlc: '2026-12-01' }, { qteRestante: 1500, dlc: '2026-11-20' }, { qteRestante: 0, dlc: '2026-10-01' }])(1);
  check('A. total = somme des restes (2000)', r.total === 2000);
  check('A. DLC mini parmi les lots ACTIFS seulement (le lot vide périmé est ignoré)', r.dlcMin === '2026-11-20');
  check('A. nbLots = lots actifs (2)', r.nbLots === 2);
  r = await monde([])(1);
  check('A. aucune matière en stock : 0, pas de DLC, 0 lot (sans exception)', r.total === 0 && r.dlcMin === null && r.nbLots === 0);
  r = await monde([{ qteRestante: 3, dlc: null }])(1);
  check('A. lot sans DLC : total ok, dlcMin null', r.total === 3 && r.dlcMin === null && r.nbLots === 1);
  check('A. plus de ReferenceError : `actifs` est déclarée dans la fonction', /const actifs = lots\.filter/.test(src));
  // le tableau de bord appelle toujours cette fonction (chemin protégé conservé)
  // stockDepuisLots = même calcul sur des lots déjà lus (tableau de bord : 1 lecture au lieu d'une par matière)
  const i2 = APP.indexOf('function stockDepuisLots(lots){'), j2 = APP.indexOf('\n}\n', i2) + 3;
  const sdl = new Function('round3', APP.slice(i2, j2) + '\nreturn stockDepuisLots;')(round3);
  const L = [{ qteRestante: 500, dlc: '2026-12-01' }, { qteRestante: 1500, dlc: '2026-11-20' }, { qteRestante: 0, dlc: '2026-10-01' }];
  const viaFn = await monde(L)(1), viaLots = sdl(L);
  check('A. stockDepuisLots == stockParMatiere (même total, DLC, nb lots)', JSON.stringify(viaFn) === JSON.stringify(viaLots));
  check('A. stockDepuisLots : liste vide / absente sans exception', sdl([]).total === 0 && sdl(undefined).dlcMin === null && sdl([{ qteRestante: 2 }]).dlcMin === null);
  const dash = APP.slice(APP.indexOf('const _lotsParMat = new Map();'), APP.indexOf('const _lotsParMat = new Map();') + 900);
  check('A. tableau de bord : UNE lecture des lots, plus aucun appel par matière', /db\.materialLots\.toArray\(\)/.test(dash) && /stockDepuisLots\(_lotsParMat\.get/.test(dash) && !/await stockParMatiere\(mat\.id\)/.test(APP));

  // ---------- B. filet de démarrage ----------
  const k = HTML.indexOf('window.smFiletVerifier = function(doc, now){'), l = HTML.indexOf('\n};\n', k) + 3;
  const verif = HTML.slice(k, l);
  function faux(texte, avecPanneau){
    const els = {}; const body = { kids: [], appendChild(e){ this.kids.push(e); els[e.id] = e; } };
    const mk = () => ({ style: {}, children: [], appendChild(c){ this.children.push(c); }, set textContent(v){ this._t = v; }, get textContent(){ return this._t; } });
    const doc = { getElementById: id => id === 'main' ? { innerText: texte } : (els[id] || null), createElement: () => mk(), body };
    if(avecPanneau) els.smFilet = {};
    return { doc, body };
  }
  const win = { smFiletErreurs: ['ReferenceError: x is not defined (app.js:12)'] };
  const run = (doc) => new Function('window', 'navigator', 'location', verif + '\nreturn window.smFiletVerifier;')(win, {}, {})(doc);
  let f = faux('Tableau de bord LUNDI 9 NOVEMBRE 2026 0,00 €');
  check('B. écran rempli → aucun panneau', run(f.doc) === false && f.body.kids.length === 0);
  f = faux('   ');
  check('B. écran vide → panneau créé', run(f.doc) === true && f.body.kids.length === 1 && f.body.kids[0].id === 'smFilet');
  check('B. le panneau cite la dernière erreur capturée', JSON.stringify(f.body.kids[0].children.map(c => c._t)).includes('ReferenceError'));
  check('B. deux boutons : Recharger et Réparer', f.body.kids[0].children.filter(c => /Recharger|Réparer/.test(c._t || '')).length === 2);
  f = faux('', true);
  check('B. panneau déjà présent → pas de doublon', run(f.doc) === true && f.body.kids.length === 0);
  check('B. #main introuvable → ne fait rien (pas d\'exception)', new Function('window', 'navigator', 'location', verif + '\nreturn window.smFiletVerifier;')(win, {}, {})({ getElementById: () => null }) === false);

  // ---------- C. câblage et sûreté ----------
  check('C. le filet est chargé AVANT les scripts de l\'app', HTML.indexOf('smFiletVerifier') < HTML.indexOf('<script src="dexie.min.js">'));
  check('C. vérifié à 6 s puis 15 s après le chargement', /setTimeout\(function\(\)\{ window\.smFiletVerifier\(document\); \}, 6000\)/.test(HTML) && /15000/.test(HTML));
  check('C. « Réparer » vide caches et service worker, JAMAIS indexedDB / localStorage', /unregister\(\)/.test(HTML) && /caches\.delete/.test(HTML) && !/indexedDB\.deleteDatabase|localStorage\.clear|\.delete\(\)/.test(verif));
  check('C. erreurs et promesses rejetées capturées sans écraser window.onerror', /addEventListener\('error'/.test(HTML) && /addEventListener\('unhandledrejection'/.test(HTML));
  check('C. APP_VERSION v1524', /const APP_VERSION = 'v15\d\d'/.test(APP));
  const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
  check('C. cache du service worker v554', /sm-iphone-v5\d\d/.test(sw));

  console.log(`v1524 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
})();
