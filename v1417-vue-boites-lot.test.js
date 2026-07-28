/* ============================================================
   TESTS — v1417 : VUE D'ENSEMBLE DES BOÎTES D'UN LOT
   ------------------------------------------------------------
   DEMANDE DE BEN : depuis les DLC de l'accueil, cliquer un n° de lot ouvre un
   menu (déclarer une perte / ranger / voir dans productions). En choisissant
   « Ranger », il veut « visualiser l'ensemble des boîtes avec leur emplacement
   et décider quoi faire avec ».

   COMPORTEMENT AVANT : `ouvrirRangement` allait DIRECTEMENT au formulaire de
   mise en boîtes, qui ne montre que le stock de la LIGNE CLIQUÉE. Si le lot
   était déjà réparti en boîtes, elles restaient invisibles.

   CE QUE CES TESTS GÈLENT :
     1. boitesDuLot reconstitue la FAMILLE (parent + lignes-filles) depuis
        n'importe laquelle de ses lignes ;
     2. le parent n'apparaît que s'il lui reste du stock non réparti ;
     3. les boîtes absorbées par fusion sont exclues (leur contenu vit ailleurs) ;
     4. l'aiguillage : lot déjà en boîtes → vue d'ensemble ; lot en vrac →
        formulaire de mise en boîtes (comportement historique préservé) ;
     5. le déplacement passe par doMoveEmplacement (invariant du moteur unique).
   ============================================================ */
'use strict';
const { extractFunction, APP } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1417 : vue d\'ensemble des boîtes ===\n');

const G = global;
G.round3 = n => Math.round((+n||0)*1000)/1000;
new Function('G', `with(G){ ${extractFunction('prodEstFusionnee')}\n G.prodEstFusionnee = prodEstFusionnee; }`)(G);
new Function('G', `with(G){ const prodEstFusionnee=G.prodEstFusionnee, round3=G.round3; ${extractFunction('boitesDuLot')}\n G.boitesDuLot = boitesDuLot; }`)(G);
const boites = G.boitesDuLot;

// Un lot #10 réparti en 3 boîtes, dont une déjà fusionnée dans une autre.
const parent = { id:10, lotProduction:'250626-FRA-AS', qteRestante:0, emplacement:'frigo' };
const b1 = { id:11, etiquetteDe:10, lotProduction:'250626-FRA-AS-B1-F', qteRestante:20, emplacement:'frigo' };
const b2 = { id:12, etiquetteDe:10, lotProduction:'250626-FRA-AS-B2-C', qteRestante:15, emplacement:'congelo' };
const b3 = { id:13, etiquetteDe:10, lotProduction:'250626-FRA-AS-B3-F', qteRestante:0,  emplacement:'frigo', fusionneeDans:11 };
const autre = { id:99, lotProduction:'AUTRE-LOT', qteRestante:8, emplacement:'frigo' };
const prods = [parent, b1, b2, b3, autre];

// ── 1. Reconstitution de la famille ────────────────────────────────────────
{
  const f = boites(b1, prods);
  ok(f.length === 2, '1 · depuis une BOÎTE, on retrouve les 2 boîtes vivantes du lot');
  ok(f.some(x=>x.id===11) && f.some(x=>x.id===12), '2 · les deux boîtes en stock sont là');
  ok(!f.some(x=>x.id===99), '3 · une boîte d\'un AUTRE lot n\'est jamais mélangée');

  const fp = boites(parent, prods);
  ok(fp.length === 2 && fp.every(x=>x.etiquetteDe===10),
     '4 · depuis le PARENT, on retrouve la même famille (point d\'entrée indifférent)');

  const f2 = boites(b2, prods);
  ok(JSON.stringify(f2.map(x=>x.id)) === JSON.stringify(f.map(x=>x.id)),
     '5 · le résultat est identique quelle que soit la boîte de départ');
}

// ── 2. Le parent n'apparaît que s'il reste du vrac ─────────────────────────
{
  ok(!boites(b1, prods).some(x=>x.id===10),
     '6 · parent à 0 (tout réparti) → il n\'encombre pas la liste');

  const parentAvecReste = { ...parent, qteRestante:5 };
  const prods2 = [parentAvecReste, b1, b2, b3, autre];
  const f = boites(b1, prods2);
  ok(f.some(x=>x.id===10), '7 · parent avec du reste non réparti → il apparaît');
  ok(f[0].id === 10, '8 · et il est placé EN TÊTE (le vrac avant les boîtes)');
}

// ── 3. Les boîtes fusionnées sont exclues ──────────────────────────────────
{
  const f = boites(b1, prods);
  ok(!f.some(x=>x.id===13),
     '9 · une boîte absorbée par fusion est exclue (son contenu vit dans la boîte gardée)');
}

// ── 4. Robustesse ──────────────────────────────────────────────────────────
{
  ok(boites(null, prods).length === 0, '10 · production absente → liste vide');
  ok(boites(b1, null).length === 0,    '11 · base absente → liste vide');
  const seul = { id:20, lotProduction:'SEUL', qteRestante:12 };
  ok(boites(seul, [seul]).length === 1,
     '12 · un lot jamais mis en boîtes se retourne lui-même (il a du stock)');
}

// ── 5. Aiguillage et câblage dans l'écran ──────────────────────────────────
{
  ok(/async function vueBoitesDuLot\(prodId\)/.test(APP),
     '13 · la vue d\'ensemble existe');
  ok(/if\(aDesBoites\) return vueBoitesDuLot\(prodId\);\s*\n\s*return prodEtiquetteBoites\(prodId\);/.test(APP),
     '14 · AIGUILLAGE : lot déjà en boîtes → vue d\'ensemble ; sinon → formulaire (historique préservé)');
  ok(/boiteDeplacer\(\$\{x\.id\},\$\{prodId\}\)/.test(APP),
     '15 · chaque boîte a son bouton Déplacer');
  ok(/onclick="closeModal\(\);prodEtiquetteBoites\(\$\{x\.id\}\)"/.test(APP),
     '16 · chaque boîte peut être remise en boîtes (re-répartition)');
  ok(/onclick="closeModal\(\);traceProd\(\$\{x\.id\}\)"/.test(APP),
     '17 · chaque boîte ouvre sa traçabilité (le fil v1414/15/16)');
  ok(/empIcon\(x\.emplacement\)[\s\S]{0,120}empNom\(x\.emplacement\)/.test(APP),
     '18 · l\'emplacement de CHAQUE boîte est affiché (le cœur de la demande)');
  ok(/const ok = await doMoveEmplacement\(boiteId, sel\.value, \{\}\);/.test(APP),
     '19 · le déplacement passe par doMoveEmplacement — invariant du moteur unique respecté');
  ok(/if\(ok\)\{ toast\('Boîte déplacée ✓'\); vueBoitesDuLot\(retourId\); \}/.test(APP),
     '20 · après déplacement, la vue se rafraîchit (on reste dans le flux)');
}

// ── 6. Pureté ──────────────────────────────────────────────────────────────
{
  ok(!/\bdb\./.test(extractFunction('boitesDuLot')),
     '21 · boitesDuLot est PURE : aucun accès base (testable, réutilisable)');
}

console.log(`\n=== v1417 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
