// ════════════════════════════════════════════════════════════════════════════
//  v1357 — LES FONCTIONS APPELÉES DEPUIS LE HTML DOIVENT EXISTER
//
//  En écrivant la création de boîte à la volée, j'ai appelé `modal(...)`.
//  **`modal` n'est pas une fonction — c'est une VARIABLE** (l'élément DOM du modal).
//  La vraie fonction s'appelle `openModal()`. Mon code aurait planté au premier clic de Ben.
//
//  C'est le MÊME motif que le bug `db.lots` (v1351, table inexistante) et que le `case` manquant
//  (v1352, intent non câblé) : **une référence qui ne casse RIEN à la lecture, et TOUT à l'exécution.**
//
//  Trois bugs, trois causes différentes, une seule famille : LA PLOMBERIE.
//  Aucun test métier ne les attrape — ils ne concernent pas le calcul, mais le CÂBLAGE.
//
//  RÈGLE (v1357) : chaque fonction appelée depuis un `onclick=` du HTML généré doit exister
//  dans le fichier. Un onclick vers une fonction fantôme est un bouton mort — et un bouton mort
//  ne se voit qu'en cliquant dessus.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, a, b) => { const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

// Code sans commentaires (un commentaire qui cite une fonction n'est pas un appel).
const CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// 1) Toutes les fonctions DÉFINIES : `function nom(`, `const nom = (`, `const nom = async`, arrow.
const definies = new Set();
let m;
const reFn = /function\s+(\w+)\s*\(/g;
while ((m = reFn.exec(CODE))) definies.add(m[1]);
const reConst = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\()/g;
while ((m = reConst.exec(CODE))) definies.add(m[1]);
const reArrow = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w+\s*=>/g;
while ((m = reArrow.exec(CODE))) definies.add(m[1]);

// 2) Toutes les fonctions APPELÉES depuis un onclick= dans du HTML généré.
const appelees = new Set();
const reClick = /onclick=\\?["']([a-zA-Z_$][\w$]*)\s*\(/g;
while ((m = reClick.exec(CODE))) appelees.add(m[1]);

console.log('\n-- Fonctions definies dans app.js : ' + definies.size);
console.log('-- Fonctions appelees depuis un onclick= : ' + appelees.size);

console.log('\n-- CHAQUE onclick= DOIT POINTER VERS UNE FONCTION QUI EXISTE --');
// Les mots-clés JS ne sont pas des fonctions : `onclick="if(...)"` est une condition inline,
// pas un appel. Mon premier jet les comptait comme des "boutons morts" — un faux positif dans
// le test censé détecter les faux appels. (Le test avait le bug qu'il cherchait.)
const MOTS_CLES = new Set(['if','for','while','switch','return','typeof','delete','void','new','function','catch','with','do']);
const fantomes = [...appelees].filter(f => !definies.has(f) && !MOTS_CLES.has(f)).sort();
T('aucun onclick vers une fonction fantome (bouton mort)', fantomes, []);
if (fantomes.length) {
  console.log('\n  BOUTONS MORTS -- ils planteront au clic :');
  fantomes.forEach(f => console.log('    - ' + f + '()'));
}

console.log('\n-- Le bug precis de la v1357 : modal() n existe pas, c est openModal()');
T('openModal est bien une fonction definie', definies.has('openModal'), true);
T('les nouvelles fonctions de creation de boite existent',
  [definies.has('partFlowNouvelleBoite'), definies.has('partFlowNouvelleBoiteSave')], [true, true]);
T('elles sont bien appelees depuis un onclick',
  [appelees.has('partFlowNouvelleBoite'), appelees.has('partFlowNouvelleBoiteSave')], [true, true]);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- plomberie HTML coherente')));
process.exit(ko ? 1 : 0);
