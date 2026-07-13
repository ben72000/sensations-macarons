/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 61 : LE TOTAL *ET* LE RESTE DÛ
   ----------------------------------------------------------------------------
   DEMANDÉ PAR BENJAMIN :
     « Dans ma liste de commandes à venir je veux avoir affiché clairement le montant total de
       l'ensemble des commandes mais aussi le restant dû, car bien souvent il y a une partie
       payée à l'avance. »

   L'encart « À venir » n'affichait que le montant total (« 5 · 1 022,40 € »). Or une partie est
   souvent déjà encaissée en acompte : ce total ne dit donc PAS ce qu'il reste à percevoir — le
   seul chiffre qui compte pour la trésorerie.

   Symétriquement, la section « À encaisser » affichait le reste dû SANS jamais dire de quel
   montant total il provenait : impossible de savoir si 139 € de reste portaient sur 150 € ou sur
   3 000 € de commandes.

   RÈGLES FIGÉES ICI :

     A. LES TROIS CHIFFRES SE RECOMPOSENT : total = déjà encaissé + reste dû, AU CENTIME.
        Un encart où les nombres ne se recomposent pas oblige Benjamin à vérifier à la calculette
        — et un chiffre qu'on doit vérifier est un chiffre auquel on ne fait plus confiance.

     B. UN TROP-PERÇU NE PAIE PAS LA COMMANDE D'À CÔTÉ. C'est la règle qui évite un mensonge
        discret. Si un client a versé 120 € pour une commande de 100 €, les 20 € en trop ne
        viennent PAS réduire le reste dû d'un AUTRE client. Sommer bêtement
        (Σ montant − Σ encaissé) ferait exactement cela, et SOUS-ESTIMERAIT le reste à percevoir.
        On plafonne donc commande par commande, et on expose le trop-perçu À PART.

     C. UNE SEULE FONCTION calcule les deux sections. Deux calculs séparés finiraient par
        diverger — c'est la leçon de toute cette série.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    ${extractFunction('orderPaid')}
    ${extractFunction('orderBalance')}
    ${extractFunction('cmdTotauxLot')}
    return { cmdTotauxLot, orderPaid, orderBalance };
  `;
  return new Function(code)();
}
const M = buildModule();

let pass=0, fail=0; const failures=[];
function eq(a, e, label){
  const x=JSON.stringify(a), y=JSON.stringify(e);
  if(x===y){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${y}\n      obtenu : ${x}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push('  ✗ ' + label); } }

console.log('\n=== TESTS — Vague 61 : le total ET le reste dû ===\n');

// La liste passe des « rows » {o: commande}. La fonction accepte aussi la commande nue.
const row = (o) => ({ o });

// ---------------------------------------------------------------------------
// A. LE CAS DE BENJAMIN — des acomptes sur des commandes à venir
// ---------------------------------------------------------------------------
{
  const lot = [
    row({ id:1, montant:400, paiements:[{ montant:200 }] }),   // acompte de 200
    row({ id:2, montant:225, paiements:[{ montant:100 }] }),   // acompte de 100
    row({ id:3, montant:187, paiements:[] }),                  // rien versé
    row({ id:4, montant:130.40, paiements:[] }),
    row({ id:5, montant:80, paiements:[] })
  ];
  const T = M.cmdTotauxLot(lot);

  eq(T.total, 1022.40, 'A1 · montant TOTAL des 5 commandes (le seul chiffre affiché jusqu\'ici)');
  eq(T.encaisse, 300, 'A2 · déjà encaissé en acomptes : 200 + 100');
  eq(T.reste, 722.40, 'A3 · RESTE DÛ : 1 022,40 − 300 — LE chiffre qui compte pour la trésorerie');
  eq(T.nbAvecAcompte, 2, 'A4 · deux commandes portent un acompte');
  eq(T.nb, 5, 'A5 · cinq commandes dans le lot');

  // RÈGLE A — les trois chiffres se recomposent, au centime.
  eq(Math.round((T.encaisse + T.reste) * 100) / 100, T.total,
     'A6 · TRAÇABILITÉ : déjà encaissé + reste dû = total, AU CENTIME (rien à vérifier à la calculette)');
}

// ---------------------------------------------------------------------------
// B. LA RÈGLE QUI COMPTE — un trop-perçu ne paie pas la commande d'à côté
// ---------------------------------------------------------------------------
// C'EST LE CŒUR DE CETTE VAGUE. Un client verse 120 € pour une commande de 100 €. Un AUTRE client
// doit 200 €. La somme naïve (Σ montant − Σ encaissé = 300 − 320) dirait « reste : −20 € » — ou,
// pire, « reste 180 € » : les 20 € en trop du premier viendraient PAYER le second.
// C'est faux, et ça sous-estime ce que Benjamin doit réclamer.
{
  const lot = [
    row({ id:1, montant:100, paiements:[{ montant:120 }] }),   // TROP-PERÇU de 20
    row({ id:2, montant:200, paiements:[] })                   // rien versé
  ];
  const T = M.cmdTotauxLot(lot);

  eq(T.total, 300, 'B1 · total des deux commandes');
  eq(T.encaisse, 100, 'B2 · seuls 100 € s\'APPLIQUENT réellement (le versement est plafonné au montant dû)');
  eq(T.reste, 200, 'B3 · RESTE DÛ : 200 € — les 20 € en trop du client 1 ne paient PAS le client 2');
  eq(T.tropPercu, 20, 'B4 · … et le trop-perçu est exposé À PART, pour ne pas le perdre de vue');

  // La preuve par l'absurde : la somme naïve.
  const naif = Math.round((300 - 120) * 100) / 100;
  eq(naif, 180, 'B5 · la somme NAÏVE (Σ montant − Σ encaissé) annoncerait 180 € de reste…');
  ok(naif < T.reste,
     'B6 · … elle SOUS-ESTIME donc de 20 € ce que Benjamin doit réclamer — un mensonge discret, et coûteux');

  // Et la recomposition tient toujours (règle A).
  eq(Math.round((T.encaisse + T.reste) * 100) / 100, T.total,
     'B7 · TRAÇABILITÉ : la recomposition tient MÊME avec un trop-perçu (il est hors de l\'équation)');
}

// ---------------------------------------------------------------------------
// C. LE CAS COURANT — aucun acompte
// ---------------------------------------------------------------------------
// Sans acompte, l'encart doit se comporter EXACTEMENT comme avant : afficher le total, et rien
// de plus. On n'ajoute pas du bruit là où il n'y a rien à dire.
{
  const lot = [ row({ id:1, montant:80, paiements:[] }), row({ id:2, montant:20, paiements:[] }) ];
  const T = M.cmdTotauxLot(lot);
  eq(T.total, 100, 'C1 · total inchangé');
  eq(T.encaisse, 0, 'C2 · rien d\'encaissé…');
  eq(T.reste, 100, 'C3 · … donc tout reste dû');
  eq(T.nbAvecAcompte, 0, 'C4 · aucun acompte');

  // L'écran ne montre le détail QUE s'il y a eu des acomptes (`AV.encaisse > 0`).
  ok(/AV\.encaisse\s*>\s*0/.test(APP),
     'C5 · l\'écran n\'affiche le bandeau QUE s\'il y a des acomptes — pas de bruit inutile');
}

// ---------------------------------------------------------------------------
// D. LE STATUT « PAYÉ » SANS REGISTRE — le legacy ne doit pas être ignoré
// ---------------------------------------------------------------------------
// `orderPaid` traite une commande marquée « Payé » sans registre de paiements comme intégralement
// réglée (commandes anciennes, avant le registre). Nos totaux doivent en tenir compte, sinon on
// réclamerait de l'argent déjà perçu.
{
  const lot = [
    row({ id:1, montant:150, paiement:'Payé' }),               // legacy : payé, pas de registre
    row({ id:2, montant:100, paiements:[{ montant:40 }] })
  ];
  const T = M.cmdTotauxLot(lot);
  eq(T.encaisse, 190, 'D1 · la commande legacy « Payé » compte pour son montant entier (150 + 40)');
  eq(T.reste, 60, 'D2 · … et il ne reste que les 60 € de la seconde — on ne réclame pas deux fois');
}

// ---------------------------------------------------------------------------
// E. ROBUSTESSE — aucun NaN, aucun chiffre inventé
// ---------------------------------------------------------------------------
{
  eq(M.cmdTotauxLot([]).total, 0, 'E1 · lot vide → 0 €');
  eq(M.cmdTotauxLot(null).reste, 0, 'E2 · lot absent → 0 € sans planter');
  eq(M.cmdTotauxLot([null, undefined]).nb, 0, 'E3 · lignes vides → ignorées');
  eq(M.cmdTotauxLot([row({ montant: -50 })]).total, 0,
     'E4 · un montant NÉGATIF est borné à 0 (une commande ne rapporte pas d\'argent négatif)');
  eq(M.cmdTotauxLot([row({ montant: 100 })]).reste, 100,
     'E5 · commande sans champ `paiements` → rien d\'encaissé, tout est dû');

  // La commande nue (sans enveloppe {o}) est acceptée : la fonction ne dépend pas de la forme
  // interne de la liste, ce qui la rend réutilisable ailleurs.
  eq(M.cmdTotauxLot([{ montant: 60, paiements: [{ montant: 10 }] }]).reste, 50,
     'E6 · une commande NUE (hors enveloppe de liste) est acceptée telle quelle');
}

// ---------------------------------------------------------------------------
// F. UNE SEULE FONCTION POUR LES DEUX SECTIONS (règle C)
// ---------------------------------------------------------------------------
// « À venir » et « À encaisser » calculaient leurs totaux séparément. Deux calculs finissent
// toujours par diverger — c'est la leçon de toute cette série.
{
  ok(/const AV = cmdTotauxLot\(aVenir\)/.test(APP),
     'F1 · la section « À venir » utilise cmdTotauxLot…');
  ok(/const AE = cmdTotauxLot\(aEncaisser\)/.test(APP),
     'F2 · … et « À encaisser » aussi : UNE seule règle pour les deux');
  ok(/const T=cmdTotauxLot\(lot\)/.test(APP),
     'F3 · … et les séparateurs de SEMAINE également');

  // Plus aucune somme de montants faite à la main dans ces sections.
  ok(!/aVenir\.reduce\(\(s,r\)=>s\+\(\+r\.o\.montant/.test(APP),
     'F4 · la somme artisanale de « À venir » a disparu');
  ok(!/aEncaisser\.reduce\(\(s,r\)=>s\+\(\(typeof orderBalance/.test(APP),
     'F5 · … et celle de « À encaisser » aussi');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
