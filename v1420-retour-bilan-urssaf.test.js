/* ============================================================
   TESTS — v1420 : CHAÎNE DE RETOUR COMPLÈTE (bilan URSSAF ↔ commande)
   ------------------------------------------------------------
   BEN : depuis les raccourcis du Bilan du mois & URSSAF, il veut le NOM DU
   CLIENT sur chaque ligne, et « un bouton retour sur chaque page permettant de
   naviguer facilement en arrière jusqu'à la page d'origine, c'est-à-dire
   jusqu'à la page comptabilité pointant vers le bilan URSSAF ».

   LA CHAÎNE ATTENDUE, dans les deux sens :
     Bilan URSSAF → détail d'une catégorie → fiche d'une commande
     et retour :  fiche commande → détail catégorie → bilan URSSAF

   TROUVÉ EN VÉRIFIANT : le nom du client et la pile de retour existaient déjà,
   MAIS le premier maillon manquait — les boutons du bilan appelaient
   directement comptaCategorieDetail sans rien empiler. La pile était donc VIDE
   à ce niveau, et le détail de catégorie n'affichait AUCUN bouton retour : la
   chaîne s'arrêtait à mi-parcours.

   CE QUE CES TESTS GÈLENT :
     1. la pile de retour (push / go / reset) et son bouton ;
     2. les TROIS maillons de la chaîne, sans trou ;
     3. le nom du client affiché en tête de ligne ;
     4. le retour au bilan repositionne sur le bon bloc.
   ============================================================ */
'use strict';
const { extractFunction, APP } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1420 : chaîne de retour bilan URSSAF ===\n');

// ── 1. La pile de retour, comportement réel ────────────────────────────────
{
  const G = global;
  G._retourPile = [];
  G.esc = s => String(s==null?'':s);
  new Function('G', `with(G){ ${extractFunction('retourPush')}\n G.retourPush = retourPush; }`)(G);
  new Function('G', `with(G){ ${extractFunction('retourReset')}\n G.retourReset = retourReset; }`)(G);
  new Function('G', `with(G){ const esc=G.esc; ${extractFunction('retourBoutonHtml')}\n G.retourBoutonHtml = retourBoutonHtml; }`)(G);

  ok(G.retourBoutonHtml() === '',
     '1 · pile vide → AUCUN bouton retour (pas de bouton orphelin qui ne mène nulle part)');

  G.retourPush('Bilan du mois & URSSAF', ()=>'bilan');
  ok(/← Retour à Bilan du mois &amp; URSSAF|← Retour à Bilan du mois & URSSAF/.test(G.retourBoutonHtml()),
     '2 · après un push, le bouton nomme la destination (Ben sait où il va retomber)');

  G.retourPush('Vente de marchandise — juillet 2026', ()=>'cat');
  ok(/Vente de marchandise/.test(G.retourBoutonHtml()),
     '3 · le bouton montre TOUJOURS le dernier maillon empilé, pas le premier');
  ok(G._retourPile.length === 2, '4 · les maillons s\'empilent (navigation à plusieurs niveaux)');

  G.retourPush('ignoré', null);
  ok(G._retourPile.length === 2,
     '5 · un push sans action n\'empile rien (pas de maillon mort dans la pile)');

  G.retourReset();
  ok(G._retourPile.length === 0 && G.retourBoutonHtml() === '',
     '6 · reset vide la pile — repartir d\'un écran neuf n\'hérite pas d\'un vieux chemin');
}

// ── 2. Les TROIS maillons de la chaîne ─────────────────────────────────────
{
  // Maillon 1 : bilan → détail de catégorie
  ok(/onclick="comptaOuvrirCategorie\('\$\{_comptaMonth\}','goods'\)"/.test(APP),
     '7 · MAILLON 1 : le bouton du bilan passe par comptaOuvrirCategorie (et non plus en direct)');
  const m1 = extractFunction('comptaOuvrirCategorie');
  ok(/retourPush\('Bilan du mois & URSSAF', \(\)=>comptaRetourBilan\(\)\)/.test(m1),
     '8 · il MÉMORISE le retour au bilan avant d\'ouvrir — c\'est le maillon qui manquait');
  ok(/retourPush[\s\S]*comptaCategorieDetail\(ym, categorie\)/.test(m1),
     '9 · le push a lieu AVANT l\'ouverture (sinon le détail s\'affiche sans son bouton)');

  // Maillon 2 : détail de catégorie → fiche commande
  const m2 = extractFunction('comptaOuvrirCommande');
  ok(/retourPush\(`\$\{nomCat\} — \$\{monthLabel\(ym\)\}`/.test(m2),
     '10 · MAILLON 2 : ouvrir une commande mémorise le retour vers SA catégorie ET SON mois');
  ok(/setTimeout\(\(\)=>cmdView\(oid\), 0\)/.test(m2),
     '11 · la fiche commande s\'ouvre après fermeture de la précédente (pas de collision de modales)');

  // Le bouton est affiché sur les DEUX écrans de la chaîne
  ok(/openModal\(`\$\{retourBoutonHtml\(\)\}<h3>\$\{titre\}/.test(APP),
     '12 · le détail de catégorie affiche le bouton retour en tête');
  ok(/openModal\(`\$\{retourBoutonHtml\(\)\}<h3>Détail commande<\/h3>/.test(APP),
     '13 · la fiche commande aussi — « un bouton retour sur chaque page », comme demandé');
}

// ── 3. Le nom du client sur chaque ligne ───────────────────────────────────
{
  ok(/detailGoods\.push\(\{label:_libelle, client:_nomCl/.test(APP),
     '14 · chaque ligne de marchandise porte le nom du client');
  ok(/detailService\.push\(\{label:_libelle, client:_nomCl/.test(APP),
     '15 · chaque ligne de service aussi');
  const src = extractFunction('comptaCategorieDetail');
  ok(/const nom = l\.client \? esc\(l\.client\) : esc\(l\.label\)/.test(src),
     '16 · le client est affiché en priorité, avec repli sur le libellé si absent');
  ok(/· #\$\{l\.oid\}/.test(src),
     '17 · le n° de commande reste visible, en second et discret');
}

// ── 4. Le retour au bilan atterrit au bon endroit ──────────────────────────
{
  const src = extractFunction('comptaRetourBilan');
  ok(/renderCompta\(\)/.test(src),
     '18 · le retour reconstruit bien l\'écran Comptabilité');
  ok(/\/Bilan du mois\/\.test\(h\.textContent\|\|''\)/.test(src),
     '19 · il repère le bloc « Bilan du mois »…');
  ok(/scrollIntoView\(\{behavior:'smooth', block:'start'\}\)/.test(src),
     '20 · …et y fait défiler (pas de retour en haut d\'une longue page)');
  ok(/boxShadow='0 0 0 2px var\(--caramel\)'/.test(src) && /boxShadow=''/.test(src),
     '21 · surbrillance brève puis retrait — on retrouve son point de départ d\'un coup d\'œil');
  ok(/if\(!el\) return;/.test(src),
     '22 · bloc introuvable → aucun plantage');
}

console.log(`\n=== v1420 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
