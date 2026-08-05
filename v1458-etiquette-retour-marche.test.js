'use strict';
// v1458 — ÉTIQUETTE SPÉCIALE RETOUR MARCHÉ. Ben : « l'app me propose d'editer une étiquette
// spéciale retour marché ».
//
// 🚨 DÉFAUT TROUVÉ EN OUVRANT LES ÉTIQUETTES, plus important que la demande elle-même : la
// QUANTITÉ n'était pas imprimée du tout par `renderLabelHTML`. Elle était bien calculée
// (`nbPieces`) et bien dessinée par le moteur canvas/PDF, mais ce rendu-là l'omettait. L'étiquette
// « recyclable » décidée en v1454 — Ben corrige la quantité au stylo à chaque prélèvement — n'avait
// donc RIEN à corriger sur ce chemin. Le correctif v1454 (imprimer le RESTANT plutôt que le
// PRODUIT) était nécessaire mais insuffisant : il changeait quelle quantité est calculée, pas le
// fait qu'elle n'était jamais affichée.
//
// DEUX MOTEURS D'ÉTIQUETTE coexistent (canvas/PDF pour Labelife, HTML pour la feuille d'impression).
// La marque « RETOUR MARCHÉ » doit apparaître sur LES DEUX, sinon elle dépendrait du chemin choisi.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. La donnée d'étiquette porte le marqueur ----
{
  const src = extractFunction('buildLabelData');
  check('A. buildLabelData expose retourMarche', /retourMarche:\s*!!p\.retourMarche/.test(src));
  check('A. la quantité imprimée reste le RESTANT (non-régression v1454)', /prodQteStock\(p\)/.test(src));
  check('A. le QR reste bâti sur le numéro de lot (étiquette recyclable)', /traceUrl\(p\.lotProduction/.test(src));
}

// ---- B. Rendu HTML : quantité ET bandeau retour ----
{
  const src = extractFunction('renderLabelHTML');
  const M = new Function('esc','qty', `${src}\nreturn renderLabelHTML;`)(s=>String(s), n=>String(n));

  const normal = M({ produit:'Pistache', lot:'050826PIS-F', dlc:'12/08/26', fab:'05/08/26 10:00',
    nbPieces:24, empLettre:'F', qr:'data:,' });
  check('B. la QUANTITÉ est imprimée (elle ne l\'était pas du tout avant)', /24 pièces/.test(normal));
  check('B. le lot est imprimé', /050826PIS-F/.test(normal));
  check('B. la DLC est imprimée', /12\/08\/26/.test(normal));
  check('B. pas de bandeau retour sur un lot normal', !/RETOUR MARCHÉ/.test(normal));

  const retour = M({ produit:'Pistache', lot:'050826PISRM-F', dlc:'12/08/26', fab:'05/08/26 18:00',
    nbPieces:9, empLettre:'F', qr:'data:,', retourMarche:true });
  check('B. le bandeau RETOUR MARCHÉ apparaît sur une ligne de retour', /RETOUR MARCHÉ/.test(retour));
  check('B. le bandeau est placé AVANT le lot (première chose lue)',
    retour.indexOf('RETOUR MARCHÉ') < retour.indexOf('050826PISRM-F'));
  check('B. la quantité est imprimée aussi sur une étiquette retour', /9 pièces/.test(retour));

  // Quantité inconnue : pas de ligne « null pièces ».
  const sansQte = M({ produit:'X', lot:'L', dlc:'—', fab:'—', qr:'data:,' });
  check('B. aucune ligne de quantité quand elle est inconnue', !/pièces/.test(sansQte));
}

// ---- C. Rendu canvas/PDF : le même bandeau, au même endroit ----
{
  const i = APP.indexOf("ctx.fillText(titre, tx, y);");
  const src = APP.slice(i, i+700);
  check('C. le moteur canvas dessine aussi le bandeau RETOUR MARCHÉ', /d\.retourMarche.*RETOUR MARCHÉ/s.test(src));
  check('C. il est dessiné AVANT la ligne Lot (même ordre que le rendu HTML)',
    src.indexOf('RETOUR MARCHÉ') < src.indexOf("'Lot : '"));
  check('C. il est en gras (lisible sur une thermique monochrome)', /RETOUR MARCHÉ', 5, true/.test(src));
}

// ---- D. Le style d'impression du bandeau ----
{
  const i = APP.indexOf('.lab .rm {');
  check('D. le bandeau a son style dans la feuille d\'impression', i > 0);
  const css = APP.slice(i, i+220);
  check('D. il est en noir plein inversé (une trame ou une couleur disparaîtrait en thermique)',
    /background:#000/.test(css) && /color:#fff/.test(css));
}

// ---- E. La proposition d'étiquettes après un rangement de retour ----
{
  const srcExec = extractFunction('marketRetourExecuter');
  check('E. les lignes retour créées sont collectées', /rmIds\.push/.test(srcExec));
  check('E. l\'écran d\'étiquettes n\'est proposé QUE s\'il y en a', /if\(rmIds\.length\)/.test(srcExec));
  check('E. sinon on retourne au marché sans écran inutile', /marketDetail\(marketId\)/.test(srcExec));

  const srcForm = extractFunction('marketRetourEtiquettesForm');
  check('E. chaque boîte a son bouton d\'étiquette', /shareLabelImage\(\$\{p\.id\}\)/.test(srcForm));
  check('E. le moteur d\'impression existant est réutilisé (pas un second chemin)',
    !/QR\.render/.test(srcForm) && !/printLabelSheet/.test(srcForm));
  check('E. la quantité et l\'emplacement de chaque boîte sont rappelés',
    /qteRestante/.test(srcForm) && /empNom/.test(srcForm));
  check('E. une boîte SANS DLC est signalée en rouge', /DLC à renseigner/.test(srcForm));
  check('E. l\'app dit qu\'elle n\'invente pas de DLC', /n'en invente pas/.test(srcForm));
  check('E. rien à étiqueter → on ne bloque pas Ben sur un écran vide', /if\(!lignes\.length\)/.test(srcForm));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
