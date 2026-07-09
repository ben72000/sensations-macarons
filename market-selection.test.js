/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 29 : computeMarketSelection (sélection stratégique)
   ----------------------------------------------------------------------------
   Fige le score composite (CA 45% + vélocité 35% + marge 20%, normalisés par le
   max observé) et le classement en cœur de gamme / rotation / à reposer, ainsi
   que la séparation stricte standards vs grands formats (BIG_FORMATS).
   computeSalesVelocity et analyzeFlavorProfitability sont STUBBÉES (déjà
   couvertes ou hors périmètre) pour isoler strictement la logique de scoring.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(veloStub, profStub){
  const computeMarketSelection = extractFunction('computeMarketSelection');
  const code = `
    const BIG_FORMATS = ['Chocolat', 'Myrtille framboise', 'Mangue passion', 'Madeleine'];
    function aiNormalize(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim(); }
    function getSettings(){ return {}; }
    async function computeSalesVelocity(){ return veloStub; }
    function analyzeFlavorProfitability(){ return profStub; }
    ${computeMarketSelection}
    return computeMarketSelection;
  `;
  const factory = new Function('db', 'veloStub', 'profStub', code);
  return (dbArg) => factory(dbArg, veloStub, profStub);
}

function makeDb(){
  return {
    recipes: { toArray: async()=>[{produitNom:'A'},{produitNom:'B'},{produitNom:'C'}] },
    recipeItems: { toArray: async()=>[] },
    materialLots: { toArray: async()=>[] },
    materials: { toArray: async()=>[] },
    orders: { toArray: async()=>[] },
    markets: { toArray: async()=>[] },
    marketMoves: { toArray: async()=>[] },
    productions: { toArray: async()=>[] }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Score composite : le parfum avec le meilleur CA+vélocité+marge arrive en tête ──
{
  const velo = { hasData:true, lignes:[
    {parfum:'A', perMonth:100, vendu:50, stock:20},
    {parfum:'B', perMonth:10, vendu:5, stock:20}
  ]};
  const prof = { lignes:[
    {parfum:'A', ca:1000, tauxMarge:60},
    {parfum:'B', ca:100, tauxMarge:20}
  ]};
  const ms = buildModule(velo, prof)(makeDb());
  const r = await ms({});
  eq(r.coeur[0].parfum, 'A', 'CAS1 · le parfum dominant sur tous les critères (A) arrive en tête du cœur de gamme');
}

// ── CAS 2 — Grand format SÉPARÉ des standards (BIG_FORMATS), jamais mélangé dans coeur/rotation ──
{
  const velo = { hasData:true, lignes:[
    {parfum:'Chocolat', perMonth:50, vendu:20, stock:10},   // dans BIG_FORMATS
    {parfum:'Vanille', perMonth:50, vendu:20, stock:10}
  ]};
  const prof = { lignes:[{parfum:'Chocolat', ca:500, tauxMarge:40}, {parfum:'Vanille', ca:500, tauxMarge:40}] };
  const ms = buildModule(velo, prof)(makeDb());
  const r = await ms({});
  eq(r.grandsFormats.some(l=>l.parfum==='Chocolat'), true, 'CAS2 · Chocolat (BIG_FORMATS) classé en grand format');
  eq(r.coeur.some(l=>l.parfum==='Chocolat'), false, 'CAS2 · jamais dans le cœur de gamme standard');
  eq(r.coeur.some(l=>l.parfum==='Vanille') || r.rotation.some(l=>l.parfum==='Vanille'), true, 'CAS2 · Vanille (pas dans BIG_FORMATS) reste un standard');
}

// ── CAS 3 — Parfum SANS aucune vente ni CA : classé en "sansVente", jamais dans le cœur ──
{
  const velo = { hasData:true, lignes:[
    {parfum:'Actif', perMonth:30, vendu:15, stock:10},
    {parfum:'Dormant', perMonth:0, vendu:0, stock:5}
  ]};
  const prof = { lignes:[{parfum:'Actif', ca:300, tauxMarge:30}] };   // Dormant absent : ca=0 par défaut
  const ms = buildModule(velo, prof)(makeDb());
  const r = await ms({});
  eq(r.sansVente.some(l=>l.parfum==='Dormant'), true, 'CAS3 · parfum sans vente ni CA classé en "sansVente"');
  eq(r.coeur.some(l=>l.parfum==='Dormant'), false, 'CAS3 · jamais dans le cœur de gamme');
}

// ── CAS 4 — Aucune donnée du tout : hasData=false, pas de crash, listes vides cohérentes ──
{
  const velo = { hasData:false, lignes:[] };
  const prof = { lignes:[] };
  const ms = buildModule(velo, prof)(makeDb());
  const r = await ms({});
  eq(r.hasData, false, 'CAS4 · aucune vélocité ni rentabilité connue → hasData=false');
  eq(Array.isArray(r.coeur), true, 'CAS4 · coeur reste un tableau (vide), pas undefined/crash');
}

// ── CAS 5 — Taille du cœur de gamme : bornée entre 4 et 8, ~45% des parfums actifs ──
{
  // 20 parfums actifs avec vente → nCoeur = round(20*0.45) = 9, borné à 8 (max)
  const lignes = Array.from({length:20}, (_,i)=>({parfum:'P'+i, perMonth:10, vendu:5, stock:5}));
  const velo = { hasData:true, lignes };
  const prof = { lignes: lignes.map(l=>({parfum:l.parfum, ca:100, tauxMarge:30})) };
  const ms = buildModule(velo, prof)(makeDb());
  const r = await ms({});
  eq(r.coeur.length, 8, 'CAS5 · cœur de gamme plafonné à 8 même avec beaucoup de parfums actifs (45% de 20=9 → borné à 8)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 29 : computeMarketSelection ===\n');
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
