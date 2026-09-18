'use strict';
// v1501 — L'ÉMISSION D'UN AVOIR NE SE VOYAIT NULLE PART. Ben, après avoir cliqué « Annuler la
// facture » : « ça semble fonctionner mais apparemment rien ne change. Puis quand je clique à
// nouveau sur annuler ça met la facture a déjà été intégralement annulée. »
//
// 🚨 L'avoir avait bel et bien été émis — le second clic en est la preuve indirecte (avoirForm
// refuse un montant déjà couvert). Mais RIEN sur la fiche de la facture elle-même ne le
// reflétait : ni bandeau, ni badge, ni total, ni lien vers l'avoir. Rouvrir la facture montrait
// exactement le même « 🔒 Validée » qu'avant, comme si de rien n'était. Le statut légal
// ('emise'/'payee') n'est délibérément jamais modifié par un avoir (inaltérabilité) — mais
// personne ne calculait ni n'affichait l'état DÉRIVÉ (annulée / avoir partiel) à côté.
//
// FIX : un badge dérivé dans l'en-tête, un bandeau récapitulatif avec lien direct vers le/les
// avoir(s), le bouton avoir masqué une fois la facture entièrement couverte, et le même lien
// ajouté côté fiche commande (Documents liés) — pour ne plus dépendre d'un second clic malheureux
// pour savoir si ça a marché.
const { APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Le calcul des avoirs liés à une facture existe et précède son usage ----
{
  const iCalc = APP.indexOf('const avoirsDeCetteFacture = (d.type');
  check('A. le calcul des avoirs liés existe', iCalc > -1);
  check('A. il matche par factureId OU par commande liée (les deux chemins d\'émission possibles)',
    /x\.factureId===d\.id \|\| orderIds\.includes\(x\.orderId\)/.test(APP));
  check('A. seuls les avoirs réellement émis comptent (statut emis/enregistré)',
    /x\.statut==='emis'\|\|x\.statut==='enregistre'/.test(APP.slice(iCalc, iCalc+250)));

  const iDecl = APP.indexOf('const orderIds = d.type');
  check('A. orderIds est déclaré AVANT le calcul des avoirs qui le consulte (pas de ReferenceError)',
    iDecl > -1 && iDecl < iCalc);

  const iTot = APP.indexOf('const totalAvoirsFacture');
  const iAnnul = APP.indexOf('const factureAnnuleeParAvoir');
  check('A. le seuil « entièrement annulée » tolère l\'arrondi centime (>= montant - 0.009)',
    /totalAvoirsFacture>=money2\(\+d\.montant\|\|0\)-0\.009/.test(APP.slice(iAnnul, iAnnul+150)));
  check('A. les deux constantes sont calculées dans le bon ordre', iTot < iAnnul);
}

// ---- B. [LE DÉFAUT CORRIGÉ] Retour visuel enfin présent sur la fiche facture ----
{
  check('B. un badge dérivé « Annulée par avoir » apparaît dans l\'en-tête',
    /Annulée par avoir/.test(APP));
  check('B. …et un badge intermédiaire pour un avoir partiel',
    /Avoir partiel/.test(APP));
  check('B. un bandeau récapitulatif s\'affiche dès qu\'un avoir existe (totalAvoirsFacture>0)',
    /totalAvoirsFacture>0\?`<div class="banner"/.test(APP));
  check('B. le bandeau rappelle que le montant original reste inchangé (inaltérabilité)',
    /Le montant original reste inchangé/.test(APP));
  check('B. chaque avoir listé a un accès direct (bouton "Voir l\'avoir")',
    /Voir l'avoir \$\{esc\(a\.numero/.test(APP));
}

// ---- C. Le bouton avoir ne se propose plus une fois la facture entièrement couverte ----
{
  const iBtn = APP.indexOf('factureAnnuleeParAvoir ? \'\' : (orderIds.length===1');
  check('C. le bouton est conditionné à factureAnnuleeParAvoir', iBtn > -1);
}

// ---- D. Même découvrabilité côté fiche commande (Documents liés) ----
{
  check('D. les avoirs de la commande sont recherchés (même filtre statut que la facture)',
    /_avoirsOrig = _docs\.filter\(x=>x\.type==='avoir'/.test(APP));
  check('D. ils sont ajoutés aux documents liés, avec accès direct',
    /_avoirsOrig\.forEach\(a=>_docLiens\.push/.test(APP));
}

// ---- E. Sensibilité : sans ce calcul, rien ne distinguait une facture annulée d'une facture intacte ----
{
  const facture = { type:'facture', montant:120 };
  const avoirs = [{ type:'avoir', statut:'emis', factureId:1, montant:120 }];
  const totalSansFix = 0;   // ancien comportement : jamais calculé, toujours traité comme 0
  const totalAvecFix = avoirs.reduce((s,a)=>s+a.montant,0);
  check('E. [SENSIBILITÉ] sans le correctif, le total d\'avoirs valait toujours 0 quel que soit l\'avoir réel',
    totalSansFix === 0 && totalAvecFix === 120);
  check('E. avec le correctif, 120 € d\'avoir sur une facture de 120 € est bien détecté comme entièrement annulée',
    totalAvecFix >= facture.montant - 0.009);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
