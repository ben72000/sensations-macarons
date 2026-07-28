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
const { APP } = require('./_extract');

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
  ok(/comptaCategorieDetail\('\$\{_comptaMonth\}','goods'\)/.test(APP),
     '4 · « Vente de marchandise » appelle comptaCategorieDetail avec le mois affiché + \'goods\'');
  ok(/comptaCategorieDetail\('\$\{_comptaMonth\}','service'\)/.test(APP),
     '5 · « Prestation de service » appelle comptaCategorieDetail avec le mois affiché + \'service\'');
  ok(/caMonthDetail\('\$\{_comptaMonth\}'\)/.test(APP),
     '6 · « CA encaissé » appelle caMonthDetail (déjà trié/filtré) avec le mois affiché');
}

// 3. computeMonthlyBilan enrichit bien chaque ligne de date + oid.
{
  ok(/detailGoods\.push\(\{label:\(cl\|\|\('commande #'\+o\.id\)\), montant:gPart, date:dateEncMois, oid:o\.id\}\)/.test(APP),
     '7 · detailGoods porte désormais date + oid (marchandise, commande normale)');
  ok(/detailService\.push\(\{label:\(cl\|\|\('prestation #'\+o\.id\)\), montant:sPart, date:dateEncMois, oid:o\.id\}\)/.test(APP),
     '8 · detailService porte désormais date + oid (service, commande normale)');
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
  ok(/onclick="closeModal\(\);cmdView\(\$\{l\.oid\}\)"/.test(APP),
     '13 · chaque ligne du détail ouvre bien sa commande d\'origine au clic');
}

console.log(`\n=== v1412 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
