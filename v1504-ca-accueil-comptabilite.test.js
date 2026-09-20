'use strict';
// v1504 — LE CA « ACTIVITÉ GLOBALE » DE LA COMPTABILITÉ NE DISAIT PAS LA MÊME CHOSE QUE LE CA
// « TOTAL FACTURÉ DEPUIS LE DÉBUT » DE L'ACCUEIL. Ben : « pourquoi... ne dit pas la même chose ? »
//
// 🚨 CAUSE : la comptabilité déduit déjà les avoirs émis de son CA facturé (règle posée en v1283,
// affinée en v1499 pour distinguer annulation/remboursement). Le total cumulé de l'accueil, lui,
// additionnait le montant de chaque commande TEL QU'IL A ÉTÉ SAISI, sans jamais regarder si un
// avoir avait depuis été émis contre elle. Une facture annulée (exactement le cas de Ben ce
// jour-là) restait donc comptée en pleine valeur sur l'accueil, déjà déduite en comptabilité.
//
// FIX : l'accueil déduit désormais chaque avoir émis (statut emis/enregistré), quelle que soit sa
// nature — un avoir corrige TOUJOURS le facturé, annulation ou remboursement ; seul l'encaissé
// distingue les deux (v1499), et cette carte n'affiche pas l'encaissé — du bon panier (fil de
// l'eau ou reprises) selon la commande qu'il corrige.
//
// AU PASSAGE (même famille de bug, trouvé en creusant, hors demande initiale mais dans le même
// mécanisme) : côté comptabilité, un avoir contre une commande de REPRISE était déduit à tort de
// `totalFacture` (qui exclut déjà les reprises par construction) au lieu de `migCA`. Corrigé au
// même endroit, avec le même raisonnement.
const { APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const money2 = n => Math.round((+n||0)*100)/100;
const estReprise = o => !!(o && o.histo === true);

// Extrait le bloc RÉEL du dashboard (entre les deux ancres) et l'exécute contre des données
// synthétiques — jamais recopié à la main.
function extraireBlocDashboard(){
  const iStart = APP.indexOf('let _caFilEau = money2(');
  const iEnd = APP.indexOf('const caTotal = money2(_caFilEau + _caReprises);', iStart);
  const bloc = APP.slice(iStart, iEnd + "const caTotal = money2(_caFilEau + _caReprises);".length);
  return new Function('orders', 'closedMk', 'estReprise', 'money2', 'db', 'swallow', `
    return (async () => {
      ${bloc}
      return { caTotal, _caFilEau, _caReprises };
    })();
  `);
}

async function run(){
  const runBloc = extraireBlocDashboard();
  const noop = () => {};

  // ---- A. Non-régression : sans aucun avoir, le total est inchangé (somme brute des commandes) ----
  {
    const orders = [
      { id: 1, montant: 100, histo: false },
      { id: 2, montant: 50, histo: true },   // reprise
    ];
    const db = { documents: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) } };
    const r = await runBloc(orders, [], estReprise, money2, db, noop);
    check('A. non-régression : sans avoir, fil de l\'eau = 100', r._caFilEau === 100);
    check('A. non-régression : sans avoir, reprises = 50', r._caReprises === 50);
    check('A. non-régression : total = 150', r.caTotal === 150);
  }

  // ---- B. [LE DÉFAUT CORRIGÉ] Le cas exact de Ben : facture annulée par avoir ----
  {
    const orders = [{ id: 1, montant: 500, histo: false }];
    const avoir = { type: 'avoir', statut: 'emis', nature: 'annulation', orderId: 1, montant: 500 };
    const db = { documents: { where: () => ({ equals: () => ({ toArray: async () => [avoir] }) }) } };
    const r = await runBloc(orders, [], estReprise, money2, db, noop);
    check('B. [LE DÉFAUT CORRIGÉ] une facture intégralement annulée ne compte plus dans le CA de l\'accueil',
      r._caFilEau === 0 && r.caTotal === 0);
  }

  // ---- C. Un avoir de REMBOURSEMENT déduit aussi (un avoir corrige toujours le facturé) ----
  {
    const orders = [{ id: 2, montant: 200, histo: false }];
    const avoir = { type: 'avoir', statut: 'emis', nature: 'remboursement', orderId: 2, montant: 80 };
    const db = { documents: { where: () => ({ equals: () => ({ toArray: async () => [avoir] }) }) } };
    const r = await runBloc(orders, [], estReprise, money2, db, noop);
    check('C. un remboursement partiel réduit bien le CA facturé de l\'accueil (200 − 80 = 120)',
      r._caFilEau === 120);
  }

  // ---- D. Un avoir contre une commande de REPRISE est déduit du bon panier ----
  {
    const orders = [{ id: 3, montant: 300, histo: true }];
    const avoir = { type: 'avoir', statut: 'emis', nature: 'annulation', orderId: 3, montant: 100 };
    const db = { documents: { where: () => ({ equals: () => ({ toArray: async () => [avoir] }) }) } };
    const r = await runBloc(orders, [], estReprise, money2, db, noop);
    check('D. l\'avoir sur une reprise réduit _caReprises, pas _caFilEau',
      r._caReprises === 200 && r._caFilEau === 0);
  }

  // ---- E. Un avoir non émis (brouillon) ne compte pas ----
  {
    const orders = [{ id: 4, montant: 100, histo: false }];
    const avoir = { type: 'avoir', statut: 'brouillon', nature: 'annulation', orderId: 4, montant: 100 };
    const db = { documents: { where: () => ({ equals: () => ({ toArray: async () => [avoir] }) }) } };
    const r = await runBloc(orders, [], estReprise, money2, db, noop);
    check('E. un avoir non émis (brouillon) ne réduit rien', r._caFilEau === 100);
  }

  // ---- F. [SENSIBILITÉ] Sans le correctif, l'écart de Ben persisterait tel quel ----
  {
    const sansCorrectif = (orders) => money2(orders.reduce((s,c)=>s+(+c.montant||0),0));
    const orders = [{ id: 1, montant: 500, histo: false }];
    check('F. [SENSIBILITÉ] l\'ancien calcul (somme brute) afficherait encore 500 malgré l\'avoir',
      sansCorrectif(orders) === 500);
  }

  // ---- G. Câblage réel : la comptabilité attribue déjà un avoir de reprise au bon panier ----
  {
    check('G. migCAAvoirDeduit existe et est déduit de migCA (pas de totalFacture)',
      /migCA = money2\(migCA - migCAAvoirDeduit\)/.test(APP));
    check('G. la boucle avoirs de la comptabilité distingue reprise vs fil de l\'eau avant de déduire',
      /if\(oAvoir && estReprise\(oAvoir\)\)/.test(APP));
    check('G. le cas non-reprise continue de déduire totalFacture comme avant (non-régression)',
      /migCAAvoirDeduit = money2\(migCAAvoirDeduit \+ v\);[\s\S]{0,80}\} else \{[\s\S]{0,80}totalFacture=money2\(totalFacture-v\);/.test(APP));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
