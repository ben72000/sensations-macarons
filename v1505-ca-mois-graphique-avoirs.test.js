'use strict';
// v1505 — SUITE DE LA v1504 : deux autres écrans ignoraient les avoirs émis, avec le RISQUE
// D'EN RECRÉER UN TROISIÈME (le graphique et la carte « CA du mois » sont DEUX calculs
// indépendants qui doivent concorder mois par mois — cf. le commentaire au-dessus de CA_GRANS et
// la suite v1444, qui le vérifie explicitement).
//
// `caDuMois` (carte mensuelle) et `_caLignesToutes` (source du graphique zoomable ET du total
// encaissé cumulé de l'accueil) sont des vues en ENCAISSEMENTS RÉELS, pas en facturé — base
// différente de celle corrigée en v1504. La règle qui s'y applique est donc différente elle
// aussi : seul un avoir de REMBOURSEMENT (argent réellement rendu) doit les réduire, au mois où
// IL est émis — jamais une annulation, puisqu'aucun paiement n'a jamais existé pour elle. C'est
// exactement le traitement que la comptabilité applique déjà à `totalEncaisse` (v1499).
//
// PIÈGE ÉVITÉ EN COURS DE ROUTE : réduire le TOTAL de `caDuMois` sans ajouter la ligne
// correspondante dans le détail (`caMonthDetail`) aurait fait apparaître un écart entre la somme
// des lignes affichées et le total du bas — exactement l'incohérence que ce correctif règle par
// ailleurs. Une ligne « Avoir émis ce mois » explicite a donc été ajoutée au popup.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const money2 = n => Math.round((+n||0)*100)/100;

function makeHarness(fnName, orders, markets, avoirs){
  const src = extractFunction(fnName);
  const db = {
    orders: { toArray: async () => orders },
    clients: { toArray: async () => [] },
    markets: { toArray: async () => markets },
    marketMoves: { toArray: async () => [] },
    documents: { where: () => ({ equals: () => ({ toArray: async () => avoirs }) }) }
  };
  const fn = new Function('db', 'money2', `
    function monthKey(s){ return String(s||'').slice(0,7); }
    function ymKey(s){ return String(s||'').slice(0,7); }
    function today(){ return '2026-09-20'; }
    function estReprise(o){ return !!(o && o.histo); }
    function paiementsDe(o){ return o.paiements||[]; }
    function orderMacaronsVendus(){ return 0; }
    function orderMontantRecalcule(){ return 0; }
    function marketNetCA(k){ return +k.montant||0; }
    function marketLineSummary(){ return []; }
    function swallow(){}
    ${src}
    return ${fnName};
  `);
  return fn(db, money2);
}

async function run(){
  // ---- A. [LE DÉFAUT CORRIGÉ] caDuMois : un avoir de remboursement émis ce mois-ci réduit le total ----
  {
    const orders = [{ id: 1, date: '2026-09-05', montant: 200, paiements: [{ date: '2026-09-05', montant: 200 }] }];
    const avoirs = [{ type: 'avoir', statut: 'emis', nature: 'remboursement', orderId: 1, montant: 60, date: '2026-09-15' }];
    const caDuMois = makeHarness('caDuMois', orders, [], avoirs);
    const r = await caDuMois('2026-09');
    check('A. [LE DÉFAUT CORRIGÉ] le total du mois déduit bien l\'avoir de remboursement (200 − 60 = 140)',
      r.total === 140);
    check('A. totalCmd (brut) reste inchangé — utile pour vérifier la ligne d\'avoir séparément',
      r.totalCmd === 200);
    check('A. la ligne d\'avoir est exposée pour l\'affichage (lignesAvoirs), pas seulement le total',
      Array.isArray(r.lignesAvoirs) && r.lignesAvoirs.length === 1 && r.lignesAvoirs[0].montant === 60);
  }

  // ---- B. Une ANNULATION ne touche jamais caDuMois (aucun paiement n'a jamais existé) ----
  {
    const orders = [{ id: 2, date: '2026-09-05', montant: 300, paiements: [{ date: '2026-09-05', montant: 300 }] }];
    const avoirs = [{ type: 'avoir', statut: 'emis', nature: 'annulation', orderId: 2, montant: 300, date: '2026-09-16' }];
    const caDuMois = makeHarness('caDuMois', orders, [], avoirs);
    const r = await caDuMois('2026-09');
    check('B. une annulation ne réduit pas le total encaissé du mois', r.total === 300);
    check('B. …ni ne crée de ligne d\'avoir dans le détail', r.lignesAvoirs.length === 0);
  }

  // ---- C. L'avoir compte au mois où IL est émis, pas au mois du paiement d'origine ----
  {
    const orders = [{ id: 3, date: '2026-08-01', montant: 100, paiements: [{ date: '2026-08-01', montant: 100 }] }];
    const avoirs = [{ type: 'avoir', statut: 'emis', nature: 'remboursement', orderId: 3, montant: 40, date: '2026-09-10' }];
    const caDuMois = makeHarness('caDuMois', orders, [], avoirs);
    const rAout = await caDuMois('2026-08');
    const rSept = await caDuMois('2026-09');
    check('C. le mois du paiement d\'origine (août) reste un fait historique inchangé (100)', rAout.total === 100);
    check('C. le mois d\'émission de l\'avoir (septembre) porte la déduction (0 − 40 devient 0, rien à réduire ce mois-là en positif)',
      rSept.total === -40);
  }

  // ---- D. Non-régression : sans avoir, comportement identique à avant ----
  {
    const orders = [{ id: 4, date: '2026-09-05', montant: 80, paiements: [{ date: '2026-09-05', montant: 80 }] }];
    const caDuMois = makeHarness('caDuMois', orders, [], []);
    const r = await caDuMois('2026-09');
    check('D. sans avoir, le total reste la somme brute des encaissements', r.total === 80);
  }

  // ---- E. Même règle appliquée à _caLignesToutes (source du graphique ET du cumulé accueil) ----
  {
    const orders = [{ id: 5, date: '2026-09-05', montant: 150, paiements: [{ date: '2026-09-05', montant: 150 }] }];
    const avoirs = [{ type: 'avoir', statut: 'emis', nature: 'remboursement', orderId: 5, montant: 50, date: '2026-09-12' }];
    const lignesFn = makeHarness('_caLignesToutes', orders, [], avoirs);
    const lignes = await lignesFn();
    const total = money2(lignes.reduce((s,l)=>s+(+l.montant||0), 0));
    check('E. [ÉVITE LE « TROISIÈME CHIFFRE »] _caLignesToutes intègre l\'avoir en ligne négative',
      lignes.some(l => l.type === 'avoir' && l.montant === -50));
    check('E. son total agrégé concorde avec celui de caDuMois pour le même mois (150 − 50 = 100)',
      total === 100);
  }
  {
    // Une annulation ne doit générer AUCUNE ligne dans _caLignesToutes non plus.
    const orders = [{ id: 6, date: '2026-09-05', montant: 90, paiements: [{ date: '2026-09-05', montant: 90 }] }];
    const avoirs = [{ type: 'avoir', statut: 'emis', nature: 'annulation', orderId: 6, montant: 90, date: '2026-09-12' }];
    const lignesFn = makeHarness('_caLignesToutes', orders, [], avoirs);
    const lignes = await lignesFn();
    check('E. non-régression : une annulation ne crée toujours aucune ligne dans _caLignesToutes',
      !lignes.some(l => l.type === 'avoir'));
  }

  // ---- F. Câblage réel : le popup affiche la ligne d'avoir (sinon somme des lignes ≠ total) ----
  {
    const srcDetail = extractFunction('caMonthDetail');
    check('F. caMonthDetail construit une section « Avoirs émis ce mois »',
      /Avoirs émis ce mois/.test(srcDetail));
    check('F. …insérée AVANT le total, à l\'intérieur du même popup (visible sans dérouler quoi que ce soit)',
      srcDetail.indexOf('rowsAvoirs') > -1 && srcDetail.indexOf('rowsAvoirs') < srcDetail.indexOf('Total encaissé'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
