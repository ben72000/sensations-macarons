/* ============================================================
   LANCEUR DE TESTS — Sensations Macarons
   ------------------------------------------------------------
   Exécute toute la suite de tests de caractérisation et agrège
   les résultats. Un seul échec quelque part → code de sortie 1.

   Usage :  node tests/run-all.js
   ============================================================ */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'characterization.test.js',   // vague 1 : briques pures (argent, dates, DLC, facture)
  'order.test.js',              // vague 2 : famille « commande » (paiements, solde, reprise)
  'accounting.test.js',         // vague 3 : computeAccounting (cœur compta / URSSAF)
  'monthly-bilan.test.js',      // vague 4 : computeMonthlyBilan (ventilation + cotisations)
  'fifo-stock.test.js',         // vague 5 : FIFO stock & coût réel des lots consommés
  'order-pricing.test.js',      // vague 6 : prix de vente des lignes (CA commande)
  'assembly.test.js',           // vague 7 : assemblage chantilly (potentiel min coques/ganache)
  'assembly-decrement.test.js', // vague 8 : décrément transactionnel 3 composants (chantache)
  'avg-sell-price.test.js',     // vague 9 : computeAvgSellPrice (prix de vente moyen)
  'market-costs.test.js',       // vague 10 : coûts marché (marketTotals + computeDeliveryCost)
  'net-poche.test.js',          // vague 11 : computeNetPoche (IR + net en poche)
  'batch-picking.test.js',      // vague 12 : batch picking (agrégation besoins lot, résolution parfum)
  'tresorerie.test.js',         // vague 13 : computeTresorerie (projection J+30/60/90)
  'scenario-prix.test.js',      // vague 14 : computeScenarioPrix (module scénarios prix)
  'panier-moyen.test.js',       // vague 15 : ventilation panier moyen par type dominant
  'fifo-materiel.test.js',      // vague 16 : FIFO matières (décrément/restock, filet refactoring)
  'allocate-batches.test.js',   // vague 17 : allocateBatches (moteur picking FIFO/zone)
  'numerotation-legale.test.js', // vague 18 : numérotation légale factures/avoirs (art. 242 nonies A CGI)
  'seuils-fiscaux.test.js',      // vague 19 : computeSeuilsFiscaux (jauges TVA/micro, projection)
  'pilotage-ca.test.js',         // vague 20 : computePilotageCA (leviers, panier moyen hors événement)
  'pilotage-strategic.test.js',  // vague 21 : computeStrategic (panier, marges, clients actifs)
  'prevision-revenu.test.js',    // vague 22 : computePrevisionRevenu (tendance + carnet)
  'rd-pont-creatif.test.js'      // vague 23 : rdSuggestMaterial (Pont Créatif R&D→Production)
];

let allOk = true;
console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   SUITE DE TESTS — Sensations Macarons           ║');
console.log('╚══════════════════════════════════════════════════╝');

for(const suite of SUITES){
  try{
    const out = execFileSync('node', [path.join(__dirname, suite)], { encoding:'utf8' });
    process.stdout.write(out);
  }catch(err){
    allOk = false;
    if(err.stdout) process.stdout.write(err.stdout);
    if(err.stderr) process.stderr.write(err.stderr);
  }
}

console.log('──────────────────────────────────────────────────');
if(allOk){
  console.log('✓ TOUTE LA SUITE EST VERTE — aucune régression.\n');
  process.exit(0);
}else{
  console.log('✗ AU MOINS UNE SUITE A ÉCHOUÉ — voir ci-dessus.\n');
  process.exit(1);
}
