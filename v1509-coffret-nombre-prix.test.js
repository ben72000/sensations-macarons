'use strict';
// v1509 — COFFRET : NOMBRE DE MACARONS + PRIX LIBRE, LA CASE « ANCIENS TARIFS » DISPARAÎT.
// Ben : « dans les devis / factures et les commandes, au lieu d'une case ancien/nouveau prix et de devoir
// jongler sans arrêt, d'un côté un menu avec le NOMBRE de macarons du coffret, en face le PRIX. Pour tel
// client 4 macarons à 8 €, pour le suivant 4 macarons à 10 €. Ou 3 macarons à 8 €. »
// RÉPONSES DE BEN (questions posées avant de coder, il s'agit d'argent) :
//   · la case « anciens tarifs » disparaît PARTOUT          → élément conservé mais CACHÉ (voir H)
//   · prix en SAISIE LIBRE à chaque fois                    → champ numérique + raccourcis grille
//   · aucun supplément parfum sur 3, 4… macarons            → `prixLibre` + helper unique (voir A)
//
// CE QUI NE DOIT JAMAIS BOUGER (garde de l'historique) :
//   · une ligne DÉJÀ ENREGISTRÉE n'a pas `prixLibre` → son calcul reste celui d'avant, au centime (voir I)
//   · une commande déjà enregistrée AVANT la grille (ni marqueur ni tarifRef) ou marquée « anciens tarifs »
//     garde le verrou historique : la rouvrir puis l'enregistrer ne la retarife pas, même sans case (voir H)
//   · le prix d'une ligne rouverte est celui SCELLÉ à l'enregistrement, plus jamais recalculé (voir B)
//
// LEÇONS APPLIQUÉES : calcul juste ≠ écran juste (le champ affiche coffretUnitPrice, le prix réellement
// appliqué) · un aller simple ne prouve pas un aller-retour (D) · garde par PATTERN sur le supplément (F) ·
// chaque garde est prouvée par réintroduction du défaut (voir COUVERTURE.md).
const { stripComments, APP } = require('./_extract');

let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// Découpe d'une fonction de premier niveau : du repère jusqu'à la première « } » en colonne 0.
function fn(marker){
  const i = APP.indexOf(marker); if(i < 0) return '';
  const j = APP.indexOf('\n}\n', i);
  return APP.slice(i, j < 0 ? i + 4000 : j + 3);
}
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
const LIMITES = { 6: 3, 8: 4, 10: 4, 16: 4, 25: 5 };

// ---------- A. Le supplément parfum : un seul endroit, format libre = prix final ----------
const srcSupp = fn('function coffretSupplementParfums(');
check('A. helper coffretSupplementParfums retrouvé', srcSupp.length > 80);
const supp = new Function('BOX_FLAVOR_LIMIT','FLAVOR_SURCHARGE','money2', srcSupp + '\nreturn coffretSupplementParfums;')(LIMITES, 3, money2);
check('A. 4 macarons, format libre, 4 parfums différents → AUCUN supplément', supp({ taille: 4, prixLibre: true }, 4) === 0);
check('A. 3 macarons, format libre, 3 parfums → aucun supplément', supp({ taille: 3, prixLibre: true }, 3) === 0);
check('A. 12 macarons, format libre, 6 parfums → aucun supplément', supp({ taille: 12, prixLibre: true }, 6) === 0);
check('A. format STANDARD 6 inchangé : 5 parfums → +6 €', supp({ taille: 6, prixLibre: true }, 5) === 6);
check('A. format STANDARD 8 : 4 parfums inclus → 0', supp({ taille: 8 }, 4) === 0);
check('A. format STANDARD 25 : 7 parfums → +6 €', supp({ taille: 25 }, 7) === 6);
check('A. LIGNE HISTORIQUE de format hors standard (sans prixLibre) : comportement d\'origine conservé (5 parfums → +15 €)', supp({ taille: 12 }, 5) === 15);

// ---------- B. Le prix de la ligne passe avant la grille ----------
const srcPU = fn('function coffretUnitPrice(');
check('B. coffretUnitPrice retrouvé', srcPU.length > 200);
function buildPU(grille, catalogue){
  return new Function('tarifsSaisie','money2','cmdProductsCache','BOX_PRICES', srcPU + '\nreturn coffretUnitPrice;')(
    () => ({ box: grille }), money2, catalogue || [], { 6: 12, 8: 16, 10: 22, 16: 28, 25: 42 });
}
{
  const pu = buildPU({ 6: 14, 8: 18, 10: 22, 16: 34, 25: 50 });
  check('B. 4 macarons à 8 € pour un client', pu({ taille: 4, prixUnitaireApplique: 8 }) === 8);
  check('B. 4 macarons à 10 € pour le client suivant (indépendant du précédent)', pu({ taille: 4, prixUnitaireApplique: 10 }) === 10);
  check('B. 3 macarons à 8 €', pu({ taille: 3, prixUnitaireApplique: 8 }) === 8);
  check('B. le prix saisi PRIME sur la grille (6 macarons à 10 € alors que la grille dit 14 €)', pu({ taille: 6, prixUnitaireApplique: 10 }) === 10);
  check('B. prix décimal conservé (4 à 8,50 €)', pu({ taille: 4, prixUnitaireApplique: 8.5 }) === 8.5);
  check('B. sans prix saisi, format standard → valeur PAR DÉFAUT de la grille (6 → 14 €)', pu({ taille: 6, prixUnitaireApplique: null }) === 14);
  check('B. sans prix saisi, format libre → 0 (jamais un prix inventé)', pu({ taille: 4, prixUnitaireApplique: null }) === 0);
  check('B. champ vide (chaîne vide) traité comme absent', pu({ taille: 6, prixUnitaireApplique: '' }) === 14);
  check('B. une ligne ROUVERTE garde son prix scellé même si la grille a changé (pas de retarification)',
    buildPU({ 6: 99 })({ taille: 6, prixUnitaireApplique: 12 }) === 12);
}

// ---------- C. Totaux de bout en bout : écran (lineTotalBase) ET enregistré (lineTotalStored) ----------
{
  const srcBase = fn('function lineTotalBase(ln){');
  const srcSto = fn('function lineTotalStored(ln){');
  check('C. lineTotalBase et lineTotalStored retrouvés', srcBase.length > 200 && srcSto.length > 200);
  const stubs = ['BOX_FLAVOR_LIMIT','FLAVOR_SURCHARGE','money2','tarifsSaisie','cmdProductsCache','BOX_PRICES','coffretSupplementParfums','coffretUnitPrice'];
  const supp2 = supp, pu = buildPU({ 6: 14, 8: 18 });
  const make = (src, name) => new Function(...stubs, 'eventUnitPrice','pyraTotalLigne','accessoireDecoTotal','bigPrice','vracPrixMacaron','sachetPrixPour','tarifsLigneSaisie','tarifsDeLigne','eventUnitPriceSaisie','addMoney','mulMoney','subMoney',
    src + '\nreturn ' + name + ';')(LIMITES, 3, money2, () => ({ box: { 6: 14, 8: 18 } }), [], { 6: 12 }, supp2, pu);
  const base = make(srcBase, 'lineTotalBase'), sto = make(srcSto, 'lineTotalStored');
  const parfumsObj = { a: 1, b: 1, c: 1, d: 1 };
  const parfumsArr = [{ nom: 'a', qte: 1 }, { nom: 'b', qte: 1 }, { nom: 'c', qte: 1 }, { nom: 'd', qte: 1 }];
  check('C. ÉCRAN : 4 macarons à 8 €, 4 parfums différents → 8 € pile', base({ type: 'coffret', taille: 4, prixUnitaireApplique: 8, prixLibre: true, parfums: parfumsObj }) === 8);
  check('C. ÉCRAN : 4 macarons à 10 € → 10 €', base({ type: 'coffret', taille: 4, prixUnitaireApplique: 10, prixLibre: true, parfums: parfumsObj }) === 10);
  check('C. ENREGISTRÉ : 4 macarons à 8 € → 8 € (même chiffre que l\'écran)', sto({ type: 'coffret', taille: 4, prixUnitaireApplique: 8, prixLibre: true, parfums: parfumsArr }) === 8);
  check('C. ENREGISTRÉ : 3 macarons à 8 € → 8 €', sto({ type: 'coffret', taille: 3, prixUnitaireApplique: 8, prixLibre: true, parfums: parfumsArr.slice(0, 3) }) === 8);
  check('C. écran = enregistré sur le même coffret', base({ type: 'coffret', taille: 4, prixUnitaireApplique: 9, prixLibre: true, parfums: parfumsObj }) === sto({ type: 'coffret', taille: 4, prixUnitaireApplique: 9, prixLibre: true, parfums: parfumsArr }));
  check('C. remise de ligne (10 %) s\'applique sur le prix saisi : 10 € → 9 €', (() => {
    const ln = { type: 'coffret', taille: 4, prixUnitaireApplique: 10, prixLibre: true, parfums: parfumsArr, remisePct: 10 };
    return sto(ln) === 9; })());
  // I. HISTORIQUE — oracle INDÉPENDANT : l'ancienne formule écrite à la main
  const ancien = (pu0, nb, taille) => money2(pu0 + Math.max(0, nb - (LIMITES[taille] || 0)) * 3);
  const lnHisto = { type: 'coffret', taille: 12, prixUnitaireApplique: 20, parfums: [1, 2, 3, 4, 5].map(n => ({ nom: 'p' + n, qte: 1 })) };
  check('I. HISTORIQUE : ligne enregistrée de 12 macarons (sans prixLibre, 5 parfums) = ancienne formule, au centime', sto(lnHisto) === ancien(20, 5, 12));
  const lnStd = { type: 'coffret', taille: 6, prixUnitaireApplique: 14, parfums: [1, 2, 3, 4].map(n => ({ nom: 'p' + n, qte: 1 })) };
  check('I. HISTORIQUE : coffret de 6 à 14 € avec 4 parfums = 17 € (supplément standard inchangé)', sto(lnStd) === 17 && sto(lnStd) === ancien(14, 4, 6));
  check('I. coffret de 6 par défaut, 3 parfums, grille 14 € → 14 € (écran)', base({ type: 'coffret', taille: 6, prixUnitaireApplique: null, parfums: { a: 1, b: 1, c: 1 } }) === 14);
}

// ---------- D. ALLER-RETOUR édition ↔ enregistré (leçon v1488) ----------
{
  const srcEdit = fn('function _lineToEdit(ln){');
  const srcObj = fn('function _parfumsToObj(p){');
  check('D. _lineToEdit et _parfumsToObj retrouvés', srcEdit.length > 300 && srcObj.length > 100);
  const toEdit = new Function(srcObj + '\n' + srcEdit + '\nreturn _lineToEdit;')();
  const e1 = toEdit({ type: 'coffret', taille: 4, prixUnitaireApplique: 8, prixLibre: true, parfums: [{ nom: 'a', qte: 2 }] });
  check('D. rouvrir une ligne : le PRIX SAISI est repris (8 €)', e1.prixUnitaireApplique === 8);
  check('D. rouvrir une ligne : le drapeau prixLibre est repris', e1.prixLibre === true);
  check('D. rouvrir une ligne : le nombre de macarons est repris', e1.taille === 4);
  const e2 = toEdit({ type: 'coffret', taille: 6, prixUnitaireApplique: 12, parfums: [] });
  check('D. ligne HISTORIQUE rouverte : prix scellé conservé, prixLibre faux (rien n\'est inventé)', e2.prixUnitaireApplique === 12 && e2.prixLibre === false);
  check('D. le constructeur de ligne enregistrée écrit prixLibre', /prixUnitaireApplique: coffretUnitPrice\(ln\), prixLibre: \(ln\.prixLibre===true\)\|\|undefined/.test(APP));
}

// ---------- E. L'écran : deux champs, plus de case visible ----------
{
  const ecr = fn('function drawCoffretLine(ln,i){');
  check('E. drawCoffretLine retrouvée', ecr.length > 1500);
  check('E. menu « Nombre de macarons » branché sur setCoffretTaille', /Nombre de macarons<\/label><select onchange="setCoffretTaille\(\$\{i\},this\.value\)"/.test(ecr));
  check('E. champ « Prix du coffret » branché sur setCoffretPrix', /Prix du coffret \(€\)<\/label><input[\s\S]*?onchange="setCoffretPrix\(\$\{i\},this\.value\)"/.test(ecr));
  check('E. le champ prix affiche coffretUnitPrice (le prix RÉELLEMENT appliqué, leçon v1467)', /const _pu = coffretUnitPrice\(ln\)/.test(ecr) && /value="\$\{_pu>0\?_pu:''\}"/.test(ecr));
  check('E. plus de menu « Taille » alimenté par le catalogue', !/boxOpts/.test(ecr) && !/<label>Taille<\/label>/.test(ecr));
  check('E. le menu propose 1 à 50 macarons (3 et 4 inclus)', /for\(let n=1;n<=50;n\+\+\)/.test(ecr));
  check('E. raccourcis « grille actuelle » / « ancienne grille » (un geste, plus de case)', /grille actuelle/.test(ecr) && /ancienne grille/.test(ecr));
  check('E. alerte visible quand le prix manque', /Saisis le prix de ce coffret/.test(ecr));
  check('E. sous-titre honnête pour un format libre (« prix final — sans supplément parfum »)', /prix final — sans supplément parfum/.test(ecr));
  check('E. la case « Appliquer les anciens tarifs » n\'existe plus nulle part à l\'écran', !/Appliquer les <b>anciens tarifs<\/b>/.test(APP));
  check('E. l\'élément f_ancienTarif reste, CACHÉ (porteur du verrou historique)', /<input type="checkbox" id="f_ancienTarif" hidden /.test(APP));
  check('E. plus aucun libellé visible attaché à la case', !/f_ancienTarif" \$\{o\.ancienTarif\?'checked':''\} onchange/.test(APP));
  // setCoffretPrix : comportement réel
  const sp = fn('function setCoffretPrix(i, v){');
  check('E. setCoffretPrix retrouvée', sp.length > 150);
  function lancer(v){
    const cmdLines = [{ type: 'coffret', taille: 4, prixUnitaireApplique: null }]; let redraw = 0;
    new Function('cmdLines','money2','drawLines', sp + '\nsetCoffretPrix(0, ' + JSON.stringify(v) + ');')(cmdLines, money2, () => { redraw++; });
    return { ln: cmdLines[0], redraw };
  }
  { const r = lancer('8,5'); check('E. « 8,5 » (virgule) → 8,50 € et format libre', r.ln.prixUnitaireApplique === 8.5 && r.ln.prixLibre === true && r.redraw === 1); }
  { const r = lancer('10'); check('E. « 10 » → 10 €', r.ln.prixUnitaireApplique === 10); }
  { const r = lancer(''); check('E. champ vidé → retour au prix par défaut (null)', r.ln.prixUnitaireApplique === null); }
  { const r = lancer('abc'); check('E. texte invalide → null, rien d\'inventé', r.ln.prixUnitaireApplique === null); }
  { const r = lancer('-3'); check('E. prix négatif refusé', r.ln.prixUnitaireApplique === null); }
  const st = fn('function setCoffretTaille(i,v){');
  check('E. changer le nombre remet le prix à choisir ET marque le format libre', /prixUnitaireApplique=null;/.test(st) && /prixLibre=true;/.test(st));
}

// ---------- F. GARDE PAR PATTERN : le supplément n'est calculé qu'à UN endroit ----------
{
  const src = stripComments(APP);
  // La formule d'origine n'a le droit de subsister QUE comme repli de bac à sable (suites de test qui extraient
  // lineTotalStored/lineTotalBase sans le helper) : sur une ligne qui teste d'abord `typeof coffretSupplementParfums`.
  const lignesFormule = src.split('\n').filter(l => /nbDiff-\(BOX_FLAVOR_LIMIT\[ln\.taille\]\|\|0\)\)\*FLAVOR_SURCHARGE/.test(l) || /Math\.max\(0,\s*nbDiff-limit\)\s*\*\s*FLAVOR_SURCHARGE/.test(l));
  check('F. la formule « (nbDiff−limite) × supplément » n\'existe plus qu\'en repli de test, derrière typeof coffretSupplementParfums (' + lignesFormule.length + ' repli)',
    lignesFormule.length === 2 && lignesFormule.every(l => /typeof coffretSupplementParfums/.test(l)));
  const nbAppels = (src.match(/coffretSupplementParfums\(/g) || []).length;
  check('F. le helper est appelé par les 4 sites (vue détail, enregistré, écran, ligne en saisie) + sa définition : ' + nbAppels, nbAppels >= 5);
  check('F. lineTotalBase passe par le helper (repli de test mis à part)', /const _sup = \(typeof coffretSupplementParfums==='function'\) \? coffretSupplementParfums\(ln, nbDiff\)/.test(src));
}

// ---------- G. Enregistrement : un coffret sans prix est refusé ----------
{
  const i = APP.indexOf('async function saveCmd(');
  const sv = APP.slice(i, i + 9000);
  const iTaille = sv.indexOf("!ln.taille){ toast('Coffret : choisis le nombre de macarons')");
  const iPrix = sv.indexOf("!(coffretUnitPrice(ln)>0)");
  check('G. saveCmd refuse un coffret sans prix', iTaille > 0 && iPrix > iTaille);
  check('G. message explicite avec le nombre de macarons', /Coffret de \$\{ln\.taille\} macarons : indique son prix/.test(sv));
}

// ---------- H. Verrou historique : commande déjà enregistrée = anciens tarifs conservés ----------
{
  const m = APP.match(/<input type="checkbox" id="f_ancienTarif" hidden \$\{(\([^}]*\))\?'checked':''\}>/);
  check('H. expression du verrou retrouvée dans le formulaire', !!m);
  const verrou = m ? new Function('o', 'return !!' + m[1] + ';') : () => null;
  check('H. NOUVELLE commande → décochée (nouvelle grille)', verrou({}) === false);
  check('H. commande ENREGISTRÉE avant la grille (id, ni marqueur ni tarifRef) → verrou ACTIF (anciens tarifs gardés)', verrou({ id: 7 }) === true);
  check('H. commande enregistrée AVEC tarifRef, sans « anciens tarifs » → décochée', verrou({ id: 7, tarifRef: '2026-09-02' }) === false);
  check('H. commande marquée « anciens tarifs » → verrou actif', verrou({ id: 7, tarifRef: '2026-08-01', ancienTarif: true }) === true);
  check('H. devis (pas d\'id) avec tarifRef → décoché', verrou({ tarifRef: '2026-09-02' }) === false);
  check('H. devis marqué « anciens tarifs » → verrou actif', verrou({ ancienTarif: true }) === true);
  const band = fn('function cmdTarifBandeau(){');
  check('H. le bandeau « tarifs en vigueur » n\'est plus affiché', !/tarifs en vigueur<\/p>/.test(band));
  check('H. le bandeau n\'apparaît que pour une commande historique', /z\.innerHTML = coche\n    \? `[\s\S]*?`\n    : '';/.test(band));
  check('H. tarifsSaisie lit toujours l\'élément (verrou → grille historique, sinon grille courante)', /document\.getElementById\('f_ancienTarif'\)/.test(fn('function tarifsSaisie(){')));
}

// ---------- J. Version ----------
check('J. APP_VERSION v1509', /const APP_VERSION = 'v1509';/.test(APP));

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}, 100);
