/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 57 : LE CANAL OUBLIÉ
   ----------------------------------------------------------------------------
   BUG DE PRODUCTION, remonté par Benjamin (deux captures). Le copilote annonce
   « CA de juin = 552,00 € ». Sa compta, sur EXACTEMENT la même période (01 → 30 juin),
   affiche « CA encaissé = 1 068,00 € ».

   DEUX CHIFFRES POUR LE MÊME MOIS. Or la v1331 devait précisément éliminer ça. Ma correction
   était donc INCOMPLÈTE — et c'est le pire des aveuglements : celui qui se croit guéri.

   ┌─ BUG 1 — LES MARCHÉS N'ÉTAIENT PAS COMPTÉS DU TOUT.
   │  `caEncaisseParMois(orders)` n'itérait que sur les COMMANDES. Or les ventes de marché ne
   │  passent JAMAIS par la table `orders` : elles sont encaissées en direct, à la caisse.
   │  TOUT UN CANAL DE VENTE manquait au CA du copilote — et aussi au graphe « Coûts & prix »,
   │  qui lit la même fonction (sa marge brute était donc sous-estimée d'autant).
   │
   │  LA LEÇON : j'avais fondé ma « vérité unique » (v1331) sur une fonction qui oubliait
   │  elle-même un canal. UNE SOURCE UNIQUE QUI EST INCOMPLÈTE RESTE UNE SOURCE UNIQUE — ET
   │  RESTE FAUSSE. Unifier n'est pas vérifier.
   │
   └─ BUG 2 — LE FOND DE CAISSE ÉTAIT COMPTÉ COMME DU CHIFFRE D'AFFAIRES.
      `computeAccounting` (la compta) retire le fond de caisse des espèces : c'est l'argent que
      Benjamin met LUI-MÊME dans la caisse le matin pour rendre la monnaie. Ce n'est pas une
      vente. Mais `revenuHoraireData` sommait les espèces BRUTES : il comptait donc la monnaie
      de Benjamin comme du CA, et surestimait son revenu de l'heure.

   RÈGLES FIGÉES ICI :
     A. Le CA d'un marché = (espèces − FOND DE CAISSE, borné à 0) + carte + autre. Écrit UNE
        SEULE FOIS (`caMarcheEncaisse`). Une règle écrite à deux endroits finit toujours par
        diverger — c'est très exactement ce qui s'est passé.
     B. Seuls les marchés CLOS comptent : un marché en cours n'a pas de CA arrêté.
     C. Un marché est encaissé LE JOUR MÊME : aucun prorata, contrairement aux commandes.
     D. LE TEST QUI AURAIT DÛ EXISTER : le CA du copilote doit ÉGALER celui de la compta, au
        centime, MARCHÉS COMPRIS. La vague 52 ne comparait que le canal « commandes » — elle
        validait donc une égalité partielle, et c'est pour ça qu'elle n'a rien vu.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');
const fs = require('fs');
const path = require('path');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    const round3 = n => Math.round(n*1000)/1000;
    ${extractFunction('monthKey')}
    ${extractFunction('_dansPeriode')}
    ${extractConstLine('ymKey')}
    ${extractFunction('estReprise')}
    ${extractFunction('lineTotalStored')}
    ${extractFunction('orderToLines')}
    ${extractFunction('paiementsDe')}
    ${extractConstLine('marcheDate')}
    const swallow = () => {};
    const addMoney = (...a) => Math.round(a.reduce((x,y)=>x+(+y||0),0)*100)/100;
    ${extractConstLine('addQty')}
    ${extractConstLine('subQty')}
    ${extractFunction('marketLineSummary')}
    ${extractFunction('caMarcheEncaisse')}
    ${extractFunction('caMarchesDuMois')}
    ${extractFunction('caEncaisseParMois')}
    ${extractFunction('macaronsDeCommande')}
    ${extractFunction('caMoisEncaisse')}
    ${extractFunction('serieMensuelleEncaisse')}
    return { caMarcheEncaisse, caMarchesDuMois, caEncaisseParMois, caMoisEncaisse,
             serieMensuelleEncaisse, orderToLines, marketLineSummary };
  `;
  return new Function(code)();
}
const M = buildModule();

let pass=0, fail=0; const failures=[];
function eq(a, e, label){
  const x=JSON.stringify(a), y=JSON.stringify(e);
  if(x===y){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${y}\n      obtenu : ${x}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }

console.log('\n=== TESTS — Vague 57 : le canal oublié ===\n');

// ---------------------------------------------------------------------------
// A. LE FOND DE CAISSE N'EST PAS DU CHIFFRE D'AFFAIRES
// ---------------------------------------------------------------------------
// Benjamin met 50 € de monnaie dans la caisse le matin. Le soir, la caisse contient 300 € en
// espèces. Il n'a donc vendu que 250 € en liquide — les 50 € étaient DÉJÀ à lui.
{
  const mk = { id:1, nom:'Marché de juin', date:'2026-06-14', statut:'clos',
               fondCaisse:50, ca:{ especes:300, cb:200, autre:0 } };
  eq(M.caMarcheEncaisse(mk), 450,
     'A1 · CA = (300 − 50 de fond) + 200 de CB = 450 € — le fond de caisse est RETIRÉ');

  // Le bug rejoué : sommer les espèces BRUTES.
  const faux = 300 + 200 + 0;
  eq(faux, 500, 'A2 · l\'ANCIEN calcul du revenu horaire annonçait 500 € …');
  ok(faux > M.caMarcheEncaisse(mk),
     'A3 · … il comptait la monnaie de Benjamin comme du CA, et SURESTIMAIT toujours son revenu');

  // GARDE-FOU : si Benjamin repart avec moins que son fond, ce n'est pas un CA négatif.
  const maigre = { id:2, date:'2026-06-14', statut:'clos', fondCaisse:50, ca:{ especes:30, cb:0, autre:0 } };
  eq(M.caMarcheEncaisse(maigre), 0,
     'A4 · GARDE-FOU : espèces < fond de caisse → CA de 0, jamais négatif (ça, c\'est une perte, pas un CA)');
}

// ---------------------------------------------------------------------------
// B. SEULS LES MARCHÉS CLOS COMPTENT (règle B)
// ---------------------------------------------------------------------------
{
  const enCours = { id:3, date:'2026-06-14', statut:'en_cours', fondCaisse:0, ca:{ especes:500 } };
  eq(M.caMarcheEncaisse(enCours), 0,
     'B1 · un marché EN COURS n\'a pas de CA arrêté → 0 (on ne compte pas une caisse qu\'on n\'a pas faite)');
  eq(M.caMarcheEncaisse(null), 0, 'B2 · marché absent → 0, sans planter');
  eq(M.caMarcheEncaisse({ statut:'clos' }), 0, 'B3 · marché clos sans caisse saisie → 0 (pas de NaN)');
}

// ---------------------------------------------------------------------------
// C. LE BUG EXACT — le CA du marché ne remontait NULLE PART
// ---------------------------------------------------------------------------
// Reconstitution du cas de Benjamin : des commandes ET un marché sur le même mois.
const CMD = {
  id:1, date:'2026-06-02', montant:552, paiement:'Payé',
  paiements:[{ date:'2026-06-05', montant:552 }],
  lignes:[{ type:'coffret', taille:6, parfums:[{ nom:'Vanille', qte:200 }] }]
};
const MARCHE = { id:9, nom:'Marché de juin', date:'2026-06-20', statut:'clos',
                 fondCaisse:50, ca:{ especes:366, cb:200, autre:0 } };   // → 516 €
// ⚠ LE TYPE STOCKÉ EST 'sortie', PAS 'embarque'.
// En v1336 j'avais INVENTÉ le type 'embarque' — qui n'existe nulle part dans la base. Les macarons
// des marchés valaient donc TOUJOURS 0, avec ou sans mouvements saisis. Et mon test partageait la
// MÊME erreur : il passait au vert en validant un code faux.
// C'est le piège que la vague 52 s'interdisait explicitement — une duplication non prouvée. On
// s'appuie désormais sur `marketTotals`, la fonction qui sert déjà l'écran marché.
const MOVES = [
  { marketId:9, parfum:'Vanille', type:'sortie', qte:150 },
  { marketId:9, parfum:'Vanille', type:'retour', qte:30  },
  { marketId:9, parfum:'Vanille', type:'perte',  qte:5   }
];   // vendu = 150 − 30 − 5 = 115

{
  eq(M.caMarcheEncaisse(MARCHE), 516, 'C1 · le marché a rapporté 516 € (366 − 50 + 200)');

  const E = M.caMoisEncaisse([CMD], '2026-06', M.orderToLines, [MARCHE], MOVES);
  eq(E.ca, 1068, 'C2 · CA de juin = 552 (commandes) + 516 (marché) = 1 068 € — LE CHIFFRE DE LA COMPTA');

  // Le bug : sans les marchés, on retombe sur les 552 € du copilote.
  const sansMarches = M.caMoisEncaisse([CMD], '2026-06', M.orderToLines);
  eq(sansMarches.ca, 552, 'C3 · sans les marchés → 552 € : EXACTEMENT le chiffre que Benjamin voyait');
  eq(M.caMoisEncaisse([CMD], '2026-06', M.orderToLines, [MARCHE], MOVES).ca - sansMarches.ca, 516,
     'C4 · l\'écart de 516 € était TOUT le CA marché, purement absent');

  // Les macarons du marché remontent aussi (sinon on aurait un CA sans macarons — le symptôme v1331).
  eq(E.macaronsStd, 315, 'C5 · 200 (commande) + 115 vendus au marché (150 sortis − 30 retours − 5 pertes)');
  eq(E.caMarches, 516, 'C6 · le CA marché est exposé À PART (traçabilité : commandes vs marchés)');
  eq(E.nbMarches, 1, 'C7 · … avec le nombre de marchés');
}

// ---------------------------------------------------------------------------
// D. LE TEST QUI AURAIT DÛ EXISTER (règle D)
// ---------------------------------------------------------------------------
// La vague 52 comparait déjà le copilote à la compta… mais SANS MARCHÉS dans le jeu de données.
// Elle validait donc une égalité PARTIELLE — et c'est pour ça qu'elle n'a rien vu.
// Un test qui ne contient pas le cas ne le protège pas : il donne seulement l'illusion qu'il le fait.
{
  const orders = [CMD];
  const markets = [MARCHE];

  const compta = M.caEncaisseParMois(orders, markets).parMois;
  const copilote = M.caMoisEncaisse(orders, '2026-06', M.orderToLines, markets, MOVES).ca;

  eq(copilote, Math.round((compta['2026-06'] || 0) * 100) / 100,
     'D1 · le copilote et la compta annoncent le MÊME CA — marchés compris (le test qui manquait)');
  eq(compta['2026-06'], 1068, 'D2 · … et c\'est bien 1 068 €');

  // La série des graphiques doit dire la même chose (sinon les courbes rementiraient).
  const S = M.serieMensuelleEncaisse(orders, M.orderToLines, markets, MOVES);
  eq(S.parMois['2026-06'].ca, 1068,
     'D3 · les COURBES aussi — sinon l\'écran Stats recontredirait le copilote, comme en v1333');
  ok(S.mois.includes('2026-06'), 'D4 · le mois du marché apparaît bien dans la série');
}

// Un mois SANS commande mais AVEC un marché doit exister dans la série.
// Avant, un tel mois était purement invisible : aucune commande → aucun mois → CA fantôme.
{
  const S = M.serieMensuelleEncaisse([], M.orderToLines, [MARCHE], MOVES);
  eq(S.mois, ['2026-06'],
     'D5 · un mois SANS commande mais AVEC un marché EXISTE (avant : le mois disparaissait entièrement)');
  eq(S.parMois['2026-06'].ca, 516, 'D6 · … avec son CA marché');
}

// ---------------------------------------------------------------------------
// E. LE PRORATA NE S'APPLIQUE PAS AUX MARCHÉS (règle C)
// ---------------------------------------------------------------------------
// Une commande payée à moitié n'apporte que la moitié de ses macarons (v1331). Un marché, lui,
// est encaissé le jour même, en totalité : lui appliquer un prorata n'aurait aucun sens.
{
  const G = M.caMarchesDuMois([MARCHE], MOVES, '2026-06');
  eq(G.ca, 516, 'E1 · le CA marché est compté en TOTALITÉ…');
  eq(G.vendu, 115, 'E2 · … et ses macarons aussi (aucun prorata : l\'argent est tombé le jour même)');
  eq(G.nbMarches, 1, 'E3 · un marché concerné');

  // Un marché d'un AUTRE mois ne doit pas fuir.
  const juillet = M.caMarchesDuMois([MARCHE], MOVES, '2026-07');
  eq(juillet.ca, 0, 'E4 · le marché de juin ne fuit pas dans juillet');
  eq(juillet.nbMarches, 0, 'E5 · … et aucun marché n\'y est compté');

  // Sans mois : tout l'historique.
  eq(M.caMarchesDuMois([MARCHE], MOVES, null).ca, 516, 'E6 · sans mois → tout l\'historique');
}

// ---------------------------------------------------------------------------
// F. NON-RÉGRESSION — les commandes seules se comportent comme avant
// ---------------------------------------------------------------------------
{
  const E = M.caMoisEncaisse([CMD], '2026-06', M.orderToLines, [], []);
  eq(E.ca, 552, 'F1 · aucun marché → le CA des commandes est inchangé');
  eq(E.caMarches, 0, 'F2 · … et le CA marché est nul');
  eq(M.caEncaisseParMois([CMD], []).parMois['2026-06'], 552, 'F3 · idem pour la ventilation comptable');
  eq(M.caEncaisseParMois([CMD]).parMois['2026-06'], 552,
     'F4 · … même sans passer les marchés du tout (les anciens appelants ne cassent pas)');
}

// ---------------------------------------------------------------------------
// G. [v1337] ZÉRO N'EST PAS UNE MESURE — c'est une AFFIRMATION
// ---------------------------------------------------------------------------
// SIGNALÉ PAR BENJAMIN, et il a vu juste avant moi :
//   « si seul le CA est entré, on retourne une vente de macarons à zéro même avec un CA ».
// Les quantités vendues sur un marché se déduisent du DELTA (sorti − retours − dons − pertes).
// Sans mouvements saisis, le sorti vaut 0… et la vente aussi. L'app affichait donc « 516 € et
// 0 macaron » — ce qui ne dit pas « je ne sais pas », mais « tu n'as RIEN VENDU ».
// C'est le MÊME mensonge que le « 50 € / 0 macaron » de la v1331, réapparu dans l'autre canal.
{
  // Un marché encaissé, mais AUCUN mouvement saisi.
  const G = M.caMarchesDuMois([MARCHE], [], '2026-06');
  eq(G.ca, 516, 'G1 · le CA est bien là : 516 € encaissés');
  eq(G.vendu, 0, 'G2 · … mais AUCUN macaron n\'est ajouté au total (on ne les invente pas)');
  eq(G.nbNonMesures, 1, 'G3 · … et le marché est compté comme NON MESURÉ');
  eq(G.caNonMesure, 516, 'G4 · … avec le CA correspondant, pour pouvoir le DIRE en euros');
  eq(G.macaronsComplets, false, 'G5 · le total de macarons est déclaré INCOMPLET');
  eq(G.detail[0].macarons, null,
     'G6 · dans le détail, la quantité vaut `null` (INCONNUE) — surtout pas 0, qui affirmerait « rien vendu »');
  eq(G.detail[0].mesure, false, 'G7 · … et la ligne est marquée non mesurée');

  // Avec les mouvements : tout est mesuré, aucune alerte.
  const OK = M.caMarchesDuMois([MARCHE], MOVES, '2026-06');
  eq(OK.vendu, 115, 'G8 · avec les mouvements saisis : 115 macarons, au macaron près');
  eq(OK.nbNonMesures, 0, 'G9 · … aucun marché non mesuré');
  eq(OK.macaronsComplets, true, 'G10 · … et le total est COMPLET');
}

// L'incertitude doit REMONTER jusqu'au chiffre du copilote. La taire reviendrait à présenter un
// total partiel comme un total complet — le plus discret des mensonges, et le plus tenace.
{
  const E = M.caMoisEncaisse([CMD], '2026-06', M.orderToLines, [MARCHE], []);
  eq(E.ca, 1068, 'G11 · le CA reste juste : 552 + 516 (l\'argent, lui, est connu)');
  eq(E.macaronsStd, 200, 'G12 · … mais seuls les 200 macarons des COMMANDES sont comptés');
  eq(E.macaronsComplets, false, 'G13 · … et le copilote sait que son compte est INCOMPLET');
  eq(E.nbMarchesNonMesures, 1, 'G14 · … avec le nombre de marchés concernés');
  eq(E.caMarcheNonMesure, 516, 'G15 · … et les euros correspondants, pour pouvoir l\'expliquer');

  // Avec les mouvements : le compte est complet, aucune alerte.
  const F = M.caMoisEncaisse([CMD], '2026-06', M.orderToLines, [MARCHE], MOVES);
  eq(F.macaronsComplets, true, 'G16 · mouvements saisis → total complet, aucune alerte');
  eq(F.macaronsStd, 315, 'G17 · … et 315 macarons (200 + 115)');
}

// ---------------------------------------------------------------------------
// H. [v1337] LE VOCABULAIRE DES MOUVEMENTS — une seule fonction sait le lire
// ---------------------------------------------------------------------------
// LA VRAIE CAUSE du bug : en v1336 j'avais parsé les mouvements moi-même et INVENTÉ un type
// 'embarque' qui n'existe nulle part. Le type stocké est 'sortie'. Les macarons des marchés
// valaient donc TOUJOURS zéro — et mon test, qui partageait la même erreur, passait au vert.
// UN TEST QUI PARTAGE L'ERREUR DU CODE NE VAUT RIEN : il ne valide que sa propre cohérence.
{
  const S = M.marketLineSummary([
    { marketId:1, parfum:'Vanille', type:'sortie', qte:100 },
    { marketId:1, parfum:'Vanille', type:'retour', qte:20  }
  ]);
  eq(S[0].sortie, 100, 'H1 · le type stocké est bien « sortie »…');
  eq(S[0].vendu, 80, 'H2 · … et le résumeur en déduit la vente (100 − 20)');

  // Le type inventé ne produit RIEN — la preuve que le bug de v1336 était total.
  const faux = M.marketLineSummary([{ marketId:1, parfum:'Vanille', type:'embarque', qte:100 }]);
  eq(faux[0].sortie, 0,
     'H3 · le type « embarque » que j\'avais inventé ne remonte RIEN : les macarons valaient toujours 0');

  // On ne re-parse plus les mouvements nulle part : `marketLineSummary` est la seule à savoir lire.
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const fn = src.slice(src.indexOf('function caMarchesDuMois'), src.indexOf('function caEncaisseParMois'));
  ok(/marketLineSummary/.test(fn),
     'H4 · caMarchesDuMois passe par marketLineSummary — le MÊME résumeur que marketTotals');
  // On vise le CODE, pas la prose : le commentaire explique justement le bug, il a le droit de
  // nommer le type fantôme. Ce qu'on interdit, c'est de le TESTER.
  ok(!/mv\.type\s*===\s*'/.test(fn),
     'H5 · … et ne teste plus AUCUN type de mouvement elle-même (plus de parsing maison)');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
