// ════════════════════════════════════════════════════════════════════════════
//  v1355 — LES VOLUMES PAR PARFUM : « 0 pièces vendues » sur 128 commandes
//
//  Ben lance le tableau de bord (v1354) : « 0 pièces vendues au total », les 15 parfums en
//  « JAMAIS VENDUS ». Il a 128 commandes et 48 paniers exploitables.
//
//  DEUX BUGS, empilés :
//
//  1. MAUVAISE CLÉ. `computeStats()` retourne `{global, parClient, nbValides}`. Les volumes sont
//     dans `R.global.parfums` — j'ai lu `R.parfums`. Toujours `undefined` → toujours 0.
//
//  2. LE FILTRE `paiement === 'Payé'`. computeStats ne compte QUE les commandes soldées. Or Ben
//     a tranché en v1344 : « ce sont deux notions bien distinctes qui ne doivent pas s'annuler
//     l'une l'autre ». Un macaron VENDU est vendu, réglé ou non : le VOLUME mesure ce qui SORT,
//     pas ce qui RENTRE. Les associations (v1344) comptaient déjà les impayées — le tableau
//     aurait donc mélangé DEUX PÉRIMÈTRES DIFFÉRENTS dans les mêmes lignes.
//
//  CE QUI REND LE BUG 1 PERNICIEUX : la marge (1,48 €/pce) et les associations (×2,24)
//  s'affichaient PARFAITEMENT — elles viennent d'autres sources. SEUL le volume était faux.
//
//  RÈGLE GRAVÉE (v1355) : UN TABLEAU À MOITIÉ JUSTE EST PLUS DANGEREUX QU'UN TABLEAU VIDE.
//  Un écran totalement cassé se voit ; un écran dont trois colonnes sur quatre sont correctes
//  inspire confiance — et Ben aurait pu sortir Vanille de sa gamme en la croyant invendue.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? fa() : fa; b = (typeof fb === 'function') ? fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '\n      EXCEPTION : ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

// On EXTRAIT le bloc de comptage réel du fichier (jamais une paraphrase — leçon v1345).
const iV = SRC.indexOf('const volumes = {};');
const jV = SRC.indexOf('// ── 2. RENTABILITÉ', iV);
if (iV < 0 || jV < 0) { console.log('  X bloc de comptage des volumes introuvable dans app.js'); process.exit(1); }
const BLOC = SRC.slice(iV, jV).replace('const volumes = {};', 'globalThis.volumes = {};');

function orderToLines(o) { return o.lignes || []; }

const orders = [
  { id: 1, montant: 20, paiement: 'Payé',       lignes: [{ type: 'coffret', parfums: [{ nom: 'Vanille', qte: 3 }, { nom: 'Pistache', qte: 3 }] }] },
  { id: 2, montant: 20, paiement: 'En attente', lignes: [{ type: 'coffret', parfums: [{ nom: 'Vanille', qte: 2 }, { nom: 'Cafe', qte: 4 }] }] },
  { id: 3, montant: 80, paiement: 'Payé',       lignes: [{ type: 'grand',   items:   [{ nom: 'Chocolat noir', qte: 10 }] }] },
  { id: 4, histo: true, montant: 20, paiement: 'Payé', lignes: [{ type: 'coffret', parfums: [{ nom: 'Vanille', qte: 99 }] }] },
];
eval(BLOC);
const v = globalThis.volumes;

console.log('\n-- LE BUG : les volumes doivent etre NON NULS');
T('des volumes sont bien comptes (le bug affichait 0 partout)', () => Object.keys(v).length > 0, true);

console.log('\n-- LA DECISION DE BEN (v1344) : payee et impayee comptent PAREIL');
T('Vanille = 5 (3 payee + 2 IMPAYEE)', () => v['Vanille'], 5);
T('Cafe = 4 (issu d une commande IMPAYEE uniquement)', () => v['Cafe'], 4);
console.log('      -> le volume mesure ce qui SORT, pas ce qui RENTRE.');
console.log('      -> les associations comptaient deja les impayees : les deux colonnes doivent');
console.log('         parler du MEME perimetre, sinon le tableau melange deux realites.');

console.log('\n-- LES GRANDS FORMATS rangent leurs parfums dans `items`, pas `parfums`');
T('Chocolat noir = 10 (grand format compte)', () => v['Chocolat noir'], 10);

console.log('\n-- LES REPRISES D HISTORIQUE restent exclues');
T('la reprise histo (99 Vanille) n est PAS comptee', () => v['Vanille'] !== 104, true);



// ════════════════════════════════════════════════════════════════════════════
//  v1356 — UNE MARGE INCONNUE N'EST PAS UNE MAUVAISE MARGE
//
//  Praliné noisettes (96 pces) et Chocolat noir (94 pces) atterrissaient dans
//  « À QUESTIONNER — faible volume ET faible marge », avec une marge affichée « — ».
//  Ben aurait pu SORTIR DE SA GAMME deux parfums qui vendent ~100 pièces, sur la foi d'une
//  marge qu'on n'a JAMAIS MESURÉE.
//
//  Cause : `(margeUnit != null) && (margeUnit >= med)` renvoie `false` sur un `null`.
//  Un null traité comme un false est UN JUGEMENT DÉGUISÉ EN DONNÉE.
//
//  C'est le péché gravé en v1337 (« zéro n'est pas une mesure ») — recommis 19 vagues plus tard.
// ════════════════════════════════════════════════════════════════════════════
console.log('\n-- [v1356] UNE MARGE INCONNUE N EST PAS UNE MAUVAISE MARGE');

// On extrait la VRAIE fonction quadrant du fichier (jamais paraphrasee).
const iQ = SRC.indexOf('const quadrant = (l) => {');
const jQ = SRC.indexOf('};', iQ) + 2;
const BLOC_Q = SRC.slice(iQ, jQ).replace('const quadrant =', 'globalThis.quadrant =');

const medVol = 125, medMarge = 1.43;   // medianes reelles de la gamme de Ben
eval(BLOC_Q);

T('Praline noisettes (96 pces, marge INCONNUE) -> "marge_inconnue", PAS "poids_mort"',
  () => quadrant({ volume: 96, margeUnit: null }), 'marge_inconnue');
T('Chocolat noir (94 pces, marge INCONNUE) -> idem',
  () => quadrant({ volume: 94, margeUnit: null }), 'marge_inconnue');
console.log('      -> avant v1356, ces deux tombaient en "poids_mort" : Ben pouvait les SORTIR de sa gamme.');

console.log('\n-- Les quadrants MESURES restent corrects (non-regression)');
T('gros volume + grosse marge -> pilier',      () => quadrant({ volume: 284, margeUnit: 1.48 }), 'pilier');
T('gros volume + marge sous mediane -> locomotive', () => quadrant({ volume: 285, margeUnit: 1.40 }), 'locomotive');
T('petit volume + grosse marge -> pepite',     () => quadrant({ volume: 61,  margeUnit: 1.47 }), 'pepite');
T('petit volume + petite marge -> poids_mort', () => quadrant({ volume: 37,  margeUnit: 1.34 }), 'poids_mort');
T('zero vente -> dormant',                     () => quadrant({ volume: 0,   margeUnit: 1.50 }), 'dormant');

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- volumes + quadrants coherents')));
process.exit(ko ? 1 : 0);
