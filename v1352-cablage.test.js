// ════════════════════════════════════════════════════════════════════════════
//  v1352 — LE CÂBLAGE : CHAQUE INTENT DOIT AVOIR SON `case` DANS LE DISPATCH
//
//  LE BUG : « Génère moi un coffret » répondait « je n'ai pas bien compris » — MÊME EN v1351,
//  MÊME APRÈS avoir corrigé db.lots et mesureParRec. J'ai d'abord cru à un problème de regex,
//  puis de cache, puis de saisie. Tout était faux.
//
//  parseIntent retournait CORRECTEMENT `query_generer_coffret`. Le problème était en AVAL :
//  le `case 'query_generer_coffret'` du switch `_aiDispatch` AVAIT DISPARU. Une de mes éditions
//  Python en cascade l'avait écrasé, sans que rien ne le signale. Le switch tombait dans son
//  `default:` — dont le message est « Je n'ai pas bien compris », le MÊME que pour un intent
//  inconnu. D'où trois heures de diagnostic dans la mauvaise direction.
//
//  LEÇON (v1352) : DEUX CAUSES TRÈS DIFFÉRENTES (intent non reconnu / intent non câblé)
//  PRODUISAIENT LE MÊME MESSAGE. Un message de repli qui ne distingue pas ses causes envoie
//  celui qui débugge sur une fausse piste — et il y reste, parce que le message a l'air d'être
//  une réponse.
//
//  CE TEST EST DE LA PLOMBERIE, PAS DE LA LOGIQUE MÉTIER. Il vérifie que le fil est branché.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, a, b) => { const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

// Code sans commentaires : un commentaire qui CITE un intent ne doit pas compter comme une
// déclaration ni comme un câblage (leçon du test v1351, qui comptait ses propres commentaires).
const CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// 1) Tous les intents PRODUITS par parseIntent : `return {intent:'xxx'`
const produits = new Set();
const reProduit = /return\s*\{\s*intent\s*:\s*'([a-z_0-9]+)'/g;
let m;
while ((m = reProduit.exec(CODE))) produits.add(m[1]);

// 2) Tous les intents CÂBLÉS dans un switch : `case 'xxx':`
const cables = new Set();
const reCase = /case\s+'([a-z_0-9]+)'\s*:/g;
while ((m = reCase.exec(CODE))) cables.add(m[1]);

// 3) Les intents qui n'ont PAS besoin d'un case (gérés hors dispatch, en amont).
//    'unknown' tombe volontairement dans le default ; les autres sont traités avant le switch.
const HORS_DISPATCH = new Set(['unknown']);

console.log('\n-- Intents produits par parseIntent : ' + produits.size);
console.log('-- Intents cables dans un switch    : ' + cables.size);

console.log('\n-- CHAQUE INTENT PRODUIT DOIT ETRE CABLE (ou explicitement hors dispatch) --');
const orphelins = [...produits].filter(i => !cables.has(i) && !HORS_DISPATCH.has(i)).sort();
T('aucun intent orphelin (produit mais jamais route)', orphelins, []);

if (orphelins.length) {
  console.log('\n  INTENTS ORPHELINS -- ils tomberont dans le default du switch,');
  console.log('  et l utilisateur lira "Je n ai pas bien compris" alors que la regle a MATCHE :');
  orphelins.forEach(i => console.log('    - ' + i));
}

// 4) Non-regression nominative sur le bug precis qui a motive ce test.
T('query_generer_coffret est bien produit par parseIntent', produits.has('query_generer_coffret'), true);
T('query_generer_coffret est bien CABLE dans le dispatch (le bug exact)', cables.has('query_generer_coffret'), true);
T('query_associations reste cable (non-regression)', cables.has('query_associations'), true);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- cablage coherent')));
process.exit(ko ? 1 : 0);
