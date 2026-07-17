/* ============================================================
   TESTS — v1375 : les deux bugs d'étiquettes (mise en boîte)
   ------------------------------------------------------------
   BUG#2 (critique) — « Étiquettes groupées » : au moment de générer le
   PDF, les quantités saisies étaient ignorées (copies forcé à 1, pièces
   retombant sur la quantité du lot). CAUSE : `lbGenerate` lisait des
   champs `#lbcopies_…` / `#lbpieces_…` qui n'existent dans AUCUN élément
   du DOM — les vraies saisies vivent dans le modèle `_lbLignes`. FIX :
   lire `_lbLignes`, la source de vérité (comme le fait le rangement).

   BUG#1 — « Étiquettes (boîtes) » depuis Stock par parfum : un toast de
   validation s'affichait mais le menu Imprimer/Enregistrer n'apparaissait
   jamais. CAUSE : `closeModal()` puis ré-ouverture — le `history.back()`
   de closeModal émettait un `popstate` différé qui refermait le modal de
   résultats. FIX : transiter le modal EN PLACE, sans le fermer d'abord.

   RÈGLE GRAVÉE (v1375) : l'écran et le générateur lisent le MÊME modèle
   (v1339/v1374 : lecteur et modèle ne divergent pas) ; et on ne
   ferme-puis-rouvre JAMAIS un modal à travers un saut async (v1363).
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1375 : les deux bugs d\'étiquettes (mise en boîte) ===\n');

const cleanApp = stripComments(APP);

// ---------------------------------------------------------------------------
// A. BUG#2 — COMPORTEMENTAL : lbGenerate lit le modèle, pas le DOM
// ---------------------------------------------------------------------------
// On assemble le VRAI `lbGenerate` avec le VRAI `lbTotalLigne` (jamais une copie), on lui injecte
// un `_lbLignes` réaliste ET UN DOM VIDE — si la fonction dépendait encore du DOM (l'ancien bug),
// elle produirait copies=1 / pièces=null pour tout. Elle doit au contraire refléter le modèle.
{
  const codeTotal = extractFunction('lbTotalLigne');
  const codeGen = extractFunction('lbGenerate');
  const src = codeTotal + '\nreturn (' +
    codeGen.replace(/^async function lbGenerate/, 'async function lbGenerate') + ');';
  const faireLbGenerate = (modele, capture) => new Function(
    '_lbLignes', 'document', 'toast', 'buildLabelsPDF', 'closeModal', src
  )(
    modele,
    { getElementById: () => null, querySelectorAll: () => [] },   // DOM VIDE : preuve d'indépendance
    (m) => capture.toasts.push(m),
    async (items) => { capture.items = items; },                  // corps synchrone : items posé à l'appel
    () => { capture.closed = true; }
  );

  // Cas nominal : deux lignes sur le même lot (3×20 + 1×12), une ligne « pièces vide » (auto),
  // et une ligne à zéro qui doit être IGNORÉE (v1358 : une boîte vide n'est pas une boîte).
  const modele = [
    { uid:1, prodId:7, copies:3, pieces:20,   equipKey:null },  // 3 boîtes de 20
    { uid:2, prodId:7, copies:1, pieces:12,   equipKey:null },  // + 1 boîte de 12 (même lot)
    { uid:3, prodId:9, copies:2, pieces:null, equipKey:null },  // pièces « auto » → imprime avec la qté du lot
    { uid:4, prodId:5, copies:0, pieces:20,   equipKey:null }   // 0 étiquette → rien à imprimer, IGNORÉE
  ];
  const cap = { items:null, closed:false, toasts:[] };
  faireLbGenerate(modele, cap)();   // corps synchrone jusqu'au await : items déjà capturés

  ok(Array.isArray(cap.items) && cap.items.length === 3,
     'A1 · une entrée PDF par ligne NON VIDE (la ligne à 0 pièce est écartée) — 3 sur 4');
  ok(cap.items && cap.items[0] && cap.items[0].prodId === 7 && cap.items[0].copies === 3 && cap.items[0].nbPieces === 20,
     'A2 · les 3 boîtes de 20 remontent telles quelles — copies et pièces/boîte viennent du MODÈLE, DOM vide ignoré');
  ok(cap.items && cap.items[1] && cap.items[1].prodId === 7 && cap.items[1].copies === 1 && cap.items[1].nbPieces === 12,
     'A3 · la 2ᵉ série du MÊME lot (1×12) est distincte — plusieurs boîtes/lot enfin honorées dans le PDF');
  ok(cap.items && cap.items[2] && cap.items[2].prodId === 9 && cap.items[2].nbPieces === null,
     'A4 · une ligne « pièces vide » donne nbPieces=null → buildLabelsPDF retombe sur la quantité du lot (comportement voulu)');
  ok(cap.items && !cap.items.some(it => it.prodId === 5),
     'A5 · aucune entrée pour la ligne à total nul');
  ok(cap.closed === true,
     'A6 · le modal est fermé une fois le PDF lancé');

  // PREUVE DE NON-RÉGRESSION : l'ancien code aurait produit copies=1 / nbPieces=null pour tout,
  // indépendamment du modèle. Ici, aucune entrée n'a ce profil dégénéré alors que le DOM est vide.
  const profilAncienBug = cap.items && cap.items.every(it => it.copies === 1 && it.nbPieces === null);
  ok(!profilAncienBug,
     'A7 · PREUVE — avec un DOM vide, le résultat n\'est PAS le profil dégénéré de l\'ancien bug (copies=1/pièces=null partout)');

  // Rien de coché / tout à zéro : on prévient et on ne génère pas de PDF fantôme.
  const cap2 = { items:null, closed:false, toasts:[] };
  faireLbGenerate([{ uid:1, prodId:7, copies:0, pieces:0, equipKey:null }], cap2)();
  ok(cap2.items === null && cap2.toasts.some(t => /quantité|coche/i.test(t)),
     'A8 · aucune ligne exploitable → message clair, pas de PDF vide généré');
}

// ---------------------------------------------------------------------------
// B. BUG#2 — RÉINTRODUCTION : le motif des identifiants fantômes est banni
// ---------------------------------------------------------------------------
{
  const fantomes = (cleanApp.match(/lbcopies_|lbpieces_/g) || []).length;
  ok(fantomes === 0,
     'B1 · plus AUCUNE lecture de `#lbcopies_`/`#lbpieces_` dans le code exécutable — revenir à ces IDs fait échouer la garde' +
     (fantomes ? ` (trouvé ${fantomes})` : ''));
  ok(/const lignes = _lbLignes\.filter\(l => \(\+l\.copies \|\| 0\) > 0\)/.test(cleanApp),
     'B2 · lbGenerate lit `_lbLignes` et imprime dès copies > 0 (les lignes « pièces auto » sont honorées, pas perdues)');
}

// ---------------------------------------------------------------------------
// C. BUG#1 — le modal de résultats ne clignote plus
// ---------------------------------------------------------------------------
{
  const iVal = cleanApp.indexOf('async function _etiqValiderGo');
  const corpsVal = cleanApp.slice(iVal, cleanApp.indexOf('\n}', cleanApp.indexOf('_etiqResultats(res.boxes)', iVal)) );
  // Dans _etiqValiderGo, aucun closeModal() ne doit précéder un _etiqResultats des chemins SUCCÈS.
  const iResSimple = corpsVal.indexOf('_etiqResultats(res.boxes)');
  const avantResultats = corpsVal.slice(0, iResSimple);
  // Le seul closeModal() toléré est celui du chemin d'erreur `if(!res.ok){ closeModal();`.
  const closeErreur = /if\(!res\.ok\)\{ closeModal\(\);/.test(corpsVal);
  const closeApresRes = avantResultats.replace(/if\(!res\.ok\)\{ closeModal\(\);[^\n]*\n/, '');
  ok(!/closeModal\(\)/.test(closeApresRes),
     'C1 · aucun closeModal() ne précède l\'affichage des résultats (le succès ne referme plus le modal avant de le remplir)');
  ok(closeErreur,
     'C2 · le closeModal() ne subsiste QUE sur le chemin d\'erreur (rien à afficher → on ferme)');

  // _etiqResultats remplace le contenu en place quand un modal est déjà ouvert.
  const iRes = cleanApp.indexOf('async function _etiqResultats');
  const corpsRes = cleanApp.slice(iRes, cleanApp.indexOf('\n}\n', iRes));
  ok(/overlay && overlay\.classList\.contains\('show'\) && modal\)\{ modal\.innerHTML = html; \}/.test(corpsRes),
     'C3 · _etiqResultats REMPLACE le contenu du modal en place s\'il est déjà ouvert (pas de fermeture/ré-ouverture)');
  ok(/else openModal\(html\)/.test(corpsRes),
     'C4 · … et n\'ouvre un modal neuf que s\'il n\'y en a pas déjà un (appel direct hors formulaire)');
  // Les boutons d'impression par boîte restent présents dans l'écran de résultats.
  ok(/shareLabelPDF\(\$\{b\.id\}\)/.test(cleanApp) && /shareLabelImage\(\$\{b\.id\}\)/.test(cleanApp),
     'C5 · chaque boîte du résultat garde ses boutons 📄 PDF / 🖼 Image (chacun lit sa propre DLC)');
}

// ---------------------------------------------------------------------------
// D. INVARIANT DE FOND — un seul modèle de boîtes pour l'écran groupé
// ---------------------------------------------------------------------------
{
  // Le rangement ET la génération PDF doivent tous deux passer par `_lbLignes` : c'est la garantie
  // que « ce que Ben voit » = « ce qui est imprimé » = « ce qui est rangé ».
  ok(/async function lbExecuter/.test(cleanApp) && /_lbLignes\.filter\(l => lbTotalLigne\(l\) > 0/.test(cleanApp) &&
     /_lbLignes\.filter\(l => \(\+l\.copies \|\| 0\) > 0\)/.test(cleanApp),
     'D1 · rangement et génération lisent le MÊME modèle `_lbLignes` — chacun avec son critère (total rangeable vs étiquettes à imprimer)');
  // lbSetLigne reste le SEUL point d'écriture du modèle depuis les champs (pas de setState parallèle).
  ok(/function lbSetLigne\(uid, champ, valeur\)/.test(cleanApp) &&
     /onchange="lbSetLigne\(\$\{l\.uid\},'copies',this\.value\)"/.test(APP) &&
     /onchange="lbSetLigne\(\$\{l\.uid\},'pieces',this\.value\)"/.test(APP),
     'D2 · les champs copies/pièces écrivent dans `_lbLignes` via lbSetLigne — un seul chemin d\'écriture');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
