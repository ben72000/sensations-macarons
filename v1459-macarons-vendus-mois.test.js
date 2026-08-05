'use strict';
// v1459 — MACARONS VENDUS SUR LE MOIS (accueil) + DATE DU JOUR (bandeau du tableau de bord).
// Ben : « Peux tu afficher sur l'écran d'accueil le nombre de macarons vendus sur le mois ? Et sur
// le tableau de bord indiquer la date du jour, pas seulement le mois ? »
//
// LE PIÈGE DE CE COMPTEUR : « vendus » n'est pas « sortis ». `orderTotalMacarons` existe déjà et
// compte TOUT ce qui quitte le stock, DONS COMPRIS — c'est voulu, il sert à lier les lots de
// production (un macaron offert sort physiquement du stock). Le réutiliser ici aurait fait passer
// les dons pour du chiffre. D'où une fonction distincte, et les deux doivent coexister.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const M = new Function(`
  ${extractConstLine('round3')}
  function orderToLines(o){ return (o && o.lignes) || []; }
  ${extractFunction('orderMacaronsVendus')}
  ${extractFunction('orderTotalMacarons')}
  return { orderMacaronsVendus, orderTotalMacarons };
`)();

// ---- A. Chaque type de ligne compte pour ce qu'il vend ----
{
  check('A. coffret : sa taille', M.orderMacaronsVendus({lignes:[{type:'coffret', taille:10}]}) === 10);
  check('A. sachet : ses parfums', M.orderMacaronsVendus({lignes:[{type:'sachet', parfums:[{nom:'V',qte:3}]}]}) === 3);
  check('A. sachet : « sans parfum » compte aussi (il est vendu)',
    M.orderMacaronsVendus({lignes:[{type:'sachet', parfums:[], sansParfum:2}]}) === 2);
  check('A. vrac : parfums + sans parfum',
    M.orderMacaronsVendus({lignes:[{type:'vrac', parfums:[{nom:'V',qte:20}], sansParfum:5}]}) === 25);
  check('A. événement : sa quantité', M.orderMacaronsVendus({lignes:[{type:'evenement', evQte:60}]}) === 60);
  check('A. grand format : ses pièces', M.orderMacaronsVendus({lignes:[{type:'grand', items:[{nom:'V',qte:8}]}]}) === 8);
  check('A. prestation seule : 0 macaron', M.orderMacaronsVendus({lignes:[{type:'prestation', montantHT:50}]}) === 0);
}

// ---- B. LE POINT QUI COMPTE : un don n'est PAS une vente ----
{
  const cmd = {lignes:[
    {type:'coffret', taille:6},
    {type:'don', parfums:[{nom:'V',qte:4}], items:[{nom:'G',qte:2}]},
  ]};
  check('B. les dons sont exclus du compteur de VENTES', M.orderMacaronsVendus(cmd) === 6);
  check('B. mais ils restent comptés par orderTotalMacarons (sortie de stock réelle)',
    M.orderTotalMacarons(cmd) === 12);
  check('B. les deux fonctions DIVERGENT bien — sinon l\'une des deux serait fausse',
    M.orderMacaronsVendus(cmd) !== M.orderTotalMacarons(cmd));
  check('B. une commande 100 % don ne vend rien',
    M.orderMacaronsVendus({lignes:[{type:'don', parfums:[{nom:'V',qte:10}]}]}) === 0);
}

// ---- C. Une commande mixte, chiffres réels ----
{
  const cmd = {lignes:[
    {type:'coffret', taille:10},                                  // 10
    {type:'sachet', parfums:[{nom:'P',qte:2}], sansParfum:1},      //  3
    {type:'vrac', parfums:[{nom:'V',qte:24}]},                     // 24
    {type:'don', parfums:[{nom:'V',qte:5}]},                       //  0 (offert)
    {type:'prestation', montantHT:80},                             //  0
  ]};
  check('C. total vendu = 37 (les 5 offerts exclus)', M.orderMacaronsVendus(cmd) === 37);
}

// ---- D. Le calcul de l'accueil : périmètre et sources ----
{
  const i = APP.indexOf('let macVendusMois = 0;');
  const src = APP.slice(i-1400, i+1400);
  check('D. les reprises d\'historique sont exclues (ventes déjà faites ailleurs)', /estReprise\(o\)/.test(src));
  check('D. les commandes « histo » sont exclues', /o\.histo/.test(src));
  check('D. le filtre de mois est bien appliqué', /ymKey\(o\.date\|\|''\) !== _mkCourant/.test(src));
  check('D. le compteur de VENTES est utilisé, pas le compteur de sorties', /orderMacaronsVendus\(o\)/.test(src));
  check('D. les marchés clos du mois sont ajoutés', /closedMk\.filter\(k=>mkInMonth\(k\.date\)\)/.test(src));
  check('D. la règle « vendu » des marchés n\'est PAS redite (marketLineSummary réutilisée)',
    /marketLineSummary\(/.test(src));
  check('D. les marchés ne sont chargés QUE s\'il y en a ce mois-ci', /if\(_mkMois\.length\)/.test(src));
  check('D. un échec côté marchés n\'empêche pas l\'accueil de s\'afficher', /swallow\(e,'macarons vendus marchés'\)/.test(src));
}

// ---- E. L'affichage sur la carte CA ----
{
  const i = APP.indexOf("onclick=\"caMonthDetail()\"");
  const src = APP.slice(i, i+900);
  check('E. le nombre de macarons vendus est affiché', /macVendusMois/.test(src));
  check('E. il passe par qtyP (masqué en mode discret, comme les montants)', /qtyP\(macVendusMois\)/.test(src));
  check('E. la part vendue en marché est distinguée quand il y en a', /_macMarches>0/.test(src));
  check('E. il est sur la carte du CA du mois (même période, même endroit)', /CA \$\{esc\(_moisCourantLbl\)\}/.test(src));
}

// ---- F. La date du jour dans le bandeau ----
{
  const i = APP.indexOf('<span class="hhc-sub">');
  const src = APP.slice(i, i+220);
  check('F. le JOUR est affiché', /day:'numeric'/.test(src));
  check('F. le jour de la semaine aussi', /weekday:'long'/.test(src));
  check('F. le mois et l\'année restent affichés', /month:'long'/.test(src) && /year:'numeric'/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
