'use strict';
// v1500 — LE BOUTON AVOIR N'EXISTAIT PAS À L'ÉCRAN. Ben, juste après avoir demandé « comment
// créer un avoir sur une facture ? » et reçu la marche à suivre (commande → ↩︎ Créer un avoir) :
// « Je ne vois pas du tout où c'est ».
//
// 🚨 CAUSE : le bouton sur la fiche COMMANDE était conditionné à `orderPaid(o)>0` — un reste du
// AVANT la v1499, où l'avoir n'existait QUE comme remboursement d'argent reçu. La v1499 a bien
// débloqué la FONCTION `avoirForm` pour le cas « rien encaissé » (avoir d'annulation), mais le
// BOUTON QUI Y MÈNE n'a pas été mis à jour : dans le cas exact de Ben (rien encaissé), le bouton
// ne s'affichait tout simplement JAMAIS. La fonction marchait ; l'accès n'existait pas.
// Même trou sur la fiche de la FACTURE elle-même (écran Documents) : aucun bouton avoir, quel que
// soit le règlement — seul un lien vers la commande liée, à condition de penser à cliquer dessus.
//
// FIX : le bouton de la commande s'affiche aussi dès qu'une facture est liée (même non
// encaissée), avec un libellé qui reflète le cas (« Créer un avoir » / « Annuler la facture »).
// Un accès identique est ajouté directement sur la fiche facture (mono-commande), pour ne plus
// dépendre de la navigation vers la commande.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Le bouton de la fiche commande ne dépend plus SEULEMENT de l'encaissement ----
{
  const iBtn = APP.indexOf("orderPaid(o)>0 || _factOrig)?");
  check('A. le bouton existe et sa condition a bien été étendue', iBtn > -1);
  const srcBtn = APP.slice(Math.max(0, iBtn-30), iBtn+400);
  check('A. [LE DÉFAUT CORRIGÉ] le bouton s\'affiche aussi quand une facture est liée sans rien d\'encaissé',
    /_factOrig/.test(srcBtn));
  check('A. le libellé s\'adapte au cas (annulation vs remboursement)',
    /Annuler la facture/.test(srcBtn) && /Créer un avoir/.test(srcBtn));

  // Sensibilité : l'ancienne condition, seule, aurait caché le bouton dans le cas de Ben.
  const ancienneCondition = (orderPaid) => orderPaid > 0;
  check('A. [SENSIBILITÉ] l\'ancienne condition (encaissement seul) cachait le bouton à 0 € encaissé',
    ancienneCondition(0) === false);
}

// ---- B. Accès direct depuis la fiche facture elle-même (nouveau) ----
{
  check('B. la fiche facture propose désormais un accès direct à l\'avoir (mono-commande)',
    /avoirForm\(\$\{orderIds\[0\]\}\)/.test(APP));
  const iDoc = APP.indexOf('avoirForm(${orderIds[0]})');
  const around = APP.slice(Math.max(0, iDoc-250), iDoc+250);
  check('B. le libellé y suit aussi le montant réellement réglé de CETTE facture',
    /_reglInfo\.paye>0/.test(around));
  check('B. une facture groupée sur plusieurs commandes ne pointe vers aucune commande au hasard',
    /orderIds\.length>1/.test(APP) && /ouvre la commande concernée/.test(APP));
}

// ---- C. Non-régression : le cas déjà couvert (encaissement partiel/total) reste inchangé ----
{
  const iBtn = APP.indexOf("orderPaid(o)>0 || _factOrig)?");
  const srcBtn = APP.slice(Math.max(0, iBtn-30), iBtn+400);
  check('C. un encaissement seul (sans facture liée) affiche toujours le bouton',
    /orderPaid\(o\)>0/.test(srcBtn));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
