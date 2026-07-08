/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 10 : coûts marché
   ------------------------------------------------------------
   Fige la MARGE NETTE PAR MARCHÉ, volet rentabilité terrain :
     - computeDeliveryCost : coût du déplacement (carburant A/R + temps
       de route A/R au taux horaire) ;
     - marketTotals        : synthèse d'un marché — vendu (sortie − retour
       − don − perte), CA net (fond de caisse déduit des espèces), coûts
       (matière des vendus, emballage réel, stand + déplacement), marge
       brute, charges sociales marchandise, marge nette.

   Toutes pures : données + settings passés / stubbés, pas de Dexie.
   _embEstRatioMarches = null → pas d'estimation d'emballage, on prend le
   coût réel (comptage de boîtes). app.js n'est jamais modifié.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// Settings stubbés (défauts réels de l'app).
const SETTINGS = { socialGoods: 12.3, socialService: 25.6, laborRate: 15, vehicleConso: 7 };

function buildModule(){
  const money2 = extractConstLine('money2');
  const round3 = extractConstLine('round3');
  const addMoney = extractConstLine('addMoney');
  const addQty = extractConstLine('addQty');
  const subQty = extractConstLine('subQty');
  const marketLineSummary   = extractFunction('marketLineSummary');
  const marketPackagingCost = extractFunction('marketPackagingCost');
  const computeDeliveryCost = extractFunction('computeDeliveryCost');
  const marketTotals        = extractFunction('marketTotals');

  const code = `
    function getSettings(){ return ${JSON.stringify(SETTINGS)}; }
    const _embEstRatioMarches = null;   // pas d'estimation → coût emballage réel
    ${money2}
    ${round3}
    ${addMoney}
    ${addQty}
    ${subQty}
    ${marketLineSummary}
    ${marketPackagingCost}
    ${computeDeliveryCost}
    ${marketTotals}
    ({ computeDeliveryCost, marketLineSummary, marketPackagingCost, marketTotals });
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
// 1) computeDeliveryCost — carburant A/R + temps A/R
// ============================================================================
// 10 km aller → 20 A/R. Conso 7 L/100. Prix 1,80 €/L.
// Carburant = 20 × (7/100) × 1,80 = 20 × 0,07 × 1,80 = 2,52 €.
// 30 min aller → 60 min A/R = 1 h × 15 €/h = 15 €. Total = 17,52 €.
const d1 = M.computeDeliveryCost({ distanceKm:10, prixCarburant:1.80, tempsLivraisonMin:30 });
eq(d1.distAR, 20, 'delivery : distance A/R = 2 × 10 = 20 km');
eq(d1.coutCarburant, 2.52, 'delivery : carburant = 20 × 0,07 × 1,80 = 2,52 €');
eq(d1.coutTemps, 15, 'delivery : temps = 1 h × 15 €/h = 15 €');
eq(d1.total, 17.52, 'delivery : total = 2,52 + 15 = 17,52 €');
eq(d1.actif, true, 'delivery : actif (distance ou temps > 0)');

// Conso réelle du véhicule saisie pour cette course prime sur le réglage global.
const d2 = M.computeDeliveryCost({ distanceKm:10, prixCarburant:1.80, consoVehicule:10 });
eq(d2.coutCarburant, 3.6, 'delivery : conso saisie (10 L/100) → 20 × 0,10 × 1,80 = 3,60 €');

// Sans distance ni temps → tout à zéro, inactif.
const d3 = M.computeDeliveryCost({});
eq(d3.total, 0, 'delivery : sans donnée → 0 €');
eq(d3.actif, false, 'delivery : inactif');

// ============================================================================
// 2) marketTotals — vendu = sortie − retour − don − perte
// ============================================================================
// Un parfum : 100 sortis, 10 retour, 5 don, 5 perte → vendu = 80.
const moves1 = [
  { parfum:'Vanille', productionId:1, type:'sortie', qte:100 },
  { parfum:'Vanille', productionId:1, type:'retour', qte:10 },
  { parfum:'Vanille', productionId:1, type:'don',    qte:5 },
  { parfum:'Vanille', productionId:1, type:'perte',  qte:5 }
];
// Marché : espèces 250 (fond 50 → net 200), CB 100. CA total = 300.
// Coût matière : avgUnit = 0,30 €/macaron sur 80 vendus = 24 €.
// Emballage : comptage 20 boîtes @0,50 = 10 €. Stand 30 €. Pas de déplacement.
const mk1 = {
  statut:'clos', fondCaisse:50, ca:{ especes:250, cb:100, autre:0 },
  coutStand:30, distanceKm:0, tempsRouteMin:0,
  packaging:[ { nom:'Boîte 6', capacite:6, before:20, after:0, cost:0.50 } ]
};
const T1 = M.marketTotals(mk1, moves1, 0.30);
eq(T1.vendu, 80, 'marketTotals : vendu = 100 − 10 − 5 − 5 = 80');
eq(T1.caEspeces, 200, 'marketTotals : espèces nettes = 250 − 50 (fond) = 200');
eq(T1.caCB, 100, 'marketTotals : CB = 100');
eq(T1.caTotal, 300, 'marketTotals : CA total = 200 + 100 = 300');
eq(T1.coutMat, 24, 'marketTotals : coût matière = 80 × 0,30 = 24 €');
eq(T1.coutEmb, 10, 'marketTotals : emballage réel = 20 × 0,50 = 10 €');
eq(T1.coutStand, 30, 'marketTotals : stand = 30 €');
eq(T1.coutMarche, 30, 'marketTotals : frais marché = stand 30 + déplacement 0 = 30 €');
// Marge brute = CA − matière − emballage − frais marché = 300 − 24 − 10 − 30 = 236.
eq(T1.margeBrute, 236, 'marketTotals : marge brute = 300 − 24 − 10 − 30 = 236 €');
// Charges sociales marchandise = 300 × 12,3 % = 36,90.
eq(T1.chargesSociales, 36.9, 'marketTotals : charges sociales = 300 × 12,3 % = 36,90 €');
// Marge nette = 236 − 36,90 = 199,10.
eq(T1.margeNette, 199.1, 'marketTotals : marge nette = 236 − 36,90 = 199,10 €');

// ============================================================================
// 3) marketTotals — taux d'invendus et de perte
// ============================================================================
// embarqué (sortie) = 100 ; invendus = retour + don + perte = 20 → 20 %.
eq(T1.tauxInvendus, 20, 'marketTotals : taux invendus = 20/100 = 20 %');
eq(T1.tauxPerte, 5, 'marketTotals : taux perte = 5/100 = 5 %');

// ============================================================================
// 4) marketTotals — avec déplacement (carburant + temps)
// ============================================================================
// Même marché, + 10 km aller et 30 min aller. Déplacement = 17,52 € (cf. cas 1).
// Frais marché = stand 30 + 17,52 = 47,52.
const mk2 = Object.assign({}, mk1, { distanceKm:10, prixCarburant:1.80, tempsRouteMin:30 });
const T2 = M.marketTotals(mk2, moves1, 0.30);
eq(T2.deplacement.total, 17.52, 'marketTotals : déplacement = 17,52 €');
eq(T2.coutMarche, 47.52, 'marketTotals : frais marché = 30 + 17,52 = 47,52 €');
// Marge brute = 300 − 24 − 10 − 47,52 = 218,48.
eq(T2.margeBrute, 218.48, 'marketTotals : marge brute avec déplacement = 218,48 €');

// ============================================================================
// 5) marketTotals — fond de caisse jamais négatif
// ============================================================================
// Espèces 30, fond 50 → net = max(0, 30 − 50) = 0 (pas négatif).
const mk3 = { statut:'clos', fondCaisse:50, ca:{ especes:30, cb:0, autre:0 }, packaging:[] };
const T3 = M.marketTotals(mk3, [], 0);
eq(T3.caEspeces, 0, 'marketTotals : espèces nettes plancher à 0 (30 − 50 → 0)');
eq(T3.caTotal, 0, 'marketTotals : CA total = 0');

// ============================================================================
// 6) marketLineSummary — incohérence détectée (vendu négatif)
// ============================================================================
// Retour supérieur à la sortie → vendu négatif → drapeau incohérent.
const movesInc = [
  { parfum:'X', productionId:1, type:'sortie', qte:10 },
  { parfum:'X', productionId:1, type:'retour', qte:15 }
];
const lines = M.marketLineSummary(movesInc);
eq(lines[0].vendu, 0, 'lineSummary : vendu plancher à 0 malgré retour > sortie');
eq(lines[0].incoherent, true, 'lineSummary : incohérence signalée (retour > sortie)');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 10 : coûts marché ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }
