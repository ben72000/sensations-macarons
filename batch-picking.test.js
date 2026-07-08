/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 12 : Batch picking (logique pure)
   ----------------------------------------------------------------------------
   Fige le comportement de l'agrégation des besoins d'un lot et de la résolution
   du parfum d'un lot de production. Ces fonctions sont le socle du picking groupé
   par QR : si elles dérivent, tout le flux de scan compte faux.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(db){
  const round3       = extractConstLine('round3');
  const GF_MARK      = extractConstLine('GF_MARK');
  const orderToLines = extractFunction('orderToLines');
  const orderFlavorNeeds = extractFunction('orderFlavorNeeds');
  const pickBatchProdFlavor = extractFunction('pickBatchProdFlavor');
  const pickBatchNeeds = extractFunction('pickBatchNeeds');
  const pickBatchDejaReparti = extractFunction('pickBatchDejaReparti');
  const code = `
    ${round3}
    ${GF_MARK}
    ${orderToLines}
    ${orderFlavorNeeds}
    ${pickBatchProdFlavor}
    ${pickBatchNeeds}
    ${pickBatchDejaReparti}
    return { pickBatchProdFlavor, pickBatchNeeds, pickBatchDejaReparti };
  `;
  // db est injecté par closure via eval : on redéclare pickBatchNeeds/DejaReparti dans un scope
  // où `db` pointe sur le stub fourni.
  const factory = new Function('db', code);
  return factory(db);
}

function makeDb(tables){
  return {
    orders: { get: async (id) => (tables.orders||[]).find(o=>+o.id===+id) || null },
    orderItems: { toArray: async () => (tables.orderItems||[]).slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Agrégation de besoins sur 3 commandes (exemple du cahier des charges) ──
const db1 = makeDb({ orders:[
  { id:1, lignes:[ {type:'coffret', taille:12, parfums:[{nom:'Chocolat',qte:4},{nom:'Citron',qte:4},{nom:'Pistache',qte:4}]} ] },
  { id:2, lignes:[ {type:'coffret', taille:12, parfums:[{nom:'Chocolat',qte:2},{nom:'Citron',qte:6},{nom:'Pistache',qte:4}]} ] },
  { id:3, lignes:[ {type:'coffret', taille:12, parfums:[{nom:'Chocolat',qte:6},{nom:'Citron',qte:2},{nom:'Pistache',qte:4}]} ] }
]});
const m1 = buildModule(db1);
const needs1 = await m1.pickBatchNeeds({ orderIds:[1,2,3] });
eq(needs1['Chocolat'], 12, 'CAS1 · total Chocolat = 4+2+6 = 12');
eq(needs1['Citron'], 12, 'CAS1 · total Citron = 4+6+2 = 12');
eq(needs1['Pistache'], 12, 'CAS1 · total Pistache = 4+4+4 = 12');

// ── CAS 2 — Commande supprimée depuis la création du lot : ignorée sans planter ──
const db2 = makeDb({ orders:[
  { id:10, lignes:[ {type:'coffret', taille:6, parfums:[{nom:'Vanille',qte:6}]} ] }
  // id 11 absent (supprimée)
]});
const m2 = buildModule(db2);
const needs2 = await m2.pickBatchNeeds({ orderIds:[10,11] });
eq(needs2['Vanille'], 6, 'CAS2 · seule la commande existante compte');
eq(Object.keys(needs2).length, 1, 'CAS2 · commande fantôme ignorée, pas d\'erreur');

// ── CAS 3 — Résolution du parfum d'un lot (recette vs libre) ──
const m3 = buildModule(makeDb({}));
const recipes = [{id:5, produitNom:'Framboise'}];
eq(m3.pickBatchProdFlavor({recipeId:5}, recipes), 'Framboise', 'CAS3 · lot recette → nom recette');
eq(m3.pickBatchProdFlavor({libre:true, produitLibre:'Édition spéciale'}, recipes), 'Édition spéciale', 'CAS3 · lot libre → produitLibre');
eq(m3.pickBatchProdFlavor(null, recipes), '', 'CAS3 · lot null → chaîne vide (pas de crash)');
eq(m3.pickBatchProdFlavor({recipeId:999}, recipes), '', 'CAS3 · recette inconnue → chaîne vide');

// ── CAS 4 — Déjà réparti sur un batch (orderItems.batchId) agrégé par parfum ──
const db4 = makeDb({
  orderItems:[
    { orderId:1, productionId:100, qte:8, batchId:1 },
    { orderId:2, productionId:100, qte:4, batchId:1 },
    { orderId:3, productionId:200, qte:5, batchId:1 },
    { orderId:9, productionId:100, qte:99, batchId:2 }   // autre batch : NE DOIT PAS compter
  ]
});
const m4 = buildModule(db4);
const prods4 = [{id:100, recipeId:5},{id:200, recipeId:6}];
const rec4 = [{id:5, produitNom:'Chocolat'},{id:6, produitNom:'Citron'}];
const dr4 = await m4.pickBatchDejaReparti(1, prods4, rec4);
eq(dr4['Chocolat'], 12, 'CAS4 · Chocolat batch#1 = 8+4 = 12 (batch#2 exclu)');
eq(dr4['Citron'], 5, 'CAS4 · Citron batch#1 = 5');

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 12 : Batch picking (logique pure) ===\n');
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
