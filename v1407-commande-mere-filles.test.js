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
const { extractFunction, extractConstLine } = require('./_extract');

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

// ── 6. AFFICHAGE (v1407b) — les corrections après retour de Ben ────────────
// Ben : « la commande fille aucune info concernant la date de paiement ni le moyen […]
// et la commande mère ne donne aucune info sur les commandes filles reliées. »
{
  const APP = require('fs').readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');

  // BUG CORRIGÉ : le bloc mère lisait un champ 'f_montant' QUI N'EXISTE PAS (le vrai id est
  // 'f_mt') → le reliquat affichait toujours 0 €. Ce test empêche la régression.
  ok(!/getElementById\('f_montant'\)/.test(APP),
     '28 · le champ inexistant f_montant n\'est plus lu (le vrai id est f_mt)');
  ok(/cmdRenderMereBlock[\s\S]{0,900}getElementById\('f_mt'\)/.test(APP),
     '29 · le bloc mère lit bien f_mt pour calculer le reliquat');

  // La FILLE doit remonter le paiement de la mère : date + moyen, pas juste « Payé ».
  ok(/function cmdRenderInfoMere/.test(APP),
     '30 · une fonction dédiée affiche l\'origine du paiement sur une sous-commande');
  ok(/Déjà réglé sur la commande mère/.test(APP),
     '31 · bandeau explicite « Déjà réglé sur la commande mère #X » sur la fille');
  ok(/Payé \$\{qty\(p\.montant\)\} € en <b>\$\{esc\(p\.moyen\|\|'—'\)\}<\/b> le <b>\$\{fmtDate\(p\.date\)\}/.test(APP),
     '32 · le bandeau affiche montant + MOYEN + DATE (« payé en espèces le JJ/MM/AAAA »)');

  // La vue DÉTAIL (lecture seule) doit aussi remonter l'info, pas seulement le formulaire.
  ok(/_mereDeCetteCmd/.test(APP) && /Réglé sur la commande mère/.test(APP),
     '33 · la vue Détail commande remonte aussi le paiement de la mère');
  ok(/_reliquatSiMere/.test(APP) && /sous-commande\$\{_fillesDeCetteCmd\.length>1\?'s':''\} rattachée/.test(APP),
     '34 · la vue Détail d\'une MÈRE liste ses sous-commandes et son reliquat');

  // Cas limite signalé : une fille qui porte AUSSI ses propres paiements doit être signalée
  // dans la vue détail (pas seulement au moment du rattachement).
  ok(/porte AUSSI ses propres paiements/.test(APP),
     '35 · une fille avec ses propres paiements est signalée en rouge dans la vue détail');
}

// ── 7. RECHERCHE INTELLIGENTE + ÉLIGIBILITÉ (v1409) ────────────────────────
// Retour de Ben : « le sélecteur est très peu pratique […] scroll infini » et surtout
// « impossible de rattacher plusieurs commandes filles à une seule commande mère car la
// commande cible est introuvable ». Règle dictée : « tant que le montant total n'est pas
// atteint, cette même commande mère doit rester disponible ».
{
  new Function('G', `with(G){ ${extractFunction('_normRech')}\n G._normRech = _normRech; }`)(G);
  new Function('G', `with(G){ ${extractConstLine('MOIS_FR')}\n G.MOIS_FR = MOIS_FR; }`)(G);
  new Function('G', `with(G){ const _normRech=G._normRech, MOIS_FR=G.MOIS_FR; ${extractFunction('parseRechercheMere')}\n G.parseRechercheMere = parseRechercheMere; }`)(G);
  new Function('G', `with(G){ const reliquatCommandeMere=G.reliquatCommandeMere; ${extractFunction('commandeMereEligible')}\n G.commandeMereEligible = commandeMereEligible; }`)(G);
  new Function('G', `with(G){ const parseRechercheMere=G.parseRechercheMere, commandeMereEligible=G.commandeMereEligible, _normRech=G._normRech;
    ${extractFunction('filtrerCommandesMere')}\n G.filtrerCommandesMere = filtrerCommandesMere; }`)(G);

  // -- parsing de la saisie libre --
  const p1 = G.parseRechercheMere('avril 2026 David Siempé');
  ok(p1.mois === 4 && p1.annee === 2026, '36 · « avril 2026 » → mois 4, année 2026');
  ok(p1.texte === 'david siempe', '37 · le reste devient la recherche par nom (accents neutralisés)');

  const p2 = G.parseRechercheMere('David Siempé 04/2026');
  ok(p2.mois === 4 && p2.annee === 2026 && p2.texte === 'david siempe',
     '38 · l\'ORDRE DES MOTS n\'importe pas, et 04/2026 est compris');

  ok(G.parseRechercheMere('siempe').mois === null, '39 · nom seul → aucun filtre de date');
  ok(G.parseRechercheMere('2026').texte === '', '40 · année seule → aucun filtre de nom');

  // -- LE BUG CORRIGÉ : une mère reste éligible tant que son montant n'est pas épuisé --
  const clients = [{ id: 9, nom: 'David Siempé' }, { id: 10, nom: 'Autre Client' }];
  const mere = { id: 1, montant: 300, date: '2026-04-12', clientId: 9 };
  const ordersUneFille = [mere, { id: 2, montant: 100, date: '2026-05-02', clientId: 9, commandeMereId: 1 }];

  ok(G.commandeMereEligible(mere, ordersUneFille, 2) === true,
     '41 · RÉGRESSION v1408 CORRIGÉE : une mère ayant DÉJÀ une fille reste éligible');
  ok(G.filtrerCommandesMere('siempe', ordersUneFille, clients, 2).length === 1,
     '42 · elle est bien retrouvée par la recherche → 2e, 3e fille rattachables');

  // Épuisée : les filles couvrent tout → disparaît (règle de Ben)
  const ordersSoldee = [mere, { id: 3, montant: 300, date: '2026-05-02', commandeMereId: 1 }];
  ok(G.commandeMereEligible(mere, ordersSoldee, 3) === false,
     '43 · montant entièrement retiré → la mère n\'est plus proposée');

  // -- garde-fous d'éligibilité --
  ok(G.commandeMereEligible(mere, [mere], 1) === false, '44 · une commande ne peut pas être sa propre mère');
  const fille = { id: 4, montant: 50, commandeMereId: 1 };
  ok(G.commandeMereEligible(fille, [mere, fille], 9) === false,
     '45 · une fille ne peut pas devenir mère (pas de chaîne mère→fille→petite-fille)');
  ok(G.commandeMereEligible({ id: 5, montant: 100, histo: true }, [], 9) === false,
     '46 · une commande archivée n\'est jamais proposée');

  // -- filtrage combiné nom + date --
  const orders = [
    mere,                                                             // Siempé, avril 2026
    { id: 6, montant: 200, date: '2026-04-20', clientId: 10 },        // Autre Client, avril 2026
    { id: 7, montant: 150, date: '2026-11-03', clientId: 9 },         // Siempé, novembre 2026
  ];
  ok(G.filtrerCommandesMere('avril 2026 David Siempé', orders, clients, 99).length === 1,
     '47 · nom + mois + année : un seul résultat, l\'homonyme de date et le doublon de nom sont écartés');
  ok(G.filtrerCommandesMere('siempe', orders, clients, 99).length === 2,
     '48 · nom seul : les 2 commandes de ce client, quelle que soit la date');
  ok(G.filtrerCommandesMere('avril', orders, clients, 99).length === 2,
     '49 · mois seul : les 2 commandes d\'avril, quel que soit le client');

  // -- plafond de résultats : plus de scroll infini --
  const beaucoup = Array.from({length: 40}, (_,i)=>({ id: 100+i, montant: 50, date: '2026-04-01', clientId: 9 }));
  ok(G.filtrerCommandesMere('siempe', beaucoup, clients, 99, 12).length === 12,
     '50 · résultats plafonnés (12) — fini le scroll infini sur tout l\'historique');

  // -- tri : le plus récent en premier --
  const tri = G.filtrerCommandesMere('siempe', orders, clients, 99);
  ok(tri[0].date === '2026-11-03', '51 · résultats triés du plus récent au plus ancien');
}

console.log(`\n=== v1407 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
