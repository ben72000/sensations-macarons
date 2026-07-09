/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 28 : computeForecast (projection réservations)
   ----------------------------------------------------------------------------
   Fige la projection de stock au fil des commandes futures datées : solde qui
   décroît réservation par réservation, détection de la PREMIÈRE date de rupture,
   correction par le "mobilisable" (coques+ganache assemblables), alerte seulement
   si la rupture tombe sous l'horizon ET n'est pas couvrable par assemblage.
   stockMobilisableParParfum et marketForecast sont STUBBÉES (hors périmètre :
   calcul d'assemblage et d'historique marché, testables séparément). Toujours
   appelé avec opts.skipFaisabilite=true pour éviter de stubber retroplanningCale
   (échappatoire déjà prévue par le code lui-même pour ce cas).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(fakeNow, mobMapStub){
  const round3 = extractConstLine('round3');
  const orderToLines = extractFunction('orderToLines');
  const orderParfumDemand = extractFunction('_orderParfumDemand');
  const normStatus = extractFunction('normStatus');
  const prodComposant = extractFunction('prodComposant');
  const prodVendable = extractFunction('prodVendable');
  const daysTo = extractFunction('daysTo');
  const computeForecast = extractFunction('computeForecast');
  const code = `
    ${round3}
    const today = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    ${orderToLines}
    ${orderParfumDemand}
    ${normStatus}
    ${prodComposant}
    ${prodVendable}
    ${daysTo}
    function aiNormalize(s){ return String(s||'').toLowerCase().trim(); }
    async function stockMobilisableParParfum(){ return mobMapStub || {}; }
    async function marketForecast(){ return { repartition: [] }; }
    const __RealDate = globalThis.Date;
    function Date(...args){ return args.length ? new __RealDate(...args) : new __RealDate(fakeNow); }
    Date.prototype = __RealDate.prototype;
    ${computeForecast}
    return computeForecast;
  `;
  const factory = new Function('db', 'fakeNow', 'mobMapStub', code);
  return (dbArg) => factory(dbArg, fakeNow, mobMapStub);
}

function makeDb({recipes=[], productions=[], orders=[], markets=[]}){
  return {
    recipes: { toArray: async()=>recipes.slice() },
    productions: { toArray: async()=>productions.slice() },
    orders: { toArray: async()=>orders.slice() },
    markets: { toArray: async()=>markets.slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Stock suffisant pour toutes les réservations : pas d'alerte ──
{
  const recipes = [{id:1, produitNom:'Chocolat'}];
  const productions = [{id:1, recipeId:1, qteRestante:100, composant:'complet'}];
  const orders = [
    { id:1, date:'2026-05-20', statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:30}]}] }
  ];
  const cf = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await cf({skipFaisabilite:true});
  const l = r.lignes.find(x=>x.parfum==='Chocolat');
  eq(l.soldePrev, 70, 'CAS1 · solde prévisionnel = 100 stock - 30 réservé = 70');
  eq(l.alerte, false, 'CAS1 · stock largement suffisant → pas d\'alerte');
}

// ── CAS 2 — Rupture détectée : plusieurs réservations, la 2e passe le stock sous 0 ──
{
  const recipes = [{id:1, produitNom:'Vanille'}];
  const productions = [{id:1, recipeId:1, qteRestante:20, composant:'complet'}];
  const orders = [
    { id:1, date:'2026-05-18', statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Vanille',qte:15}]}] },
    { id:2, date:'2026-05-20', statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Vanille',qte:10}]}] }
  ];
  const cf = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await cf({skipFaisabilite:true});
  const l = r.lignes.find(x=>x.parfum==='Vanille');
  eq(l.soldePrev, -5, 'CAS2 · solde prévisionnel négatif = 20 - 15 - 10 = -5');
  eq(l.firstShortOrderId, 2, 'CAS2 · la rupture est imputée à la 2e commande (celle qui fait passer sous 0)');
  eq(l.alerte, true, 'CAS2 · rupture sous l\'horizon (8j par défaut) → alerte');
}

// ── CAS 3 — Rupture COUVERTE par le mobilisable (coques+ganache) : pas d'alerte ──
{
  const recipes = [{id:1, produitNom:'Framboise'}];
  const productions = [{id:1, recipeId:1, qteRestante:5, composant:'complet'}];
  const orders = [
    { id:1, date:'2026-05-18', statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Framboise',qte:10}]}] }
  ];
  // 10 assemblables en stock (coques+ganache prêtes) → couvre largement le manque de 5.
  const mobMap = { 'framboise': { assemblable: 10 } };
  const cf = buildModule('2026-05-15T12:00:00', mobMap)(makeDb({recipes, productions, orders}));
  const r = await cf({skipFaisabilite:true});
  const l = r.lignes.find(x=>x.parfum==='Framboise');
  eq(l.manque, 5, 'CAS3 · manque BRUT calculé (5) avant prise en compte du mobilisable');
  eq(l.manqueApresMob, 0, 'CAS3 · manque APRÈS mobilisable = 0 (10 assemblables couvrent le trou de 5)');
  eq(l.alerte, false, 'CAS3 · rupture couvrable par simple assemblage → pas de vraie alerte');
}

// ── CAS 4 — Stock composant (coques seules) EXCLU du stock vendable ──
{
  const recipes = [{id:1, produitNom:'Pistache'}];
  const productions = [
    { id:1, recipeId:1, qteRestante:50, composant:'coques' },   // coques nues : pas vendable
    { id:2, recipeId:1, qteRestante:10, composant:'complet' }   // vendable
  ];
  const cf = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders:[]}));
  const r = await cf({skipFaisabilite:true});
  const l = r.lignes.find(x=>x.parfum==='Pistache');
  eq(l.stock, 10, 'CAS4 · stock ne compte QUE le composant vendable (10), pas les 50 coques nues');
}

// ── CAS 5 — Commande LIVRÉE exclue des réservations futures (déjà honorée) ──
{
  const recipes = [{id:1, produitNom:'Café'}];
  const productions = [{id:1, recipeId:1, qteRestante:20, composant:'complet'}];
  const orders = [
    { id:1, date:'2026-05-20', statut:'Livrée', lignes:[{type:'coffret', parfums:[{nom:'Café',qte:15}]}] }
  ];
  const cf = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await cf({skipFaisabilite:true});
  const l = r.lignes.find(x=>x.parfum==='Café');
  eq(l.reserved, 0, 'CAS5 · commande déjà livrée : n\'entre plus dans les réservations futures');
}

// ── CAS 6 — Commande PASSÉE (date déjà écoulée) exclue même si pas livrée ──
{
  const recipes = [{id:1, produitNom:'Noisette'}];
  const productions = [{id:1, recipeId:1, qteRestante:20, composant:'complet'}];
  const orders = [
    { id:1, date:'2026-05-10', statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Noisette',qte:15}]}] }   // date déjà passée
  ];
  const cf = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await cf({skipFaisabilite:true});
  const l = r.lignes.find(x=>x.parfum==='Noisette');
  eq(l.reserved, 0, 'CAS6 · commande de date passée exclue des réservations futures (todayStr filter)');
}

// ── CAS 7 — nbParfumsRupture : compte les parfums réellement en solde négatif ──
{
  const recipes = [{id:1, produitNom:'A'},{id:2, produitNom:'B'}];
  const productions = [{id:1, recipeId:1, qteRestante:5, composant:'complet'}, {id:2, recipeId:2, qteRestante:50, composant:'complet'}];
  const orders = [
    { id:1, date:'2026-05-18', statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'A',qte:10},{nom:'B',qte:5}]}] }
  ];
  const cf = buildModule('2026-05-15T12:00:00')(makeDb({recipes, productions, orders}));
  const r = await cf({skipFaisabilite:true});
  eq(r.nbParfumsRupture, 1, 'CAS7 · seul le parfum A (5 stock - 10 réservé = -5) compte en rupture, pas B (largement couvert)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 28 : computeForecast ===\n');
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
