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
  'rd-pont-creatif.test.js',     // vague 23 : rdSuggestMaterial (Pont Créatif R&D→Production)
  'order-margins.test.js',       // vague 24 : computeOrderMargins (marge par commande)
  'dlc-anti-recongel.test.js',   // vague 25 : computeDlcFromHistory (DLC anti-recongélation, sanitaire)
  'compute-stats.test.js',       // vague 26 : computeStats (agrégation ventes globale/client)
  'sales-velocity.test.js',      // vague 27 : computeSalesVelocity (vélocité, rupture de stock)
  'forecast.test.js',            // vague 28 : computeForecast (projection réservations datées)
  'market-selection.test.js',    // vague 29 : computeMarketSelection (score composite, classement)
  'market-channel.test.js',      // vague 30 : computeMarketChannelAnalysis (taux d'écoulement)
  'material-needs.test.js',      // vague 31 : computeMaterialNeeds (besoins matières production)
  'gaspillage.test.js',          // vague 32 : computeGaspillage (coût du gaspillage marché)
  'temps-decompo.test.js',       // vague 33 : _tempsDecompoParParfum (traçabilité du temps : le détail doit sommer au total)
  'batch-comptable.test.js',     // vague 34 : _estBatchComptable (dénominateur des moyennes : les composants ne sont pas des batches)
  'temps-par-macaron.test.js',   // vague 35 : temps par macaron et par batch standard de 60 (l'ancienne moyenne divisait par le nb d'enregistrements)
  'copilote-routage.test.js',    // vague 36 : diagnostic du routage du copilote (smWhy/smSkills, aucune compétence fantôme)
  'produits-rentabilite.test.js',// vague 37 : rentabilité par produit (marge réelle, pas chiffre d'affaires)
  'comparaison-periode.test.js', // vague 38 : comparaisons mois/année à périmètre comparable (prorata du temps écoulé)
  'cout-temps-marge.test.js',    // vague 39 : le coût du temps dans les marges (périmètre coques/macarons)
  'marche-temps.test.js',        // vague 40 : rentabilité des marchés rapportée au temps passé sur place
  'prestation-temps.test.js',    // vague 41 : la prestation vend du temps (coût des heures + revenu horaire)
  'pertes-visibles.test.js',     // vague 42 : les pertes ne doivent jamais être cachées (marge négative visible)
  'point-mort.test.js',          // vague 43 : le point mort (combien vendre pour couvrir les charges fixes)
  'point-mort-verite.test.js',   // vague 44 : le point mort disait la moitié de la vérité (URSSAF, impôt et heures hors-atelier oubliés)
  'revenu-horaire.test.js',      // vague 45 : le revenu horaire mentait dans les deux sens (MO comptée 2×, taux unique, impôt absent)
  'emballage-gratuit.test.js'    // vague 46 : l'emballage était gratuit (coutEmballages jamais calculé — prorata d'encaissement, mesuré vs estimé)
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
