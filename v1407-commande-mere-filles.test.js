/* ============================================================
   TESTS — v1407 : COMMANDES MÈRE / FILLES (paiement groupé, retraits échelonnés)
   ------------------------------------------------------------
   LE BESOIN DE BEN : un client paie une grosse commande EN UNE FOIS, puis vient
   la chercher en PLUSIEURS FOIS, à des dates inconnues d'avance. Chaque venue
   doit pouvoir être saisie comme une commande normale (on ne connaît pas les
   dates à l'avance), puis rattachée après coup à la commande « mère » qui porte
   le paiement — à la manière des batches qu'on rattache à une commande.

   LE RISQUE CENTRAL : le DOUBLE COMPTAGE.
   Si une commande fille compte son propre montant dans la compta, le CA est
   gonflé. Si elle compte son montant en « reste à encaisser », l'app réclame de
   l'argent déjà perçu. Les deux erreurs sont aussi graves l'une que l'autre.

   CE QUE CES TESTS GÈLENT :
     1. commandesFillesDe : retrouve les filles d'une mère, jamais la mère.
     2. reliquatCommandeMere : total − somme des filles = ce qu'il reste à retirer.
     3. caEncaisseParMois : une fille ne gonfle NI le CA encaissé NI l'en-attente.
     4. orderPayStatus : une fille est « Payé » (pas « En attente »).
     5. alerteRattachementFille : avertit si la fille a déjà des paiements, SANS bloquer.
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1407 : commandes mère / filles ===\n');

const G = global;
G.money2 = n => Math.round((+n||0)*100)/100;

// ── 1. commandesFillesDe ────────────────────────────────────────────────────
{
  new Function('G', `with(G){ ${extractFunction('commandesFillesDe')}\n G.commandesFillesDe = commandesFillesDe; }`)(G);
  const orders = [
    { id: 1, montant: 300 },                        // la mère
    { id: 2, montant: 100, commandeMereId: 1 },     // fille
    { id: 3, montant: 80,  commandeMereId: 1 },     // fille
    { id: 4, montant: 50 },                         // commande indépendante
  ];
  const filles = G.commandesFillesDe(1, orders);
  ok(filles.length === 2, '1 · les 2 filles de la mère #1 sont retrouvées');
  ok(!filles.some(f => f.id === 1), '2 · la mère ne se compte JAMAIS comme sa propre fille');
  ok(!filles.some(f => f.id === 4), '3 · une commande indépendante n\'est pas une fille');
  ok(G.commandesFillesDe(null, orders).length === 0, '4 · id nul → aucune fille (robuste)');
  ok(G.commandesFillesDe(1, []).length === 0, '5 · liste vide → aucune fille (robuste)');
}

// ── 2. reliquatCommandeMere ─────────────────────────────────────────────────
{
  new Function('G', `with(G){ const commandesFillesDe=G.commandesFillesDe; ${extractFunction('reliquatCommandeMere')}\n G.reliquatCommandeMere = reliquatCommandeMere; }`)(G);
  const mere = { id: 1, montant: 300 };
  const orders = [
    mere,
    { id: 2, montant: 100, commandeMereId: 1 },
    { id: 3, montant: 80,  commandeMereId: 1 },
  ];
  const r = G.reliquatCommandeMere(mere, orders);
  ok(r.montantTotal === 300, '6 · montant total de la mère conservé');
  ok(r.montantCouvertParFilles === 180, '7 · somme des filles = 100 + 80 = 180');
  ok(r.reste === 120, '8 · reste à retirer = 300 − 180 = 120');
  ok(r.nbFilles === 2, '9 · nombre de filles correct');
  ok(r.entierementRetiree === false, '10 · pas encore entièrement retirée');

  // Cas soldé : les filles couvrent tout
  const orders2 = [mere, { id: 5, montant: 300, commandeMereId: 1 }];
  const r2 = G.reliquatCommandeMere(mere, orders2);
  ok(r2.reste === 0 && r2.entierementRetiree === true, '11 · filles couvrant le total → entièrement retirée');

  // Garde-fou : jamais de reste NÉGATIF, même si les filles dépassent (erreur de saisie)
  const orders3 = [mere, { id: 6, montant: 500, commandeMereId: 1 }];
  ok(G.reliquatCommandeMere(mere, orders3).reste === 0, '12 · filles > total → reste plafonné à 0, jamais négatif');

  // Mère sans fille : tout reste à retirer
  ok(G.reliquatCommandeMere(mere, [mere]).reste === 300, '13 · mère sans fille → tout reste à retirer');
}

// ── 3. caEncaisseParMois — LE TEST CRITIQUE (double comptage) ───────────────
{
  G.ymKey = d => String(d||'').slice(0,7);
  G.monthKey = d => String(d||'').slice(0,7);
  G.caMarcheEncaisse = () => 0;
  G.marcheDate = () => '';
  new Function('G', `with(G){ ${extractFunction('paiementsDe')}\n G.paiementsDe = paiementsDe; }`)(G);
  new Function('G', `with(G){ const paiementsDe=G.paiementsDe, ymKey=G.ymKey, monthKey=G.monthKey,
    caMarcheEncaisse=G.caMarcheEncaisse, marcheDate=G.marcheDate, money2=G.money2;
    ${extractFunction('caEncaisseParMois')}\n G.caEncaisseParMois = caEncaisseParMois; }`)(G);

  // La mère : 300 € encaissés en une fois le 5 mars.
  // Deux filles de 100 € et 80 €, SANS paiement propre (leur argent est déjà à la mère).
  const orders = [
    { id: 1, montant: 300, date: '2026-03-05', paiements: [{date:'2026-03-05', montant:300, moyen:'Espèces'}] },
    { id: 2, montant: 100, date: '2026-04-10', commandeMereId: 1, paiements: [] },
    { id: 3, montant: 80,  date: '2026-05-20', commandeMereId: 1, paiements: [] },
  ];
  const ca = G.caEncaisseParMois(orders, []);

  ok(ca.parMois['2026-03'] === 300, '14 · les 300 € comptent UNE FOIS, au mois du paiement réel (mars)');
  ok(ca.parMois['2026-04'] === undefined, '15 · avril (retrait fille) n\'ajoute AUCUN euro — pas de double comptage');
  ok(ca.parMois['2026-05'] === undefined, '16 · mai (retrait fille) n\'ajoute AUCUN euro non plus');
  ok(ca.enAttente === 0, '17 · CRITIQUE : les filles ne gonflent PAS le « reste à encaisser » (déjà payé)');

  // Contre-épreuve : SANS le rattachement, ces mêmes commandes réclameraient de l'argent.
  const ordersSansLien = orders.map(o => { const c = {...o}; delete c.commandeMereId; return c; });
  const caFaux = G.caEncaisseParMois(ordersSansLien, []);
  ok(caFaux.enAttente === 180, '18 · contre-épreuve : sans rattachement, l\'app réclamerait 180 € déjà perçus');
}

// ── 4. orderPayStatus — une fille est PAYÉE, pas « En attente » ─────────────
{
  G.orderPaid = o => (o.paiements||[]).reduce((s,p)=>s+(+p.montant||0),0);
  new Function('G', `with(G){ const orderPaid=G.orderPaid; ${extractFunction('orderPayStatus')}\n G.orderPayStatus = orderPayStatus; }`)(G);

  const fille = { id: 2, montant: 100, commandeMereId: 1, paiements: [] };
  ok(G.orderPayStatus(fille) === 'Payé',
     '19 · une fille affiche « Payé » (son argent est sur la mère) — pas de bouton « Solder » trompeur');

  const indep = { id: 4, montant: 50, paiements: [] };
  ok(G.orderPayStatus(indep) === 'En attente', '20 · une commande indépendante non payée reste « En attente »');

  const payee = { id: 5, montant: 50, paiements: [{montant:50}] };
  ok(G.orderPayStatus(payee) === 'Payé', '21 · comportement normal inchangé pour une commande payée');

  const partielle = { id: 6, montant: 100, paiements: [{montant:40}] };
  ok(G.orderPayStatus(partielle) === 'Partiel', '22 · comportement normal inchangé pour un paiement partiel');
}

// ── 5. alerteRattachementFille — avertit SANS bloquer ──────────────────────
{
  G.qty = n => String(n);
  G.esc = s => String(s||'');
  G.fmtDate = d => String(d||'');
  new Function('G', `with(G){ const paiementsDe=G.paiementsDe, money2=G.money2, qty=G.qty, esc=G.esc, fmtDate=G.fmtDate;
    ${extractFunction('alerteRattachementFille')}\n G.alerteRattachementFille = alerteRattachementFille; }`)(G);

  ok(G.alerteRattachementFille({ paiements: [] }) === null,
     '23 · cas normal (fille sans paiement) → aucune alerte');

  const alerte = G.alerteRattachementFille({ paiements: [{date:'2026-03-05', montant:50, moyen:'Espèces'}] });
  ok(alerte !== null, '24 · fille AVEC paiement déjà enregistré → alerte levée');
  ok(alerte.total === 50, '25 · le total des paiements en conflit est calculé');
  ok(/double encaissement/.test(alerte.message),
     '26 · le message avertit explicitement du risque de double encaissement');
  ok(/50/.test(alerte.message) && /Espèces/.test(alerte.message),
     '27 · le message DÉTAILLE les paiements concernés (montant + moyen), comme demandé par Ben');
}

console.log(`\n=== v1407 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
