/* ============================================================================
   TESTS — v1434 : MA RÉGRESSION DE LA v1433 — LES DONS AVAIENT DISPARU
   ----------------------------------------------------------------------------
   Ben : « pourquoi mes dons ont bougé suite à cette mise à jour ? Mes chiffres
   ont l'air sans dessus dessous, c'est très désagréable, je ne peux pas faire
   confiance aux chiffres de l'app. »

   IL A RAISON, ET C'EST MOI QUI AI CASSÉ ÇA. En v1433, pour sortir les reprises
   d'historique du €/macaron, j'ai restreint l'assiette EN AMONT :
   `buildFlavorSales(ordersMarge, …)` avec `estVenteAgregable`, qui exige
   `paiement === 'Payé'`.

   Or **un don n'est pas payé — c'est sa définition**. Toute commande contenant
   des macarons offerts, et toute commande de don pure, sortait donc du calcul
   AVANT d'atteindre l'étape 1 de `buildFlavorSales`, celle qui compte les pièces
   offertes. Les dons se sont effondrés, et avec eux `coutDons`, `margeApresDons`
   et le €/macaron qui en dépend.

   LA LEÇON, ET ELLE VAUT AU-DELÀ DE CE BUG : filtrer une liste EN AMONT d'une
   fonction qui en tire PLUSIEURS mesures, c'est appliquer à toutes le critère
   d'une seule. `buildFlavorSales` produit deux mesures de nature différente —
   les pièces OFFERTES et le CA VENDU. Elles n'ont pas les mêmes conditions de
   validité. Le filtre doit vivre là où la distinction se fait, pas au-dessus.

   Ce qui reste vrai de la v1433 : reprises et commandes filles sont bien
   écartées — ces deux critères-là valent pour TOUTES les mesures (une reprise
   appartient à une autre époque ; une fille doublonne sa mère).

   Propriétés verrouillées ici :
     1. Un don compte, qu'il soit payé ou non.
     2. La garde de vente s'applique APRÈS le comptage des dons, jamais avant.
     3. Reprises et filles restent écartées de tout, dons compris.
     4. L'acquis de la v1433 tient : migrer des commandes ne bouge pas le ratio.
     5. Le coût des emballages de dons décrit le même périmètre que les pièces
        offertes.
   ============================================================================ */
'use strict';
const { extractFunction, stripComments } = require('./_extract');

function buildModule(){
  const code = `
    ${extractFunction('estVenteAgregable')}
    return { estVenteAgregable };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// L'assiette d'entrée (v1434) : époque et doublon seulement.
function assiette(orders){
  return (orders||[]).filter(o=>o && o.histo!==true && o.commandeMereId==null);
}
// Le parcours de buildFlavorSales, rejoué : dons d'abord, garde de vente ensuite.
function mesurer(M, orders){
  let piecesDon=0, ca=0, piecesVendues=0;
  assiette(orders).forEach(o=>{
    (o.lignes||[]).forEach(ln=>{
      if(ln.type==='don') (ln.parfums||[]).forEach(p=>{ piecesDon += +p.qte||0; });
    });
    if(!M.estVenteAgregable(o)) return;          // ← la garde, APRÈS les dons
    (o.lignes||[]).forEach(ln=>{
      if(ln.type==='don') return;
      (ln.parfums||[]).forEach(p=>{ piecesVendues += +p.qte||0; });
    });
    ca += +o.montant||0;
  });
  return { piecesDon, ca, piecesVendues };
}

const don = (id, qte, extra) => Object.assign({ id, date:'2026-06-10', montant:0, paiement:'Offert',
  lignes:[{type:'don', parfums:[{nom:'Vanille', qte}]}] }, extra||{});
const vente = (id, montant, qte) => ({ id, date:'2026-06-12', montant, paiement:'Payé',
  lignes:[{type:'coffret', parfums:[{nom:'Vanille', qte}]}] });

function run(){
const M = buildModule();

// ── CAS 1 : LE BUG DE BEN — un don pur compte, bien qu'il ne soit pas payé ─
{
  const r = mesurer(M, [don(1, 12), vente(2, 100, 40)]);
  eq(r.piecesDon, 12,     'CAS1 · les 12 pièces offertes sont comptées');
  eq(r.piecesVendues, 40, 'CAS1 · … sans polluer les pièces vendues');
  eq(r.ca, 100,           'CAS1 · … ni le CA');
  eq(M.estVenteAgregable(don(1,12)), false,
     'CAS1 · le don n\'est PAS une vente agrégeable — et c\'est bien pour ça qu\'il sautait');
}

// ── CAS 2 : un don DANS une commande payée compte aussi ──────────────────
{
  const mixte = { id:3, date:'2026-06-15', montant:80, paiement:'Payé', lignes:[
    { type:'coffret', parfums:[{nom:'Vanille', qte:30}] },
    { type:'don',     parfums:[{nom:'Vanille', qte:6}] },
  ]};
  const r = mesurer(M, [mixte]);
  eq(r.piecesDon, 6,      'CAS2 · les 6 offertes sont comptées');
  eq(r.piecesVendues, 30, 'CAS2 · les 30 vendues aussi');
  eq(r.ca, 80,            'CAS2 · CA intact');
}

// ── CAS 3 : un don sur une commande NON PAYÉE compte encore ─────────────
// Le cas le plus fréquent : une commande en attente contenant un geste commercial.
{
  const enAttente = { id:4, date:'2026-06-18', montant:60, paiement:'En attente', lignes:[
    { type:'coffret', parfums:[{nom:'Vanille', qte:20}] },
    { type:'don',     parfums:[{nom:'Vanille', qte:4}] },
  ]};
  const r = mesurer(M, [enAttente]);
  eq(r.piecesDon, 4,     'CAS3 · le don est compté');
  eq(r.piecesVendues, 0, 'CAS3 · … mais la vente non réalisée, non');
  eq(r.ca, 0,            'CAS3 · … et son CA non plus');
}

// ── CAS 4 : L'ACQUIS DE LA v1433 TIENT — migrer ne bouge rien ──────────
{
  const base = [don(1, 12), vente(2, 100, 40)];
  const avant = mesurer(M, base);
  const apres = mesurer(M, base.concat([
    { id:50, date:'2025-03-01', montant:500, paiement:'Payé', histo:true,
      lignes:[{type:'coffret', parfums:[{nom:'Vanille', qte:200}]}] },
    { id:51, date:'2025-04-01', montant:200, paiement:'Payé', histo:true,
      lignes:[{type:'don', parfums:[{nom:'Vanille', qte:50}]}] },
  ]));
  eq(apres, avant, 'CAS4 · reprises ajoutées : AUCUN chiffre ne bouge, dons compris');
}

// ── CAS 5 : une fille ne double ni le CA ni les dons ───────────────────
{
  const base = [vente(2, 100, 40)];
  const avec = base.concat([{ id:60, date:'2026-07-01', montant:100, paiement:'Payé', commandeMereId:2,
    lignes:[{type:'coffret', parfums:[{nom:'Vanille', qte:40}]},
            {type:'don',     parfums:[{nom:'Vanille', qte:5}]}] }]);
  eq(mesurer(M, avec), mesurer(M, base),
     'CAS5 · la fille doublonne sa mère : elle n\'ajoute rien, dons inclus');
}

// ── CAS 6 : L'ORDRE DANS LE CODE — dons comptés AVANT la garde ─────────
// C'est LA garde qui empêche ce bug de revenir. Si la ligne remonte au-dessus
// de l'étape 1, les dons resautent.
{
  const src = stripComments(extractFunction('buildFlavorSales'));
  const iDon   = src.indexOf('a.piecesDon+=+p.qte');
  const iGarde = src.indexOf('estVenteAgregable(o)) return;');
  vrai(iDon > -1,   'CAS6 · l\'étape des dons existe');
  vrai(iGarde > -1, 'CAS6 · la garde de vente existe');
  vrai(iDon < iGarde, 'CAS6 · les dons sont comptés AVANT la garde');
  const iCA = src.indexOf('const montant = money2');
  vrai(iGarde < iCA, 'CAS6 · … et la garde précède le calcul du CA');
}

// ── CAS 7 : l'assiette d'entrée ne porte QUE époque et doublon ─────────
// La condition de paiement ne doit plus y figurer : elle ne vaut que pour la
// vente, pas pour le don.
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  vrai(/const ordersMarge   = \(orders\|\|\[\]\)\.filter\(o=>o && o\.histo!==true && o\.commandeMereId==null\)/.test(src),
     'CAS7 · assiette = hors reprises, hors filles');
  eq(/ordersMarge   = \(orders\|\|\[\]\)\.filter\(o=>o && o\.histo!==true && estVenteAgregable\(o\)\)/.test(src), false,
     'CAS7 · le critère de paiement a quitté l\'amont (c\'était la régression)');
  vrai(/buildFlavorSales\(ordersMarge,/.test(src),
     'CAS7 · c\'est bien cette assiette qui alimente les ventes par parfum');
}

// ── CAS 8 : emballages de dons — même périmètre que les pièces offertes ─
// Deux chiffres qui parlent du même objet doivent décrire le même ensemble,
// sinon le coût par don devient faux.
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  const i = src.indexOf('coutEmbDons');
  vrai(i > -1, 'CAS8 · le coût des emballages de dons existe toujours');
  const bloc = src.slice(i, i + 700);
  vrai(/\(ordersMarge\|\|\[\]\)\.forEach/.test(bloc),
     'CAS8 · il est calculé sur la même assiette que les pièces offertes');
}

// ── CAS 9 : le reste de la chaîne des dons est intact ──────────────────
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  vrai(/piecesDon: round3\(rows\.reduce/.test(src),           'CAS9 · total des pièces offertes');
  vrai(/coutDons: money2\(rows\.reduce/.test(src),            'CAS9 · coût des dons');
  vrai(/totals\.piecesDon = round3\(totals\.piecesDon \+ piecesDonNS\)/.test(src),
     'CAS9 · les dons sans parfum identifié sont toujours rattrapés');
  vrai(/totals\.coutDons = money2\(totals\.coutDons \+ coutEmbDons\)/.test(src),
     'CAS9 · les emballages s\'ajoutent bien au coût des dons');
}

// ── CAS 10 : la tuile « Coût des dons » de l'accueil lit ces totaux ────
{
  const app = require('./_extract').APP;
  vrai(/coutDons = _An\.totals\.coutDons\|\|0/.test(app), 'CAS10 · l\'accueil lit le coût des dons');
  vrai(/piecesDon = _An\.totals\.piecesDon\|\|0/.test(app), 'CAS10 · … et les pièces offertes');
  vrai(/margeApresDons = _An\.totals\.margeApresDons/.test(app), 'CAS10 · … et la marge après dons');
}

// ── résultat ──
console.log('\n=== TESTS — v1434 : un don compte, payé ou non ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
