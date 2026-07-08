/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 9 : computeAvgSellPrice
   ------------------------------------------------------------
   Fige le PRIX DE VENTE MOYEN par macaron, qui alimente les calculs
   de rentabilité. Il agrège :
     - les commandes (coffrets : capacité × prix par pièce du format) ;
     - les marchés clos avec comptage d'emballages (coffrets vendus =
       before − after, valorisés au prix du format) ;
     - un repli sur la moyenne de la grille tarifaire si aucune vente.

   Cibles (toutes pures, données passées en argument, pas de Dexie) :
     - prixParPiece          : prix/pièce d'un format (exact, plus proche, repli)
     - marketFormatBreakdown : coffrets vendus d'un marché, CA théorique
     - computeAvgSellPrice    : moyenne pondérée CA / pièces, ou repli grille

   settings est fourni explicitement dans data → getSettings() n'est
   pas appelé. app.js n'est jamais modifié : on extrait le source réel.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// Grille tarifaire réelle (défauts de l'app) : capacité → prix PAR PIÈCE.
const SETTINGS = { prixParFormat: { 6:2.00, 8:2.00, 16:1.75, 25:1.68 }, prixVenteUnitaire: 1.90 };

function buildModule(){
  const money2 = extractConstLine('money2');
  const round3 = extractConstLine('round3');
  const orderToLines = extractFunction('orderToLines');
  const prixParPiece = extractFunction('prixParPiece');
  const marketFormatBreakdown = extractFunction('marketFormatBreakdown');
  const computeAvgSellPrice   = extractFunction('computeAvgSellPrice');

  const code = `
    function getSettings(){ return ${JSON.stringify(SETTINGS)}; }
    ${money2}
    ${round3}
    ${orderToLines}
    ${prixParPiece}
    ${marketFormatBreakdown}
    ${computeAvgSellPrice}
    ({ prixParPiece, marketFormatBreakdown, computeAvgSellPrice });
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
// 1) prixParPiece — prix/pièce d'un format
// ============================================================================
eq(M.prixParPiece(6, SETTINGS), 2.00, 'prixParPiece(6) = 2,00 (format exact)');
eq(M.prixParPiece(16, SETTINGS), 1.75, 'prixParPiece(16) = 1,75 (format exact)');
// Format absent (10) → le plus proche de la grille {6,8,16,25} est 8 (écart 2) → 2,00.
eq(M.prixParPiece(10, SETTINGS), 2.00, 'prixParPiece(10) → format le plus proche (8) = 2,00');
// Format 20 → le plus proche est 16 (écart 4) vs 25 (écart 5) → 16 = 1,75.
eq(M.prixParPiece(20, SETTINGS), 1.75, 'prixParPiece(20) → plus proche (16) = 1,75');
// Grille vide → repli sur prixVenteUnitaire.
eq(M.prixParPiece(6, { prixParFormat:{}, prixVenteUnitaire:1.90 }), 1.90,
   'prixParPiece : grille vide → prixVenteUnitaire (1,90)');

// ============================================================================
// 2) marketFormatBreakdown — coffrets vendus d'un marché
// ============================================================================
// 1 marché : 5 coffrets de 6 vendus (before 10, after 5) + 2 coffrets de 16 (before 8, after 6).
// Pièces : 5×6 = 30 @2,00 = 60 € ; 2×16 = 32 @1,75 = 56 €. Total 116 €, 62 pièces.
const mk1 = { statut:'clos', packaging:[
  { nom:'Boîte 6',  capacite:6,  before:10, after:5 },
  { nom:'Boîte 16', capacite:16, before:8,  after:6 }
]};
const b1 = M.marketFormatBreakdown(mk1, SETTINGS);
eq(b1.piecesFormats, 62, 'breakdown : 30 + 32 = 62 pièces');
eq(b1.caTheo, 116, 'breakdown : (30×2,00) + (32×1,75) = 116 €');
eq(b1.coffrets, 7, 'breakdown : 5 + 2 = 7 coffrets');
eq(b1.prixMoyen, 1.87, 'breakdown : 116 / 62 = 1,87 €/pièce');
eq(b1.hasData, true, 'breakdown : hasData = true');
// Ligne sans vente (before = after) → ignorée.
const b2 = M.marketFormatBreakdown({ statut:'clos', packaging:[
  { nom:'Boîte 8', capacite:8, before:5, after:5 }
]}, SETTINGS);
eq(b2.piecesFormats, 0, 'breakdown : 0 coffret vendu → 0 pièce');
eq(b2.hasData, false, 'breakdown : aucune donnée → hasData false');

// ============================================================================
// 3) computeAvgSellPrice — commandes coffret seules
// ============================================================================
// 1 commande : coffret 6 (6 × 2,00 = 12 €, 6 pièces) + coffret 16 (16 × 1,75 = 28 €, 16 pièces).
// Prix moyen = (12 + 28) / (6 + 16) = 40 / 22 = 1,8181… → 1,82.
const orders1 = [
  { id:1, lignes:[ {type:'coffret', taille:6,  parfums:[{nom:'A',qte:6}]},
                   {type:'coffret', taille:16, parfums:[{nom:'B',qte:16}]} ] }
];
const r1 = M.computeAvgSellPrice({ orders:orders1, markets:[], settings:SETTINGS });
eq(r1.prix, 1.82, 'avgSell : (12 + 28) / 22 = 1,82 €/pièce');
eq(r1.pieces, 22, 'avgSell : 22 pièces');
eq(r1.source, 'ventes', 'avgSell : source = ventes');

// Les lignes NON-coffret (prestation, vrac) sont ignorées (taille inconnue).
const orders2 = [
  { id:2, lignes:[ {type:'coffret', taille:6, parfums:[{nom:'A',qte:6}]},
                   {type:'prestation', montantHT:300},
                   {type:'vrac', parfums:[{nom:'B',qte:50}]} ] }
];
const r2 = M.computeAvgSellPrice({ orders:orders2, markets:[], settings:SETTINGS });
eq(r2.prix, 2.00, 'avgSell : seul le coffret 6 compte → 2,00 €/pièce');
eq(r2.pieces, 6, 'avgSell : 6 pièces (prestation et vrac ignorés)');

// ============================================================================
// 4) computeAvgSellPrice — commandes + marchés combinés
// ============================================================================
// Commande : coffret 6 = 12 € / 6 p. Marché mk1 = 116 € / 62 p.
// Total = 128 € / 68 p = 1,882… → 1,88.
const r3 = M.computeAvgSellPrice({
  orders:[ { id:3, lignes:[ {type:'coffret', taille:6, parfums:[{nom:'A',qte:6}]} ] } ],
  markets:[ mk1 ],
  settings:SETTINGS
});
eq(r3.pieces, 68, 'avgSell : 6 (commande) + 62 (marché) = 68 pièces');
eq(r3.prix, 1.88, 'avgSell : 128 / 68 = 1,88 €/pièce');

// Un marché NON clos est ignoré.
const r3b = M.computeAvgSellPrice({
  orders:[],
  markets:[ Object.assign({}, mk1, { statut:'ouvert' }) ],
  settings:SETTINGS
});
eq(r3b.source, 'grille', 'avgSell : marché non clos ignoré → repli grille');

// ============================================================================
// 5) computeAvgSellPrice — repli grille (aucune vente)
// ============================================================================
// Aucune commande ni marché : moyenne simple de la grille {2,00 ; 2,00 ; 1,75 ; 1,68}
// = 7,43 / 4 = 1,8575 → 1,86.
const r4 = M.computeAvgSellPrice({ orders:[], markets:[], settings:SETTINGS });
eq(r4.prix, 1.86, 'avgSell : aucune vente → moyenne de la grille = 1,86');
eq(r4.pieces, 0, 'avgSell : repli → 0 pièce');
eq(r4.source, 'grille', 'avgSell : source = grille');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 9 : computeAvgSellPrice ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }
