'use strict';
// v1495 — LANCER LE CRÉMEUX CONSOMMAIT (ET AFFICHAIT) AUSSI LA GANACHE. Ben : « Quand je lance
// une recette de crémeux chocolat, c'est à dire une sous recette, je me retrouve avec une recette
// lançant à la fois la ganache et le crémeux alors que ce n'est pas ce que je veux ».
//
// 🚨 CAUSE (deux endroits, même défaut) : le formulaire de lancement propose bien un sous-type de
// garniture précis (radio Ganache / Crémeux, sous-lot -GA ou -CR), et `prodFilterGarnTypes()`
// affiche même les DEUX options dès qu'une recette a des lignes des deux types (ex. une base
// ganache commune + une finition crémeux, exactement le cas de Ben). Mais UNE FOIS le choix fait,
// deux endroits ignoraient LEQUEL avait été sélectionné et regroupaient systématiquement
// `partie==='ganache' OU partie==='cremeux'` :
//   ① `enregistrerProduction` — la consommation RÉELLE de matières (pas seulement l'affichage :
//      Ben perdait du stock de ganache qu'il n'avait pas produite)
//   ② `ficheRecetteProduction` — la fiche affichée après lancement, qui listait les deux
// FIX : les deux lisent désormais le sous-type RÉELLEMENT choisi (`meta.garnitureType` /
// `garnitureType`, déjà porté par la production et déjà transmis par le formulaire — il suffisait
// de s'en servir) et ne filtrent plus que sur celui-là.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// Extrait la ligne réelle du filtre (sans la recopier à la main) pour la faire tourner
// isolément contre des données synthétiques — sensible à toute régression du filtre lui-même.
function extractFilterFn(anchorConst, anchorFilter){
  const iConst = APP.indexOf(anchorConst);
  const iFilter = APP.indexOf(anchorFilter, iConst);
  const filterExpr = APP.slice(iFilter + 'items = '.length, APP.indexOf(';', iFilter));
  return new Function('allItems', 'garnT', `return (${filterExpr.replace(/garnType|garnitureType(?!\|)/, 'garnT')});`);
}

// ---- A. `enregistrerProduction` : consommation matières scopée au sous-type choisi ----
{
  const src = extractFunction('enregistrerProduction');
  check('A. lit désormais meta.garnitureType (au lieu de regrouper les deux sous-types)',
    /meta\.garnitureType/.test(src));
  check('A. [v1495] le filtre d\'affectation ne regroupe plus « ganache OU cremeux » (recetteEtiquetee, elle, a toujours besoin des deux pour détecter si la recette est étiquetée — non concernée)',
    !/items = allItems\.filter\(it=> it\.partie===['"]ganache['"] \|\| it\.partie===['"]cremeux['"]/.test(src));

  const filtreGarniture = extractFilterFn(
    "const garnType = meta.garnitureType || 'ganache';",
    "items = allItems.filter(it=> it.partie===garnType || !it.partie);"
  );
  const allItems = [
    {id:1, partie:'coque',   materialId:10},
    {id:2, partie:'ganache', materialId:20},   // base ganache (partagée avec le crémeux, chez Ben)
    {id:3, partie:'cremeux', materialId:30},   // finition crémeux, propre à ce sous-type
    {id:4, partie:null,      materialId:40},   // ligne commune non étiquetée (ex. sel)
  ];
  const consoCremeux = filtreGarniture(allItems, 'cremeux').map(it=>it.materialId).sort();
  const consoGanache = filtreGarniture(allItems, 'ganache').map(it=>it.materialId).sort();
  check('A. [LE DÉFAUT CORRIGÉ] lancer le CRÉMEUX ne consomme plus la matière de la ganache (20)',
    !consoCremeux.includes(20));
  check('A. …et consomme bien sa propre matière (30) + la ligne commune (40)',
    consoCremeux.join(',') === '30,40');
  check('A. non-régression : lancer la GANACHE ne consomme pas la matière du crémeux (30)',
    !consoGanache.includes(30));
  check('A. …et consomme bien sa propre matière (20) + la ligne commune (40)',
    consoGanache.join(',') === '20,40');
  check('A. la coque (10) n\'entre jamais dans une consommation de garniture, quel que soit le sous-type',
    !consoCremeux.includes(10) && !consoGanache.includes(10));

  // Sensibilité : l'ancien filtre (union) réintroduit sur ces mêmes données consommerait 20 ET 30
  // à chaque fois, quel que soit le sous-type — la preuve que l'assertion mesure le bon mécanisme.
  const filtreAncien = allItems.filter(it=> it.partie==='ganache' || it.partie==='cremeux' || !it.partie).map(it=>it.materialId).sort();
  check('A. [SENSIBILITÉ] l\'ancien filtre (union) aurait consommé les deux matières à la fois (20 et 30)',
    filtreAncien.includes(20) && filtreAncien.includes(30));
}

// ---- B. `ficheRecetteProduction` : la fiche affichée suit le même sous-type ----
{
  check('B. la signature accepte désormais un paramètre garnitureType',
    /function ficheRecetteProduction\(recipeId, nbMacarons, composant, lot, garnitureType\)/.test(APP));

  const filtreFiche = extractFilterFn(
    "const garnT = garnitureType || 'ganache';",
    "items = allItems.filter(it=> it.partie===garnT || !it.partie);"
  );
  const allItems = [
    {id:1, partie:'ganache', materialId:20},
    {id:2, partie:'cremeux', materialId:30},
    {id:3, partie:null,      materialId:40},
  ];
  check('B. [LE DÉFAUT CORRIGÉ] la fiche pour « Crémeux » n\'affiche plus l\'ingrédient de la ganache',
    !filtreFiche(allItems, 'cremeux').map(it=>it.materialId).includes(20));
  check('B. …et reste non vide pour une recette purement crémeux (ex. mangue passion, cas déjà couvert)',
    filtreFiche([{id:1, partie:'cremeux', materialId:30}], 'cremeux').length === 1);
}

// ---- C. Les 3 points d'appel transmettent bien le sous-type réel (pas de trou de propagation) ----
{
  const srcLancer = extractFunction('lancerBatchAvecFiche');
  check('C. lancerBatchAvecFiche transmet garnType à la fiche qu\'il ouvre juste après',
    /ficheRecetteProduction\(recipeId, facteurQte, composant, lot, garnType\)/.test(srcLancer));

  const srcFromBatch = extractFunction('ficheRecetteProductionFromBatch');
  check('C. rouvrir la fiche d\'un lot existant transmet le garnitureType RÉEL stocké sur la production',
    /ficheRecetteProduction\(p\.recipeId, nbMac, comp, p\.lotProduction\|\|'', p\.garnitureType\)/.test(srcFromBatch));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
