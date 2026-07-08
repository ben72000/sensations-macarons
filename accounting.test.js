/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 3 : computeAccounting
   ------------------------------------------------------------
   Fige le CŒUR COMPTABLE : agrégation des encaissements (cash basis),
   CA facturé vs encaissé, ventilation par mois et par mode de paiement,
   EXCLUSION des reprises d'historique (anti double-déclaration URSSAF),
   créances clients, et intégration des ventes de marché clôturées.

   computeAccounting lit 8 tables Dexie. On fournit un FAUX Dexie en
   mémoire (chaque table expose .toArray()) et des jeux de données
   contrôlés. Les coûts matière sont NEUTRALISÉS proprement en passant
   recipes = [] : estimateOrderMaterialCost et avgMacaronCost renvoient
   alors 0 par construction (map sur tableau vide), SANS qu'on modifie
   leur code — ils s'exécutent réellement. On peut ainsi vérifier au
   centime les encaissements et la ventilation, indépendamment des coûts.

   app.js n'est jamais modifié : on extrait le source réel et on
   l'exécute contre le faux Dexie.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// --- Construction du module compta en isolation ----------------------------
function buildModule(fakeDb){
  const money2   = extractConstLine('money2');
  const round3   = extractConstLine('round3');
  const EVENT_MIN= extractConstLine('EVENT_MIN');
  // helpers monétaires agrégés (addMoney utilisé par marketTotals ; inoffensif ici)
  const addMoney = extractConstLine('addMoney');
  const subMoney = extractConstLine('subMoney');

  const monthKey     = extractFunction('monthKey');
  const paiementsDe  = extractFunction('paiementsDe');
  const orderPaid    = extractFunction('orderPaid');
  const orderBalance = extractFunction('orderBalance');
  const orderToLines = extractFunction('orderToLines');
  const estReprise   = extractFunction('estReprise');
  const coutRecette  = extractFunction('coutRecette');
  const estimateOrderMaterialCost = extractFunction('estimateOrderMaterialCost');
  const avgMacaronCost = extractFunction('avgMacaronCost');
  const computeAccounting = extractFunction('computeAccounting');

  // Stubs neutres pour les branches marché (non exercées quand markets = []) :
  //  - marketTotals : renvoyé neutre (coûts 0) ; on ne teste pas les coûts marché ici.
  //  - getSettings  : requis indirectement, valeurs neutres.
  const code = `
    const console = { warn: () => {}, error: () => {} };
    const db = fakeDb;
    ${money2}
    ${round3}
    ${addMoney}
    ${subMoney}
    ${EVENT_MIN}
    ${monthKey}
    ${paiementsDe}
    ${orderPaid}
    ${orderBalance}
    ${orderToLines}
    ${estReprise}
    ${coutRecette}
    ${estimateOrderMaterialCost}
    ${avgMacaronCost}
    // marketTotals neutralisé : coûts à 0 (le CA marché est calculé en amont dans
    // computeAccounting depuis mk.ca, pas via ce helper). Suffisant car on teste le CA,
    // pas les coûts marché (réservés à une vague ultérieure).
    function marketTotals(market, moves, avgUnitMat){
      return { coutMat:0, coutEmb:0, coutMarche:0 };
    }
    ${computeAccounting}
    computeAccounting;
  `;
  return eval(code);
}

// --- Faux Dexie : chaque table expose .toArray() ---------------------------
function makeDb(tables){
  const wrap = (arr) => ({ toArray: async () => (arr || []).slice() });
  return {
    orders:       wrap(tables.orders),
    charges:      wrap(tables.charges),
    recipes:      wrap(tables.recipes),
    recipeItems:  wrap(tables.recipeItems),
    materialLots: wrap(tables.materialLots),
    markets:      wrap(tables.markets),
    marketMoves:  wrap(tables.marketMoves),
    losses:       wrap(tables.losses)
  };
}

// --- Micro-framework --------------------------------------------------------
let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
async function run(){

// ============================================================================
//  CAS 1 — Commandes seules (pas de marché), coûts matière neutralisés
// ============================================================================
// Jeu de données : 3 commandes.
//  A : payée en 2 fois (mai + juin), moyens différents
//  B : partiellement payée (mai)
//  C : REPRISE d'historique (histo:true) → doit être EXCLUE du CA et des cotisations
const db1 = makeDb({
  recipes: [], recipeItems: [], materialLots: [],   // coûts matière = 0
  markets: [], marketMoves: [], losses: [], charges: [],
  orders: [
    { id:1, date:'2026-05-10', montant:100,
      paiements:[ {date:'2026-05-10', montant:30, moyen:'Virement'},
                  {date:'2026-06-02', montant:70, moyen:'Carte'} ] },
    { id:2, date:'2026-05-15', montant:200,
      paiements:[ {date:'2026-05-20', montant:80, moyen:'Espèces'} ] },
    { id:3, date:'2024-01-01', montant:5000, histo:true,
      paiements:[ {date:'2024-01-01', montant:5000, moyen:'Virement'} ] }
  ]
});
const A1 = buildModule(db1);
const r1 = await A1();

// Encaissé total = 30 + 70 + 80 = 180 (la reprise de 5000 est exclue)
eq(r1.totalEncaisse, 180, 'CAS1 · total encaissé = 180 (reprise histo exclue)');
// CA facturé = montant des commandes NON-reprise, à leur date de commande : 100 (mai) + 200 (mai) = 300
eq(r1.totalFacture, 300, 'CAS1 · CA facturé = 300 (reprise exclue du facturé)');
// Reprise comptée à part pour transparence
eq(r1.migCount, 1, 'CAS1 · 1 reprise détectée');
eq(r1.migCA, 5000, 'CAS1 · CA de reprise mis de côté = 5000');
// Ventilation par mois de l'ENCAISSEMENT
const serieByMonth1 = Object.fromEntries(r1.serie.map(s=>[s.mois, s.ca]));
eq(serieByMonth1['2026-05'], 110, 'CAS1 · encaissé mai = 30 + 80 = 110');
eq(serieByMonth1['2026-06'], 70, 'CAS1 · encaissé juin = 70');
// Ventilation par méthode
eq(r1.encByMethod['Virement'], 30, 'CAS1 · Virement = 30');
eq(r1.encByMethod['Carte'], 70, 'CAS1 · Carte = 70');
eq(r1.encByMethod['Espèces'], 80, 'CAS1 · Espèces = 80');
// Créances = solde non encaissé des commandes vivantes : A soldée (0), B doit 120 → 120
eq(r1.creances, 120, 'CAS1 · créances = solde restant de B = 120');
// Coûts matière neutralisés
eq(r1.totalCoutMatieres, 0, 'CAS1 · coût matières = 0 (recipes vides)');
// Résultat = encaissé - charges - coût - pertes = 180 - 0 - 0 - 0 = 180
eq(r1.resultat, 180, 'CAS1 · résultat = 180');
eq(r1.nbCharges, 0, 'CAS1 · aucune charge');

// ============================================================================
//  CAS 2 — Filtre par période : seul mai 2026 est demandé
// ============================================================================
const A2 = buildModule(db1);
const r2 = await A2({ periodeStart:'2026-05-01', periodeEnd:'2026-05-31' });
// Sur mai seul : encaissé = 30 (A, mai) + 80 (B, mai) = 110. Le paiement de juin (70) est hors période.
eq(r2.totalEncaisse, 110, 'CAS2 · encaissé mai seul = 110 (paiement juin exclu)');
// CA facturé mai = 100 + 200 = 300 (les deux commandes datées de mai)
eq(r2.totalFacture, 300, 'CAS2 · facturé mai = 300');
eq(r2.encByMethod['Carte']||0, 0, 'CAS2 · Carte (juin) exclue du mois de mai');

// ============================================================================
//  CAS 3 — Avec charges et pertes
// ============================================================================
const db3 = makeDb({
  recipes: [], recipeItems: [], materialLots: [], markets: [], marketMoves: [],
  orders: [
    { id:1, date:'2026-05-10', montant:100, paiements:[ {date:'2026-05-10', montant:100, moyen:'Carte'} ] }
  ],
  charges: [
    { date:'2026-05-05', montant:25, categorie:'Ingrédients' },
    { date:'2026-05-08', montant:15, categorie:'Emballage' }
  ],
  losses: [
    { date:'2026-05-09', coutTotal:10 }
  ]
});
const A3 = buildModule(db3);
const r3 = await A3();
eq(r3.totalEncaisse, 100, 'CAS3 · encaissé = 100');
eq(r3.totalCharges, 40, 'CAS3 · charges = 25 + 15 = 40');
eq(r3.chargeByCat['Ingrédients'], 25, 'CAS3 · charge Ingrédients = 25');
eq(r3.totalPertes, 10, 'CAS3 · pertes = 10');
// Résultat = 100 - 40 charges - 0 coût - 10 pertes = 50
eq(r3.resultat, 50, 'CAS3 · résultat = 100 - 40 - 10 = 50');

// ============================================================================
//  CAS 4 — Vente de marché clôturée (CA entre dans l'encaissé + ventilation)
//  Fond de caisse déduit des espèces. Coûts marché neutralisés (marketTotals stub).
// ============================================================================
const db4 = makeDb({
  recipes: [], recipeItems: [], materialLots: [], marketMoves: [], losses: [], charges: [],
  orders: [],
  markets: [
    { id:1, date:'2026-05-18', statut:'clos', fondCaisse:50,
      ca:{ especes:200, cb:120, autre:0 } }   // espèces nettes = 200 - 50 = 150
  ]
});
const A4 = buildModule(db4);
const r4 = await A4();
// CA marché encaissé = espèces nettes (150) + cb (120) = 270
eq(r4.totalEncaisse, 270, 'CAS4 · encaissé marché = 150 (esp. nettes) + 120 (CB) = 270');
eq(r4.totalMarches, 270, 'CAS4 · total marchés = 270');
eq(r4.totalFacture, 270, 'CAS4 · marché : facturé = encaissé (vente immédiate)');
// Ventilation méthode : Espèces 150, Carte 120
eq(r4.encByMethod['Espèces'], 150, 'CAS4 · Espèces marché = 150 (fond déduit)');
eq(r4.encByMethod['Carte'], 120, 'CAS4 · Carte marché = 120');
// Un marché NON clos ne doit rien produire
const db4b = makeDb({
  recipes: [], recipeItems: [], materialLots: [], marketMoves: [], losses: [], charges: [], orders: [],
  markets: [ { id:2, date:'2026-05-19', statut:'ouvert', ca:{ especes:100, cb:0, autre:0 } } ]
});
const r4b = await (buildModule(db4b))();
eq(r4b.totalEncaisse, 0, 'CAS4 · marché non clos → ignoré');

// ============================================================================
//  CAS 5 — Base vide → tout à zéro (robustesse)
// ============================================================================
const dbEmpty = makeDb({ orders:[], charges:[], recipes:[], recipeItems:[], materialLots:[], markets:[], marketMoves:[], losses:[] });
const r5 = await (buildModule(dbEmpty))();
eq(r5.totalEncaisse, 0, 'CAS5 · base vide : encaissé = 0');
eq(r5.totalFacture, 0, 'CAS5 · base vide : facturé = 0');
eq(r5.resultat, 0, 'CAS5 · base vide : résultat = 0');
eq(r5.creances, 0, 'CAS5 · base vide : créances = 0');
eq(r5.serie.length, 0, 'CAS5 · base vide : série mensuelle vide');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 3 : computeAccounting ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }

}
run().catch(err=>{ console.error('Erreur test:', err); process.exit(1); });
