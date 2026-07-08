/* ============================================================
   TESTS DE CARACTÉRISATION — Famille « commande »
   ------------------------------------------------------------
   Fige le comportement des helpers qui lisent une commande et en
   déduisent paiements, montant encaissé, solde, statut, et nature
   de reprise (migration d'historique). Ces helpers alimentent TOUTE
   la comptabilité (computeAccounting, bilan mensuel, créances).

   Cibles : paiementsDe, orderPaid, orderBalance, orderPayStatus,
            estReprise (+ sa dépendance orderToLines).

   Ne modifie jamais app.js : on extrait le source réel et on
   l'évalue en isolation avec des données de commande simulées.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// --- Reconstruction du module en isolation ---------------------------------
function buildModule(){
  const money2 = extractConstLine('money2');
  const EVENT_MIN = extractConstLine('EVENT_MIN');
  const paiementsDe   = extractFunction('paiementsDe');
  const orderPaid     = extractFunction('orderPaid');
  const orderBalance  = extractFunction('orderBalance');
  const orderPayStatus= extractFunction('orderPayStatus');
  const orderToLines  = extractFunction('orderToLines');
  const estReprise    = extractFunction('estReprise');

  // console.warn est utilisé par paiementsDe (legacy) : on le neutralise pour ne pas
  // polluer la sortie des tests, tout en gardant le comportement identique.
  const code = `
    const console = { warn: () => {} };
    ${money2}
    ${EVENT_MIN}
    ${paiementsDe}
    ${orderPaid}
    ${orderBalance}
    ${orderPayStatus}
    ${orderToLines}
    ${estReprise}
    ({ paiementsDe, orderPaid, orderBalance, orderPayStatus, orderToLines, estReprise });
  `;
  return eval(code);
}
const M = buildModule();

// --- Micro-framework --------------------------------------------------------
let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// ============================================================================
// 1) paiementsDe — registre multi-paiements
// ============================================================================
// Deux paiements de moyens différents : le moyen hérité o.reglement NE doit PAS
// être appliqué (sinon le rapport par mode de paiement serait faussé) → '—'. [A10]
const cmdMulti = { id:1, date:'2026-05-10', montant:100,
  paiements:[ {date:'2026-05-10', montant:30, moyen:'Virement'},
              {date:'2026-06-01', montant:70} ],  // 2e sans moyen
  reglement:'Carte' };
eq(M.paiementsDe(cmdMulti),
   [ {date:'2026-05-10', montant:30, moyen:'Virement'},
     {date:'2026-06-01', montant:70, moyen:'—'} ],
   'paiementsDe : multi-paiements → 2e sans moyen reste « — » (pas d\'héritage o.reglement) [A10]');

// Paiement UNIQUE sans moyen propre : là, o.reglement est hérité. [A10]
const cmdUniqueSansMoyen = { id:2, date:'2026-05-10', montant:50,
  paiements:[ {date:'2026-05-12', montant:50} ], reglement:'Espèces' };
eq(M.paiementsDe(cmdUniqueSansMoyen),
   [ {date:'2026-05-12', montant:50, moyen:'Espèces'} ],
   'paiementsDe : paiement unique sans moyen → hérite o.reglement [A10]');

// Paiement sans date : hérite la date de commande.
const cmdSansDatePaie = { id:3, date:'2026-05-10', montant:20,
  paiements:[ {montant:20, moyen:'Carte'} ] };
eq(M.paiementsDe(cmdSansDatePaie),
   [ {date:'2026-05-10', montant:20, moyen:'Carte'} ],
   'paiementsDe : paiement sans date → hérite o.date');

// Paiements à montant 0 ou nul : ignorés.
const cmdAvecZero = { id:4, date:'2026-05-10', montant:40,
  paiements:[ {date:'2026-05-10', montant:40, moyen:'Carte'}, {date:'2026-05-11', montant:0, moyen:'Carte'} ] };
eq(M.paiementsDe(cmdAvecZero).length, 1, 'paiementsDe : paiement de montant 0 ignoré');

// ============================================================================
// 2) paiementsDe — legacy « Payé » sans registre
// ============================================================================
const cmdLegacyPaye = { id:5, date:'2026-04-01', montant:80, paiement:'Payé',
  datePaiement:'2026-04-05', reglement:'Virement' };
eq(M.paiementsDe(cmdLegacyPaye),
   [ {date:'2026-04-05', montant:80, moyen:'Virement'} ],
   'paiementsDe : legacy « Payé » → 1 paiement à datePaiement [A7]');

const cmdLegacyPayeSansDate = { id:6, date:'2026-04-01', montant:80, paiement:'Payé' };
eq(M.paiementsDe(cmdLegacyPayeSansDate),
   [ {date:'2026-04-01', montant:80, moyen:'—'} ],
   'paiementsDe : legacy « Payé » sans datePaiement → imputé à o.date, moyen « — » [A7]');

// Commande non payée, sans registre : aucun paiement.
eq(M.paiementsDe({ id:7, date:'2026-04-01', montant:80 }), [], 'paiementsDe : commande sans paiement → []');
eq(M.paiementsDe(null), [], 'paiementsDe(null) → []');

// ============================================================================
// 3) orderPaid / orderBalance / orderPayStatus
// ============================================================================
eq(M.orderPaid(cmdMulti), 100, 'orderPaid : somme des paiements du registre');
eq(M.orderBalance(cmdMulti), 0, 'orderBalance : montant − payé = 0 (soldée)');
eq(M.orderPayStatus(cmdMulti), 'Payé', 'orderPayStatus : soldée → « Payé »');

const cmdPartielle = { id:8, date:'2026-05-01', montant:100, paiements:[ {date:'2026-05-01', montant:40, moyen:'Carte'} ] };
eq(M.orderPaid(cmdPartielle), 40, 'orderPaid : partiel = 40');
eq(M.orderBalance(cmdPartielle), 60, 'orderBalance : reste 60');
eq(M.orderPayStatus(cmdPartielle), 'Partiel', 'orderPayStatus : encaissé partiel → « Partiel »');

const cmdEnAttente = { id:9, date:'2026-05-01', montant:100, paiements:[] };
eq(M.orderPaid(cmdEnAttente), 0, 'orderPaid : rien encaissé = 0');
eq(M.orderPayStatus(cmdEnAttente), 'En attente', 'orderPayStatus : rien encaissé → « En attente »');

// Legacy « Payé » sans registre : orderPaid = montant (rétro-compat).
eq(M.orderPaid(cmdLegacyPaye), 80, 'orderPaid : legacy « Payé » sans registre = montant');
eq(M.orderPayStatus(cmdLegacyPaye), 'Payé', 'orderPayStatus : legacy « Payé » → « Payé »');

// Tolérance d'arrondi : payé à 1e-9 près compte comme soldé.
const cmdArrondi = { id:10, date:'2026-05-01', montant:33.33, paiements:[ {date:'2026-05-01', montant:33.33, moyen:'Carte'} ] };
eq(M.orderPayStatus(cmdArrondi), 'Payé', 'orderPayStatus : soldée au centime → « Payé »');

// ============================================================================
// 4) estReprise — migration d'historique exclue du CA
// ============================================================================
eq(M.estReprise({ id:11, histo:true, montant:500, date:'2024-01-01' }), true,
   'estReprise : o.histo === true → true');
eq(M.estReprise({ id:12, montant:100, date:'2026-05-01',
   lignes:[ {type:'coffret', taille:6, parfums:[{nom:'Vanille', qte:6}]} ] }), false,
   'estReprise : commande normale (ligne coffret) → false');
eq(M.estReprise({ id:13, montant:100, date:'2026-05-01',
   lignes:[ {type:'histo', montant:100} ] }), true,
   'estReprise : ligne de type « histo » → true');
eq(M.estReprise(null), false, 'estReprise(null) → false');
eq(M.estReprise({ id:14, montant:100, date:'2026-05-01' }), false,
   'estReprise : commande sans lignes ni histo → false');

// ============================================================================
// 5) orderToLines — normalisation des formats de commande
// ============================================================================
// Format moderne : lignes explicites (copie profonde).
const lignesModernes = [ {type:'coffret', taille:16, parfums:[{nom:'Café', qte:16}]} ];
eq(M.orderToLines({ lignes: lignesModernes }), lignesModernes,
   'orderToLines : format lignes modernes → copie fidèle');

// Ancien format coffret (o.taille + o.parfums).
eq(M.orderToLines({ type:'coffret', taille:6, parfums:[{nom:'Vanille', qte:6}, {nom:'Vide', qte:0}] }),
   [ {type:'coffret', taille:6, parfums:[{nom:'Vanille', qte:6}]} ],
   'orderToLines : ancien coffret → parfums à qte>0 seulement');

// Ancien format « grand ».
eq(M.orderToLines({ type:'grand', tarif:'pro', bigItems:[{nom:'Number cake', qte:1}] }),
   [ {type:'grand', tarif:'pro', items:[{nom:'Number cake', qte:1}]} ],
   'orderToLines : ancien « grand » → items');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Famille « commande » ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }
