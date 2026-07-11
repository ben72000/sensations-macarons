/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 21 : computeStrategic (pilotage stratégique)
   ----------------------------------------------------------------------------
   Fige le calcul du panier moyen, des évolutions M/M-1 et Y/Y-1, des marges
   globales et des clients actifs (fenêtre 90 j) pour l'écran Pilotage.
   computeAccounting et computeOrderMargins sont STUBBÉES (déjà couvertes par
   les vagues 3 et 6) pour isoler strictement la logique propre à cette fonction.

   [v1286-fix] Le panier moyen exclut désormais les commandes ÉVÉNEMENT, comme
   computePilotageCA (vague 20, [v1284-fix]) — les deux écrans sont cohérents.
   Les agrégats globaux (margeBrute, margeNette, caPaye) restent COMPLETS
   (événements inclus) : seul le panier moyen et son détail sont recalculés sur
   un sous-ensemble hors événement. CAS3 verrouille ce correctif.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(accountingStub, marginsStub, fakeNow){
  const money2 = extractConstLine('money2');
  const ymOf = extractFunction('ymOf');
  const ymdLocal = extractFunction('ymdLocal');
  const basePeriodeComparable = extractFunction('_basePeriodeComparable');
  const orderToLines = extractFunction('orderToLines');
  const orderIsEvent = extractFunction('orderIsEvent');
  const computeStrategic = extractFunction('computeStrategic');
  const code = `
    ${money2}
    ${ymOf}
    ${ymdLocal}
    ${basePeriodeComparable}
    ${orderToLines}
    ${orderIsEvent}
    async function computeAccounting(){ return accountingStub(); }
    function computeOrderMargins(o){ return marginsStub(o); }
    const __RealDate = globalThis.Date;
    function Date(...args){ return args.length ? new __RealDate(...args) : new __RealDate(fakeNow); }
    Date.prototype = __RealDate.prototype;
    ${computeStrategic}
    return computeStrategic;
  `;
  const factory = new Function('db', 'accountingStub', 'marginsStub', 'fakeNow', code);
  return (dbArg) => factory(dbArg, accountingStub, marginsStub, fakeNow);
}

function makeDb({orders=[], clients=[]}){
  return {
    orders: { toArray: async()=>orders.slice() },
    clients: { toArray: async()=>clients.slice() },
    recipes: { toArray: async()=>[] },
    recipeItems: { toArray: async()=>[] },
    materialLots: { toArray: async()=>[] },
    products: { toArray: async()=>[] }
  };
}

// Stub de computeOrderMargins : marge = 30% du montant, coût matière = 50%, emballage = 10%,
// charges sociales = 12.3% — répartition arbitraire mais STABLE pour rendre le test lisible.
function simpleMarginsStub(o){
  const ca = +o.montant||0;
  const coutMat = money2Ref(ca*0.5), coutEmb = money2Ref(ca*0.1), chargesSociales = money2Ref(ca*0.123);
  const margeBrute = money2Ref(ca - coutMat - coutEmb);
  const margeNette = money2Ref(margeBrute - chargesSociales);
  return { ca, coutMat, coutEmb, chargesSociales, margeBrute, margeNette };
}
function money2Ref(n){ const v=+n; return isFinite(v) ? Math.round(v*100)/100 : 0; }

function baseAccounting(){
  return { serie:[], totalEncaisse:0, totalFacture:0, creances:0 };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Panier moyen : moyenne des commandes PAYÉES (o.paiement==='Payé') uniquement ──
{
  const orders = [
    { id:1, montant:20, paiement:'Payé', date:'2026-05-01' },
    { id:2, montant:40, paiement:'Payé', date:'2026-05-02' },
    { id:3, montant:999, paiement:'En attente', date:'2026-05-03' }   // pas payée : exclue
  ];
  const db1 = makeDb({orders});
  const cs = buildModule(baseAccounting, simpleMarginsStub, '2026-05-15T12:00:00')(db1);
  const r = await cs();
  eq(r.nbCmd, 2, 'CAS1 · seules les 2 commandes payées comptent');
  eq(r.panier, 30, 'CAS1 · panier moyen = (20+40)/2 = 30, la commande non payée (999) exclue');
}

// ── CAS 2 — Aucune commande payée : panier à 0, pas de division par zéro ──
{
  const db2 = makeDb({orders:[{id:1, montant:50, paiement:'En attente', date:'2026-05-01'}]});
  const cs = buildModule(baseAccounting, simpleMarginsStub, '2026-05-15T12:00:00')(db2);
  const r = await cs();
  eq(r.nbCmd, 0, 'CAS2 · aucune commande payée');
  eq(r.panier, 0, 'CAS2 · panier = 0 proprement (pas NaN ni erreur)');
}

// ── CAS 3 — [v1286-fix] Une commande ÉVÉNEMENT payée ne gonfle PLUS ce panier, exactement
//    comme computePilotageCA (vague 20). Les deux écrans sont désormais cohérents.
{
  const orders = [
    { id:1, montant:20, paiement:'Payé', date:'2026-05-01', lignes:[{type:'coffret'}] },
    { id:2, montant:400, paiement:'Payé', date:'2026-05-02', lignes:[{type:'evenement'}] }
  ];
  const db3 = makeDb({orders});
  const cs = buildModule(baseAccounting, simpleMarginsStub, '2026-05-15T12:00:00')(db3);
  const r = await cs();
  eq(r.panier, 20, 'CAS3 · [CORRIGÉ] panier = 20 (événement exclu), plus 210 comme avant le fix');
  eq(r.nbCmd, 1, 'CAS3 · nbCmd (panier) ne compte que la commande hors événement (1, pas 2)');
  // nbCmdTotal reste GLOBAL (événement inclus) : cohérent avec caPaye/margeBrute, eux aussi globaux.
  eq(r.nbCmdTotal, 2, 'CAS3 · nbCmdTotal compte TOUTES les commandes payées (2), dénominateur cohérent pour caPaye/margeBrute');
}

// ── CAS 4 — Marges globales : somme correcte sur les commandes payées uniquement ──
{
  const orders = [
    { id:1, montant:100, paiement:'Payé', date:'2026-05-01' },
    { id:2, montant:200, paiement:'Payé', date:'2026-05-02' }
  ];
  const db4 = makeDb({orders});
  const cs = buildModule(baseAccounting, simpleMarginsStub, '2026-05-15T12:00:00')(db4);
  const r = await cs();
  // marge brute par commande = ca - 50% - 10% = ca*0.4 → 40 + 80 = 120
  eq(r.margeBrute, 120, 'CAS4 · marge brute cumulée = 40 (sur 100) + 80 (sur 200) = 120');
  eq(r.caPaye, 300, 'CAS4 · CA payé cumulé (issu des marges) = 100+200 = 300');
}

// ── CAS 5 — Clients actifs : fenêtre glissante de 90 jours, "aujourd'hui" figé ──
{
  const orders = [
    { id:1, montant:50, paiement:'Payé', date:'2026-04-01', clientId:1 },    // dans les 90j avant le 15 mai (~45j)
    { id:2, montant:50, paiement:'Payé', date:'2026-01-01', clientId:2 }     // hors fenêtre (>90j avant)
  ];
  const clients = [{id:1,nom:'A'},{id:2,nom:'B'}];
  const db5 = makeDb({orders, clients});
  const cs = buildModule(baseAccounting, simpleMarginsStub, '2026-05-15T12:00:00')(db5);
  const r = await cs();
  eq(r.activeClients, 1, 'CAS5 · un seul client actif dans la fenêtre 90j (client 1)');
  eq(r.totalClients, 2, 'CAS5 · totalClients compte TOUS les clients, actifs ou non');
}

// ── CAS 6 — panierDetail : chaque ligne porte son écart signé à la moyenne ──
{
  const orders = [
    { id:1, montant:10, paiement:'Payé', date:'2026-05-01', clientId:1 },
    { id:2, montant:30, paiement:'Payé', date:'2026-05-02', clientId:1 }
  ];
  const clients = [{id:1,nom:'Client X'}];
  const db6 = makeDb({orders, clients});
  const cs = buildModule(baseAccounting, simpleMarginsStub, '2026-05-15T12:00:00')(db6);
  const r = await cs();
  // panier moyen = 20. commande à 10 → écart -10 (dessous). commande à 30 → écart +10 (dessus).
  const d10 = r.panierDetail.find(d=>d.id===1), d30 = r.panierDetail.find(d=>d.id===2);
  eq(d10.ecart, -10, 'CAS6 · écart de la commande à 10 : -10 sous la moyenne (20)');
  eq(d10.dessus, false, 'CAS6 · commande à 10 est SOUS la moyenne');
  eq(d30.ecart, 10, 'CAS6 · écart de la commande à 30 : +10 au-dessus de la moyenne');
  eq(d30.dessus, true, 'CAS6 · commande à 30 est AU-DESSUS de la moyenne');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 21 : computeStrategic ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
