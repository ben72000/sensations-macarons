/* ============================================================
   TESTS — v1418 : « VOIR DANS PRODUCTIONS » POINTE LE BON LOT
   ------------------------------------------------------------
   BEN : « quand on clique sur une DLC expirée et qu'on veut voir dans
   production, ça ouvre juste la rubrique production. Pour bien faire ça devrait
   pointer et ouvrir directement la production concernée ».

   COMPORTEMENT AVANT : le bouton faisait `goView('productions')` — un simple
   changement d'écran, sans aucune cible. Ben atterrissait dans la liste
   entière et devait retrouver son lot à la main.

   CE QUE CES TESTS GÈLENT :
     1. le bouton passe par `voirLotDansProductions(prodId)`, plus par goView nu ;
     2. cette fonction pose un focus {type:'lot', val:<n° de lot>, prodId} ;
     3. renderProductions consomme ce focus : pré-filtre sur le n° de lot ET
        retient l'id à pointer ;
     4. chaque carte de lot porte un id DOM stable `prodcard-<id>` ;
     5. `_prodPointerLot` fait défiler + met en surbrillance, et ne pointe
        QU'UNE FOIS (la cible est consommée).
   ============================================================ */
'use strict';
const { extractFunction, APP } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1418 : pointage du lot depuis les DLC ===\n');

// ── 1. Le bouton ne fait plus un simple changement d'écran ─────────────────
{
  // On cible la LIGNE du bouton, pas une zone large : la fonction de navigation
  // ajoutée juste après contient un goView('productions') de repli parfaitement légitime
  // (lot introuvable), qui ne doit pas faire échouer ce test.
  const ligneBouton = (APP.split('\n').find(l=>/Voir dans Productions<\/button>/.test(l))) || '';
  ok(ligneBouton && !/goView\('productions'\)/.test(ligneBouton),
     '1 · le bouton « Voir dans Productions » ne fait PLUS un goView nu');
  ok(/voirLotDansProductions\(\$\{prodId\}\)/.test(ligneBouton),
     '2 · il appelle voirLotDansProductions avec l\'id du lot cliqué');
}

// ── 2. La fonction de navigation pose une vraie cible ──────────────────────
{
  const src = extractFunction('voirLotDansProductions');
  ok(/window\._viewFocus = \{ view:'productions', type:'lot',/.test(src),
     '3 · elle pose un focus de type « lot » (le mécanisme existant ne gérait que « parfum »)');
  ok(/val: p\.lotProduction \|\| \('#'\+p\.id\)/.test(src),
     '4 · la valeur du filtre est le NUMÉRO DE LOT (ce que Ben lit sur l\'étiquette)');
  ok(/prodId: p\.id/.test(src),
     '5 · l\'id est transmis séparément pour pouvoir pointer la carte');
  ok(/if\(!p\)\{ toast\('Lot introuvable'\); goView\('productions'\); return; \}/.test(src),
     '6 · lot introuvable → on retombe proprement sur la liste, sans planter');
}

// ── 3. L'écran Productions consomme la cible ───────────────────────────────
{
  const src = extractFunction('renderProductions');
  ok(/f\.type==='lot' && f\.val/.test(src),
     '7 · renderProductions reconnaît le focus de type « lot »');
  ok(/prodnSearch = String\(f\.val\);\s*\n\s*window\._prodLotAPointer/.test(src),
     '8 · il pré-remplit la recherche sur le n° de lot ET retient l\'id à pointer');
  ok(/window\._viewFocus = null;[\s\S]{0,80}\}\s*\}catch/.test(src),
     '9 · le focus est consommé (pas de re-filtrage fantôme au rendu suivant)');
  ok(/prodbatFilter\(prodnSearch\);[\s\S]{0,300}_prodPointerLot\(\);/.test(APP),
     '10 · le pointage est déclenché APRÈS le filtre (la carte doit être dans le DOM)');
}

// ── 4. Carte identifiable et pointage ──────────────────────────────────────
{
  ok(/<div id="prodcard-\$\{p\.id\}"/.test(APP),
     '11 · chaque carte de lot porte un id DOM stable prodcard-<id>');

  const src = extractFunction('_prodPointerLot');
  ok(/if\(id==null\) return;\s*\n\s*window\._prodLotAPointer = null;/.test(src),
     '12 · la cible est consommée AVANT l\'action : un lot n\'est pointé qu\'une fois');
  ok(/getElementById\('prodcard-'\+id\)/.test(src),
     '13 · il cible la carte par son id');
  ok(/scrollIntoView\(\{behavior:'smooth', block:'center'\}\)/.test(src),
     '14 · il fait DÉFILER jusqu\'à elle (le « pointer » de la demande)');
  ok(/boxShadow = '0 0 0 3px var\(--caramel/.test(src),
     '15 · et la met en SURBRILLANCE pour qu\'elle saute aux yeux');
  ok(/el\.style\.boxShadow = avant \|\| '';/.test(src),
     '16 · la surbrillance est retirée ensuite (état visuel restauré)');
  ok(/if\(!el\) return;/.test(src),
     '17 · carte absente du DOM (lot filtré, replié) → aucun plantage');
}

console.log(`\n=== v1418 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
