/* ============================================================
   TESTS — v1404 : DIAGNOSTIC DES NOMS DE STOCK
   ------------------------------------------------------------
   Ben voit deux lignes « Praliné noisette » / « Praliné noisettes » et
   affirme n'avoir PAS de doublon de recette. Avant de re-supposer, on lui
   donne un diagnostic : pour chaque nom du stock, combien de productions le
   portent, leur PROVENANCE (recette / garniture catalogue / libre) et leur
   TYPE (complet / coques / ganache / dégustation).

   CE QUE CE TEST GÈLE :
     1. regroupe les productions par nom (via prodNomComplet).
     2. distingue la provenance : recette vs garniture catalogue vs libre.
     3. compte les types (complet / ganache / coques…).
     4. somme les quantités par nom.
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1404 : diagnostic des noms de stock ===\n');

const G = global;
G.round3 = n => Math.round((+n||0)*1000)/1000;
// prodNomComplet et prodComposant réels (source unique des noms/types)
new Function('G', `with(G){ ${extractFunction('prodComposant')}\n G.prodComposant = prodComposant; }`)(G);
new Function('G', `with(G){ ${extractFunction('prodNomComplet')}\n G.prodNomComplet = prodNomComplet; }`)(G);
new Function('G', `with(G){ const prodNomComplet=G.prodNomComplet; const prodComposant=G.prodComposant; ${extractFunction('_diagnosticNomsStock')}\n G._diagnosticNomsStock = _diagnosticNomsStock; }`)(G);
const diag = G._diagnosticNomsStock;

const recipes = [
  { id: 1, produitNom: 'Praliné noisette' },   // une SEULE recette (sans s)
];

// Scénario reproduisant la capture : un fini « Praliné noisette » (recette) + une garniture
// catalogue « Praliné noisettes » (avec s) → DEUX noms proches, provenances différentes.
const prods = [
  { id:1, recipeId:1, qteRestante:15, composant:'complet' },                                  // fini, recette
  { id:2, recipeId:1, qteRestante:29, composant:'ganache' },                                  // ganache, recette
  { id:3, composantCatalogue:true, garnitureNom:'Praliné noisettes', qteRestante:0, composant:'ganache' }, // garniture catalogue (avec s)
];

const d = diag(prods, recipes);

// 1. regroupement par nom
{
  ok(!!d['Praliné noisette'], '1 · « Praliné noisette » (recette) présent');
  ok(!!d['Praliné noisettes'], '2 · « Praliné noisettes » (garniture) présent — nom distinct');
}

// 2. provenance distincte
{
  ok(d['Praliné noisette'].provenances['recette'] === 2, '3 · « Praliné noisette » vient de la recette (2 productions)');
  ok(d['Praliné noisettes'].provenances['garniture catalogue'] === 1, '4 · « Praliné noisettes » vient d\'une GARNITURE catalogue');
}

// 3. types comptés
{
  ok(d['Praliné noisette'].types['complet'] === 1 && d['Praliné noisette'].types['ganache'] === 1,
     '5 · types comptés pour « Praliné noisette » (1 complet + 1 ganache)');
}

// 4. somme des quantités
{
  ok(d['Praliné noisette'].total === 44, '6 · total « Praliné noisette » = 15 + 29 = 44');
  ok(d['Praliné noisettes'].total === 0, '7 · total « Praliné noisettes » = 0 (garniture épuisée)');
}

console.log(`\n=== v1404 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
