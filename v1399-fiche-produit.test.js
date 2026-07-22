/* ============================================================
   TESTS — v1399 : FICHE PRODUIT CONFORME (boutique en ligne)
   ------------------------------------------------------------
   Ben veut préparer ses fiches produit pour Shopify À PARTIR de ses données
   réelles (recettes + allergènes de l'ERP), au format « liste d'ingrédients
   (ordre de poids) + bloc allergènes en gras dessous » — le plus conforme
   INCO, avec les allergènes issus de sa base fiable (pas de mise en gras
   devinée dans la liste).

   CE QUE CE TEST GÈLE :
     1. les ingrédients sont listés par POIDS décroissant.
     2. les allergènes viennent de la recette (source fiable), avec repli
        sur le dictionnaire par nom.
     3. le bloc allergènes est en gras (<strong>) dans le HTML.
     4. recette sans ingrédient → mention « à compléter », pas de plantage.
     5. versions HTML et brut cohérentes.
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1399 : fiche produit conforme ===\n');

// Environnement minimal : rdToGrams simplifié (g par défaut, kg×1000).
const G = global;
G.rdToGrams = (q, u) => { const n = +q || 0; return (u === 'kg') ? n * 1000 : n; };
// esc absent → escOrRaw renverra le brut (ok pour le test).

// Charge les fonctions (escOrRaw + _normaliserIngredient utilisées par _ficheProduitTexte).
new Function('G', `with(G){ ${extractFunction('escOrRaw')}\n G.escOrRaw = escOrRaw; }`)(G);
new Function('G', `with(G){ ${extractFunction('_normaliserIngredient')}\n G._normaliserIngredient = _normaliserIngredient; }`)(G);
new Function('G', `with(G){ const escOrRaw = G.escOrRaw; const _normaliserIngredient = G._normaliserIngredient; const allergenesPourNom = ()=>null; ${extractFunction('_ficheProduitTexte')}\n G._ficheProduitTexte = _ficheProduitTexte; }`)(G);
const f = G._ficheProduitTexte;

const mats = [
  { id: 1, nom: 'Poudre d\'amande', unite: 'g' },
  { id: 2, nom: 'Sucre glace', unite: 'g' },
  { id: 3, nom: 'Blancs d\'œufs', unite: 'g' },
  { id: 4, nom: 'Chocolat noir', unite: 'g' },
];

// 1. ordre de poids
{
  const recette = { produitNom: 'Chocolat noir', allergenes: ['Œufs','Lait','Soja','Fruits à coque'] };
  const items = [
    { materialId: 2, qteParBatch: 200 }, // sucre glace 200
    { materialId: 1, qteParBatch: 250 }, // amande 250 (le + lourd)
    { materialId: 4, qteParBatch: 120 }, // chocolat 120
    { materialId: 3, qteParBatch: 90 },  // blancs 90
  ];
  const fiche = f(recette, items, mats, {});
  ok(fiche.ingredients[0] === 'Amande', '1 · ingrédient le plus lourd en tête, normalisé et capitalisé (amande 250)');
  ok(fiche.ingredients[fiche.ingredients.length-1] === 'œuf', '2 · le plus léger en dernier, normalisé (blancs d œufs → œuf)');
  ok(fiche.ingredients.length === 4, '3 · tous les ingrédients listés');
}

// 2. allergènes de la recette (source fiable) + gras
{
  const recette = { produitNom: 'Chocolat noir', allergenes: ['Œufs','Lait','Fruits à coque'] };
  const items = [{ materialId: 1, qteParBatch: 100 }];
  const fiche = f(recette, items, mats, {});
  ok(fiche.allergenes.join(',') === 'Œufs,Lait,Fruits à coque', '4 · allergènes pris depuis la recette');
  ok(/<strong>Allergènes\s*:.*<\/strong>/.test(fiche.texteHtml), '5 · bloc allergènes en gras dans le HTML');
  ok(/Allergènes : Œufs, Lait, Fruits à coque\./.test(fiche.texteBrut), '6 · allergènes présents en version brute');
}

// 3. conservation + opérateur injectés
{
  const fiche = f({ produitNom: 'X', allergenes: ['Lait'] }, [{materialId:1, qteParBatch:10}], mats,
    { operateur: 'Sensations Macarons — Le Mans', conservation: 'À conserver au frais.' });
  ok(/À conserver au frais\./.test(fiche.texteBrut), '7 · mention de conservation reprise');
  ok(/Sensations Macarons/.test(fiche.texteBrut), '8 · identité opérateur reprise');
}

// 4. recette sans ingrédient → mention à compléter, pas de plantage
{
  const fiche = f({ produitNom: 'Vide', allergenes: ['Lait'] }, [], mats, {});
  ok(fiche.ingredients.length === 0 && /compléter/.test(fiche.texteBrut), '9 · aucun ingrédient → « à compléter », pas de plantage');
}

// 5. unité kg convertie pour l'ordre
{
  const matsKg = [{ id:1, nom:'Beurre', unite:'kg' }, { id:2, nom:'Sel', unite:'g' }];
  const items = [{ materialId:2, qteParBatch:500 }, { materialId:1, qteParBatch:1 }]; // 500 g sel vs 1 kg beurre
  const fiche = f({ produitNom:'Test', allergenes:[] }, items, matsKg, {});
  ok(fiche.ingredients[0] === 'Beurre', '10 · 1 kg (=1000 g) passe devant 500 g (conversion d\'unité)');
}

console.log(`\n=== v1399 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
