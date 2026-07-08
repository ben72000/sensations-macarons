/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 5 : FIFO stock & coût réel
   ------------------------------------------------------------
   Fige le NOYAU du coût de revient matière :
     - lotFifoCompare     : l'ORDRE de consommation des lots
       (reprise d'abord, puis DLC la plus proche, puis réception la plus ancienne)
     - lotPU              : prix unitaire d'un lot (lots d'inventaire = 0)
     - prixCourant        : prix de repli (dernier lot reçu chiffré)
     - coutMatiereFifoReel: simule la consommation FIFO d'une quantité et la
       valorise au prix RÉEL de chaque lot consommé, avec repli honnête sur
       la part non couverte
     - coutRecetteFifoReel: somme ingrédient par ingrédient

   Ces fonctions sont PURES (les lots sont passés en argument, pas de Dexie).
   Une erreur ici fausse tous les coûts de revient, les marges et la rentabilité.
   app.js n'est jamais modifié : on extrait le source réel.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const money2 = extractConstLine('money2');
  const round3 = extractConstLine('round3');
  const lotFifoCompare = extractFunction('lotFifoCompare');
  const lotPU          = extractFunction('lotPU');
  const prixCourant    = extractFunction('prixCourant');
  const coutMatiereFifoReel = extractFunction('coutMatiereFifoReel');
  const coutRecetteFifoReel = extractFunction('coutRecetteFifoReel');

  const code = `
    ${money2}
    ${round3}
    ${lotFifoCompare}
    ${lotPU}
    ${prixCourant}
    ${coutMatiereFifoReel}
    ${coutRecetteFifoReel}
    ({ lotFifoCompare, lotPU, prixCourant, coutMatiereFifoReel, coutRecetteFifoReel });
  `;
  return eval(code);
}
const M = buildModule();

let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// ============================================================================
// 1) lotFifoCompare — l'ordre de consommation
// ============================================================================
// Tri d'un ensemble de lots ; on vérifie l'ordre des id après tri.
const lotsOrdre = [
  { id:'A', dlc:'2026-08-01', dateReception:'2026-05-01' },
  { id:'B', dlc:'2026-06-01', dateReception:'2026-05-10' },   // DLC plus proche → avant A
  { id:'C', dlc:'2026-06-01', dateReception:'2026-04-01' },   // même DLC que B, reçu avant → avant B
  { id:'R', dlc:'2026-12-01', dateReception:'2026-05-20', repriseStock:true } // reprise → tout en tête
];
const ordre = lotsOrdre.slice().sort(M.lotFifoCompare).map(l=>l.id);
eq(ordre, ['R','C','B','A'],
   'lotFifoCompare : reprise d\'abord, puis DLC croissante, puis réception la plus ancienne');

// DLC absente → traitée comme très lointaine ('9999') donc en dernier.
const lotsDlcAbsente = [
  { id:'X', dlc:'2026-06-01', dateReception:'2026-05-01' },
  { id:'Y', dateReception:'2026-05-01' }   // pas de DLC
];
eq(lotsDlcAbsente.slice().sort(M.lotFifoCompare).map(l=>l.id), ['X','Y'],
   'lotFifoCompare : lot sans DLC part en dernier (DLC = 9999 par défaut)');

// ============================================================================
// 2) lotPU — prix unitaire d'un lot
// ============================================================================
eq(M.lotPU({ prixUnitaire:2.5 }), 2.5, 'lotPU : prixUnitaire explicite');
eq(M.lotPU({ prix:10, qteInitiale:4 }), 2.5, 'lotPU : prix/qteInitiale si pas de prixUnitaire');
eq(M.lotPU({ qteInitiale:0 }), 0, 'lotPU : qteInitiale 0 → 0 (pas de division par zéro)');
eq(M.lotPU({ prixUnitaire:2.5, inventaire:true }), 0,
   'lotPU : lot d\'inventaire (régularisation) → jamais chiffré = 0 [POINT H]');

// ============================================================================
// 3) prixCourant — prix de repli (dernier lot reçu chiffré)
// ============================================================================
const lotsPrix = [
  { materialId:1, prixUnitaire:2.0, dateReception:'2026-03-01', qteInitiale:5 },
  { materialId:1, prixUnitaire:3.0, dateReception:'2026-05-01', qteInitiale:5 }  // plus récent
];
eq(M.prixCourant(1, lotsPrix), 3.0, 'prixCourant : prend le dernier lot reçu chiffré (3.0)');
eq(M.prixCourant(999, lotsPrix), 0, 'prixCourant : matière inconnue → 0');
// Repli sur prix indicatif de la matière (mats fourni) quand aucun lot.
eq(M.prixCourant(2, [], [{ id:2, prixDefaut:12, unite:'kg' }]), 12,
   'prixCourant : sans lot → prixDefaut de la matière (€/kg)');
eq(M.prixCourant(3, [], [{ id:3, prixDefaut:12, unite:'g' }]), 0.012,
   'prixCourant : matière en grammes → prixDefaut converti (12 €/kg = 0,012 €/g)');

// ============================================================================
// 4) coutMatiereFifoReel — consommation valorisée au prix réel des lots
// ============================================================================
// Deux lots du même matériau : un ancien à 2 €/u (3 u), un récent à 3 €/u (10 u).
// On consomme 5 u en FIFO : 3 u @2 + 2 u @3 = 6 + 6 = 12 €. PU moyen = 12/5 = 2,4.
const lots2 = [
  { id:'L1', materialId:1, prixUnitaire:2, qteRestante:3, qteInitiale:3, dlc:'2026-06-01', dateReception:'2026-04-01' },
  { id:'L2', materialId:1, prixUnitaire:3, qteRestante:10, qteInitiale:10, dlc:'2026-08-01', dateReception:'2026-05-01' }
];
const c1 = M.coutMatiereFifoReel(1, 5, lots2, 'restant');
eq(c1.cout, 12, 'coutMatiereFifoReel : 3@2 + 2@3 = 12 €');
eq(c1.couvert, 5, 'coutMatiereFifoReel : 5 u couvertes');
eq(c1.manque, 0, 'coutMatiereFifoReel : rien en manque');
eq(c1.puUnitMoyen, 2.4, 'coutMatiereFifoReel : PU moyen = 12/5 = 2,4');
eq(c1.tranches.length, 2, 'coutMatiereFifoReel : 2 tranches (2 lots consommés)');
eq(c1.tranches[0], {lotId:'L1', pris:3, pu:2}, 'coutMatiereFifoReel : 1re tranche = lot ancien (FIFO)');

// Quantité nulle → coût nul.
eq(M.coutMatiereFifoReel(1, 0, lots2, 'restant'),
   {cout:0, couvert:0, manque:0, puUnitMoyen:0, tranches:[]},
   'coutMatiereFifoReel : quantité 0 → résultat nul');

// ============================================================================
// 5) coutMatiereFifoReel — repli sur prix courant pour la part non couverte
// ============================================================================
// Un seul lot de 2 u @2 €, on demande 5 u. Couvert : 2 u @2 = 4 €.
// Manque 3 u → valorisées au prix courant (= dernier lot chiffré = 2 €) → +6 €. Total 10 €.
const lots3 = [
  { id:'L1', materialId:1, prixUnitaire:2, qteRestante:2, qteInitiale:2, dlc:'2026-06-01', dateReception:'2026-04-01' }
];
const c2 = M.coutMatiereFifoReel(1, 5, lots3, 'restant');
eq(c2.couvert, 2, 'coutMatiereFifoReel : 2 u couvertes par le stock');
eq(c2.manque, 3, 'coutMatiereFifoReel : 3 u en manque');
eq(c2.cout, 10, 'coutMatiereFifoReel : 4 € (stock) + 6 € (repli prix courant) = 10 €');
const trRepli = c2.tranches[c2.tranches.length-1];
eq(trRepli.repli, true, 'coutMatiereFifoReel : dernière tranche marquée « repli »');

// ============================================================================
// 6) coutMatiereFifoReel — mode 'initial' vs 'restant'
// ============================================================================
// Lot entamé : qteInitiale 10, qteRestante 2, prix 5.
// mode 'restant' : ne peut couvrir que 2 → coût sur 2 (+ repli pour le reste).
// mode 'initial' : puise dans la quantité initiale (10) → couvre 4 sans repli.
const lot4 = [
  { id:'L', materialId:1, prixUnitaire:5, qteRestante:2, qteInitiale:10, dlc:'2026-06-01', dateReception:'2026-04-01' }
];
const cRestant = M.coutMatiereFifoReel(1, 4, lot4, 'restant');
eq(cRestant.couvert, 2, "mode 'restant' : couvre seulement le stock restant (2)");
const cInitial = M.coutMatiereFifoReel(1, 4, lot4, 'initial');
eq(cInitial.couvert, 4, "mode 'initial' : puise dans la quantité initiale (couvre 4)");
eq(cInitial.cout, 20, "mode 'initial' : 4 u @5 = 20 €");

// ============================================================================
// 7) coutMatiereFifoReel — les lots d'inventaire (PU=0) sont ignorés
// ============================================================================
const lotsInv = [
  { id:'INV', materialId:1, prixUnitaire:2, inventaire:true, qteRestante:100, qteInitiale:100, dlc:'2026-05-01', dateReception:'2026-03-01' },
  { id:'L1',  materialId:1, prixUnitaire:3, qteRestante:10, qteInitiale:10, dlc:'2026-08-01', dateReception:'2026-05-01' }
];
const c3 = M.coutMatiereFifoReel(1, 4, lotsInv, 'restant');
eq(c3.tranches[0].lotId, 'L1', 'coutMatiereFifoReel : lot d\'inventaire (PU 0) ignoré, on consomme le lot chiffré');
eq(c3.cout, 12, 'coutMatiereFifoReel : 4 u @3 = 12 € (inventaire non compté)');

// ============================================================================
// 8) coutRecetteFifoReel — somme sur les ingrédients d'une recette
// ============================================================================
// Recette 1 : 2 ingrédients. Ing.10 : 2 u @2 ; Ing.11 : 1 u @5.
const items = [
  { recipeId:1, materialId:10, qteParBatch:2 },
  { recipeId:1, materialId:11, qteParBatch:1 },
  { recipeId:2, materialId:10, qteParBatch:99 }   // autre recette, ne doit pas compter
];
const lotsRec = [
  { id:'a', materialId:10, prixUnitaire:2, qteRestante:100, qteInitiale:100, dlc:'2026-08-01', dateReception:'2026-05-01' },
  { id:'b', materialId:11, prixUnitaire:5, qteRestante:100, qteInitiale:100, dlc:'2026-08-01', dateReception:'2026-05-01' }
];
eq(M.coutRecetteFifoReel(1, items, lotsRec, 'restant'), 9,
   'coutRecetteFifoReel : (2×2) + (1×5) = 9 € pour la recette 1 (recette 2 ignorée)');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 5 : FIFO stock & coût réel ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }
