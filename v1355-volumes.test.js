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

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- volumes coherents')));
process.exit(ko ? 1 : 0);
