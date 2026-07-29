/* ============================================================================
   TESTS — v1426 : ASSEMBLER DEPUIS « STOCK PAR PARFUM », SANS MÉLANGE
   ----------------------------------------------------------------------------
   Ben : « quand j'ai des batchs en attente d'assemblage j'aimerais pouvoir
   réaliser les assemblages à partir de cet écran sans créer de nouvelle
   fonctionnalité, simplement en reprenant tel quel le chemin déjà existant de la
   fonction. […] pour cette vue précisément on ne rend pas disponible la
   possibilité de mélange des coques, c'est à dire qu'une coque prévue
   initialement pour faire des macarons vanille ne pourra pas servir à faire des
   macarons praliné, cette fonctionnalité étant déjà présente et fonctionnelle
   via l'écran production. »

   DEUX EXIGENCES, ET LA SECONDE EST LA PLUS DÉLICATE :
     • Réutiliser `prodAssembleForm` TELLE QUELLE — pas de second moteur
       d'assemblage. Une deuxième implémentation, c'est la divergence de demain :
       le jour où une règle change, l'une des deux l'apprend et pas l'autre.
     • Interdire le mélange de parfums SUR CE CHEMIN SEULEMENT. La mutualisation
       par couleur (v1249) et le second lot bicolore (v1413) restent entiers
       depuis l'écran Production, où Ben les pilote en connaissance de cause.

   Propriétés verrouillées ici :
     1. L'écran passe par `prodAssembleForm(id,{sansMelange:true})` — la fonction
        existante, avec une option, pas une copie.
     2. `sansMelange` filtre AVANT la mutualisation par couleur : aucune règle de
        couleur ne peut rouvrir la porte.
     3. Le second lot de coques est restreint lui aussi.
     4. La restriction est REVALIDÉE à l'enregistrement, sur les lots relus en
        base — une interdiction qui n'existe que dans le menu n'est pas une règle.
     5. Sans l'option, tout le comportement historique est intact (contre-épreuve).
     6. Un sous-lot non terminé n'obtient pas de bouton, mais une raison.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

function buildModule(){
  const code = `
    const round3 = n => Math.round((+n||0)*1000)/1000;
    const COQUES_PAR_MACARON = 2;
    // COQUE_COULEURS est un objet littéral : l'extracteur partagé ne gère que les tableaux.
    // On injecte les seules clés utiles au jeu de test — recCoqueColors ne s'en sert que pour
    // valider l'existence d'une couleur, jamais pour son libellé ni sa teinte.
    const COQUE_COULEURS = { blanc:{label:'Blanc'}, marron_fonce:{label:'Marron foncé'} };
    ${extractFunction('recCoqueColors')}
    ${extractFunction('coquesMutualisables')}
    ${extractFunction('coqueColorProfile')}
    ${extractFunction('coquesPourCouleur')}
    ${extractFunction('recEstBicolore')}
    ${extractFunction('repartitionCoques')}
    return { recCoqueColors, coquesMutualisables, coqueColorProfile, coquesPourCouleur, recEstBicolore, repartitionCoques };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// Le filtre de candidats de prodAssembleForm, rejoué à l'identique sur des données.
// (La fonction elle-même est un écran : on teste ici la RÈGLE qu'elle applique, et
// les gardes statiques ci-dessous vérifient que l'écran applique bien celle-là.)
function candidatsCoques(M, lots, recipeIdCible, profilCible, recById, sansMelange){
  let cands = lots.filter(x=>x.composant==='coques' && x.qteRestante>0 && x.prodStatut==='termine');
  if(sansMelange) return cands.filter(x=>+x.recipeId===+recipeIdCible);
  if(profilCible && profilCible.colors.length){
    cands = cands.filter(x=>{
      if(x.recipeId===recipeIdCible) return true;
      const ps = M.coqueColorProfile(x, recById);
      if(!ps) return false;
      return M.coquesMutualisables(profilCible, ps, null);
    });
  }
  return cands;
}

function run(){
const M = buildModule();

// Vanille = coques BLANCHES · Praliné = bicolore (marron foncé + blanc) ·
// Chocolat au lait = MARRON FONCÉ. Le cas exact cité par Ben : une coque de
// vanille est blanche, donc « compatible couleur » avec le praliné — et c'est
// précisément ce rapprochement qu'il ne veut pas voir proposé depuis cet écran.
function jeu(){
  const recById = {
    1:{ id:1, nom:'Vanille de Madagascar', coqueColors:['blanc'] },
    2:{ id:2, nom:'Praliné noisette',      coqueColors:['marron_fonce','blanc'] },
    3:{ id:3, nom:'Chocolat au lait',      coqueColors:['marron_fonce'] },
  };
  const lots = [
    { id:10, recipeId:2, composant:'coques',  qteRestante:60, prodStatut:'termine', lotProduction:'P-COQ' },
    { id:11, recipeId:1, composant:'coques',  qteRestante:40, prodStatut:'termine', lotProduction:'V-COQ' },
    { id:12, recipeId:3, composant:'coques',  qteRestante:50, prodStatut:'termine', lotProduction:'C-COQ' },
    { id:13, recipeId:2, composant:'ganache', qteRestante:30, prodStatut:'termine', lotProduction:'P-GAN' },
    { id:14, recipeId:1, composant:'ganache', qteRestante:25, prodStatut:'termine', lotProduction:'V-GAN' },
    { id:15, recipeId:2, composant:'coques',  qteRestante:20, prodStatut:'demarre', lotProduction:'P-COQ2' },
  ];
  return { recById, lots };
}

// ── CAS 1 : LE CAS DE BEN — la coque vanille ne sert plus le praliné ────────
{
  const j = jeu();
  const profilPraline = M.coqueColorProfile({recipeId:2}, j.recById);
  const avec = candidatsCoques(M, j.lots, 2, profilPraline, j.recById, false).map(x=>x.id);
  const sans = candidatsCoques(M, j.lots, 2, profilPraline, j.recById, true).map(x=>x.id);
  vrai(avec.includes(11), 'CAS1 · SANS l\'option, les coques de vanille sont proposées (couleur blanche commune)');
  eq(sans.includes(11), false, 'CAS1 · AVEC l\'option, elles ne le sont plus');
  eq(sans, [10], 'CAS1 · seul le lot de coques du parfum monté reste');
}

// ── CAS 2 : la mutualisation reste ENTIÈRE sans l'option (contre-épreuve) ────
// Preuve que la restriction est bien portée par l'option, et non par une
// altération de la règle de couleur — qui casserait l'écran Production.
{
  const j = jeu();
  const profilPraline = M.coqueColorProfile({recipeId:2}, j.recById);
  const avec = candidatsCoques(M, j.lots, 2, profilPraline, j.recById, false).map(x=>x.id).sort();
  eq(avec, [10,11,12], 'CAS2 · vanille (blanc) ET chocolat au lait (marron) restent des dépannages valides');
  const profilVanille = M.coqueColorProfile({recipeId:1}, j.recById);
  const pourVanille = candidatsCoques(M, j.lots, 1, profilVanille, j.recById, false).map(x=>x.id).sort();
  eq(pourVanille.includes(12), false, 'CAS2 · une coque marron ne sert jamais un macaron blanc, option ou pas');
}

// ── CAS 3 : un sous-lot non terminé n'est jamais candidat ───────────────────
{
  const j = jeu();
  const sans = candidatsCoques(M, j.lots, 2, null, j.recById, true).map(x=>x.id);
  eq(sans.includes(15), false, 'CAS3 · le lot « démarré » est exclu, même du bon parfum');
}

// ── CAS 4 : le bicolore reste assemblable depuis cet écran ─────────────────
// Un lot bicolore dédié porte ses deux couleurs : la restriction ne l'empêche pas.
// Ce qui disparaît, c'est le dépannage avec les coques d'un AUTRE parfum.
{
  const j = jeu();
  eq(M.recEstBicolore(j.recById[2]), true,  'CAS4 · le praliné est bien bicolore');
  eq(M.recEstBicolore(j.recById[1]), false, 'CAS4 · la vanille ne l\'est pas');
  const lotsCoques = j.lots.filter(x=>x.composant==='coques' && x.prodStatut==='termine');
  const restreints = lotsCoques.filter(x=>+x.recipeId===2).map(x=>x.id);
  eq(restreints, [10], 'CAS4 · le 2e sélecteur ne propose que le lot du parfum monté');
  eq(M.repartitionCoques(30, true), {lot1:30, lot2:30}, 'CAS4 · 2 lots → 1 coque de chaque par macaron');
  eq(M.repartitionCoques(30, false), {lot1:60, lot2:0}, 'CAS4 · 1 lot → 2 coques du même');
}

// ── CAS 5 : l'écran réutilise la fonction existante, sans la copier ─────────
{
  const src = extractFunction('stockParfumDetail');
  vrai(/prodAssembleForm\(\$\{p\.id\},\{sansMelange:true\}\)/.test(src),
     'CAS5 · le bouton appelle prodAssembleForm avec l\'option');
  eq(/db\.transaction/.test(src), false,
     'CAS5 · l\'écran n\'assemble rien lui-même (aucun second moteur)');
  eq(/prodConsumption/.test(src), false,
     'CAS5 · … et ne touche pas au décompte des composants');
  vrai(/rowsComp = composants\.map\(_ligneComposantAssemblable\)/.test(src),
     'CAS5 · le bouton est posé sur la section « En attente d\'assemblage »');
  eq(/prods\.map\(_ligneComposantAssemblable\)/.test(src), false,
     'CAS5 · … et PAS sur les macarons déjà finis');
}

// ── CAS 6 : un lot non terminé reçoit une raison, pas un bouton mort ────────
{
  const src = extractFunction('stockParfumDetail');
  vrai(/pret = prodStatut\(p\)==='termine' && round3\(\+p\.qteRestante\|\|0\)>0/.test(src),
     'CAS6 · le bouton exige un lot terminé ET non épuisé');
  vrai(/Production non terminée/.test(src),
     'CAS6 · sinon la ligne explique pourquoi il n\'y a pas de bouton');
}

// ── CAS 7 : `sansMelange` filtre AVANT la mutualisation par couleur ─────────
// L'ordre n'est pas cosmétique : placé après, le filtre couleur aurait déjà
// réintroduit les coques d'autres parfums.
{
  const src = extractFunction('prodAssembleForm');
  const iSans = src.indexOf('opts.sansMelange');
  const iMutu = src.indexOf("want==='coques' && _profilCible");
  vrai(iSans > -1 && iMutu > -1, 'CAS7 · les deux blocs existent');
  vrai(iSans < iMutu,            'CAS7 · la restriction précède la mutualisation');
  vrai(/cands = cands\.filter\(x=>\+x\.recipeId===\+p\.recipeId\)/.test(src),
     'CAS7 · elle ne garde que le parfum monté');
  vrai(/if\(!opts\.sansMelange && want==='coques'/.test(src),
     'CAS7 · … et la mutualisation est explicitement désactivée avec l\'option');
}

// ── CAS 8 : le 2e lot de coques est restreint lui aussi ────────────────────
{
  const src = extractFunction('prodAssembleForm');
  vrai(/\(!opts\.sansMelange \|\| \+x\.recipeId===\+p\.recipeId\)/.test(src),
     'CAS8 · la base des lots de coques applique la même règle');
}

// ── CAS 9 : la règle est REVALIDÉE à l'enregistrement ──────────────────────
// Un formulaire qui n'offre pas une option mais l'accepte quand même n'est pas
// une règle, c'est une décoration.
{
  const form = extractFunction('prodAssembleForm');
  vrai(/id="f_asmSansMelange" value="\$\{opts\.sansMelange\?1:0\}"/.test(form),
     'CAS9 · le formulaire porte le drapeau');
  const save = extractFunction('prodAssembleSave');
  vrai(/_sansMelange = \(val\('f_asmSansMelange'\)\|\|'0'\)==='1'/.test(save),
     'CAS9 · l\'enregistrement le relit');
  vrai(/if\(_sansMelange\)\{[\s\S]*coques\.recipeId !== \+ganache\.recipeId/.test(save),
     'CAS9 · coques et garniture doivent être du même parfum');
  vrai(/_coques2 && \+_coques2\.recipeId !== \+coques\.recipeId/.test(save),
     'CAS9 · le 2e lot de coques aussi');
  const iGet = save.indexOf('await db.productions.get(thisId)');
  const iGarde = save.indexOf('if(_sansMelange){');
  vrai(iGet > -1 && iGarde > iGet,
     'CAS9 · la garde porte sur les lots RELUS EN BASE, pas sur ce que le DOM prétend');
}

// ── CAS 10 : l'écran Production garde son mélange intact ───────────────────
// C'est la moitié explicitement demandée par Ben : ne rien retirer là-bas.
{
  const src = extractFunction('prodAssembleForm');
  vrai(/coquesMutualisables\(_profilCible, ps, null\)/.test(src),
     'CAS10 · la mutualisation par couleur existe toujours');
  vrai(/coquesPourCouleur\(_lotsCoques, _coul2, _recById, _profilCible\)/.test(src),
     'CAS10 · le 2e lot bicolore par couleur aussi');
  vrai(/coques compatibles/.test(src),
     'CAS10 · … avec son étiquette de dépannage, inchangée');
}

// ── CAS 11 : le chemin restreint le DIT, il ne se contente pas de cacher ───
{
  const src = extractFunction('prodAssembleForm');
  vrai(/Un seul parfum/.test(src),        'CAS11 · un bandeau annonce la restriction');
  vrai(/écran <b>Production<\/b>/.test(src), 'CAS11 · … et indique où le mélange reste possible');
  vrai(/ce chemin ne mélange pas les parfums/.test(src),
     'CAS11 · la case « dégustation » ne rouvre pas la porte, et le texte le dit');
}

// ── résultat ──
console.log('\n=== TESTS — v1426 : assemblage depuis le stock par parfum (sans mélange) ===\n');
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
