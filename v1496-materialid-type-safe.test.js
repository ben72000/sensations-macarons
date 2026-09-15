'use strict';
// v1496/v1497 — DEUX SUJETS DANS CETTE LIVRAISON.
//
// ① v1496 — STOCK INVISIBLE AU LANCEMENT D'UNE RECETTE MALGRÉ UNE FICHE CORRECTE.
// Ben, chiffres réels à l'appui (crème fraîche) : deux lots, 152,57 g + 1 140 g, soit 1 292,57 g
// bien affichés sur la fiche matière (capture) — mais lancer une recette demandant plus de 153 g
// annonçait « stock insuffisant ». Un seul bloc « Crème fraiche » dans la liste, orthographe
// identique : pas un doublon de référence.
// CAUSE : contrat gravé de dexie_min — `where(x).equals(v)` compare en `===` STRICT, sans aucune
// coercition (même limite que la correction v1480 sur les événements calendrier). Un lot dont le
// `materialId` a été écrit en CHAÎNE devient donc INVISIBLE à `.where('materialId').equals(+id)`,
// silencieusement. L'affichage de la fiche, lui, somme en JS sans se soucier du type : d'où un
// total juste à l'écran ET un « stock insuffisant » au lancement, sur les mêmes données.
// Explique aussi les deux symptômes secondaires signalés : deux lots « entamés » en parallèle
// (chacun vu par un chemin différent) et un FIFO qui semble ne pas s'appliquer.
// FIX : helpers `lotsDeMatiere` / `recipeItemsDeMatiere` qui relisent la table et comparent en
// `+a === +b`. Substitués aux 19 requêtes strictes sur materialId.
//
// ② v1497 — Ajout du grand format « Pistache framboise », demandé disponible EN COMMANDE avant
// que sa recette n'existe (BOM à venir).
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Le helper retrouve un lot quel que soit le type du materialId ----
{
  const round3 = n => { const v=+n; return isFinite(v) ? Math.round(v*1000)/1000 : 0; };
  const M = new Function('round3', 'db', `
    ${extractFunction('lotsDeMatiere')}
    return lotsDeMatiere;
  `);

  // Les DEUX lots de crème fraîche de Ben, dont un écrit en chaîne — le cas réel.
  const lots = [
    {id:1, materialId:7,   qteRestante:152.57, dlc:'2026-08-26', dateReception:'2026-08-09'},
    {id:2, materialId:'7', qteRestante:1140,   dlc:'2026-08-26', dateReception:'2026-08-08'},
    {id:3, materialId:9,   qteRestante:500,    dlc:'2026-09-30', dateReception:'2026-09-01'},
    {id:4, materialId:7,   qteRestante:0,      dlc:'2026-07-01', dateReception:'2026-06-01'}, // épuisé
  ];
  const db = { materialLots: { toArray: async () => lots } };
  const lotsDeMatiere = M(round3, db);

  return (async () => {
    const actifs = await lotsDeMatiere(7);
    const total = actifs.reduce((s,l)=>s+(+l.qteRestante||0),0);

    check('A. [LE DÉFAUT CORRIGÉ] les DEUX lots de crème fraîche sont retrouvés, y compris celui écrit en chaîne',
      actifs.length === 2);
    check('A. le total vu par le lancement de recette vaut bien 1 292,57 g (comme la fiche matière)',
      round3(total) === 1292.57);
    check('A. une recette demandant 153 g passe désormais (c\'était le blocage de Ben)',
      total >= 153);
    check('A. les lots épuisés (qteRestante = 0) restent exclus par défaut',
      !actifs.some(l=>l.id===4));
    check('A. les lots d\'une AUTRE matière ne sont jamais aspirés au passage',
      !actifs.some(l=>l.id===3));

    const tous = await lotsDeMatiere(7, {actifs:false});
    check('A. l\'option {actifs:false} rend aussi les lots épuisés (recrédit, inventaire, suppression)',
      tous.length === 3);

    // Sensibilité : la requête stricte d'origine, rejouée sur ces mêmes lots, en manque un.
    const strict = lots.filter(l => l.materialId === +7 && +l.qteRestante > 0);
    check('A. [SENSIBILITÉ] l\'ancienne comparaison stricte ne voyait qu\'un seul des deux lots',
      strict.length === 1 && round3(strict.reduce((s,l)=>s+(+l.qteRestante||0),0)) === 152.57);

    // ---- B. Plus aucune requête stricte sur materialId ne subsiste ----
    check('B. aucune requête stricte restante sur materialLots.materialId',
      !/materialLots\.where\('materialId'\)\.equals\(/.test(APP));
    check('B. aucune requête stricte restante sur recipeItems.materialId',
      !/recipeItems\.where\('materialId'\)\.equals\(/.test(APP));

    const srcProd = extractFunction('enregistrerProduction');
    check('B. la vérification de stock au lancement d\'une recette passe par le helper',
      /lotsDeMatiere\(item\.materialId\)/.test(srcProd));
    check('B. le FIFO reste appliqué après le correctif (tri inchangé)',
      /lotFifoCompare/.test(srcProd));

    // ---- C. Le diagnostic annoncé par le bouton existe bien (bouton sans fonction = plantage) ----
    check('C. le bouton 🔎 Diagnostic de l\'écran Matières a sa fonction',
      /onclick="diagnosticReferencesMatieres\(\)"/.test(APP)
      && /async function diagnosticReferencesMatieres\(\)/.test(APP));
    // ⚠️ `extractFunction` compte les accolades sans comprendre les template literals : sur une
    // fonction qui en contient (comme celle-ci, pleine de HTML `${…}`), il déborde largement et
    // ramènerait le code de fonctions voisines — l'assertion testerait alors autre chose. On
    // borne donc à la main, jusqu'à la déclaration suivante.
    const iDiag = APP.indexOf('async function diagnosticReferencesMatieres()');
    const iFin  = APP.indexOf('\nasync function ', iDiag + 10);
    const srcDiag = APP.slice(iDiag, iFin > 0 ? iFin : undefined);
    check('C. l\'extraction est bien bornée à la fonction (garde-fou du test lui-même)',
      srcDiag.length > 500 && srcDiag.length < 6000);
    check('C. il est purement informatif : aucune écriture en base',
      !/\.(update|put|add|delete|bulkAdd|bulkPut|bulkDelete)\(/.test(srcDiag));
    check('C. il signale aussi les lots orphelins (materialId sans fiche matière)',
      /idsConnus/.test(srcDiag));

    // ---- D. v1497 — le grand format Pistache framboise est commandable ----
    const iBig = APP.indexOf('const BIG_FORMATS = [');
    const srcBig = APP.slice(iBig, APP.indexOf('\n', iBig));
    check('D. « Pistache framboise » figure dans BIG_FORMATS (donc proposé dans la ligne Grand format)',
      /Pistache framboise/.test(srcBig));
    check('D. les grands formats existants sont préservés',
      ['Chocolat','Myrtille framboise','Mangue passion','Madeleine'].every(f=>srcBig.includes(f)));
    // Le diagnostic « grands formats » le signalera comme sans recette tant que le BOM n'existe
    // pas — c'est le comportement VOULU ici : Ben veut le commander avant de créer la recette.
    check('D. la grille de commande itère sur BIG_FORMATS (rien d\'autre à câbler pour le rendre commandable)',
      /const bigRows = BIG_FORMATS\.map/.test(APP));

    console.log(`\n${pass} passed, ${fail} failed`);
    if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
  })();
}
