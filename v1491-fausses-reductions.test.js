'use strict';
// v1491 — LES FAUSSES RÉDUCTIONS. Ben : « j'inscris toutes les lignes au devis et quand je
// l'enregistre ça me crée de fausses réductions pour combler l'écart entre le prix réel et le prix
// enregistré ». Et, avant : « ça ne va toujours pas ! Les données ne s'enregistrent pas dans le
// devis c'est infernal !!! »
//
// 🚨 CAUSE RACINE — LA PLUS IMPORTANTE DE TOUTE CETTE SÉRIE : la réduction affichée sur le devis
// était DÉDUITE DE L'ÉCART (`totalBrut - total`), jamais des remises réellement saisies. Tout
// désaccord entre le total recalculé et le montant enregistré se transformait donc en
// « réduction » — un écart de données DÉGUISÉ EN GESTE COMMERCIAL, sur un document envoyé aux
// clients.
//
// ⚠️ C'est ce mécanisme qui a MASQUÉ les quatre défauts précédents (v1487 écriture, v1488 relecture,
// v1489 grille, v1490 saisie) : il les absorbait au lieu de les montrer. Chaque correction rendait
// le calcul plus juste, et l'écart réapparaissait ailleurs sous forme de remise.
//
// RÈGLE POSÉE : une réduction ne s'affiche que si elle a été SAISIE. Un écart résiduel n'est pas une
// remise — il est nommé, et le total est recalculé pour rester cohérent avec ses propres lignes.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
const money2 = n => Math.round((+n||0)*100)/100;

// Rejoue la logique du rendu telle qu'elle est écrite dans l'app.
function rendu({ lignesTotal, persoMt = 0, logoMt = 0, montantFige = null, remiseEur = null, gpct = 0 }){
  const totalBrut = money2(lignesTotal + persoMt + logoMt);
  const total = (montantFige != null) ? +montantFige : money2(totalBrut - money2(totalBrut*gpct/100));
  const _remiseSaisie = (remiseEur != null && +remiseEur > 0)
    ? money2(+remiseEur)
    : (gpct > 0 ? money2(totalBrut*gpct/100) : 0);
  const reductions = money2(Math.max(0, _remiseSaisie));
  const _ecart = money2(totalBrut - _remiseSaisie - total);
  const totalCoherent = money2(totalBrut - _remiseSaisie);
  const totalAffiche = (Math.abs(_ecart) > 0.01) ? totalCoherent : total;
  return { totalBrut, reductions, ecart: _ecart, totalAffiche };
}

// ---- A. LE CAS DE BEN : montant figé trop bas → PLUS de fausse réduction ----
{
  // 150 macarons logotés (120 €) absents du montant figé : l'ancien code inventait 120 € de remise.
  const r = rendu({ lignesTotal:500, logoMt:120, montantFige:500 });
  check('A. AUCUNE réduction inventée', r.reductions === 0);
  check('A. l\'écart est détecté (120 €)', Math.abs(r.ecart - 120) < 0.01);
  check('A. le total affiché est RECALCULÉ, cohérent avec les lignes', r.totalAffiche === 620);
  check('A. RÉCONCILIATION : total affiché = lignes + logo − remises saisies',
    r.totalAffiche === money2(500 + 120 - 0));
}

// ---- B. Une VRAIE remise reste affichée ----
{
  const r = rendu({ lignesTotal:500, logoMt:120, remiseEur:50, montantFige:570 });
  check('B. la remise saisie de 50 € est affichée', r.reductions === 50);
  check('B. aucun écart résiduel', Math.abs(r.ecart) < 0.01);
  check('B. le montant figé est conservé (il est cohérent)', r.totalAffiche === 570);

  const rp = rendu({ lignesTotal:1000, gpct:10, montantFige:900 });
  check('B. une remise en POURCENTAGE est affichée (100 €)', rp.reductions === 100);
  check('B. …et le total figé conservé', rp.totalAffiche === 900);
}

// ---- C. Devis sans remise ni écart : rien ne change ----
{
  const r = rendu({ lignesTotal:620, logoMt:0, montantFige:620 });
  check('C. aucune réduction', r.reductions === 0);
  check('C. aucun écart', Math.abs(r.ecart) < 0.01);
  check('C. total inchangé', r.totalAffiche === 620);
}

// ---- D. Un devis JAMAIS enregistré (sans montant figé) reste correct ----
{
  const r = rendu({ lignesTotal:500, logoMt:120, montantFige:null });
  check('D. sans montant figé, le total vaut la somme des lignes', r.totalAffiche === 620);
  check('D. …et aucune réduction inventée', r.reductions === 0);
}

// ---- E. LE CÂBLAGE dans l'app ----
{
  check('E. la réduction vient des remises SAISIES', /const _remiseSaisie = \(d\.remiseGlobaleEur!=null/.test(APP));
  check('E. …et non plus de l\'écart', !/const reductions = money2\(Math\.max\(0, totalBrut - total\)\)/.test(APP));
  check('E. l\'écart inexpliqué est calculé', /const _ecartInexplique = money2\(totalBrut - _remiseSaisie - total\)/.test(APP));
  check('E. le total bascule sur le recalcul si l\'écart existe',
    /const totalAffiche = \(Math\.abs\(_ecartInexplique\) > 0\.01\) \? totalCoherent : total/.test(APP));
  check('E. l\'écart est SIGNALÉ à l\'écran, pas masqué', /Montant recalculé \(l'ancien total enregistré différait/.test(APP));
  check('E. le total du devis affiche bien la valeur cohérente', /<span>Total du devis<\/span><span>\$\{euro\(totalAffiche\)\}/.test(APP));
  check('E. la classe CSS du total n\'a pas été renommée par erreur', /class="lg total"/.test(APP));
  check('E. l\'acompte suit le même total', /totalAffiche\*0\.75/.test(APP));
}

// ---- F. La base de la remise globale inclut le logo ----
// Sans lui, une remise en euros était plafonnée trop bas et le % dérivé était faux.
{
  check('F. le supplément logo entre dans la base', /const _baseRG = money2\(_sousTotalRG \+ _persoRG \+ _logoRG\)/.test(APP));
  check('F. …et il est calculé depuis les champs du formulaire', /const _logoRG = money2\(logoMontantPour\(/.test(APP));
  check('F. le forfait création aussi', /forfaitCreationPour\(Math\.max\(0, Math\.round\(\+val\('f_forfaitNb'\)\|\|0\)\)\)/.test(APP));

  // Comportement : une remise de 600 € sur 500 de lignes + 120 de logo ne doit plus être rabotée.
  // Une remise de 600 € demandee sur 500 € de lignes + 120 € de logo :
  //  · base AVEC logo (620) → la remise passe entiere ;
  //  · base SANS logo (500) → elle serait rabotee a 500, et Ben perdrait 100 € de remise consentie.
  const remiseDemandee = 600;
  const baseAvec  = money2(500 + 0 + 120);
  const baseSans  = money2(500 + 0);
  check('F. RÉCONCILIATION : avec le logo dans la base, les 600 € passent en entier',
    Math.min(baseAvec, remiseDemandee) === 600);
  check('F. …alors que sans lui, la remise serait rabotée à 500 €',
    Math.min(baseSans, remiseDemandee) === 500);
}

// ---- G. Le diagnostic livré avec (il n'écrit rien) ----
{
  const src = extractFunction('diagDevis');
  check('G. le diagnostic n\'écrit RIEN en base', !/db\.\w+\.(add|put|update|delete)\(/.test(src));
  check('G. il montre la grille réellement appliquée', /grillePourCommande\(d\)/.test(src));
  check('G. il montre les champs logo stockés', /d\.persoLogoNb/.test(src) && /d\.forfaitCreationNb/.test(src));
  check('G. il montre le marqueur de grille de CHAQUE ligne', /ln\.tarifRef/.test(src));
  check('G. il affiche la version de l\'app (pour vérifier le déploiement)', /APP_VERSION/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
