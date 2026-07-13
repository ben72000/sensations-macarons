/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 52 : LE CA D'UN MOIS AVAIT DEUX VÉRITÉS
   ----------------------------------------------------------------------------
   BUG DE PRODUCTION, remonté par Benjamin (capture d'écran) : « mon chiffre d'affaires de mai »
   → 50,00 € … et « 0 macaron écoulé ». Il a signalé : « le chiffre est totalement faux ».
   50 € pour zéro macaron : l'incohérence était visible à l'œil nu.

   DEUX SOURCES DIVERGENTES coexistaient dans l'app :

     A) LA VÉRITÉ COMPTABLE — caEncaisseParMois() — tableau de bord & compta :
        • mois   = la date du PAIEMENT
        • montant = ce qui est RÉELLEMENT ENCAISSÉ
        Un acompte en mai + un solde en août tombent sur mai ET août, chacun son montant.

     B) CE QUE LISAIT LE COPILOTE — computeStats().global.parMois :
        • mois   = la date de la COMMANDE
        • montant = le TOTAL de la commande
        Une commande passée en mai et payée en juillet comptait INTÉGRALEMENT en mai.

   Et le copilote annonçait « CA des commandes PAYÉES sur la période ». Le mot « période »
   désignait en réalité la date de commande, pas l'encaissement : LE LIBELLÉ MENTAIT.

   RÈGLES FIGÉES ICI :
     A. UNE SEULE VÉRITÉ : l'ENCAISSEMENT. C'est celle de la compta, de l'URSSAF et du tableau
        de bord. Deux écrans ne doivent JAMAIS donner deux CA pour le même mois.
     B. LES MACARONS SUIVENT L'ENCAISSEMENT AU PRORATA — même règle que l'emballage (v1326).
        Une commande encaissée à moitié en mai n'apporte que la moitié de ses macarons à mai.
        Sans cela, les euros seraient sur une base et les macarons sur une autre : c'est
        exactement ce qui produisait « 50 € et 0 macaron ».
     C. ANTI-DIVERGENCE : `macaronsDeCommande` DUPLIQUE la lecture des lignes de computeStats.
        Une duplication non prouvée, c'est la divergence de demain — celle-là même que cette
        vague corrige. Le bloc E l'assert donc CONTRE computeStats, sur les mêmes données.
     D. On ne remplace JAMAIS un chiffre en silence : l'ancien est exposé, et l'écart expliqué.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    const round3 = n => Math.round(n*1000)/1000;
    ${extractConstLine('GF_COQUE_RATIO')}
    ${extractFunction('monthKey')}
    ${extractConstLine('ymKey')}
    ${extractFunction('estReprise')}
    ${extractFunction('lineTotalStored')}
    ${extractFunction('orderToLines')}
    ${extractFunction('paiementsDe')}
    // [v1336] Les MARCHES entrent dans le CA : ils ne passent jamais par la table orders.
    ${extractConstLine('marcheDate')}
    ${extractFunction('caMarcheEncaisse')}
    ${extractFunction('caMarchesDuMois')}
    ${extractFunction('caEncaisseParMois')}
    ${extractFunction('macaronsDeCommande')}
    ${extractFunction('caMoisEncaisse')}
    ${extractFunction('computeStats')}
    return { caMoisEncaisse, macaronsDeCommande, caEncaisseParMois, computeStats, orderToLines };
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

console.log('\n=== TESTS DE CARACTÉRISATION — Vague 52 : le CA d\'un mois avait deux vérités ===\n');

// Fabrique de commandes : un coffret de N macarons, payé en un ou plusieurs versements.
const cmd = (id, dateCmd, montant, paiements, parfums) => ({
  id, date: dateCmd, montant, paiement: 'Payé',
  paiements: paiements,
  lignes: [{ type:'coffret', taille:6, parfums: parfums || [] }]
});

// ---------------------------------------------------------------------------
// A. LE BUG EXACT — une commande de mai, payée en juillet
// ---------------------------------------------------------------------------
// C'EST LE CŒUR DE L'AFFAIRE. Commande passée le 20 mai, 100 €, 20 macarons.
// L'argent n'est rentré que le 3 JUILLET.
//   • ANCIEN calcul  : 100 € comptés en MAI (date de commande, montant total)   ← FAUX
//   • VÉRITÉ         : 0 € en mai, 100 € en JUILLET (date d'encaissement)
{
  const orders = [ cmd(1, '2026-05-20', 100, [{date:'2026-07-03', montant:100}],
                       [{nom:'Vanille', qte:20}]) ];

  const mai = M.caMoisEncaisse(orders, '2026-05', M.orderToLines);
  eq(mai.ca, 0, 'A1 · MAI : 0 € encaissé — l\'argent n\'était pas encore rentré');
  eq(mai.macaronsStd, 0, 'A2 · … et donc 0 macaron attribué à mai');
  eq(mai.ancienCa, 100, 'A3 · l\'ANCIEN calcul annonçait pourtant 100 € en mai (date de commande × montant total)');
  eq(mai.ecart, -100, 'A4 · l\'écart est chiffré et EXPOSÉ — on ne remplace jamais un chiffre en silence');

  const juillet = M.caMoisEncaisse(orders, '2026-07', M.orderToLines);
  eq(juillet.ca, 100, 'A5 · JUILLET : les 100 € tombent là où l\'argent est réellement rentré');
  eq(juillet.macaronsStd, 20, 'A6 · … avec les 20 macarons qui vont avec');
  eq(juillet.ancienCa, 0, 'A7 · l\'ancien calcul, lui, ne voyait RIEN en juillet — le mois était vide à tort');
}

// ---------------------------------------------------------------------------
// B. LE PAIEMENT EN DEUX FOIS — acompte et solde sur des mois différents
// ---------------------------------------------------------------------------
// Commande de 200 € (40 macarons) : acompte de 50 € en mai, solde de 150 € en juin.
// L'ancien calcul mettait 200 € en mai. La vérité : 50 € en mai, 150 € en juin.
{
  const orders = [ cmd(1, '2026-05-10', 200,
                       [{date:'2026-05-15', montant:50}, {date:'2026-06-20', montant:150}],
                       [{nom:'Chocolat', qte:40}]) ];

  const mai = M.caMoisEncaisse(orders, '2026-05', M.orderToLines);
  eq(mai.ca, 50, 'B1 · MAI : seul l\'acompte de 50 € est compté');
  eq(mai.macaronsStd, 10, 'B2 · … et 25 % des macarons (50 € sur 200 €) → 10 sur 40 : LE PRORATA');
  eq(mai.nbPaiements, 1, 'B3 · un seul encaissement sur mai');

  const juin = M.caMoisEncaisse(orders, '2026-06', M.orderToLines);
  eq(juin.ca, 150, 'B4 · JUIN : le solde de 150 €');
  eq(juin.macaronsStd, 30, 'B5 · … et les 75 % de macarons restants → 30 sur 40');

  // COHÉRENCE : la somme des mois doit rendre la commande entière, ni plus ni moins.
  eq(mai.ca + juin.ca, 200, 'B6 · TRAÇABILITÉ : mai + juin = les 200 € de la commande, au centime');
  eq(mai.macaronsStd + juin.macaronsStd, 40, 'B7 · TRAÇABILITÉ : mai + juin = les 40 macarons, aucun perdu ni dupliqué');

  eq(mai.ancienCa, 200, 'B8 · l\'ANCIEN calcul mettait les 200 € entiers en mai — 150 € qui n\'existaient pas encore');
}

// ---------------------------------------------------------------------------
// C. LE « 50 € / 0 MACARON » — une prestation, et il faut le DIRE
// ---------------------------------------------------------------------------
// Un encaissement sans macaron n'est PAS forcément un bug : une prestation (atelier, coaching)
// vend du temps, pas des macarons. Mais l'app doit l'EXPLIQUER, pas laisser Benjamin deviner.
{
  const presta = { id:9, date:'2026-05-05', montant:50, paiement:'Payé',
                   paiements:[{date:'2026-05-05', montant:50}],
                   lignes:[{ type:'prestation', montantHT:50 }] };
  const mai = M.caMoisEncaisse([presta], '2026-05', M.orderToLines);

  eq(mai.ca, 50, 'C1 · 50 € bien encaissés en mai');
  eq(mai.macaronsStd, 0, 'C2 · … et 0 macaron : c\'est NORMAL, une prestation vend du temps');
  eq(mai.caPrestation, 50, 'C3 · … et l\'app ISOLE ce montant pour pouvoir l\'expliquer à Benjamin');

  // Un encaissement AVEC macarons ne doit pas être marqué comme prestation.
  const mix = M.caMoisEncaisse([presta, cmd(2,'2026-05-06',60,[{date:'2026-05-06',montant:60}],[{nom:'Citron',qte:12}])],
                               '2026-05', M.orderToLines);
  eq(mix.ca, 110, 'C4 · prestation + coffret = 110 € encaissés');
  eq(mix.macaronsStd, 12, 'C5 · … 12 macarons (ceux du coffret seulement)');
  eq(mix.caPrestation, 50, 'C6 · … et seuls les 50 € de prestation sont signalés « sans macaron »');
}

// ---------------------------------------------------------------------------
// D. LES GARDE-FOUS
// ---------------------------------------------------------------------------
{
  // Commande NON payée : aucun encaissement, donc rien du tout.
  const impayee = { id:3, date:'2026-05-01', montant:100, paiement:'En attente', paiements:[],
                    lignes:[{type:'coffret', taille:6, parfums:[{nom:'Vanille',qte:20}]}] };
  const r = M.caMoisEncaisse([impayee], '2026-05', M.orderToLines);
  eq(r.ca, 0, 'D1 · une commande NON payée n\'apporte aucun CA (et n\'apparaît pas dans l\'ancien non plus)');
  eq(r.ancienCa, 0, 'D2 · … l\'ancien calcul filtrait aussi sur « Payé » — ce n\'était PAS le bug');

  // Trop-perçu : la part est bornée à 1 (jamais 130 % des macarons).
  const trop = cmd(4, '2026-05-01', 100, [{date:'2026-05-02', montant:130}], [{nom:'Vanille', qte:20}]);
  const t = M.caMoisEncaisse([trop], '2026-05', M.orderToLines);
  eq(t.ca, 130, 'D3 · le trop-perçu est encaissé tel quel (c\'est de l\'argent réel)');
  eq(t.macaronsStd, 20, 'D4 · GARDE-FOU : mais la part est bornée à 1 → 20 macarons, jamais 26');

  // Reprise historique : exclue, comme dans caEncaisseParMois (la compta ignore les reprises).
  const histo = { id:5, date:'2026-05-01', montant:80, paiement:'Payé', histo:true,
                  paiements:[{date:'2026-05-01', montant:80}],
                  lignes:[{type:'histo', parfums:[{nom:'Vanille', qte:16}]}] };
  const h = M.caMoisEncaisse([histo], '2026-05', M.orderToLines);
  eq(h.ca, 0, 'D5 · les reprises historiques sont exclues — MÊME règle que caEncaisseParMois');

  // Robustesse.
  eq(M.caMoisEncaisse([], '2026-05', M.orderToLines).ca, 0, 'D6 · aucune commande → 0 €');
  eq(M.caMoisEncaisse(null, '2026-05', M.orderToLines).ca, 0, 'D7 · commandes absentes → 0 € sans planter');
  eq(M.caMoisEncaisse([], null, M.orderToLines).ca, 0, 'D8 · mois absent → 0 € sans planter');
}

// ---------------------------------------------------------------------------
// E. ANTI-DIVERGENCE — la duplication doit être PROUVÉE (règle C)
// ---------------------------------------------------------------------------
// `macaronsDeCommande` relit les lignes exactement comme computeStats. Une règle dupliquée sans
// preuve, c'est la divergence de demain — précisément le mal que cette vague soigne.
// On l'assert donc CONTRE computeStats, sur les mêmes commandes.
{
  const orders = [
    cmd(1, '2026-05-01', 100, [{date:'2026-05-01', montant:100}], [{nom:'Vanille', qte:20}]),
    cmd(2, '2026-05-02', 60,  [{date:'2026-05-02', montant:60}],  [{nom:'Citron', qte:12}]),
    { id:3, date:'2026-05-03', montant:90, paiement:'Payé', paiements:[{date:'2026-05-03', montant:90}],
      lignes:[{ type:'grand', items:[{nom:'Gâteau macaron', qte:2}] }] },
    { id:4, date:'2026-05-04', montant:0, paiement:'Payé', paiements:[],
      lignes:[{ type:'don', parfums:[{nom:'Chocolat', qte:5}], items:[] }] }
  ];
  const clients = [];
  const R = M.computeStats(orders, clients, M.orderToLines);

  // Somme de MA lecture, sur les commandes payées.
  let std = 0, gf = 0;
  orders.filter(o => o.paiement === 'Payé').forEach(o => {
    const m = M.macaronsDeCommande(o, M.orderToLines);
    std += m.std; gf += m.gf;
  });

  eq(std, R.global.macaronsStd,
     'E1 · ANTI-DIVERGENCE : mes macarons STANDARDS = ceux de computeStats, à l\'unité près');
  eq(gf, R.global.nbGrandsFormats,
     'E2 · ANTI-DIVERGENCE : mes GRANDS FORMATS = ceux de computeStats');
  eq(std + gf, R.global.nbMacarons,
     'E3 · ANTI-DIVERGENCE : le total aussi — la duplication est PROUVÉE, pas supposée');

  // Le don (0 €) compte bien en macarons mais pas en euros — subtilité de computeStats respectée.
  const don = M.macaronsDeCommande(orders[3], M.orderToLines);
  eq(don.std, 5, 'E4 · un DON compte ses macarons (sortie de stock réelle)…');
  eq(M.caMoisEncaisse(orders, '2026-05', M.orderToLines).ca, 250,
     'E5 · … mais n\'apporte AUCUN euro (100 + 60 + 90 = 250 €, le don ne rapporte rien)');
}

// ---------------------------------------------------------------------------
// F. UNE SEULE VÉRITÉ — le copilote et la compta doivent DIRE LA MÊME CHOSE
// ---------------------------------------------------------------------------
// C'est le but de toute la vague. `caEncaisseParMois` est la source de la compta et du tableau
// de bord. Le copilote doit désormais s'aligner dessus, au centime.
{
  const orders = [
    cmd(1, '2026-05-20', 100, [{date:'2026-07-03', montant:100}], [{nom:'Vanille', qte:20}]),
    cmd(2, '2026-05-10', 200, [{date:'2026-05-15', montant:50}, {date:'2026-06-20', montant:150}], [{nom:'Chocolat', qte:40}]),
    cmd(3, '2026-06-01', 75,  [{date:'2026-06-02', montant:75}], [{nom:'Citron', qte:15}])
  ];
  const compta = M.caEncaisseParMois(orders).parMois;

  ['2026-05','2026-06','2026-07'].forEach(ym => {
    const copilote = M.caMoisEncaisse(orders, ym, M.orderToLines).ca;
    eq(copilote, Math.round((compta[ym] || 0) * 100) / 100,
       `F · ${ym} : le copilote et la compta annoncent le MÊME CA (${copilote} €)`);
  });

  // Et la somme de tous les mois = tout l'argent réellement encaissé.
  const total = Object.values(compta).reduce((a, b) => a + b, 0);
  eq(Math.round(total * 100) / 100, 375,
     'F4 · TRAÇABILITÉ : 100 + 50 + 150 + 75 = 375 € — aucun euro perdu ni compté deux fois');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
