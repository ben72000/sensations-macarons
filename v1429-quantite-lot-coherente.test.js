/* ============================================================================
   TESTS — v1429 : 60 D'UN CÔTÉ, 120 DE L'AUTRE — UNE SEULE QUANTITÉ DÉSORMAIS
   ----------------------------------------------------------------------------
   Ben, capture à l'appui, sur le même lot de ganache chocolat au lait :
   « c'est un batch de 60 doses de ganache pour remplir 120 coques. Sur un écran
   il affiche 60 puis sur l'autre 120 ».

   CE QUI SE PASSAIT — et ce n'était pas une divergence de données : les DEUX
   chiffres étaient exacts. 60 = ce qu'il RESTE. 120 = ce qui a été PRODUIT.
   Mais les deux étaient libellés « pièces », sans rien pour les distinguer :
     • `prodLotLigne` (liste de l'écran Production) affichait la PRODUITE ;
     • `_ligneBatchEpure` (liste du stock par parfum) affichait la RESTANTE —
       tout en calculant la produite dans une variable jamais utilisée, vestige
       qui montre bien que la règle n'avait jamais été tranchée ;
     • la fiche du lot (`prodV2OpenPop`) affichait la PRODUITE, juste au-dessus
       des boutons Casse / Déplacer / Assembler, qui portent tous sur le RESTE.
   Deux nombres sous la même étiquette, c'est un seul mensonge.

   LA RÈGLE TRANCHÉE :
     • `prodQteAffichee` = ce qui a été produit — une trace de fabrication, elle
       ne bouge plus.
     • `prodQteStock`    = ce qui reste — ce sur quoi Ben peut agir.
     • Une liste de stock montre le stock. La fiche du lot montre les deux, mais
       chacun nommé.

   Propriétés verrouillées ici :
     1. `prodQteStock` renvoie le restant, et retombe sur la produite seulement
        quand `qteRestante` n'a jamais été renseignée (lots anciens).
     2. Un lot épuisé vaut 0 — jamais sa quantité de fabrication.
     3. Les trois listes passent par le même prédicat, et leurs totaux aussi.
     4. La fiche du lot nomme les deux chiffres et n'affiche la produite que si
        elle diffère.
     5. La variable morte de `_ligneBatchEpure` a disparu.
   ============================================================================ */
'use strict';
const { extractFunction, stripComments } = require('./_extract');

function buildModule(){
  const code = `
    ${extractFunction('prodQteAffichee')}
    ${extractFunction('prodQteStock')}
    return { prodQteAffichee, prodQteStock };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

function run(){
const M = buildModule();

// ── CAS 1 : LE LOT DE BEN — 120 produites, 60 restantes ────────────────────
{
  const ganache = { id:1, composant:'ganache', qteTheorique:120, qteReelle:120, qteProduite:120, qteRestante:60 };
  eq(M.prodQteAffichee(ganache), 120, 'CAS1 · la quantité produite reste 120');
  eq(M.prodQteStock(ganache), 60,     'CAS1 · le stock est 60 — c\'est ce que montrent les listes');
  vrai(M.prodQteAffichee(ganache) !== M.prodQteStock(ganache),
     'CAS1 · les deux chiffres diffèrent : c\'est normal, et c\'est pour ça qu\'il faut les nommer');
}

// ── CAS 2 : un lot intact affiche la même chose des deux côtés ─────────────
{
  const neuf = { id:2, qteReelle:120, qteProduite:120, qteRestante:120 };
  eq(M.prodQteStock(neuf), 120,     'CAS2 · rien de consommé → stock = produite');
  eq(M.prodQteAffichee(neuf), 120,  'CAS2 · … aucun écart à expliquer');
}

// ── CAS 3 : un lot épuisé vaut ZÉRO, jamais sa quantité de fabrication ────
// C'est le cœur du danger : afficher 120 sur un lot vide, c'est promettre du
// stock qui n'existe pas — et le promettre juste à côté d'un bouton Assembler.
{
  const vide = { id:3, qteReelle:120, qteProduite:120, qteRestante:0 };
  eq(M.prodQteStock(vide), 0,       'CAS3 · stock épuisé → 0');
  eq(M.prodQteAffichee(vide), 120,  'CAS3 · … mais la trace de fabrication tient bon');
}

// ── CAS 4 : repli sur la produite UNIQUEMENT si qteRestante n'existe pas ──
// Sans ce repli, les lots d'avant le suivi de stock s'afficheraient à zéro et
// paraîtraient perdus. Avec un repli trop large, un lot vide paraîtrait plein.
{
  eq(M.prodQteStock({ id:4, qteReelle:80 }), 80,
     'CAS4 · qteRestante absente → on retombe sur la produite');
  eq(M.prodQteStock({ id:5, qteRestante:null, qteProduite:80 }), 80,
     'CAS4 · null compte comme absente (lot ancien)');
  eq(M.prodQteStock({ id:6, qteRestante:0, qteProduite:80 }), 0,
     'CAS4 · zéro est une VALEUR, pas une absence — le repli ne s\'applique pas');
  eq(M.prodQteStock({ id:7, qteTheorique:50 }), 50,
     'CAS4 · dernier repli : la quantité théorique');
}

// ── CAS 5 : entrées dégradées — aucune exception, aucun chiffre inventé ───
{
  eq(M.prodQteStock(null), 0,       'CAS5 · lot absent → 0');
  eq(M.prodQteStock(undefined), 0,  'CAS5 · undefined → 0');
  eq(M.prodQteStock({}), 0,         'CAS5 · lot vide → 0');
  eq(M.prodQteStock({ qteRestante:'60' }), 60, 'CAS5 · une chaîne numérique est convertie');
  eq(M.prodQteStock({ qteRestante:'abc' }), 0, 'CAS5 · une chaîne invalide ne devient pas NaN');
}

// ── CAS 6 : les décimales d'une garniture survivent ──────────────────────
// Une ganache peut rester à 12,5 doses : arrondir ici fabriquerait de l'écart
// de stock à chaque affichage.
{
  eq(M.prodQteStock({ qteRestante:12.5 }), 12.5, 'CAS6 · 12,5 doses restent 12,5');
}

// ── CAS 7 : la liste de l'écran Production montre le stock ────────────────
{
  const src = stripComments(extractFunction('prodLotLigne'));
  vrai(/const qte = prodQteStock\(p\)/.test(src), 'CAS7 · prodLotLigne passe par le prédicat de stock');
  eq(/prodQteAffichee/.test(src), false,          'CAS7 · … et n\'affiche plus la produite');
  vrai(/\$\{qty\(qte\)\}<small>pièces<\/small>/.test(src), 'CAS7 · c\'est bien ce chiffre qui est rendu');
}

// ── CAS 8 : le total d'un parfum est la somme de ses lignes ───────────────
// Un total qui ne fait pas la somme de ce qu'on lit au-dessus est pire qu'une
// absence de total : il donne l'illusion d'un contrôle.
{
  const src = stripComments(extractFunction('prodGroupeParParfum'));
  vrai(/reduce\(\(s,p\)=>s\+prodQteStock\(p\),0\)/.test(src), 'CAS8 · le total somme les stocks');
  eq(/prodQteAffichee/.test(src), false, 'CAS8 · … et non les quantités produites');
}

// ── CAS 9 : la liste du stock par parfum, et la variable morte disparue ──
{
  const src = stripComments(extractFunction('stockParfumDetail'));
  vrai(/const q = \(typeof prodQteStock==='function'\) \? prodQteStock\(p\)/.test(src),
     'CAS9 · _ligneBatchEpure passe par le même prédicat');
  vrai(/\$\{qty\(q\)\}<small>pièces<\/small>/.test(src),
     'CAS9 · … et affiche RÉELLEMENT cette variable (elle était calculée puis ignorée)');
  eq(/qty\(p\.qteRestante\)<small>pièces<\/small>/.test(src), false,
     'CAS9 · plus de lecture directe du champ à côté d\'un calcul inutilisé');
}

// ── CAS 10 : la fiche du lot nomme ses deux chiffres ─────────────────────
{
  const src = stripComments(extractFunction('prodV2OpenPop'));
  vrai(/const qte = prodQteStock\(p\)/.test(src),      'CAS10 · le stock est le chiffre principal');
  vrai(/const qteProd = prodQteAffichee\(p\)/.test(src),'CAS10 · la produite est calculée à part');
  vrai(/en stock/.test(src),                            'CAS10 · le premier chiffre est nommé « en stock »');
  vrai(/produites/.test(src),                           'CAS10 · le second « produites »');
  vrai(/\(qteProd>qte\)\?/.test(src),
     'CAS10 · la produite n\'apparaît que si elle diffère — sinon c\'est du bruit');
}

// ── CAS 11 : le stock est annoncé AVANT les actions qui le consomment ───
// Casse, Déplacer, Assembler portent sur le reste : lire 120 juste au-dessus
// d'eux invitait à agir sur une quantité qui n'existait plus.
{
  const src = stripComments(extractFunction('prodV2OpenPop'));
  const iEntete = src.indexOf('en stock');
  const iActions = src.indexOf('RACCOURCIS');
  vrai(iEntete > -1, 'CAS11 · l\'en-tête existe');
  vrai(iActions === -1 || iEntete < iActions,
     'CAS11 · … et vient avant les raccourcis d\'action');
}

// ── CAS 12 : prodQteAffichee n'a pas changé de sens ──────────────────────
// Contre-épreuve : si on avait « corrigé » prodQteAffichee au lieu d'ajouter un
// second prédicat, on aurait cassé toutes les traces de fabrication de l'app
// (étiquettes, écarts de production, historique).
{
  const src = stripComments(extractFunction('prodQteAffichee'));
  vrai(/qteReelle/.test(src) && /qteProduite/.test(src) && /qteTheorique/.test(src),
     'CAS12 · elle lit toujours réelle → produite → théorique');
  eq(/qteRestante/.test(src), false, 'CAS12 · … et ne connaît toujours pas le restant');
}

// ── résultat ──
console.log('\n=== TESTS — v1429 : une seule quantité affichée par lot ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
