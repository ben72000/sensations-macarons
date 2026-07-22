/* ============================================================
   TESTS — v1401 : NORMALISATION DES INGRÉDIENTS (fiches produit)
   ------------------------------------------------------------
   Règles de Ben pour la liste d'ingrédients des fiches :
     • un ingrédient ne revient JAMAIS deux fois (même s'il vient de deux
       parties/composants de la recette) → dédup + somme des poids.
     • « Sucre semoule » + « Sucre glace » → une seule ligne « sucre ».
     • détailler le moins possible : « Lait entier » → lait, « Purée de
       noisette » → noisette, « Pectine NH » → pectine.
     • SEULE EXCEPTION : « Gélatine de poisson » reste telle quelle (allergène).

   Testé : _normaliserIngredient (règles unitaires) + _ficheProduitTexte
   (dédup + fusion des poids + ordre).
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1401 : normalisation des ingrédients ===\n');

const G = global;
G.rdToGrams = (q, u) => { const n = +q || 0; return (u === 'kg') ? n * 1000 : n; };
new Function('G', `with(G){ ${extractFunction('_normaliserIngredient')}\n G._normaliserIngredient = _normaliserIngredient; }`)(G);
new Function('G', `with(G){ ${extractFunction('escOrRaw')}\n G.escOrRaw = escOrRaw; }`)(G);
new Function('G', `with(G){ const escOrRaw=G.escOrRaw; const _normaliserIngredient=G._normaliserIngredient; const allergenesPourNom=()=>null; ${extractFunction('_ficheProduitTexte')}\n G._ficheProduitTexte = _ficheProduitTexte; }`)(G);
const norm = G._normaliserIngredient;
const fiche = G._ficheProduitTexte;

// 1. règles unitaires de simplification
{
  ok(norm('Sucre semoule') === 'sucre' && norm('Sucre glace') === 'sucre', '1 · sucre semoule / sucre glace → « sucre »');
  ok(norm('Lait entier') === 'lait', '2 · lait entier → « lait »');
  ok(norm('Purée de noisette') === 'noisette', '3 · purée de noisette → « noisette »');
  ok(norm('Pectine NH') === 'pectine', '4 · pectine NH → « pectine »');
  ok(norm('Poudre d\'amande') === 'amande', '5 · poudre d\'amande → « amande »');
}

// 2. exception gélatine de poisson
{
  ok(norm('Gélatine de poisson') === 'gélatine de poisson', '6 · gélatine de poisson → reste « gélatine de poisson » (exception allergène)');
  ok(norm('Gélatine') === 'gélatine', '7 · gélatine simple → « gélatine » (pas l\'exception)');
}

// 3. déduplication + fusion des poids dans la fiche
{
  const mats = [
    { id:1, nom:'Sucre semoule', unite:'g' },
    { id:2, nom:'Sucre glace', unite:'g' },
    { id:3, nom:'Poudre d\'amande', unite:'g' },
    { id:4, nom:'Purée de noisette', unite:'g' },
  ];
  // recette en 2 parties : la poudre d'amande revient 2 fois, le sucre en 2 variantes
  const items = [
    { materialId:1, qteParBatch:100 }, // sucre semoule 100
    { materialId:3, qteParBatch:120 }, // amande 120 (part 1)
    { materialId:2, qteParBatch:80 },  // sucre glace 80
    { materialId:3, qteParBatch:130 }, // amande 130 (part 2) → total amande 250
    { materialId:4, qteParBatch:60 },  // noisette 60
  ];
  const f = fiche({ produitNom:'Test', allergenes:[] }, items, mats, {});
  // amande n'apparaît qu'une fois
  const nbAmande = f.ingredients.filter(x=>x.toLowerCase()==='amande').length;
  ok(nbAmande === 1, '8 · l\'amande (2 parties) n\'apparaît qu\'UNE fois');
  // sucre fusionné en une ligne
  const nbSucre = f.ingredients.filter(x=>x.toLowerCase()==='sucre').length;
  ok(nbSucre === 1, '9 · sucre semoule + sucre glace → une seule ligne « sucre »');
  // ordre : amande 250 > sucre 180 > noisette 60
  ok(f.ingredients[0].toLowerCase()==='amande', '10 · amande (250 g cumulés) en tête');
  ok(f.ingredients[1].toLowerCase()==='sucre', '11 · sucre (100+80=180) en 2e');
  ok(f.ingredients[2].toLowerCase()==='noisette', '12 · noisette (60) en dernier');
  ok(f.ingredients.length === 3, '13 · 3 ingrédients distincts au total (pas 5)');
}

console.log(`\n=== v1401 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
