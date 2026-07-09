/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 22 : computePrevisionRevenu (prévision mensuelle)
   ----------------------------------------------------------------------------
   Fige le calcul de la prévision "combien vais-je gagner le mois prochain" :
   tendance pondérée (poids croissant sur les 4 derniers mois actifs), carnet de
   commandes (reste à encaisser des commandes livrées CE mois-là), et synthèse
   bas/haut/central. computeMonthlyBilan et _listeMoisAvecActivite sont STUBBÉES
   (déjà couvertes ailleurs) pour isoler strictement la logique propre à cette
   fonction.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(monthlyBilanStub, moisActifsStub, fakeNow){
  const money2 = extractConstLine('money2');
  const monthKey = extractFunction('monthKey');
  const monthLabel = extractFunction('monthLabel');
  const orderPaid = extractFunction('orderPaid');
  const ymAddMonths = extractFunction('_ymAddMonths');
  const computePrevisionRevenu = extractFunction('computePrevisionRevenu');
  const code = `
    ${money2}
    ${monthKey}
    ${monthLabel}
    ${orderPaid}
    ${ymAddMonths}
    async function computeMonthlyBilan(ym){ return monthlyBilanStub(ym); }
    async function _listeMoisAvecActivite(){ return moisActifsStub(); }
    const __RealDate = globalThis.Date;
    function Date(...args){ return args.length ? new __RealDate(...args) : new __RealDate(fakeNow); }
    Date.prototype = __RealDate.prototype;
    ${computePrevisionRevenu}
    return computePrevisionRevenu;
  `;
  const factory = new Function('db', 'monthlyBilanStub', 'moisActifsStub', 'fakeNow', code);
  return (dbArg) => factory(dbArg, monthlyBilanStub, moisActifsStub, fakeNow);
}

function makeDb({orders=[]}){
  return { orders: { toArray: async()=>orders.slice() } };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, label, tol=0.01){
  if(Math.abs(actual-expected)<=tol){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu ≈ ${expected}\n      obtenu   : ${actual}`); }
}

async function run(){

// ── CAS 1 — Mois cible par défaut = mois PROCHAIN (pas fourni explicitement) ──
{
  const cp = buildModule(()=>({caTotal:0}), ()=>[], '2026-05-15T12:00:00')(makeDb({}));
  const r = await cp();   // aucun ymCible fourni
  eq(r.cible, '2026-06', 'CAS1 · sans argument, cible = mois suivant celui de "aujourd\'hui" (mai → juin)');
}

// ── CAS 2 — Tendance : moyenne PONDÉRÉE, le mois le plus récent pèse le plus ──
{
  // 2 mois actifs avant la cible : janvier (ca=100, poids 1) et février (ca=200, poids 2).
  const bilanByMonth = {'2026-01':{caTotal:100}, '2026-02':{caTotal:200}};
  const cp = buildModule((ym)=>bilanByMonth[ym], ()=>['2026-01','2026-02'], '2026-02-20T12:00:00')(makeDb({}));
  const r = await cp('2026-03');
  // pondéré = (100×1 + 200×2) / (1+2) = 500/3 ≈ 166.67
  near(r.tendance, 166.67, 'CAS2 · tendance pondérée = (100×1+200×2)/3 ≈ 166.67, février pèse plus que janvier');
}

// ── CAS 3 — Tendance : au plus 4 derniers mois actifs pris en compte (pas plus) ──
{
  const bilanByMonth = {'2025-10':{caTotal:9999},'2025-11':{caTotal:100},'2025-12':{caTotal:100},'2026-01':{caTotal:100},'2026-02':{caTotal:100}};
  const cp = buildModule((ym)=>bilanByMonth[ym], ()=>Object.keys(bilanByMonth).sort(), '2026-02-20T12:00:00')(makeDb({}));
  const r = await cp('2026-03');
  eq(r.nbMoisHisto, 4, 'CAS3 · au maximum 4 mois d\'historique retenus, même si 5 sont disponibles');
  eq(r.bilans.some(b=>b.ym==='2025-10'), false, 'CAS3 · le mois le plus ancien (5e) est exclu, seuls les 4 plus récents comptent');
}

// ── CAS 4 — Aucun mois actif avant la cible : tendance = 0, pas de crash ──
{
  const cp = buildModule(()=>({caTotal:0}), ()=>[], '2026-05-15T12:00:00')(makeDb({}));
  const r = await cp('2026-06');
  eq(r.tendance, 0, 'CAS4 · aucun historique → tendance 0');
  eq(r.aTendance, false, 'CAS4 · aTendance=false signalé explicitement');
}

// ── CAS 5 — Carnet : somme le RESTE À ENCAISSER des commandes livrées le mois CIBLE ──
{
  const orders = [
    { id:1, montant:100, dateLivraison:'2026-06-15', paiements:[{date:'2026-05-01',montant:30,moyen:'Carte'}] },   // reste 70
    { id:2, montant:50, dateLivraison:'2026-06-20', paiements:[] },   // reste 50
    { id:3, montant:80, dateLivraison:'2026-07-01', paiements:[] }    // mois suivant : hors cible
  ];
  const cp = buildModule(()=>({caTotal:0}), ()=>[], '2026-05-15T12:00:00')(makeDb({orders}));
  const r = await cp('2026-06');
  eq(r.carnet, 120, 'CAS5 · carnet = 70 (reste cmd1) + 50 (reste cmd2) = 120, commande de juillet exclue');
  eq(r.nbCmd, 2, 'CAS5 · 2 commandes comptent dans le carnet');
}

// ── CAS 6 — Carnet : commande déjà intégralement payée → reste 0, n'entre pas dans le carnet ──
{
  const orders = [
    { id:1, montant:100, dateLivraison:'2026-06-15', paiements:[{date:'2026-05-01',montant:100,moyen:'Carte'}] }
  ];
  const cp = buildModule(()=>({caTotal:0}), ()=>[], '2026-05-15T12:00:00')(makeDb({orders}));
  const r = await cp('2026-06');
  eq(r.carnet, 0, 'CAS6 · commande soldée n\'ajoute rien au carnet (déjà entièrement encaissée)');
  eq(r.nbCmd, 0, 'CAS6 · aucune commande comptée (reste <= 0)');
}

// ── CAS 7 — Reprise (histo) exclue du carnet ──
{
  const orders = [
    { id:1, montant:500, histo:true, dateLivraison:'2026-06-15', paiements:[] }
  ];
  const cp = buildModule(()=>({caTotal:0}), ()=>[], '2026-05-15T12:00:00')(makeDb({orders}));
  const r = await cp('2026-06');
  eq(r.carnet, 0, 'CAS7 · reprise d\'historique totalement exclue du carnet (CA déjà déclaré dans le passé)');
}

// ── CAS 8 — Synthèse bas/haut/central : bas=carnet (plancher sûr), haut=max(tendance,carnet) ──
{
  const bilanByMonth = {'2026-04':{caTotal:1000}};
  const orders = [{ id:1, montant:200, dateLivraison:'2026-06-10', paiements:[] }];   // carnet=200
  const cp = buildModule((ym)=>bilanByMonth[ym], ()=>['2026-04'], '2026-05-15T12:00:00')(makeDb({orders}));
  const r = await cp('2026-06');
  eq(r.bas, 200, 'CAS8 · plancher = carnet (200), le plus sûr car déjà commandé');
  eq(r.haut, 1000, 'CAS8 · haut = max(tendance=1000, carnet=200) = 1000');
  eq(r.central, 1000, 'CAS8 · central = haut dans ce cas (tendance > carnet)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 22 : computePrevisionRevenu ===\n');
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
