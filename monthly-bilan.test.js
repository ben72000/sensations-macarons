/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 4 : computeMonthlyBilan
   ------------------------------------------------------------
   Fige la VENTILATION MENSUELLE du CA encaissé entre :
     - marchandise (goods)  → macarons, coffrets, marchés
     - prestation de service (service) → ateliers/coaching (lignes 'prestation')
   puis le calcul des COTISATIONS URSSAF aux deux taux distincts
   (micro-entreprise : marchandise ≠ service). Une erreur ici = base
   de déclaration URSSAF fausse.

   computeMonthlyBilan lit 2 tables (orders, markets) + getSettings.
   On fournit un faux Dexie et un getSettings stubbé avec les taux
   réels (12,3 % marchandise / 25,6 % service). app.js n'est pas modifié.

   Rappel : la ventilation se fait sur les ENCAISSEMENTS DU MOIS demandé
   (cash basis), au prorata de la part service de chaque commande.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// Taux URSSAF injectés (identiques aux défauts de l'app, pour un test réaliste et stable).
const TAUX_GOODS = 12.3;
const TAUX_SERVICE = 25.6;

function buildModule(fakeDb){
  const money2   = extractConstLine('money2');
  const EVENT_MIN= extractConstLine('EVENT_MIN');
  const monthKey     = extractFunction('monthKey');
  const paiementsDe  = extractFunction('paiementsDe');
  const orderToLines = extractFunction('orderToLines');
  const estReprise   = extractFunction('estReprise');
  const lineTotalStored = extractFunction('lineTotalStored');
  // [v1325] La règle de ventilation service/marchandise a été EXTRAITE de computeMonthlyBilan en
  // fonction pure partagée (partServiceCommande), pour que le revenu horaire cesse d'appliquer le
  // taux marchandise aux prestations. Le comportement du bilan mensuel ne doit PAS bouger d'un
  // centime : les 28 assertions ci-dessous en sont la preuve.
  const partServiceCommande = extractFunction('partServiceCommande');
  const computeMonthlyBilan = extractFunction('computeMonthlyBilan');

  // getSettings stubbé : seuls socialGoods/socialService sont lus par computeMonthlyBilan.
  const code = `
    const console = { warn: () => {}, error: () => {} };
    const db = fakeDb;
    function getSettings(){ return { socialGoods: ${TAUX_GOODS}, socialService: ${TAUX_SERVICE} }; }
    ${money2}
    ${EVENT_MIN}
    ${monthKey}
    ${paiementsDe}
    ${orderToLines}
    ${estReprise}
    ${lineTotalStored}
    ${partServiceCommande}
    ${computeMonthlyBilan}
    computeMonthlyBilan;
  `;
  return eval(code);
}

function makeDb(tables){
  const ordersArr = tables.orders || [];
  const wrap = (arr) => ({ toArray: async () => (arr || []).slice() });
  const documents = tables.documents || [];
  return {
    orders: { toArray: async()=>ordersArr.slice(), get: async(id)=>ordersArr.find(o=>+o.id===+id)||null },
    markets: wrap(tables.markets),
    documents: { where: (field) => ({ equals: (val) => ({ toArray: async () => documents.filter(d=>d[field]===val) }) }) } };
}

let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
async function run(){

// ============================================================================
//  CAS 1 — Commande 100 % marchandise (coffret) encaissée dans le mois
// ============================================================================
const db1 = makeDb({ markets: [], orders: [
  { id:1, date:'2026-05-10', montant:120,
    lignes:[ {type:'coffret', taille:16, parfums:[{nom:'Café', qte:16}]} ],
    paiements:[ {date:'2026-05-12', montant:120, moyen:'Carte'} ] }
]});
const r1 = await (buildModule(db1))('2026-05');
eq(r1.goods, 120, 'CAS1 · marchandise = 120 (coffret)');
eq(r1.service, 0, 'CAS1 · service = 0');
eq(r1.caTotal, 120, 'CAS1 · CA total = 120');
eq(r1.cotisGoods, money2Ref(120*TAUX_GOODS/100), 'CAS1 · cotis marchandise = 120 × 12,3 %');
eq(r1.cotisService, 0, 'CAS1 · cotis service = 0');
eq(r1.cotisTotal, money2Ref(120*TAUX_GOODS/100), 'CAS1 · cotis total = cotis marchandise');

// ============================================================================
//  CAS 2 — Commande 100 % service (prestation/atelier)
// ============================================================================
const db2 = makeDb({ markets: [], orders: [
  { id:2, date:'2026-05-01', montant:300,
    lignes:[ {type:'prestation', montantHT:300} ],
    paiements:[ {date:'2026-05-03', montant:300, moyen:'Virement'} ] }
]});
const r2 = await (buildModule(db2))('2026-05');
eq(r2.goods, 0, 'CAS2 · marchandise = 0');
eq(r2.service, 300, 'CAS2 · service = 300 (prestation)');
eq(r2.cotisService, money2Ref(300*TAUX_SERVICE/100), 'CAS2 · cotis service = 300 × 25,6 %');
eq(r2.cotisGoods, 0, 'CAS2 · cotis marchandise = 0');

// ============================================================================
//  CAS 3 — Commande MIXTE : coffret + prestation, ventilation au prorata
// ============================================================================
// Montant total 500 : prestation 300 (service) + coffret (marchandise = reste).
// partSvc = svc / total = 300/500 = 0,6. Encaissement du mois = 500.
// → service = 500 × 0,6 = 300 ; goods = 500 − 300 = 200.
const db3 = makeDb({ markets: [], orders: [
  { id:3, date:'2026-05-05', montant:500,
    lignes:[ {type:'coffret', taille:16, parfums:[{nom:'Vanille', qte:16}]},
             {type:'prestation', montantHT:300} ],
    paiements:[ {date:'2026-05-06', montant:500, moyen:'Virement'} ] }
]});
const r3 = await (buildModule(db3))('2026-05');
eq(r3.service, 300, 'CAS3 · service = 500 × (300/500) = 300');
eq(r3.goods, 200, 'CAS3 · marchandise = 500 − 300 = 200');
eq(r3.caTotal, 500, 'CAS3 · CA total = 500');
eq(r3.cotisGoods, money2Ref(200*TAUX_GOODS/100), 'CAS3 · cotis marchandise sur 200');
eq(r3.cotisService, money2Ref(300*TAUX_SERVICE/100), 'CAS3 · cotis service sur 300');

// ============================================================================
//  CAS 4 — Encaissement PARTIEL : la ventilation suit l'encaissé du mois
// ============================================================================
// Mixte 500 (part service 0,6), mais seuls 250 encaissés en mai.
// service = 250 × 0,6 = 150 ; goods = 250 − 150 = 100.
const db4 = makeDb({ markets: [], orders: [
  { id:4, date:'2026-05-05', montant:500,
    lignes:[ {type:'coffret', taille:16, parfums:[{nom:'Vanille', qte:16}]},
             {type:'prestation', montantHT:300} ],
    paiements:[ {date:'2026-05-10', montant:250, moyen:'Carte'} ] }
]});
const r4 = await (buildModule(db4))('2026-05');
eq(r4.service, 150, 'CAS4 · service = 250 × 0,6 = 150 (prorata sur encaissé)');
eq(r4.goods, 100, 'CAS4 · marchandise = 250 − 150 = 100');

// ============================================================================
//  CAS 5 — Paiement hors du mois demandé → ignoré
// ============================================================================
const db5 = makeDb({ markets: [], orders: [
  { id:5, date:'2026-05-05', montant:100,
    lignes:[ {type:'coffret', taille:6, parfums:[{nom:'Café', qte:6}]} ],
    paiements:[ {date:'2026-06-01', montant:100, moyen:'Carte'} ] }  // payé en JUIN
]});
const r5mai = await (buildModule(db5))('2026-05');
eq(r5mai.goods, 0, 'CAS5 · mai : rien encaissé en mai → 0');
const r5juin = await (buildModule(db5))('2026-06');
eq(r5juin.goods, 100, 'CAS5 · juin : encaissement de juin compté = 100');

// ============================================================================
//  CAS 6 — Marché clôturé du mois = marchandise (fond de caisse déduit)
// ============================================================================
const db6 = makeDb({ orders: [], markets: [
  { id:1, date:'2026-05-18', statut:'clos', nom:'Marché du Mans', fondCaisse:50,
    ca:{ especes:200, cb:100, autre:0 } }   // net = (200−50) + 100 = 250
]});
const r6 = await (buildModule(db6))('2026-05');
eq(r6.goods, 250, 'CAS6 · marché clos = marchandise = 150 (esp. nettes) + 100 (CB) = 250');
eq(r6.service, 0, 'CAS6 · marché : aucun service');
eq(r6.cotisGoods, money2Ref(250*TAUX_GOODS/100), 'CAS6 · cotis marchandise sur le marché');

// ============================================================================
//  CAS 7 — Reprise d'historique (migration) : JAMAIS dans la base URSSAF [A11-fix]
//  CA d'avant l'app, déjà déclaré à l'époque. La recompter = double déclaration.
//  On teste les DEUX marqueurs couverts par estReprise : o.histo ET ligne type 'histo'.
// ============================================================================
const db7 = makeDb({ markets: [], orders: [
  { id:71, date:'2026-05-01', montant:400, histo:true,
    paiements:[ {date:'2026-05-02', montant:400, moyen:'Virement'} ] },
  { id:72, date:'2026-05-03', montant:300,
    lignes:[ {type:'histo', montant:300} ],
    paiements:[ {date:'2026-05-03', montant:300, moyen:'Espèces'} ] }
]});
const r7 = await (buildModule(db7))('2026-05');
eq(r7.goods, 0, 'CAS7 · reprise (o.histo + ligne histo) exclue de la marchandise');
eq(r7.service, 0, 'CAS7 · reprise exclue du service');
eq(r7.caTotal, 0, 'CAS7 · reprise n\'entre pas dans le CA URSSAF');
eq(r7.cotisTotal, 0, 'CAS7 · aucune cotisation sur une reprise');

// CAS 7bis — une vraie vente au fil de l'eau LE MÊME MOIS reste bien comptée
const db7b = makeDb({ markets: [], orders: [
  { id:73, date:'2026-05-01', montant:400, histo:true,
    paiements:[ {date:'2026-05-02', montant:400, moyen:'Virement'} ] },
  { id:74, date:'2026-05-04', montant:200,
    lignes:[ {type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]} ],
    paiements:[ {date:'2026-05-04', montant:200, moyen:'Carte'} ] }
]});
const r7b = await (buildModule(db7b))('2026-05');
eq(r7b.goods, 200, 'CAS7bis · seule la vente au fil de l\'eau compte (reprise ignorée)');
eq(r7b.cotisGoods, money2Ref(200*TAUX_GOODS/100), 'CAS7bis · cotis calculée sur 200, pas 600');

// ============================================================================
//  CAS 8 — Mois sans activité → tout à zéro
// ============================================================================
const r8 = await (buildModule(makeDb({ orders:[], markets:[] })))('2026-05');
eq(r8.goods, 0, 'CAS8 · aucun ordre : marchandise = 0');
eq(r8.service, 0, 'CAS8 · service = 0');
eq(r8.cotisTotal, 0, 'CAS8 · cotisations = 0');

// ============================================================================
//  CAS 9 — [v1283] JOURNAL D'AVOIRS : déduction de la base URSSAF, ventilée
//  selon la nature (marchandise/service) de la commande d'ORIGINE, imputée
//  au mois d'ÉMISSION de l'avoir (pas celui de la commande).
// ============================================================================
// CAS9a — Avoir sur une commande 100% marchandise (coffret)
const db9a = makeDb({
  orders:[ { id:90, date:'2026-05-01', montant:200,
    lignes:[ {type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]} ],
    paiements:[ {date:'2026-05-01', montant:200, moyen:'Carte'} ] } ],
  markets:[],
  documents:[ { type:'avoir', statut:'emis', orderId:90, montant:50, date:'2026-05-10', numero:'AV-202605-1' } ]
});
const r9a = await (buildModule(db9a))('2026-05');
eq(r9a.goods, 150, 'CAS9a · marchandise 200 - avoir 50 (100% marchandise) = 150');
eq(r9a.service, 0, 'CAS9a · aucune part service');
eq(r9a.avoirsDeduits, 50, 'CAS9a · avoirsDeduits = 50');
eq(r9a.cotisGoods, money2Ref(150*TAUX_GOODS/100), 'CAS9a · cotisation marchandise recalculée sur 150, pas 200');

// CAS9b — Avoir sur une commande 100% prestation (coaching)
const db9b = makeDb({
  orders:[ { id:91, date:'2026-05-01', montant:300,
    lignes:[ {type:'prestation', montantHT:300} ],
    paiements:[ {date:'2026-05-01', montant:300, moyen:'Virement'} ] } ],
  markets:[],
  documents:[ { type:'avoir', statut:'emis', orderId:91, montant:100, date:'2026-05-15', numero:'AV-202605-2' } ]
});
const r9b = await (buildModule(db9b))('2026-05');
eq(r9b.service, 200, 'CAS9b · service 300 - avoir 100 (100% service) = 200');
eq(r9b.goods, 0, 'CAS9b · aucune part marchandise');
eq(r9b.cotisService, money2Ref(200*TAUX_SERVICE/100), 'CAS9b · cotisation service recalculée sur 200, pas 300');

// CAS9c — Avoir émis un AUTRE mois que la commande d'origine : imputé au mois d'ÉMISSION
const db9c = makeDb({
  orders:[ { id:92, date:'2026-04-01', montant:150,
    lignes:[ {type:'coffret', taille:8, parfums:[{nom:'B',qte:8}]} ],
    paiements:[ {date:'2026-04-01', montant:150, moyen:'Carte'} ] } ],
  markets:[],
  documents:[ { type:'avoir', statut:'emis', orderId:92, montant:60, date:'2026-05-05', numero:'AV-202605-3' } ]
});
const r9c_avril = await (buildModule(db9c))('2026-04');
const r9c_mai = await (buildModule(db9c))('2026-05');
eq(r9c_avril.goods, 150, 'CAS9c · avril (mois de la commande) INCHANGÉ : avoir pas encore émis');
eq(r9c_mai.goods, -60, "CAS9c · mai (mois d'emission de l'avoir) : deduction pure, -60");
eq(r9c_mai.avoirsDeduits, 60, 'CAS9c · avoirsDeduits sur mai = 60');

// CAS9d — Statut 'enregistre' (pas de facture liée) déduit aussi ; un avoir NON émis/enregistré ne compte pas
const db9d = makeDb({
  orders:[ { id:93, date:'2026-05-01', montant:100,
    lignes:[ {type:'coffret', taille:6, parfums:[{nom:'C',qte:6}]} ],
    paiements:[ {date:'2026-05-01', montant:100, moyen:'Espèces'} ] } ],
  markets:[],
  documents:[
    { type:'avoir', statut:'enregistre', orderId:93, montant:20, date:'2026-05-08' },
    { type:'avoir', statut:'brouillon', orderId:93, montant:999, date:'2026-05-08' }   // ignoré : pas émis/enregistré
  ]
});
const r9d = await (buildModule(db9d))('2026-05');
eq(r9d.goods, 80, 'CAS9d · statut enregistre déduit (100-20=80), brouillon ignoré (pas 999 de trop)');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 4 : computeMonthlyBilan ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }

}

// money2 de référence pour construire les valeurs attendues (même arrondi que l'app).
function money2Ref(n){ const v=+n; return isFinite(v) ? Math.round(v*100)/100 : 0; }

run().catch(err=>{ console.error('Erreur test:', err); process.exit(1); });
