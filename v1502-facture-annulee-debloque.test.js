'use strict';
// v1502 — FACTURER UNE COMMANDE « SEMBLAIT BLOQUER » APRÈS ANNULATION DE LA PRÉCÉDENTE FACTURE.
// Ben : « Ma demande est extrêmement simple. Je veux pouvoir transformer une commande en facture
// et un devis en facture. Ce n'est pas le cas aujourd'hui. Quand je suis dans commande et que je
// clique sur facturer ça bloque. La facture n'apparaît pas dans mes factures. Est-ce que c'est à
// cause de la facture annulée ? »
//
// Sa question était la bonne réponse.
//
// 🚨 CAUSE : `genererFactureMultiple` recherche, pour le même jeu de commandes, un document
// facture déjà existant. S'il est « définitif » (`docEstDefinitif` — statut emise/payee), l'app
// se contente de le ROUVRIR au lieu d'en créer un nouveau — logique anti-doublon voulue. Mais un
// avoir, À DESSEIN (v1499/v1501), ne modifie JAMAIS ce statut : inaltérabilité légale. Une facture
// ANNULÉE reste donc « définitive » aux yeux de ce contrôle. Résultat : chaque clic sur
// « Facturer » retrouvait l'ancienne facture annulée, la rouvrait, et RETOURNAIT — sans jamais
// créer de nouveau document. Aucun brouillon, aucune facture neuve, quel que soit le nombre de
// clics. Ce que Ben percevait comme un blocage était en réalité une boucle silencieuse sur un
// document mort.
//
// FIX : une facture définitive mais entièrement couverte par un avoir (même calcul qu'en v1501)
// ne bloque plus la création — elle est traitée comme absente, SANS jamais être modifiée
// (inaltérabilité toujours respectée : on ne la met à jour ni ne la supprime, on en crée une
// nouvelle à côté).
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const src = extractFunction('genererFactureMultiple');

// ---- A. Le calcul « facture annulée » existe et précède la décision de rouvrir ----
{
  const iCalc = src.indexOf('const existingAnnulee');
  const iDecision = src.indexOf('if(existing && docEstDefinitif(existing) && !existingAnnulee)');
  check('A. le calcul existingAnnulee existe', iCalc > -1);
  check('A. il précède la décision de rouvrir (pas de ReferenceError)', iCalc > -1 && iDecision > -1 && iCalc < iDecision);
  check('A. il ne se déclenche que pour une facture réellement définitive (sinon retour rapide false)',
    /if\(!docEstDefinitif\(existing\)\) return false;/.test(src));
  check('A. il additionne les avoirs par factureId OU par commande liée (mêmes deux chemins qu\'en v1501)',
    /a\.factureId===existing\.id \|\| orderIds\.includes\(a\.orderId\)/.test(src));
  check('A. seuls les avoirs réellement émis comptent', /a\.statut==='emis'\|\|a\.statut==='enregistre'/.test(src));
}

// ---- B. [LE DÉFAUT CORRIGÉ] Une facture annulée ne bloque plus la réouverture/reprint ----
{
  check('B. la condition de réouverture exclut désormais le cas annulé',
    /docEstDefinitif\(existing\) && !existingAnnulee/.test(src));
}

// ---- C. Une facture annulée n'est JAMAIS modifiée — on en crée une nouvelle à côté ----
{
  check('C. existing est remis à null quand elle est annulée (jamais réutilisée pour un update)',
    /if\(existingAnnulee\) existing = null;/.test(src));
  // La ligne qui suit ce reset doit être la construction d'un NOUVEAU document, jamais un
  // update de l'ancien — vérifié par l'ordre : le reset précède la construction de docFact,
  // qui elle-même précède le if/else add-ou-update.
  const iReset = src.indexOf('if(existingAnnulee) existing = null;');
  const iDocFact = src.indexOf('const docFact = {');
  const iAddOrUpdate = src.indexOf("if(existing){ await db.documents.update");
  check('C. l\'ordre est le bon : reset → construction du document → décision add/update',
    iReset > -1 && iReset < iDocFact && iDocFact < iAddOrUpdate);
}

// ---- D. Non-régression : une facture définitive NON annulée continue de bloquer (anti-doublon voulu) ----
{
  check('D. le garde-fou anti-doublon original reste actif pour une facture définitive saine',
    /if\(existing && docEstDefinitif\(existing\)/.test(src));
  check('D. …et continue de rouvrir sans en créer une seconde dans ce cas',
    /return;\s*\}\s*if\(existingAnnulee\)/.test(src));
}

// ---- E. Comportement, sur des données synthétiques reproduisant le cas exact de Ben ----
{
  // Reproduit juste le calcul (pas toute la fonction, qui dépend du DOM/de openPrintView) :
  // une facture de 120€, entièrement couverte par un avoir de 120€ émis contre elle.
  const money2 = n => Math.round((+n||0)*100)/100;
  const docEstDefinitif = d => d && d.type==='facture' && (d.statut==='emise'||d.statut==='payee');
  const orderIds = [42];
  const existingFacture = { id:7, type:'facture', statut:'emise', montant:120, orderIds:[42] };
  const avoirs = [{ type:'avoir', statut:'emis', factureId:7, orderId:null, montant:120 }];
  const calc = (existing) => {
    if(!docEstDefinitif(existing)) return false;
    const tot = money2(avoirs
      .filter(a=>(a.statut==='emis'||a.statut==='enregistre') && (a.factureId===existing.id || orderIds.includes(a.orderId)))
      .reduce((s,a)=>s+(+a.montant||0),0));
    return tot>0 && tot>=money2(+existing.montant||0)-0.009;
  };
  check('E. [LE CAS EXACT DE BEN] une facture de 120€ couverte par un avoir de 120€ est bien détectée comme annulée',
    calc(existingFacture) === true);
  check('E. [SENSIBILITÉ] sans le correctif, cette même facture aurait bloqué toute nouvelle création',
    docEstDefinitif(existingFacture) === true);   // c'est justement CE test seul qui bloquait avant
  const factureNonCouverte = { id:8, type:'facture', statut:'emise', montant:120, orderIds:[42] };
  check('E. non-régression : une facture définitive SANS avoir n\'est jamais traitée comme annulée',
    calc(factureNonCouverte) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
