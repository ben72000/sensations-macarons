/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 60 : LE TOTAL EST LA SOMME DU DÉTAIL
                                          + L'ÉTAT « EN COURS » D'UN LOT
   ----------------------------------------------------------------------------
   Deux chantiers, tous deux demandés par Benjamin.

   ┌─ 1) LE « CA TOTAL » CONTREDISAIT SES PROPRES MOIS  (angle mort déclaré depuis la vague 57)
   │  La vue globale du copilote affichait `R.global.caTotal` — computeStats : commandes SEULES,
   │  date de COMMANDE, montant TOTAL. Juste en dessous, la liste mensuelle affichait la vérité
   │  comptable (encaissement, marchés compris). Le total et le détail se contredisaient SUR LE
   │  MÊME ÉCRAN, et personne ne pouvait dire lequel croire.
   │
   │  RÈGLE FIGÉE : un total qui n'est pas la somme de son détail N'EST PAS un total — c'est un
   │  TROISIÈME chiffre, et il finit toujours par contredire les deux autres.
   │
   └─ 2) L'ÉTAT « EN COURS » D'UN LOT — un vrai câblage (demandé par Benjamin)
      La vague 59 avait supprimé une branche morte : le statut 'en_cours' était TESTÉ mais jamais
      ÉCRIT. Benjamin a tranché : il veut cet état, STOCKÉ en base.

      LE RISQUE, regardé en face : un statut stocké peut MENTIR. Écrit une fois puis jamais
      revérifié, il finit par contredire la réalité — précisément le mal que la vague 59 soignait.
      UN STATUT FAUX EST PIRE QU'UN STATUT ABSENT : on lui fait confiance.

      D'OÙ LA RÉCONCILIATION. 'clos' et 'ouvert' sont des DÉCISIONS ; 'en_cours' est un FAIT
      (des articles sont affectés au lot). On ne devine que le fait, jamais les décisions. Le
      statut est ÉCRIT au premier prélèvement, et RECALÉ à chaque affichage s'il a divergé.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    const round3 = n => Math.round(n*1000)/1000;
    ${extractFunction('monthKey')}
    ${extractConstLine('ymKey')}
    ${extractConstLine('addQty')}
    ${extractConstLine('subQty')}
    ${extractFunction('estReprise')}
    ${extractFunction('lineTotalStored')}
    ${extractFunction('orderToLines')}
    ${extractFunction('paiementsDe')}
    ${extractFunction('marketLineSummary')}
    ${extractConstLine('marcheDate')}
    ${extractFunction('caMarcheEncaisse')}
    ${extractFunction('caMarchesDuMois')}
    ${extractFunction('caEncaisseParMois')}
    ${extractFunction('macaronsDeCommande')}
    ${extractFunction('caMoisEncaisse')}
    ${extractFunction('serieMensuelleEncaisse')}
    ${extractFunction('pickBatchStatutAttendu')}
    ${extractFunction('pickBatchProgres')}
    return { serieMensuelleEncaisse, caEncaisseParMois, orderToLines,
             pickBatchStatutAttendu, pickBatchProgres };
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

console.log('\n=== TESTS — Vague 60 : le total est la somme du détail + l\'état « en cours » ===\n');

// ===========================================================================
//  PARTIE 1 — LE TOTAL EST LA SOMME DU DÉTAIL
// ===========================================================================
const cmd = (id, dateCmd, montant, paiements, parfums) => ({
  id, date: dateCmd, montant, paiement: 'Payé', paiements,
  lignes: [{ type:'coffret', taille:6, parfums: parfums || [] }]
});

const ORDERS = [
  cmd(1, '2026-05-20', 100, [{date:'2026-07-03', montant:100}], [{nom:'Vanille', qte:20}]),
  cmd(2, '2026-05-10', 200, [{date:'2026-05-15', montant:50}, {date:'2026-06-20', montant:150}], [{nom:'Chocolat', qte:40}])
];
const MARCHE = { id:9, nom:'Marché de juin', date:'2026-06-20', statut:'clos',
                 fondCaisse:50, ca:{ especes:366, cb:200, autre:0 } };   // → 516 €
const MOVES = [
  { marketId:9, parfum:'Vanille', type:'sortie', qte:150 },
  { marketId:9, parfum:'Vanille', type:'retour', qte:30  },
  { marketId:9, parfum:'Vanille', type:'perte',  qte:5   }
];   // vendu = 115

// ---------------------------------------------------------------------------
// A. L'INVARIANT — le total EST la somme des mois
// ---------------------------------------------------------------------------
{
  const S = M.serieMensuelleEncaisse(ORDERS, M.orderToLines, [MARCHE], MOVES);

  const sommeMois = S.mois.reduce((a, m) => a + S.parMois[m].ca, 0);
  eq(Math.round(sommeMois * 100) / 100, S.totaux.ca,
     'A1 · INVARIANT : le total EST exactement la somme des mois — au centime');
  eq(S.totaux.ca, 816, 'A2 · … soit 50 (mai) + 666 (juin : 150 + 516 de marché) + 100 (juillet)');

  const sommeMac = S.mois.reduce((a, m) => a + S.parMois[m].macarons, 0);
  eq(sommeMac, S.totaux.macarons, 'A3 · … et les macarons aussi : le total = la somme des mois');
  eq(S.totaux.macaronsStd, 175, 'A4 · 10 (mai) + 30 + 115 du marché (juin) + 20 (juillet) = 175');

  // La preuve par l'absurde : l'ANCIEN total (commandes seules, date de commande, montant TOTAL).
  const ancien = ORDERS.filter(o => o.paiement === 'Payé').reduce((a, o) => a + o.montant, 0);
  eq(ancien, 300, 'A5 · l\'ANCIEN « CA total » valait 300 € (commandes seules, montant total)');
  ok(ancien !== S.totaux.ca,
     'A6 · … il ne coïncidait donc PAS avec la somme des mois affichée juste en dessous (816 €)');
}

// ---------------------------------------------------------------------------
// B. L'INCERTITUDE S'AGRÈGE — un mois incomplet rend le TOTAL incomplet
// ---------------------------------------------------------------------------
// Si un seul marché a encaissé sans quantités saisies, le total de macarons est INCOMPLET.
// Le taire reviendrait à présenter un total partiel comme un total complet.
{
  const S = M.serieMensuelleEncaisse(ORDERS, M.orderToLines, [MARCHE], []);   // aucun mouvement
  eq(S.totaux.ca, 816, 'B1 · le CA total reste JUSTE : l\'argent, lui, est connu');
  eq(S.totaux.macaronsComplets, false, 'B2 · … mais le total de macarons est déclaré INCOMPLET');
  eq(S.totaux.nbMarchesNonMesures, 1, 'B3 · … avec le nombre de marchés concernés');
  eq(S.totaux.caMarcheNonMesure, 516, 'B4 · … et les euros correspondants, pour pouvoir l\'expliquer');
  eq(S.totaux.macaronsStd, 60, 'B5 · … et seuls les 60 macarons des COMMANDES sont comptés');

  // Avec les mouvements : complet, aucune alerte.
  const T = M.serieMensuelleEncaisse(ORDERS, M.orderToLines, [MARCHE], MOVES);
  eq(T.totaux.macaronsComplets, true, 'B6 · mouvements saisis → total complet');
  eq(T.totaux.nbMarchesNonMesures, 0, 'B7 · … aucune alerte');
}

// ---------------------------------------------------------------------------
// C. GARDE-FOU — l'écran ne lit plus l'ancien total
// ---------------------------------------------------------------------------
{
  ok(!/R\.global\.caTotal/.test(APP),
     'C1 · GARDE-FOU : `R.global.caTotal` (base « date de commande ») n\'est plus affiché NULLE PART');
  ok(!/R\.global\.macaronsStd/.test(APP),
     'C2 · … ni le total de macarons de l\'ancienne base');
}

// ===========================================================================
//  PARTIE 2 — L'ÉTAT « EN COURS » D'UN LOT
// ===========================================================================
const LOT = { id: 7, nom: 'Lot du mardi', statut: 'ouvert' };

// ---------------------------------------------------------------------------
// D. L'ÉTAT ATTENDU — on ne devine que le FAIT, jamais les DÉCISIONS
// ---------------------------------------------------------------------------
{
  eq(M.pickBatchStatutAttendu(LOT, []), 'ouvert',
     'D1 · lot créé, rien de prélevé → « ouvert »');
  eq(M.pickBatchStatutAttendu(LOT, [{ batchId: 7, qte: 12 }]), 'en_cours',
     'D2 · DÈS LE PREMIER article prélevé → « en cours »');
  eq(M.pickBatchStatutAttendu(LOT, [{ batchId: 99, qte: 12 }]), 'ouvert',
     'D3 · un article prélevé sur un AUTRE lot ne fait pas démarrer celui-ci');

  // 'clos' est une DÉCISION de Benjamin : elle ne se dé-décide pas toute seule.
  const clos = { id: 7, statut: 'clos' };
  eq(M.pickBatchStatutAttendu(clos, [{ batchId: 7, qte: 12 }]), 'clos',
     'D4 · un lot CLOS le reste, même s\'il a des articles — une clôture est une DÉCISION, pas un fait');
  eq(M.pickBatchStatutAttendu(clos, []), 'clos',
     'D5 · … et même vidé de ses articles, il reste clos');

  // Robustesse.
  eq(M.pickBatchStatutAttendu(null, []), 'ouvert', 'D6 · lot absent → « ouvert » (pas de plantage)');
  eq(M.pickBatchStatutAttendu(LOT, null), 'ouvert', 'D7 · articles absents → « ouvert »');
  eq(M.pickBatchStatutAttendu(LOT, [{ qte: 5 }]), 'ouvert',
     'D8 · un article SANS batchId n\'appartient à aucun lot');
}

// ---------------------------------------------------------------------------
// E. LA PROGRESSION — ce qui est réellement prélevé
// ---------------------------------------------------------------------------
{
  const items = [
    { batchId: 7,  qte: 12 },
    { batchId: 7,  qte: 8  },
    { batchId: 99, qte: 50 }   // un autre lot : ne doit pas fuir
  ];
  const P = M.pickBatchProgres(LOT, items);
  eq(P.nbItems, 2, 'E1 · deux articles prélevés sur ce lot');
  eq(P.qte, 20, 'E2 · soit 20 macarons (12 + 8) — le lot voisin ne fuit pas');

  eq(M.pickBatchProgres(LOT, []).qte, 0, 'E3 · rien de prélevé → 0');
  eq(M.pickBatchProgres(null, items).qte, 0, 'E4 · lot absent → 0, sans planter');
}

// ---------------------------------------------------------------------------
// F. LA RÉCONCILIATION — un statut stocké ne doit pas pouvoir MENTIR
// ---------------------------------------------------------------------------
// C'EST LE CŒUR DU CÂBLAGE. Benjamin a choisi un statut STOCKÉ (explicite, interrogeable).
// Le danger : écrit une fois puis jamais revérifié, il finit par contredire la réalité — et un
// statut FAUX est PIRE qu'un statut absent, parce qu'on lui fait confiance.
// La réconciliation le recale sur le FAIT vérifiable, à chaque affichage.
{
  // Cas 1 : un lot marqué « en cours » mais vidé de ses articles (annulation, import, ancien lot).
  const menteur = { id: 7, statut: 'en_cours' };
  eq(M.pickBatchStatutAttendu(menteur, []), 'ouvert',
     'F1 · un lot « en cours » SANS aucun article → l\'état attendu est « ouvert » : le statut MENTAIT');

  // Cas 2 : un lot resté « ouvert » alors qu'il a déjà des articles (lot créé avant la v1339).
  const enRetard = { id: 7, statut: 'ouvert' };
  eq(M.pickBatchStatutAttendu(enRetard, [{ batchId: 7, qte: 3 }]), 'en_cours',
     'F2 · un lot « ouvert » AVEC des articles → il est en réalité « en cours » : les anciens lots se recalent seuls');

  // Cas 3 : cohérent → aucune écriture (la réconciliation doit être IDEMPOTENTE).
  const juste = { id: 7, statut: 'en_cours' };
  eq(M.pickBatchStatutAttendu(juste, [{ batchId: 7, qte: 3 }]), 'en_cours',
     'F3 · statut cohérent → rien à changer (la réconciliation n\'écrit que si ça a divergé)');
}

// ---------------------------------------------------------------------------
// G. LE CÂBLAGE EST RÉEL — 'en_cours' est enfin ÉCRIT
// ---------------------------------------------------------------------------
// La vague 59 avait supprimé cette branche parce que le statut n'était JAMAIS écrit. Elle ne peut
// revenir que si elle dit la vérité. On vérifie donc les deux points d'écriture.
{
  ok(/statut:\s*'en_cours'/.test(APP),
     'G1 · le statut « en_cours » est désormais ÉCRIT en base (il ne l\'était JAMAIS avant la v1339)');
  ok(/pickBatchSyncStatut/.test(APP),
     'G2 · … et une réconciliation existe, pour qu\'il ne puisse pas mentir');

  // L'écriture au prélèvement doit se faire à UN SEUL endroit : deux sources d'écriture finissent
  // toujours par diverger (leçon de toute cette série).
  const nbEcritures = (APP.match(/batches\.update\([^)]*statut:\s*'en_cours'/g) || []).length;
  ok(nbEcritures <= 1,
     `G3 · le statut « en cours » n'est écrit qu'à UN SEUL endroit (mesuré : ${nbEcritures}) — deux sources d'écriture divergent toujours`);

  // Et le tag d'affichage teste bien ce statut (la branche est vivante).
  ok(/statut==='en_cours'/.test(APP),
     'G4 · le tag « en cours » teste ce statut — la branche morte de la v1338 est ressuscitée, et VRAIE cette fois');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
