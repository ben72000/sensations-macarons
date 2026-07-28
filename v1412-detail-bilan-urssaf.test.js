/* ============================================================
   TESTS — v1412 : DÉTAIL DU BILAN URSSAF PAR MOIS ET CATÉGORIE
   ------------------------------------------------------------
   Ben, sur l'écran « Bilan du mois & URSSAF » : cliquer sur « Vente de
   marchandise » ou « Prestation de service » l'envoyait vers l'écran
   Commandes (TOUT l'historique, en vrac, non trié) ou vers la Rentabilité
   par client — ni l'un ni l'autre filtré par le mois sélectionné, ni par
   la catégorie sur laquelle il avait cliqué.

   CE QUE CE TEST GÈLE :
     1. computeMonthlyBilan enrichit désormais chaque ligne de detailGoods/
        detailService d'une DATE et d'un ID DE COMMANDE (nécessaires pour
        trier et pour ouvrir la commande d'origine).
     2. Les boutons du bilan pointent vers de vrais écrans filtrés, plus
        vers comptaGo('rentabilite') ni comptaGo('commandes') en vrac.
     3. Le nouvel écran comptaCategorieDetail trie du plus récent au plus
        ancien et affiche le bon total.
   ============================================================ */
'use strict';
const { APP, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1412 : détail bilan URSSAF par mois/catégorie ===\n');

// 1. Les boutons du bilan ne pointent PLUS vers les écrans en vrac.
{
  ok(!/onclick="comptaGo\('rentabilite'\)"[^>]*>.*Vente de marchandise/.test(APP.replace(/\n/g,' ')),
     '1 · le bouton « Vente de marchandise » ne pointe plus vers comptaGo(\'rentabilite\')');
  const zone = APP.slice(APP.indexOf('Bilan du mois & URSSAF'), APP.indexOf('Bilan du mois & URSSAF')+3000);
  ok(!/comptaGo\('rentabilite'\)/.test(zone),
     '2 · aucun bouton du bilan mensuel ne pointe plus vers rentabilite (zone Bilan)');
  ok(!/comptaGo\('commandes'\)/.test(zone),
     '3 · le CA encaissé ne pointe plus vers la liste commandes en vrac (zone Bilan)');
}

// 2. Les nouveaux appels ciblent bien le mois ET la catégorie.
{
  // [v1420] Le bouton passe désormais par comptaOuvrirCategorie, qui mémorise le retour vers
  // le bilan AVANT d'ouvrir le détail. L'intention testée est la même : cibler le mois affiché
  // ET la catégorie cliquée.
  ok(/comptaOuvrirCategorie\('\$\{_comptaMonth\}','goods'\)/.test(APP),
     '4 · « Vente de marchandise » cible le mois affiché + \'goods\'');
  ok(/comptaOuvrirCategorie\('\$\{_comptaMonth\}','service'\)/.test(APP),
     '5 · « Prestation de service » cible le mois affiché + \'service\'');
  ok(/caMonthDetail\('\$\{_comptaMonth\}'\)/.test(APP),
     '6 · « CA encaissé » appelle caMonthDetail (déjà trié/filtré) avec le mois affiché');
}

// 3. computeMonthlyBilan enrichit bien chaque ligne de date + oid.
{
  // [v1419] Le libellé porte aussi le NOM DU CLIENT. On vérifie l'INTENTION (les champs présents),
  // pas l'écriture littérale : figer la ligne exacte rendait le test cassant à chaque enrichissement.
  ok(/detailGoods\.push\(\{label:_libelle, client:_nomCl, montant:gPart, date:dateEncMois, oid:o\.id\}\)/.test(APP),
     '7 · detailGoods porte date + oid + client (marchandise, commande normale)');
  ok(/detailService\.push\(\{label:_libelle, client:_nomCl, montant:sPart, date:dateEncMois, oid:o\.id\}\)/.test(APP),
     '8 · detailService porte date + oid + client (service, commande normale)');
  ok(/detailGoods\.push\(\{label:'Marché : '\+\(mk\.nom\|\|mk\.lieu\|\|'—'\), montant:tot, date:mk\.date\|\|''\}\)/.test(APP),
     '9 · un marché porte aussi sa date dans detailGoods');
}

// 4. La fonction d'écran existe, trie par date décroissante, et distingue goods/service.
{
  ok(/async function comptaCategorieDetail\(ym, categorie\)/.test(APP),
     '10 · comptaCategorieDetail existe avec la bonne signature (mois, catégorie)');
  ok(/categorie==='service' \? B\.detailService : B\.detailGoods/.test(APP),
     '11 · la catégorie choisit bien entre detailService et detailGoods');
  ok(/sort\(\(a,b\)=>String\(b\.date\|\|''\)\.localeCompare\(String\(a\.date\|\|''\)\)\)/.test(APP),
     '12 · tri du plus récent au plus ancien (contraire au \'tout en vrac, pas trié\' signalé par Ben)');
  // [v1419] Le clic passe désormais par comptaOuvrirCommande, qui mémorise le chemin de retour.
  // ⚠️ L'ancien motif `closeModal();cmdView(...)` existe encore dans D'AUTRES écrans : le tester
  // globalement donnait un FAUX VERT. On vérifie donc DANS la fonction concernée.
  const _iDeb = APP.indexOf('async function comptaCategorieDetail');
  const _iFin = APP.indexOf('function comptaOuvrirCommande');
  const srcCat = (_iDeb>=0 && _iFin>_iDeb) ? APP.slice(_iDeb, _iFin) : '';
  ok(/comptaOuvrirCommande\(\$\{l\.oid\},'\$\{esc\(ym\)\}','\$\{esc\(categorie\)\}'\)/.test(srcCat),
     '13 · chaque ligne ouvre sa commande EN MÉMORISANT le retour (comptaOuvrirCommande)');
  ok(!/closeModal\(\);cmdView\(/.test(srcCat),
     '14 · elle n\'ouvre plus la commande sans mémoriser le chemin');
  ok(/retourPush\(`\$\{nomCat\} — \$\{monthLabel\(ym\)\}`/.test(extractFunction('comptaOuvrirCommande')),
     '15 · le retour est libellé « <catégorie> — <mois> », lisible pour Ben');
}

// ── 5. NOM DU CLIENT ET NAVIGATION RETOUR (v1419) ─────────────────────────
// Ben : « j'aimerais y rajouter le nom du client. Puis si je désire cliquer sur le détail de la
// commande j'aimerais avoir un bouton retour sur chaque page permettant de naviguer facilement
// en arrière jusqu'à la page d'origine, c'est-à-dire jusqu'à la page comptabilité pointant vers
// le bilan URSSAF. »
{
  // -- le nom du client est résolu et affiché --
  const srcBilan = extractFunction('computeMonthlyBilan');
  ok(/const _clientsBilan = await \(db\.clients\?db\.clients\.toArray\(\):Promise\.resolve\(\[\]\)\)/.test(srcBilan),
     '16 · computeMonthlyBilan charge les clients (il ne les lisait pas du tout avant)');
  ok(/const _nomCl = _nomClientDe\(o\.clientId\);/.test(srcBilan),
     '17 · le nom est résolu depuis le clientId de la commande');
  ok(/const _libelle = cl \|\| \(_nomCl \? _nomCl : ''\) \|\| \('commande #'\+o\.id\);/.test(srcBilan),
     '18 · ordre de repli : libellé de reprise, sinon nom du client, sinon « commande #id »');
  ok(/<b>\$\{nom\}<\/b>\$\{ref\}/.test(APP),
     '19 · le nom s\'affiche en gras, le n° de commande en second et discret');

  // -- pile de retour : mécanisme générique --
  const G = {};
  G.swallow = ()=>{};
  G.closeModal = ()=>{ G._closed = (G._closed||0)+1; };
  G.esc = s=>String(s||'');
  new Function('G', `with(G){ var _retourPile = [];
    ${extractFunction('retourPush')}
    ${extractFunction('retourGo')}
    ${extractFunction('retourReset')}
    ${extractFunction('retourBoutonHtml')}
    G.retourPush=retourPush; G.retourGo=retourGo; G.retourReset=retourReset;
    G.retourBoutonHtml=retourBoutonHtml; G._pile=()=>_retourPile; }`)(G);

  ok(G.retourBoutonHtml() === '',
     '20 · aucun chemin mémorisé → AUCUN bouton retour (pas de bouton parasite ailleurs dans l\'app)');

  let ouvert = 0;
  G.retourPush('Vente de marchandise — juillet 2026', ()=>{ ouvert++; });
  ok(/← Retour à Vente de marchandise — juillet 2026/.test(G.retourBoutonHtml()),
     '21 · le bouton nomme la page de destination (Ben sait où il revient)');
  ok(G._pile().length === 1, '22 · le chemin est empilé');

  G.retourGo();
  ok(G._closed >= 1, '23 · revenir en arrière ferme la modale courante');
  ok(G._pile().length === 0, '24 · et dépile — on ne revient pas deux fois au même endroit');

  G.retourPush('A', ()=>{}); G.retourPush('B', ()=>{});
  ok(/Retour à B/.test(G.retourBoutonHtml()),
     '25 · sur plusieurs niveaux, le bouton pointe le PRÉCÉDENT (B), pas la racine');
  G.retourReset();
  ok(G._pile().length === 0 && G.retourBoutonHtml() === '',
     '26 · « Fermer » vide la pile : on ne garde pas un chemin périmé pour la prochaine fois');

  G.retourPush('x', 'pas une fonction');
  ok(G._pile().length === 0, '27 · une entrée invalide n\'est jamais empilée (robuste)');

  // -- le bouton est bien posé sur les deux écrans concernés --
  ok(/openModal\(`\$\{retourBoutonHtml\(\)\}<h3>\$\{titre\} — /.test(APP),
     '28 · le détail de catégorie affiche le bouton retour en tête');
  ok(/openModal\(`\$\{retourBoutonHtml\(\)\}<h3>Détail commande<\/h3>/.test(APP),
     '29 · la fiche commande aussi — c\'est le maillon qui manquait pour revenir au bilan');
  ok(/onclick="retourReset\(\);closeModal\(\)"/.test(APP),
     '30 · fermer le détail de catégorie réinitialise la pile');
}

console.log(`\n=== v1412 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
