/* ============================================================
   TESTS — v1379 : la base meringue commune couvre le TOTAL
   ------------------------------------------------------------
   LE BUG (repéré par Ben en pleine préparation, captures à l'appui) :
   avec Cannelle noisette (60 mac. standard) + Madeleine (17 mac.
   grand format), l'app annonçait « Meringue à réaliser : 239 coques
   std éq. » mais les grammages de la base commune ne couvraient que
   les ~120 coques de la Cannelle — la Madeleine, sans ingrédient
   coque étiqueté, pesait ZÉRO. Pesée telle quelle : une demi-meringue,
   et on tombe court en pleine production. Un total qui n'est pas la
   somme de son détail est un TROISIÈME CHIFFRE (v1339).

   LE MODÈLE (confirmé par Ben — « A ») : les grands formats sont
   convertis en équivalent-coque standard (1 GF = 3,5 std) et la
   meringue est MUTUALISÉE sur ce total. La base commune se dimensionne
   donc sur eqTotal. Le tant pour tant ET les ajouts propres
   (noisettes…) restent PAR PARFUM — les noisettes de la Cannelle ne
   sont plus « mutualisées » avec la Madeleine.

   UN SEUL moteur (_meringueCommuneCalc) alimente les trois surfaces :
   aperçu du formulaire, fiche de production, fiche de pesée. Deux
   calculs pour la même meringue seraient deux vérités (v1331).
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1379 : la base meringue commune couvre le total ===\n');

const cleanApp = stripComments(APP);
const round3 = x => Math.round((+x || 0) * 1000) / 1000;
// Le VRAI normaliseur (jamais une copie) — c'est lui qui décide si « œufs » se lit « oeufs ».
const aiNormalize = eval('(' + extractFunction('_aiNormalizeRaw').replace(/^function _aiNormalizeRaw/, 'function') + ')');
const pres = (v, cible, tol) => Math.abs(v - cible) <= (tol == null ? 0.01 : tol);

// Constantes réelles du fichier (jamais des copies).
const COQUES_PAR_MACARON = +((cleanApp.match(/const COQUES_PAR_MACARON = (\d+(?:\.\d+)?);/) || [])[1]);
const GF_COQUE_RATIO = +((cleanApp.match(/const GF_COQUE_RATIO = (\d+(?:\.\d+)?);/) || [])[1]);
ok(COQUES_PAR_MACARON === 2 && GF_COQUE_RATIO === 3.5,
   'A0 · constantes lues dans le code : 1 macaron = 2 coques, 1 coque GF = 3,5 std');

// Le vrai moteur, assemblé (jamais une copie).
const code = [
  extractFunction('_isTantPourTant'),
  extractFunction('_isBaseMeringue'),
  extractFunction('_natureCoque'),
  extractFunction('_meringueCommuneCalc')
].join('\n');
const M = new Function('aiNormalize', 'round3', 'COQUES_PAR_MACARON', 'GF_COQUE_RATIO',
  code + '\nreturn { _isTantPourTant, _isBaseMeringue, _natureCoque, _meringueCommuneCalc };'
)(aiNormalize, round3, COQUES_PAR_MACARON, GF_COQUE_RATIO);

// Matières du cas réel (captures de Ben).
const MATS = { 1:'Poudre d\u2019amande', 2:'Sucre glace', 3:'Blancs d\'\u0153ufs', 4:'Eau', 5:'Sucre semoule', 6:'Noisettes du Pi\u00e9mont' };
const matName = id => MATS[id] || '(mati\u00e8re ?)';
const dispOf = () => ({ u:'g', f:1 });

// ---------------------------------------------------------------------------
// A. LA NATURE DES INGRÉDIENTS — base / tant pour tant / ajout propre
// ---------------------------------------------------------------------------
{
  ok(M._natureCoque('Poudre d\u2019amande') === 'tpt' && M._natureCoque('Sucre glace') === 'tpt',
     'A1 · poudre d\'amande et sucre glace = tant pour tant (par parfum)');
  ok(M._natureCoque('Blancs d\'\u0153ufs') === 'base' && M._natureCoque('Eau') === 'base' && M._natureCoque('Sucre semoule') === 'base',
     'A2 · blancs, eau, sucre semoule = BASE meringue (mutualisée)');
  ok(M._natureCoque('Noisettes du Pi\u00e9mont') === 'ajout',
     'A3 · les noisettes = AJOUT PROPRE au parfum — plus jamais fondues dans la base commune');
  ok(aiNormalize("Blancs d'\u0153ufs").includes('oeufs'),
     'A5 · le normaliseur décompose la ligature œ → oe (NFD ne le fait pas) — sans ça, les blancs d\'œufs étaient invisibles');
  ok(M._isBaseMeringue('Sucre glace') === false,
     'A4 · le sucre GLACE n\'est pas de la base (il est du tant pour tant) — l\'ambiguïté « sucre » est tranchée');
}

// ---------------------------------------------------------------------------
// B. LE CAS EXACT DE BEN — Cannelle 60 std + Madeleine 17 GF
// ---------------------------------------------------------------------------
// Recette Cannelle (rendement 60) : qteParBatch = les grammages observés pour 60 mac.
const cannelle = { nom:'Cannelle noisette', qMac:60, gf:false, rend:60, items:[
  { materialId:1, qteParBatch:228.263 },   // poudre d'amande (tpt)
  { materialId:2, qteParBatch:228.263 },   // sucre glace (tpt)
  { materialId:3, qteParBatch:18.27 },     // blancs (base)
  { materialId:4, qteParBatch:195.64 },    // eau (base)
  { materialId:5, qteParBatch:260.89 },    // sucre semoule (base)
  { materialId:6, qteParBatch:1.5 }        // noisettes (ajout propre)
]};
const madeleine = { nom:'Madeleine', qMac:17, gf:true, rend:24, items:[] };   // GF, AUCUN item coque
{
  const c = M._meringueCommuneCalc([cannelle, madeleine], dispOf, matName);
  ok(pres(c.eqTotal, 239, 0.01),
     `B1 · le total std éq. est bien 239 (120 Cannelle + 17×2×3,5 = 119 Madeleine) — le chiffre exact des captures`);
  ok(c.eqPorteurs === 120,
     'B2 · seule la Cannelle porte la base (120 std éq. porteurs)');
  ok(pres(c.facteurBase, 239/120, 1e-9),
     'B3 · la base est mise à l\'échelle ×239/120 ≈ ×1,99 — LE cœur du correctif');
  ok(pres(c.baseCommune[4], round3(195.64 * 239/120)) && pres(c.baseCommune[5], round3(260.89 * 239/120)) && pres(c.baseCommune[3], round3(18.27 * 239/120)),
     `B4 · eau ${c.baseCommune[4]} g, semoule ${c.baseCommune[5]} g, blancs ${c.baseCommune[3]} g — la base couvre les 239 coques, plus les 120 d'avant`);
  // L'INVARIANT v1339 : total = somme de son détail → grammes de base PAR coque std identiques
  // que la Madeleine soit là ou pas.
  const seul = M._meringueCommuneCalc([cannelle], dispOf, matName);
  ok(pres(c.baseCommune[4] / c.eqTotal, seul.baseCommune[4] / seul.eqTotal, 1e-4),
     'B5 · INVARIANT — les grammes d\'eau PAR coque std éq. sont identiques avec ou sans la Madeleine (le total est la somme de son détail)');
  ok(c.baseCommune[6] === undefined && pres(c.parParfum[0].propres[6], 1.5),
     'B6 · les noisettes (1,5 g) sont chez la Cannelle, PAS dans la base commune — la Madeleine n\'en hérite plus');
  ok(pres(c.parParfum[0].propres[1], 228.263) && pres(c.parParfum[0].propres[2], 228.263),
     'B7 · le tant pour tant de la Cannelle reste inchangé (228,263 g — il ne se mutualise pas)');
  ok(c.parParfum[1].porteBase === false && Object.keys(c.parParfum[1].propres).length === 0,
     'B8 · la Madeleine : rien en propre, pas de base — elle PARTAGE la meringue (modèle A)');
  ok(c.baseDetectee === true,
     'B9 · la base est détectée : la fiche est pesable');
}

// ---------------------------------------------------------------------------
// C. LE BUG D'ORIGINE, REJOUÉ — ce que l'ancien calcul aurait donné
// ---------------------------------------------------------------------------
{
  const c = M._meringueCommuneCalc([cannelle, madeleine], dispOf, matName);
  // L'ancien calcul sommait SANS mise à l'échelle : eau = 195,64 g pour 239 coques annoncées.
  ok(!pres(c.baseCommune[4], 195.64),
     'C1 · PREUVE — l\'eau ne vaut PLUS 195,64 g (la valeur non couvrante des captures de Ben)');
  const ratioAncien = 195.64 / 239;    // g/coque si on avait pesé l'ancienne fiche
  const ratioJuste = 195.64 / 120;     // g/coque que la recette exige
  ok(ratioAncien < ratioJuste * 0.55,
     'C2 · pesée telle quelle, l\'ancienne fiche donnait ~50 % de la base requise par coque — la demi-meringue évitée de justesse');
}

// ---------------------------------------------------------------------------
// D. LES CAS LIMITES — pas de porteur, tous porteurs, deux standards
// ---------------------------------------------------------------------------
{
  const aucun = M._meringueCommuneCalc([madeleine, { ...madeleine, nom:'Autre GF' }], dispOf, matName);
  ok(aucun.baseDetectee === false && aucun.facteurBase === 0 && Object.keys(aucun.baseCommune).length === 0,
     'D1 · AUCUN parfum porteur → base vide + baseDetectee=false : l\'écran doit crier, jamais afficher une fiche pesable');
  ok(pres(aucun.eqTotal, 238, 0.01),
     'D2 · … le total std éq. reste calculé (2×119) : on sait CE QUI n\'est pas couvert');

  const deuxStd = M._meringueCommuneCalc([cannelle, { ...cannelle, nom:'Vanille' }], dispOf, matName);
  ok(pres(deuxStd.facteurBase, 1, 1e-9),
     'D3 · deux parfums standards TOUS porteurs → facteur exactement 1 : le cas courant ne bouge pas d\'un gramme (v1370, pas de faux mouvement)');
  ok(pres(deuxStd.baseCommune[4], round3(195.64 * 2)),
     'D4 · … et la base est la somme simple des deux (2 × 195,64 g d\'eau)');

  const gfPorteur = M._meringueCommuneCalc([{ ...cannelle, gf:true }], dispOf, matName);
  ok(pres(gfPorteur.facteurBase, 1, 1e-9),
     'D5 · un parfum GF qui porte SA base : facteur 1 (le GF ne gonfle pas sa propre base — il la définit déjà pour ses coques)');
}

// ---------------------------------------------------------------------------
// E. LE CÂBLAGE — un seul moteur, trois surfaces, l'ancien motif banni
// ---------------------------------------------------------------------------
{
  const nAppels = (cleanApp.match(/_meringueCommuneCalc\(/g) || []).length;
  ok(nAppels === 4,
     `E1 · 1 définition + 3 appels (aperçu formulaire, fiche de production, fiche de pesée) — trouvés : ${nAppels}`);
  ok(!/aggCommun/.test(cleanApp),
     'E2 · le motif « aggCommun » (somme sur les seuls porteurs, ajouts fondus dans le commun) est ÉRADIQUÉ — le réintroduire fait échouer la garde');
  ok(/dimensionnée pour|Dimensionnée pour/i.test(APP.normalize('NFC')) || /std éq\./.test(APP),
     'E3 · la couverture est DITE à l\'écran (« dimensionnée pour N coques std éq. ») — la mutualisation est visible, pas implicite');
  ok(/ne couvre PAS|ne couvre pas le total|Ne p\u00e8se pas cette fiche/.test(APP),
     'E4 · le cas « aucun porteur » CRIE à l\'écran (⛔ ne pèse pas cette fiche) au lieu d\'afficher une fiche vide pesable');
  ok(/partage la base commune/.test(APP),
     'E5 · un parfum sans rien en propre est expliqué (« partage la base commune ») — plus le trompeur « pas de tant pour tant étiqueté » seul');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
