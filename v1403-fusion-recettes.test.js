/* ============================================================
   TESTS — v1403 : FUSION DE RECETTES DOUBLONS
   ------------------------------------------------------------
   Ben avait deux recettes pour le même parfum à une lettre près
   (« Praliné noisette » / « Praliné noisettes ») → deux lignes dans le
   stock. Remède DURABLE : fusionnerRecettes réaffecte les productions du
   doublon vers la recette gardée, supprime l'ingrédientier du doublon,
   puis supprime le doublon — le tout atomiquement.

   CE QUE CE TEST GÈLE :
     1. la transaction déclare productions + recipes + recipeItems (portée).
     2. les productions du doublon sont réaffectées à la recette gardée.
     3. le doublon (recette + son ingrédientier) est supprimé.
     4. la recette gardée et SON ingrédientier sont intacts.
     5. refus si mêmes ids / recette introuvable.
   ============================================================ */
'use strict';
const { stripComments, extractFunction } = require('./_extract');
const { chargeVraiShim, attendCommits } = require('./_faux-idb');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

(async () => {
console.log('\n=== TESTS — v1403 : fusion de recettes doublons ===\n');

// 1. GARDE STATIQUE — portée transactionnelle complète
{
  const clean = stripComments(extractFunction('fusionnerRecettes'));
  ok(/db\.transaction\(\s*['"]rw['"]\s*,\s*db\.productions\s*,\s*db\.recipes\s*,\s*db\.recipeItems/.test(clean),
     '1 · la transaction déclare productions + recipes + recipeItems (portée complète)');
  ok(/productions\.update\([^)]*recipeId:\s*idGarde/.test(clean.replace(/\s+/g,' ')) || /recipeId:\s*idGarde/.test(clean),
     '2 · les productions sont réaffectées vers idGarde');
  ok(/recipes\.delete\(idSupprime\)/.test(clean),
     '3 · le doublon est supprimé');
}

// 2. COMPORTEMENTAL — via le faux-IDB
{
  const { Dexie } = chargeVraiShim();
  const G = global;
  G.db = new Dexie('test-v1403-fusion');
  G.db.version(1).stores({ productions:'++id,recipeId', recipes:'++id', recipeItems:'++id,recipeId' });
  G.round3 = n => Math.round((+n||0)*1000)/1000;

  // deux recettes doublons + ingrédientiers + productions
  await G.db.recipes.bulkAdd([
    { id:1, produitNom:'Praliné noisette' },       // à garder
    { id:2, produitNom:'Praliné noisettes' },      // doublon
  ]);
  await G.db.recipeItems.bulkAdd([
    { id:1, recipeId:1, materialId:10, qteParBatch:100 }, // ingrédientier de la gardée
    { id:2, recipeId:2, materialId:20, qteParBatch:50 },  // ingrédientier du doublon (sera supprimé)
  ]);
  await G.db.productions.bulkAdd([
    { id:1, recipeId:2, qteRestante:15 },  // production du doublon → à réaffecter
    { id:2, recipeId:2, qteRestante:0 },   // autre production du doublon (historique)
    { id:3, recipeId:1, qteRestante:8 },   // production de la gardée (ne bouge pas)
  ]);

  // charge fusionnerRecettes
  new Function('G', `with(G){ ${extractFunction('fusionnerRecettes')}\n G.fusionnerRecettes = fusionnerRecettes; }`)(G);

  const r = await G.fusionnerRecettes(1, 2);
  await attendCommits();

  ok(r.ok && r.nbReaffectees===2, '4 · 2 productions du doublon réaffectées');

  const prods = await G.db.productions.toArray();
  const versGarde = prods.filter(p=>+p.recipeId===1).length;
  ok(versGarde===3, '5 · les 3 productions pointent désormais vers la recette gardée');
  ok(prods.every(p=>+p.recipeId!==2), '6 · plus aucune production ne pointe vers le doublon');

  const recettes = await G.db.recipes.toArray();
  ok(recettes.length===1 && +recettes[0].id===1, '7 · le doublon (recette) est supprimé, la gardée reste');

  const items = await G.db.recipeItems.toArray();
  ok(items.length===1 && +items[0].recipeId===1, '8 · l\'ingrédientier du doublon supprimé, celui de la gardée intact');
}

// 3. REFUS — mêmes ids / recette introuvable
{
  const { Dexie } = chargeVraiShim();
  const G = global;
  G.db = new Dexie('test-v1403-refus');
  G.db.version(1).stores({ productions:'++id,recipeId', recipes:'++id', recipeItems:'++id,recipeId' });
  await G.db.recipes.add({ id:1, produitNom:'X' });
  new Function('G', `with(G){ ${extractFunction('fusionnerRecettes')}\n G.fusionnerRecettes = fusionnerRecettes; }`)(G);

  const meme = await G.fusionnerRecettes(1, 1);
  ok(meme.ok===false, '9 · refus si les deux ids sont identiques');
  const introuvable = await G.fusionnerRecettes(1, 999);
  ok(introuvable.ok===false, '10 · refus si une recette est introuvable');
}

console.log(`\n=== v1403 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
})().catch(e => { console.error('ERREUR FATALE', e); process.exit(1); });
