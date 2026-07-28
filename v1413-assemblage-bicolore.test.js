/* ============================================================
   TESTS — v1413 : ASSEMBLAGE BICOLORE (deux lots de coques)
   ------------------------------------------------------------
   LE BESOIN DE BEN : un praliné noisette est un macaron BICOLORE — une coque
   marron foncé + une coque blanche. Un lot dédié contient les deux (30+30).
   Mais quand il dépanne avec DEUX lots monochromes d'autres parfums
   (chocolat au lait = marron foncé, vanille = blanc), l'assemblage était
   impossible : le formulaire n'offrait QU'UN seul sélecteur de coques.

   L'app savait DÉJÀ (v1249) que le praliné est bicolore (recCoqueColors) et
   proposait déjà des coques d'autres parfums de même couleur — mais un seul
   lot à la fois. Il manquait le SECOND sélecteur.

   CE QUE CES TESTS GÈLENT :
     1. recEstBicolore : 2 couleurs DIFFÉRENTES = bicolore ; 2 fois la même = non.
     2. coquesPourCouleur : ne propose que les lots portant LA couleur voulue,
        et jamais un grand format pour un standard (ni l'inverse).
     3. repartitionCoques : 1 lot → 2 coques/macaron ; 2 lots → 1 de chaque.
     4. La capacité est le MINIMUM des deux lots, jamais leur somme.
   ============================================================ */
'use strict';
const { extractFunction, APP } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1413 : assemblage bicolore ===\n');

const G = global;
G.COQUES_PAR_MACARON = 2;
G.COQUE_COULEURS = {
  blanc:{label:'Blanc', hex:'#fff'},
  marron_fonce:{label:'Marron foncé', hex:'#4A2E1F'},
  vert:{label:'Vert', hex:'#5C6E4A'},
};

// ── 1. recEstBicolore ───────────────────────────────────────────────────────
{
  new Function('G', `with(G){ const COQUE_COULEURS=G.COQUE_COULEURS; ${extractFunction('recCoqueColors')}\n G.recCoqueColors = recCoqueColors; }`)(G);
  new Function('G', `with(G){ const recCoqueColors=G.recCoqueColors; ${extractFunction('recEstBicolore')}\n G.recEstBicolore = recEstBicolore; }`)(G);

  ok(G.recEstBicolore({ coqueColors:['marron_fonce','blanc'] }) === true,
     '1 · praliné (marron foncé + blanc) → BICOLORE');
  ok(G.recEstBicolore({ coqueColors:['blanc','blanc'] }) === false,
     '2 · vanille (blanc + blanc) → monochrome, pas de 2e sélecteur imposé');
  ok(G.recEstBicolore({ coqueColors:[] }) === false, '3 · aucune couleur renseignée → pas bicolore');
  ok(G.recEstBicolore(null) === false, '4 · recette absente → pas bicolore (robuste)');
  ok(G.recEstBicolore({ coqueColors:['marron_fonce','inconnu'] }) === false,
     '5 · une couleur inconnue est filtrée → pas de bicolore hasardeux');
}

// ── 2. coquesPourCouleur ────────────────────────────────────────────────────
{
  new Function('G', `with(G){ const recCoqueColors=G.recCoqueColors; ${extractFunction('coqueColorProfile')}\n G.coqueColorProfile = coqueColorProfile; }`)(G);
  new Function('G', `with(G){ const coqueColorProfile=G.coqueColorProfile; ${extractFunction('coquesPourCouleur')}\n G.coquesPourCouleur = coquesPourCouleur; }`)(G);

  const recById = {
    1: { id:1, produitNom:'Praliné noisette',  coqueColors:['marron_fonce','blanc'] },
    2: { id:2, produitNom:'Vanille',           coqueColors:['blanc','blanc'] },
    3: { id:3, produitNom:'Chocolat au lait',  coqueColors:['marron_fonce','marron_fonce'] },
    4: { id:4, produitNom:'Pistache',          coqueColors:['vert','vert'] },
    5: { id:5, produitNom:'Madeleine GF',      coqueColors:['blanc','blanc'], grandFormat:true },
  };
  const lots = [
    { id:10, recipeId:2, qteRestante:40 },   // vanille — blanc
    { id:11, recipeId:3, qteRestante:60 },   // chocolat au lait — marron foncé
    { id:12, recipeId:4, qteRestante:30 },   // pistache — vert
    { id:13, recipeId:5, qteRestante:50 },   // madeleine — blanc mais GRAND FORMAT
  ];
  const profilStd = { colors:['marron_fonce','blanc'], gf:false };

  const blancs = G.coquesPourCouleur(lots, 'blanc', recById, profilStd);
  ok(blancs.length === 1 && blancs[0].id === 10,
     '6 · pour le BLANC : seul le lot vanille est proposé (pistache et marron écartés)');
  ok(!blancs.some(l=>l.id===13),
     '7 · le lot GRAND FORMAT blanc est écarté pour un macaron standard (jamais interchangeables)');

  const marrons = G.coquesPourCouleur(lots, 'marron_fonce', recById, profilStd);
  ok(marrons.length === 1 && marrons[0].id === 11,
     '8 · pour le MARRON FONCÉ : seul le lot chocolat au lait est proposé');

  ok(G.coquesPourCouleur(lots, '', recById, profilStd).length === 0,
     '9 · sans couleur demandée → aucun lot (pas de proposition au hasard)');

  const profilGF = { colors:['blanc','blanc'], gf:true };
  const blancsGF = G.coquesPourCouleur(lots, 'blanc', recById, profilGF);
  ok(blancsGF.length === 1 && blancsGF[0].id === 13,
     '10 · pour un GRAND FORMAT blanc : seul le lot GF est proposé (le standard est écarté)');
}

// ── 3. repartitionCoques — LE CŒUR DU CALCUL ───────────────────────────────
{
  new Function('G', `with(G){ const COQUES_PAR_MACARON=G.COQUES_PAR_MACARON; ${extractFunction('repartitionCoques')}\n G.repartitionCoques = repartitionCoques; }`)(G);

  const un = G.repartitionCoques(30, false);
  ok(un.lot1 === 60 && un.lot2 === 0,
     '11 · UN seul lot : 30 macarons = 60 coques prises dans ce lot (comportement historique)');

  const deux = G.repartitionCoques(30, true);
  ok(deux.lot1 === 30 && deux.lot2 === 30,
     '12 · DEUX lots : 30 macarons = 30 coques de chaque (1 de chaque couleur par macaron)');
  ok(deux.lot1 + deux.lot2 === 60,
     '13 · le TOTAL de coques consommées reste 60 — on ne consomme ni plus ni moins qu\'avant');

  ok(G.repartitionCoques(0, true).lot1 === 0, '14 · quantité nulle → aucune coque');
  ok(G.repartitionCoques(-5, true).lot1 === 0, '15 · quantité négative → plancher à 0 (robuste)');
}

// ── 4. Capacité : le MINIMUM des deux lots, jamais la somme ────────────────
{
  // Reproduit le calcul du code : avec 2 lots, chaque macaron prend 1 coque de chacun.
  const capacite = (q1, q2, deux) => {
    const rep = G.repartitionCoques(1, deux);
    return deux ? Math.min(Math.floor(q1/rep.lot1), Math.floor(q2/rep.lot2))
                : Math.floor(q1/G.COQUES_PAR_MACARON);
  };
  ok(capacite(30, 30, true) === 30,
     '16 · 30 coques marron + 30 blanches → 30 macarons bicolores');
  ok(capacite(60, 10, true) === 10,
     '17 · CRITIQUE : limité par le lot le plus PAUVRE (10), pas par la somme (70/2=35)');
  ok(capacite(60, 0, false) === 30,
     '18 · un seul lot de 60 coques → 30 macarons (règle historique inchangée)');
}

// ── 5. Câblage dans l'écran d'assemblage ───────────────────────────────────
{
  ok(/id="f_asmCoques2"/.test(APP),
     '19 · le 2e sélecteur de coques existe dans le formulaire d\'assemblage');
  ok(/const coques2Id=\+val\('f_asmCoques2'\)\|\|0/.test(APP),
     '20 · sa valeur est bien lue à la validation');
  ok(/if\(_coques2\) await db\.productions\.update\(_coques2\.id/.test(APP),
     '21 · le second lot est réellement décrémenté en stock');
  ok(/\.\.\.\(_coques2\?\[\{id:_coques2\.id, lot:_coques2\.lotProduction, composant:'coques'/.test(APP),
     '22 · le second lot apparaît dans assembleFrom (traçabilité ascendante préservée)');
  ok(/Le second lot de coques doit être différent du premier/.test(APP),
     '23 · garde-fou : impossible de choisir deux fois le même lot');
  ok(/recEstBicolore\(_recCible\)/.test(APP),
     '24 · le sélecteur est proposé d\'office quand la recette montée est bicolore');
  ok(/composant:'coques', sens:-1, qte:_repFin\.lot2/.test(APP),
     '25 · la sortie du 2e lot est journalisée dans le stock (sinon consommation invisible)');
}

console.log(`\n=== v1413 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
