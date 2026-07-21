/* ============================================================
   TESTS — v1392 : LIBELLÉ COQUES DANS LE RÉSUMÉ D'ASSEMBLAGE
   ------------------------------------------------------------
   LE BUG (vu par Ben en atelier — capture « Citron crémeux ») :
     Pour un macaron MONO-COULEUR (mêmes coques des deux côtés,
     badge « même parfum »), le résumé d'assemblage affichait
     « (9 coques de chaque couleur) », faux à deux titres :
       • le mot « couleur » n'a pas de sens quand il n'y en a qu'UNE ;
       • 9 macarons mono-couleur = 18 coques (2 par macaron), pas 9.
     Attendu : « (18 coques jaunes) ».

   LE FIX :
     • branche mono → « (${coquesNeeded} coques ${couleur}s) », où
       coquesNeeded = assemblable*2 (total réel, pas par couleur) ;
     • helper pluralCouleur() accorde le libellé (« Jaune » → « jaunes »,
       « Marron foncé » → « marrons foncés »).
     • branche bi INCHANGÉE : « (N coques de chaque couleur) ».

   RÈGLE GRAVÉE : mono-couleur = total des coques d'UNE couleur, nommée
   et accordée ; bi-couleur = N de chaque couleur. coquesNeeded porte
   déjà le total (2/mac) — l'affichage mono doit s'en servir, pas de
   `assemblable`.
   ============================================================ */
'use strict';
const { APP, stripComments } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

console.log('\n=== TESTS — v1392 : libellé coques mono/bi-couleur ===\n');

// ---------------------------------------------------------------------------
// 1. GARDE STATIQUE — la branche mono nomme la couleur et utilise coquesNeeded
// ---------------------------------------------------------------------------
{
  const clean = stripComments(APP);
  // La branche bi doit rester "de chaque couleur"
  ok(/coques de chaque couleur/.test(clean),
     '1 · la branche bi-couleur garde « coques de chaque couleur »');
  // La branche mono doit désormais appeler pluralCouleur sur couleursTxt
  ok(/coquesNeeded[^`]*coques\$\{s\.couleursTxt\?[^`]*pluralCouleur\(s\.couleursTxt\)/.test(clean),
     '2 · la branche mono nomme la couleur via pluralCouleur(couleursTxt)');
  // Elle doit se baser sur coquesNeeded (total réel), pas sur assemblable
  ok(/\$\{qty\(s\.coquesNeeded\)\}\s*coques\$\{s\.couleursTxt/.test(clean),
     '3 · la branche mono compte coquesNeeded (total 2/mac), pas assemblable');
}

// ---------------------------------------------------------------------------
// 2. COMPORTEMENTAL — pluralCouleur accorde correctement
// ---------------------------------------------------------------------------
{
  // On extrait et évalue la vraie fonction pluralCouleur.
  const m = APP.match(/function pluralCouleur\(txt\)\{[\s\S]*?\n\}/);
  ok(!!m, '4 · pluralCouleur est présente dans app.js');
  // eslint-disable-next-line no-eval
  const pluralCouleur = eval('(' + m[0].replace('function pluralCouleur', 'function') + ')');

  ok(pluralCouleur('Jaune') === 'jaunes',            '5 · « Jaune » → « jaunes »');
  ok(pluralCouleur('Marron foncé') === 'marrons foncés',
     '6 · « Marron foncé » → « marrons foncés » (1er mot accordé)');
  ok(pluralCouleur('Rouge bourgogne') === 'rouges bourgognes',
     '7 · « Rouge bourgogne » → « rouges bourgognes »');
  ok(pluralCouleur('Orange') === 'oranges',          '8 · « Orange » → « oranges »');
  ok(pluralCouleur('') === '',                        '9 · vide → vide (pas de crash)');
}

console.log(`\n=== v1392 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
