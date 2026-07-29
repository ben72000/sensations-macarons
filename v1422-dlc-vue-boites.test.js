/* ============================================================================
   TESTS — v1422 : TOUCHER UNE ALERTE DLC OUVRE LES BOÎTES DU LOT
   ----------------------------------------------------------------------------
   Ben : « en cliquant sur une ligne d'un lot [des DLC produits finis de
   l'accueil] doivent apparaître l'ensemble des boîtes […] sur une vue d'ensemble
   avec leur emplacement. Ensuite chaque boîte (ayant un numéro unique comme un
   lien mère fille) peut être déplacée, fusionnée etc »

   AVANT : un menu intermédiaire (perte / ranger / voir dans Productions)
   s'intercalait ; il fallait choisir « Ranger » pour atteindre les boîtes —
   deux écrans pour savoir où est son stock. Le menu n'est pas supprimé, il est
   ABSORBÉ : ses trois actions vivent désormais DANS la vue d'ensemble, là où
   elles ont un sens boîte par boîte.

   Propriétés verrouillées ici :
     1. `boitesDuLot` reconstitue la FAMILLE complète depuis N'IMPORTE LAQUELLE
        de ses lignes (une boîte, ou le lot parent) — c'est ce qui permet
        d'arriver par une alerte DLC qui ne cite qu'une seule ligne.
     2. Le parent n'apparaît QUE s'il lui reste du vrac non réparti, et alors en tête.
     3. Les boîtes absorbées par fusion sont exclues (leur contenu vit ailleurs).
     4. `dlcActions` est une redirection MINCE vers la vue d'ensemble.
     5. Chaque boîte offre déplacement, fusion, re-répartition, traçabilité, perte.
     6. Le chemin de retour après fusion est PASSÉ EN PARAMÈTRE, jamais posé dans
        une variable globale (un marqueur global survivrait à une annulation).
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

function buildModule(){
  const code = `
    const round3 = n => Math.round((+n||0)*1000)/1000;
    ${extractFunction('prodEstFusionnee')}
    ${extractFunction('boitesDuLot')}
    return { boitesDuLot, prodEstFusionnee };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

function run(){
const M = buildModule();

// Un lot de framboise réparti en 3 boîtes, dont une déjà absorbée par fusion.
// Le parent n'a plus de vrac (tout est parti en boîtes).
function famille(){
  return {
    parent : { id:10, lotProduction:'250626-FRA',     qteRestante:0,  emplacement:'frigo' },
    b1     : { id:11, lotProduction:'250626-FRA-B1F', qteRestante:20, emplacement:'frigo',    etiquetteDe:10 },
    b2     : { id:12, lotProduction:'250626-FRA-B2C', qteRestante:15, emplacement:'congelo',  etiquetteDe:10 },
    absorbee:{ id:13, lotProduction:'250626-FRA-B3F', qteRestante:0,  emplacement:'frigo',    etiquetteDe:10, fusionneeDans:11 },
    autreLot:{ id:20, lotProduction:'260626-CIT',     qteRestante:30, emplacement:'frigo' },
  };
}
const tous = () => { const f = famille(); return [f.parent, f.b1, f.b2, f.absorbee, f.autreLot]; };

// ── CAS 1 : on arrive par N'IMPORTE QUELLE ligne, on voit TOUTE la famille ────
// C'est le cœur de la demande : l'alerte DLC ne cite qu'une boîte.
{
  const f = famille(), prods = tous();
  eq(M.boitesDuLot(f.b1, prods).map(x=>x.id), [11,12], 'CAS1 · depuis la boîte B1 → toute la famille');
  eq(M.boitesDuLot(f.b2, prods).map(x=>x.id), [11,12], 'CAS1 · depuis la boîte B2 → la même famille');
  eq(M.boitesDuLot(f.parent, prods).map(x=>x.id), [11,12], 'CAS1 · depuis le lot parent → la même famille');
}

// ── CAS 2 : une boîte absorbée par fusion n'est pas montrée ──────────────────
// Son contenu a été transféré : l'afficher compterait le stock deux fois à l'œil.
{
  const f = famille(), prods = tous();
  eq(M.boitesDuLot(f.b1, prods).some(x=>+x.id===13), false, 'CAS2 · la boîte absorbée est exclue');
  eq(M.prodEstFusionnee(f.absorbee), true,  'CAS2 · … parce qu\'elle porte fusionneeDans');
  eq(M.prodEstFusionnee(f.b1), false,       'CAS2 · … et la boîte réceptrice, non');
}

// ── CAS 3 : un autre lot ne s'invite jamais dans la famille ──────────────────
{
  const f = famille();
  eq(M.boitesDuLot(f.b1, tous()).some(x=>+x.id===20), false, 'CAS3 · le lot citron reste dehors');
}

// ── CAS 4 : le parent n'apparaît que s'il reste du vrac, et alors EN TÊTE ─────
// Parler de « reste non mis en boîte » quand il n'y a plus de reste décrirait une
// répartition qui n'existe pas.
{
  const f = famille();
  const avecVrac = Object.assign({}, f.parent, { qteRestante:7 });
  eq(M.boitesDuLot(f.b2, [avecVrac, f.b1, f.b2]).map(x=>x.id), [10,11,12],
     'CAS4 · parent en tête quand il lui reste du vrac');
  eq(M.boitesDuLot(f.b2, [f.parent, f.b1, f.b2]).map(x=>x.id), [11,12],
     'CAS4 · parent absent quand tout est parti en boîtes');
}

// ── CAS 5 : un lot JAMAIS mis en boîtes reste affichable ─────────────────────
// Ben arrive ici depuis une alerte DLC : il doit voir où est son stock, même si
// ce lot n'a jamais été réparti.
{
  const f = famille();
  eq(M.boitesDuLot(f.autreLot, tous()).map(x=>x.id), [20], 'CAS5 · lot en vrac : une seule ligne, la sienne');
}

// ── CAS 6 : le total lu à l'écran est bien celui des boîtes vivantes ──────────
{
  const f = famille();
  const fam = M.boitesDuLot(f.b1, tous());
  eq(fam.reduce((s,x)=>s+(+x.qteRestante||0),0), 35, 'CAS6 · 20 + 15 = 35 pièces (la boîte absorbée ne compte pas)');
  const parEmp = {}; fam.forEach(x=>{ parEmp[x.emplacement]=(parEmp[x.emplacement]||0)+1; });
  eq(parEmp, {frigo:1, congelo:1}, 'CAS6 · répartition par emplacement lisible d\'un coup d\'œil');
}

// ── CAS 7 : entrées dégradées — jamais d'exception, jamais de fausse famille ──
{
  eq(M.boitesDuLot(null, tous()), [],    'CAS7 · aucune ligne → tableau vide');
  eq(M.boitesDuLot(famille().b1, []), [],'CAS7 · base vide → tableau vide');
  eq(M.boitesDuLot(famille().b1, null), [], 'CAS7 · base absente → tableau vide');
}

// ── CAS 8 : toucher une alerte DLC ouvre DIRECTEMENT la vue d'ensemble ───────
// Redirection mince, comme setEmplacement → ouvrirRangement (v1389) : un seul
// écran derrière, tous les onclick existants continuent de marcher.
{
  const src = extractFunction('dlcActions');
  vrai(/return\s+vueBoitesDuLot\(\s*prodId\s*\)/.test(src),
     'CAS8 · dlcActions délègue à vueBoitesDuLot');
  eq(/openModal/.test(src), false, 'CAS8 · … et n\'ouvre plus de menu intermédiaire');
  vrai(/onclick="dlcActions\(\$\{a\.id\}\)"/.test(require('./_extract').APP),
     'CAS8 · la ligne de DLC de l\'accueil appelle bien dlcActions');
}

// ── CAS 9 : la vue d'ensemble montre l'emplacement de chaque boîte ────────────
{
  const src = extractFunction('vueBoitesDuLot');
  vrai(/boitesDuLot\(p,\s*prods\)/.test(src), 'CAS9 · elle s\'appuie sur la fonction pure');
  vrai(/empIcon\(x\.emplacement\)/.test(src) && /empNom\(x\.emplacement\)/.test(src),
     'CAS9 · chaque boîte affiche son emplacement (icône + nom)');
  vrai(/lotProduction/.test(src), 'CAS9 · … et son numéro de lot unique');
  vrai(/famille\.length\)\s*famille\.push\(p\)/.test(src),
     'CAS9 · filet : une famille vide n\'affiche jamais un écran sans ligne');
}

// ── CAS 10 : les actions demandées sont là, boîte par boîte ──────────────────
{
  const src = extractFunction('vueBoitesDuLot');
  vrai(/boiteDeplacer\(\$\{x\.id\}/.test(src),      'CAS10 · déplacer');
  vrai(/boiteFusionner\(\$\{x\.id\}/.test(src),     'CAS10 · fusionner');
  vrai(/prodEtiquetteBoites\(\$\{x\.id\}\)/.test(src),'CAS10 · re-répartir en boîtes');
  vrai(/traceProd\(\$\{x\.id\}\)/.test(src),        'CAS10 · traçabilité (le fil v1414-16)');
  vrai(/declareLossForm\(\$\{x\.id\}\)/.test(src),  'CAS10 · déclarer une perte');
  vrai(/voirLotDansProductions\(/.test(src),        'CAS10 · « Voir dans Productions » en pied d\'écran');
}

// ── CAS 11 : le bouton Fusionner n'apparaît que s'il y a de quoi fusionner ────
// Le lot parent n'est pas une boîte : _fusionValide refuse une ligne sans
// etiquetteDe, proposer le bouton serait promettre une action qui échouera.
{
  const src = extractFunction('vueBoitesDuLot');
  vrai(/fusionnables\s*=\s*famille\.filter\(x=>x\.etiquetteDe!=null/.test(src),
     'CAS11 · seules les lignes-filles avec du stock sont fusionnables');
  vrai(/peutFusionner\s*=\s*\(x\.etiquetteDe!=null\)/.test(src),
     'CAS11 · le parent ne reçoit pas le bouton');
  vrai(/fusionnables\.some\(y=>\+y\.id!==\+x\.id\)/.test(src),
     'CAS11 · … ni une boîte seule de son lot');
}

// ── CAS 12 : le nombre de jours restants est lisible sur chaque boîte ────────
// On vient d'une alerte DLC : savoir LAQUELLE des boîtes expire est l'information
// qui a amené Ben ici.
{
  const src = extractFunction('vueBoitesDuLot');
  vrai(/daysTo\(dlc\)/.test(src),        'CAS12 · le délai est calculé par boîte');
  vrai(/DLC dépassée/.test(src),         'CAS12 · une DLC dépassée est nommée, pas masquée');
  vrai(/J−|J-/.test(src),                'CAS12 · sinon un badge J−n');
}

// ── CAS 13 : le retour après fusion voyage en paramètre, pas en global ───────
// Un marqueur global survivrait à une annulation et rouvrirait plus tard un
// écran sans rapport, au milieu d'une fusion lancée depuis un autre endroit.
{
  const bf  = extractFunction('boiteFusionner');
  const e2  = extractFunction('fusionEtape2');
  const cf  = extractFunction('fusionConfirme');
  const fus = extractFunction('fusionnerBoites');
  vrai(/fusionEtape2\(boiteId,\s*\+retourId\)/.test(bf), 'CAS13 · la vue passe son point de retour');
  vrai(/function fusionEtape2\(idA,\s*retourId\)/.test(e2), 'CAS13 · l\'étape 2 le reçoit');
  vrai(/fusionConfirme\(\$\{idA\},\$\{p\.id\},\$\{_ret\}\)/.test(e2), 'CAS13 · … et le transmet à la confirmation');
  vrai(/fusionnerBoites\(\$\{idA\},\s*\$\{idB\},\s*\$\{_ret\}\)/.test(cf), 'CAS13 · … qui le transmet à l\'exécution');
  vrai(/retourId!=null[^\n]*vueBoitesDuLot\(\+retourId\)/.test(fus), 'CAS13 · la vue est rouverte, à jour');
  vrai(/retourId!=null\)\s*\?\s*\+retourId\s*:\s*'null'/.test(e2),
     'CAS13 · jamais « undefined » injecté dans un onclick (appelants historiques)');
  eq(/window\._retourFusion|_retourFusionGlobal/.test(e2 + cf + fus), false,
     'CAS13 · aucun marqueur global de retour');
}

// ── CAS 14 : le moteur de rangement reste unique (invariant v1389) ───────────
// La vue agit sur les boîtes ; elle ne doit pas devenir un cinquième écrivain.
{
  const src = extractFunction('boiteDeplacer');
  vrai(/doMoveEmplacement\(/.test(src), 'CAS14 · le déplacement passe par doMoveEmplacement');
  eq(/db\.productions\.update/.test(src), false, 'CAS14 · … et n\'écrit jamais en base directement');
  eq(/placements/.test(extractFunction('vueBoitesDuLot')), false,
     'CAS14 · la vue d\'ensemble n\'écrit aucun placement (elle affiche)');
}

// ── résultat ──
console.log('\n=== TESTS — v1422 : alerte DLC → vue d\'ensemble des boîtes ===\n');
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
