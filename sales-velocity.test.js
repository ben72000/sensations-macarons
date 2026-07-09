/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 27 : computeSalesVelocity (vélocité, rupture)
   ----------------------------------------------------------------------------
   Fige le calcul de vélocité de vente par parfum (pièces/jour sur une fenêtre
   récente), la projection en jours-avant-rupture, et le seuil d'alerte. Toutes
   les tables Dexie sont stubbées ; la date est figée pour un test déterministe.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(fakeNow){
  const round3 = extractConstLine('round3');
  const orderToLines = extractFunction('orderToLines');
  const orderParfumDemand = extractFunction('_orderParfumDemand');
  const computeSalesVelocity = extractFunction('computeSalesVelocity');
  const code = `
    ${round3}
    // today() réimplémentée localement (extractConstLine ne gère que le mono-ligne ; même
    // corps que l'original app.js : new Date() formaté YYYY-MM-DD).
    const today = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    ${orderToLines}
    ${orderParfumDemand}
    const __RealDate = globalThis.Date;
    function Date(...args){ return args.length ? new __RealDate(...args) : new __RealDate(fakeNow); }
    Date.prototype = __RealDate.prototype;
    ${computeSalesVelocity}
    return computeSalesVelocity;
  `;
  const factory = new Function('db', 'fakeNow', code);
  return (dbArg) => factory(dbArg, fakeNow);
}

function makeDb({recipes=[], productions=[], orders=[]}){
  return {
    recipes: { toArray: async()=>recipes.slice() },
    productions: { toArray: async()=>productions.slice() },
    orders: { toArray: async()=>orders.slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, label, tol=0.02){
  if(Math.abs(actual-expected)<=tol){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu ≈ ${expected}\n      obtenu   : ${actual}`); }
}

async function run(){

// ── CAS 1 — Aucune donnée : hasData=false, pas de crash ──
{
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({}));
  const r = await csv({});
  eq(r.hasData, false, 'CAS1 · aucune vente ni stock → hasData=false');
  eq(r.lignes.length, 0, 'CAS1 · aucune ligne (rien à afficher)');
}

// ── CAS 2 — Vélocité simple : X pièces vendues sur N jours observés = X/N par jour ──
{
  const recipes = [{id:1, produitNom:'Chocolat'}];
  const productions = [{id:1, recipeId:1, qteRestante:100}];
  // 30 pièces vendues il y a 10 jours (dans la fenêtre de lookback de 3 mois par défaut)
  const orders = [
    { id:1, date:'2026-05-05', paiement:'Payé', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:30}]}] }
  ];
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await csv({});
  const l = r.lignes.find(x=>x.parfum==='Chocolat');
  eq(l.stock, 100, 'CAS2 · stock actuel = 100');
  eq(l.vendu, 30, 'CAS2 · 30 pièces vendues dans la fenêtre');
  // observedDays borné au 1er jour de vente (5 mai), donc ~10 jours observés (5→15 mai)
  near(l.perDay, 3, 'CAS2 · vélocité ≈ 30/10 = 3 pièces/jour', 0.5);
}

// ── CAS 3 — Projection rupture : jours restants = stock / vélocité ──
{
  const recipes = [{id:1, produitNom:'Vanille'}];
  const productions = [{id:1, recipeId:1, qteRestante:20}];
  const orders = [
    { id:1, date:'2026-05-10', paiement:'Payé', lignes:[{type:'coffret', parfums:[{nom:'Vanille',qte:10}]}] }
  ];
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await csv({});
  const l = r.lignes.find(x=>x.parfum==='Vanille');
  // vélocité = 10 pièces / 5 jours observés = 2/jour. Stock 20 → 10 jours avant rupture.
  near(l.joursRestants, 10, 'CAS3 · rupture estimée dans ~10 jours (stock 20 / vélocité 2/jour)', 1);
  eq(typeof l.dateRupture, 'string', 'CAS3 · une date de rupture est calculée (chaîne ISO)');
}

// ── CAS 4 — Alerte : joursRestants <= horizon (défaut 14j) déclenche le flag ──
{
  const recipes = [{id:1, produitNom:'Framboise'}];
  const productions = [{id:1, recipeId:1, qteRestante:5}];   // très peu de stock
  const orders = [
    { id:1, date:'2026-05-10', paiement:'Payé', lignes:[{type:'coffret', parfums:[{nom:'Framboise',qte:10}]}] }
  ];
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await csv({});
  const l = r.lignes.find(x=>x.parfum==='Framboise');
  eq(l.alerte, true, 'CAS4 · stock très faible face à la vélocité → alerte déclenchée');
  eq(r.alertes.some(a=>a.parfum==='Framboise'), true, 'CAS4 · le parfum apparaît bien dans la liste des alertes');
}

// ── CAS 5 — Aucune vente récente sur un parfum en stock : joursRestants=null (pas de division par 0) ──
{
  const recipes = [{id:1, produitNom:'Caramel'}];
  const productions = [{id:1, recipeId:1, qteRestante:50}];
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders:[]}));
  const r = await csv({});
  const l = r.lignes.find(x=>x.parfum==='Caramel');
  eq(l.joursRestants, null, 'CAS5 · aucune vente récente → joursRestants=null (pas de fausse alerte, pas de crash)');
  eq(l.alerte, false, 'CAS5 · pas d\'alerte sans vélocité mesurable');
}

// ── CAS 6 — Commande NON payée exclue de la vélocité ──
{
  const recipes = [{id:1, produitNom:'Pistache'}];
  const productions = [{id:1, recipeId:1, qteRestante:50}];
  const orders = [
    { id:1, date:'2026-05-10', paiement:'En attente', lignes:[{type:'coffret', parfums:[{nom:'Pistache',qte:20}]}] }
  ];
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await csv({});
  const l = r.lignes.find(x=>x.parfum==='Pistache');
  eq(l.vendu, 0, 'CAS6 · commande non payée exclue : aucune vente comptée');
}

// ── CAS 7 — Vente HORS fenêtre de lookback (ex. il y a 6 mois avec lookback 3 mois) : exclue ──
{
  const recipes = [{id:1, produitNom:'Citron'}];
  const productions = [{id:1, recipeId:1, qteRestante:50}];
  const orders = [
    { id:1, date:'2025-11-01', paiement:'Payé', lignes:[{type:'coffret', parfums:[{nom:'Citron',qte:99}]}] }   // trop vieux
  ];
  const csv = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await csv({months:3});
  const l = r.lignes.find(x=>x.parfum==='Citron');
  eq(l.vendu, 0, 'CAS7 · vente antérieure à la fenêtre de lookback (3 mois) exclue');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 27 : computeSalesVelocity ===\n');
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
