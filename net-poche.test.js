/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 11 : computeNetPoche (IR + net)
   ------------------------------------------------------------
   Fige le SOMMET de la chaîne financière : de ton CA jusqu'à ce qui
   te reste réellement en poche.
     1. base imposable = CA après abattement micro (71 % vente / 50 %
        service), avec plafond du minimum légal (305 €/an) ;
     2. impôt sur le revenu = base imposable × taux marginal (tranche) ;
     3. net en poche = CA − cotisations URSSAF − impôt − charges réelles.

   computeNetPoche agrège computeMonthlyBilan (vague 4) + le calcul IR.
   On l'exerce en mode ANNÉE via un faux Dexie (orders, markets, charges)
   et un getSettings stubbé aux valeurs réelles. app.js n'est pas modifié.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// Settings stubbés : taux réels de l'app.
const SETTINGS = {
  socialGoods: 12.3, socialService: 25.6,
  irAbattementGoods: 71, irAbattementService: 50, irAbattementMin: 305,
  irTrancheMarginale: 30
};

function buildModule(fakeDb){
  const money2 = extractConstLine('money2');
  const EVENT_MIN = extractConstLine('EVENT_MIN');
  const monthKey      = extractFunction('monthKey');
  const today         = null;
  const paiementsDe   = extractFunction('paiementsDe');
  const orderToLines  = extractFunction('orderToLines');
  const estReprise    = extractFunction('estReprise');
  const lineTotalStored = extractFunction('lineTotalStored');
  const computeMonthlyBilan = extractFunction('computeMonthlyBilan');
  const _moisDeLannee = extractFunction('_moisDeLannee');
  const _chargesPeriode = extractFunction('_chargesPeriode');
  const _listeMoisAvecActivite = extractFunction('_listeMoisAvecActivite');
  const chargeNature  = extractFunction('chargeNature');
  const computeNetPoche = extractFunction('computeNetPoche');

  // today() multi-lignes
  const { APP } = require('./_extract');
  const todaySrc = APP.match(/const today = \(\) => \{[\s\S]*?\};/)[0];

  const code = `
    const console = { warn:()=>{}, error:()=>{} };
    const db = fakeDb;
    function getSettings(){ return ${JSON.stringify(SETTINGS)}; }
    const CHARGE_INVEST_CATS = ['Matériel'];   // 'Matériel' = invest ; le reste = récurrent
    ${money2}
    ${EVENT_MIN}
    ${todaySrc}
    ${monthKey}
    ${paiementsDe}
    ${orderToLines}
    ${estReprise}
    ${lineTotalStored}
    ${computeMonthlyBilan}
    ${_moisDeLannee}
    ${_chargesPeriode}
    ${_listeMoisAvecActivite}
    ${chargeNature}
    ${computeNetPoche}
    computeNetPoche;
  `;
  return eval(code);
}

function makeDb(t){
  const wrap = a => ({ toArray: async () => (a||[]).slice() });
  return { orders:wrap(t.orders), markets:wrap(t.markets), charges:wrap(t.charges) };
}

let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
async function run(){

// ============================================================================
//  CAS 1 — Année avec vente (goods) + service, sans charge
//  goods = 10 000 (coffret payé), service = 4 000 (prestation payée).
//  Cotisations : 10000×12,3% = 1230 ; 4000×25,6% = 1024 → total 2254.
//  Base imposable : 10000×(1−0,71) + 4000×(1−0,50) = 2900 + 2000 = 4900.
//    (plafond min légal : CA−305 = 13695, non contraignant ici)
//  Impôt : 4900 × 30 % = 1470.
//  Net = CA(14000) − cotis(2254) − impôt(1470) − charges(0) = 10 276.
// ============================================================================
const db1 = makeDb({
  markets: [], charges: [],
  orders: [
    { id:1, date:'2026-03-10', montant:10000,
      lignes:[ {type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]} ],
      paiements:[ {date:'2026-03-10', montant:10000, moyen:'Virement'} ] },
    { id:2, date:'2026-04-01', montant:4000,
      lignes:[ {type:'prestation', montantHT:4000} ],
      paiements:[ {date:'2026-04-01', montant:4000, moyen:'Virement'} ] }
  ]
});
const r1 = await (buildModule(db1))({ type:'annee', year:2026 });
eq(r1.goods, 10000, 'CAS1 · CA vente (goods) = 10 000');
eq(r1.service, 4000, 'CAS1 · CA service = 4 000');
eq(r1.caTotal, 14000, 'CAS1 · CA total = 14 000');
eq(r1.cotisTotal, 2254, 'CAS1 · cotisations = 1230 + 1024 = 2254');
eq(r1.baseGoods, 2900, 'CAS1 · base vente = 10000 × (1 − 0,71) = 2900');
eq(r1.baseService, 2000, 'CAS1 · base service = 4000 × (1 − 0,50) = 2000');
eq(r1.baseImposable, 4900, 'CAS1 · base imposable = 2900 + 2000 = 4900');
eq(r1.impotRevenu, 1470, 'CAS1 · impôt = 4900 × 30 % = 1470');
eq(r1.netAvantCharges, 10276, 'CAS1 · net avant charges = 14000 − 2254 − 1470 = 10 276');
eq(r1.netPoche, 10276, 'CAS1 · net en poche (aucune charge) = 10 276');

// ============================================================================
//  CAS 2 — Avec charges réelles (réduisent la poche, PAS l'imposable)
//  Mêmes ventes + charges 500 (récurrent) + 800 (Matériel = invest).
//  L'impôt ne change pas (charges ≠ abattement). Net = 10 276 − 1300 = 8 976.
// ============================================================================
const db2 = makeDb({
  markets: [],
  orders: db1.orders ? undefined : undefined,   // réutilise via nouveau makeDb ci-dessous
  charges: [
    { date:'2026-05-01', montant:500, categorie:'Énergie' },
    { date:'2026-06-01', montant:800, categorie:'Matériel' }
  ]
});
// recrée les orders (makeDb ne partage pas les tableaux)
const db2full = makeDb({
  markets: [],
  charges: [
    { date:'2026-05-01', montant:500, categorie:'Énergie' },
    { date:'2026-06-01', montant:800, categorie:'Matériel' }
  ],
  orders: [
    { id:1, date:'2026-03-10', montant:10000,
      lignes:[ {type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]} ],
      paiements:[ {date:'2026-03-10', montant:10000, moyen:'Virement'} ] },
    { id:2, date:'2026-04-01', montant:4000,
      lignes:[ {type:'prestation', montantHT:4000} ],
      paiements:[ {date:'2026-04-01', montant:4000, moyen:'Virement'} ] }
  ]
});
const r2 = await (buildModule(db2full))({ type:'annee', year:2026 });
eq(r2.impotRevenu, 1470, 'CAS2 · impôt inchangé par les charges = 1470');
eq(r2.chargesReelles, 1300, 'CAS2 · charges réelles = 500 + 800 = 1300');
eq(r2.chargesInvest, 800, 'CAS2 · charges invest (Matériel) = 800');
eq(r2.chargesRecurrent, 500, 'CAS2 · charges récurrentes (Énergie) = 500');
eq(r2.netPoche, 8976, 'CAS2 · net en poche = 10 276 − 1300 = 8 976');

// ============================================================================
//  CAS 3 — Taux marginal 0 (non imposable) → impôt nul
// ============================================================================
const dbBase = () => makeDb({
  markets: [], charges: [],
  orders: [ { id:1, date:'2026-03-10', montant:10000,
      lignes:[ {type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]} ],
      paiements:[ {date:'2026-03-10', montant:10000, moyen:'Virement'} ] } ]
});
// on rejoue buildModule avec une tranche à 0 en modifiant SETTINGS localement
const savedTranche = SETTINGS.irTrancheMarginale;
SETTINGS.irTrancheMarginale = 0;
const r3 = await (buildModule(dbBase()))({ type:'annee', year:2026 });
SETTINGS.irTrancheMarginale = savedTranche;   // restaure
eq(r3.impotRevenu, 0, 'CAS3 · tranche 0 % → impôt = 0');
// base toujours calculée (2900) mais impôt nul
eq(r3.baseImposable, 2900, 'CAS3 · base imposable = 2900 (vente seule)');

// ============================================================================
//  CAS 4 — Taux de ponction et taux net (indicateurs de synthèse)
//  Reprend le CAS 1 : ponctions = cotis(2254) + impôt(1470) = 3724 sur 14000.
// ============================================================================
eq(r1.totalPonctions, 3724, 'CAS4 · total ponctions = 2254 + 1470 = 3724');
eq(r1.tauxPonction, money2Ref(3724/14000*100), 'CAS4 · taux de ponction = 3724/14000');
eq(r1.tauxNet, money2Ref(10276/14000*100), 'CAS4 · taux net = 10276/14000');

// ============================================================================
//  CAS 5 — Année sans activité → tout à zéro
// ============================================================================
const r5 = await (buildModule(makeDb({ orders:[], markets:[], charges:[] })))({ type:'annee', year:2026 });
eq(r5.caTotal, 0, 'CAS5 · CA = 0');
eq(r5.impotRevenu, 0, 'CAS5 · impôt = 0');
eq(r5.netPoche, 0, 'CAS5 · net en poche = 0');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 11 : computeNetPoche (IR + net) ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }

}
function money2Ref(n){ const v=+n; return isFinite(v) ? Math.round(v*100)/100 : 0; }
run().catch(err=>{ console.error('Erreur test:', err); process.exit(1); });
