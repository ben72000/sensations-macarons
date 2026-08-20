'use strict';
// v1479 — « POURQUOI CES DONNÉES NE SE RECOUPENT PAS ? ». Ben, capture à l'appui :
//   · « CA total depuis le début » : 12 673,89 € — dont 12 036,14 € au fil de l'app
//     et 637,75 € en reprises d'historique
//   · graphique « Chiffre d'affaires », onglet Année : 2025 = 1 732 · 2026 = 8 594,
//     « 10 325,59 € sur les 2 dernières »
//
// LES DEUX CHIFFRES ÉTAIENT JUSTES. Ils ne mesurent simplement pas la même chose :
//   · l'en-tête additionne le montant FACTURÉ des commandes (`o.montant`), encaissé ou non ;
//   · le graphique additionne les ENCAISSEMENTS réels (`paiementsDe`).
// L'écart de 1 710,55 € = ce qui est facturé mais pas encore encaissé.
//
// 🚨 LE VRAI DÉFAUT ÉTAIT DONC D'AFFICHAGE : deux totaux côte à côte, sans mention de leur base,
// invitent à les comparer — et à conclure à une erreur de l'app. Corriger un calcul juste n'aurait
// rien donné ; il fallait NOMMER chaque base et montrer l'écart avec son explication.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
const eq = (a,b) => Math.abs(a-b) < 0.011;

// ---- A. L'arithmétique de Ben, reproduite ----
{
  const global = 12673.89, fil = 12036.14, reprises = 637.75, encaisse = 10325.59;
  check('A. activité globale = fil de l\'eau + reprises', eq(fil + reprises, global));
  check('A. l\'écart facturé/encaissé vaut 1 710,55 €', eq(fil - encaisse, 1710.55));
  check('A. l\'écart se compare au FIL DE L\'EAU, pas au total (sinon on y mêlerait les reprises)',
    !eq(global - encaisse, 1710.55));
}

// ---- B. Les deux bases sont bien DIFFÉRENTES par construction ----
{
  const srcFil = APP.slice(APP.indexOf('const _caFilEau'), APP.indexOf('const _caFilEau') + 260);
  check('B. l\'en-tête somme le MONTANT des commandes', /\+c\.montant\|\|0/.test(srcFil));
  check('B. …et non les paiements', !/paiementsDe/.test(srcFil));
  const srcGraph = extractFunction('_caLignesToutes');
  check('B. le graphique somme les PAIEMENTS', /paiementsDe\(o\)/.test(srcGraph));
  check('B. …et non le montant des commandes', !/o\.montant/.test(srcGraph));
}

// ---- C. Le total encaissé vient de LA MÊME SOURCE que le graphique ----
// Une seconde addition maison pourrait diverger du graphique et recréer le problème corrigé.
{
  const i = APP.indexOf('let _caEncaisseTotal = 0');
  const src = APP.slice(i, i + 900);
  check('C. il réutilise _caLignesToutes (source unique)', /_caLignesToutes\(\)/.test(src));
  check('C. il réutilise le cache quand il existe', /_caLignesCache \|\| await/.test(src));
  check('C. l\'écart est calculé sur le fil de l\'eau seul', /_caFilEau - _caEncaisseTotal/.test(src));
  check('C. l\'écart ne peut pas être négatif', /Math\.max\(0,/.test(src));
  check('C. un échec de lecture ne casse pas l\'accueil', /swallow\(e,'caEncaisseTotal'\)/.test(src));
}

// ---- D. CHAQUE BASE EST NOMMÉE À L'ÉCRAN (le vrai correctif) ----
{
  check('D. l\'en-tête annonce « facturé »', /CA total depuis le début — <b>facturé<\/b>/.test(APP));
  check('D. il précise « montant des commandes »', /activité globale cumulée \(montant des commandes\)/.test(APP));
  check('D. le graphique annonce « encaissé »', /Chiffre d'affaires <span[^>]*>encaissé<\/span>/.test(APP));
}

// ---- E. L'ÉCART EST EXPLIQUÉ, pas laissé à calculer ----
{
  const i = APP.indexOf('_caEcartFactEnc>0.01');
  const src = APP.slice(i - 100, i + 700);
  check('E. l\'écart n\'est affiché QUE s\'il existe', /_caEcartFactEnc>0\.01/.test(src));
  check('E. le montant encaissé est rappelé', /_caEncaisseTotal/.test(src));
  check('E. l\'écart est nommé « pas encore encaissé »', /pas encore encaissé/.test(src));
  check('E. un lien mène au détail des commandes concernées', /auditCaManquantUI\(\)/.test(src));
  check('E. rien n\'est affiché en mode confidentialité', /!privacyModeEnabled\(\)/.test(src));
}

// ---- F. NON-RÉGRESSION : les reprises d'historique restent hors du CA encaissé ----
{
  const srcGraph = extractFunction('_caLignesToutes');
  check('F. le graphique exclut toujours les reprises', /filter\(o=>!estReprise\(o\)\)/.test(srcGraph));
  const srcRep = APP.slice(APP.indexOf('const _caReprises'), APP.indexOf('const _caReprises') + 200);
  check('F. les reprises restent comptées à part dans l\'en-tête', /estReprise\(o\)/.test(srcRep));
  check('F. …et signalées hors URSSAF', /hors URSSAF, déjà déclaré/.test(APP));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
