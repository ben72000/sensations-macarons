/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 31 : computeMaterialNeeds (besoins matières)
   ----------------------------------------------------------------------------
   Fige la cascade : demande par parfum (commandes "à préparer") → nombre de
   batchs nécessaires par recette (arrondi SUPÉRIEUR, jamais de batch partiel
   en dessous du besoin) → besoins matières cumulés → confrontation au stock
   disponible (manque = max(0, requis-dispo), jamais négatif).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const orderToLines = extractFunction('orderToLines');
  const normStatus = extractFunction('normStatus');
  const computeMaterialNeeds = extractFunction('computeMaterialNeeds');
  const code = `
    function aiNormalize(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim(); }
    ${orderToLines}
    ${normStatus}
    ${computeMaterialNeeds}
    return computeMaterialNeeds;
  `;
  return new Function('db', code);
}

function makeDb({recipes=[], recipeItems=[], materials=[], lots=[]}){
  return {
    recipes: { toArray: async()=>recipes.slice() },
    recipeItems: { toArray: async()=>recipeItems.slice() },
    materials: { toArray: async()=>materials.slice() },
    materialLots: { toArray: async()=>lots.slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){
const factory = buildModule();

// ── CAS 1 — Filtre par défaut : uniquement les commandes "À préparer" ──
{
  const orders = [
    { id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:20}]}] },
    { id:2, statut:'Livrée', lignes:[{type:'coffret', parfums:[{nom:'Vanille',qte:99}]}] }
  ];
  const cmn = factory(makeDb({}));
  const r = await cmn(orders, {});
  eq(r.demande.Chocolat, 20, 'CAS1 · demande "À préparer" comptée');
  eq(r.demande.Vanille, undefined, 'CAS1 · commande déjà livrée exclue de la demande');
}

// ── CAS 2 — opts.all=true : toutes les commandes comptent, peu importe le statut ──
{
  const orders = [
    { id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:20}]}] },
    { id:2, statut:'Livrée', lignes:[{type:'coffret', parfums:[{nom:'Vanille',qte:15}]}] }
  ];
  const cmn = factory(makeDb({}));
  const r = await cmn(orders, {all:true});
  eq(r.demande.Vanille, 15, 'CAS2 · avec opts.all, même une commande livrée compte');
}

// ── CAS 3 — Nombre de batchs : arrondi TOUJOURS SUPÉRIEUR (jamais de batch partiel manquant) ──
{
  const orders = [{ id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:25}]}] }];
  const recipes = [{id:1, produitNom:'Chocolat', rendement:12}];   // 25/12 = 2.08... → 3 batchs (pas 2)
  const cmn = factory(makeDb({recipes}));
  const r = await cmn(orders, {});
  eq(r.batchsParRecette[1], 3, 'CAS3 · 25 pièces demandées / rendement 12 → 3 batchs (arrondi supérieur, pas 2)');
}

// ── CAS 4 — Besoins matières cumulés = nb_batchs × qteParBatch, sommé sur plusieurs ingrédients ──
{
  const orders = [{ id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:24}]}] }];
  const recipes = [{id:1, produitNom:'Chocolat', rendement:12}];   // 24/12 = 2 batchs pile
  const recipeItems = [
    {recipeId:1, materialId:100, qteParBatch:0.5},   // 2 batchs × 0.5 = 1
    {recipeId:1, materialId:200, qteParBatch:0.2}    // 2 batchs × 0.2 = 0.4
  ];
  const materials = [{id:100, nom:'Chocolat noir', unite:'kg'}, {id:200, nom:'Beurre', unite:'kg'}];
  const cmn = factory(makeDb({recipes, recipeItems, materials}));
  const r = await cmn(orders, {});
  const l100 = r.matLignes.find(l=>l.id===100), l200 = r.matLignes.find(l=>l.id===200);
  eq(l100.requis, 1, 'CAS4 · besoin matière 100 = 2 batchs × 0.5 = 1');
  eq(l200.requis, 0.4, 'CAS4 · besoin matière 200 = 2 batchs × 0.2 = 0.4');
}

// ── CAS 5 — Confrontation au stock : manque = max(0, requis - dispo), jamais négatif ──
{
  const orders = [{ id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:12}]}] }];
  const recipes = [{id:1, produitNom:'Chocolat', rendement:12}];
  const recipeItems = [{recipeId:1, materialId:100, qteParBatch:2}];   // besoin = 1 batch × 2 = 2
  const materials = [{id:100, nom:'Chocolat noir', unite:'kg'}];
  // Cas A : stock insuffisant (0.5 dispo pour 2 requis)
  const lotsInsuf = [{materialId:100, qteRestante:0.5}];
  const cmnA = factory(makeDb({recipes, recipeItems, materials, lots:lotsInsuf}));
  const rA = await cmnA(orders, {});
  eq(rA.matLignes[0].manque, 1.5, 'CAS5a · manque = 2 requis - 0.5 dispo = 1.5');
  // Cas B : stock largement suffisant (10 dispo pour 2 requis) → manque=0, JAMAIS négatif
  const lotsSuffisant = [{materialId:100, qteRestante:10}];
  const cmnB = factory(makeDb({recipes, recipeItems, materials, lots:lotsSuffisant}));
  const rB = await cmnB(orders, {});
  eq(rB.matLignes[0].manque, 0, 'CAS5b · stock largement suffisant → manque=0 (jamais -8 négatif)');
}

// ── CAS 6 — Parfum SANS recette rattachée : signalé à part (sansRecette), pas de crash ──
{
  const orders = [{ id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Parfum mystère',qte:10}]}] }];
  const cmn = factory(makeDb({}));   // aucune recette du tout
  const r = await cmn(orders, {});
  eq(r.sansRecette.length, 1, 'CAS6 · parfum sans recette signalé dans sansRecette');
  eq(r.sansRecette[0].qte, 10, 'CAS6 · la quantité demandée est conservée pour affichage');
  eq(Object.keys(r.batchsParRecette).length, 0, 'CAS6 · aucun batch calculé pour un parfum non résolu');
}

// ── CAS 7 — Matching TOLÉRANT par nom (inclusion partielle) quand pas d'égalité exacte ──
{
  const orders = [{ id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat noir intense',qte:12}]}] }];
  const recipes = [{id:1, produitNom:'Chocolat noir', rendement:12}];   // nom plus court, inclus dans la demande
  const cmn = factory(makeDb({recipes}));
  const r = await cmn(orders, {});
  eq(r.sansRecette.length, 0, 'CAS7 · matching tolérant trouve la recette malgré un nom légèrement différent');
  eq(r.batchsParRecette[1], 1, 'CAS7 · 1 batch calculé pour la recette matchée par inclusion');
}

// ── CAS 8 — Deux parfums différents contribuant à la MÊME recette (synonymes) cumulent les batchs ──
{
  const orders = [
    { id:1, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:12}]}] },
    { id:2, statut:'À préparer', lignes:[{type:'coffret', parfums:[{nom:'Chocolat',qte:6}]}] }
  ];
  const recipes = [{id:1, produitNom:'Chocolat', rendement:12}];
  const cmn = factory(makeDb({recipes}));
  const r = await cmn(orders, {});
  // demande cumulée = 12+6=18 → 18/12 = 1.5 → 2 batchs (arrondi supérieur)
  eq(r.batchsParRecette[1], 2, 'CAS8 · demande cumulée sur 2 commandes (18 pièces) → 2 batchs');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 31 : computeMaterialNeeds ===\n');
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
