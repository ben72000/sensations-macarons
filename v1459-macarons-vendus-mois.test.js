'use strict';
// v1459 — « LE CHIFFRE ME PARAÎT FAUX » : macarons vendus du mois. Ben, sur la ligne « 🍬 X
// macaron(s) vendu(s) » de la carte CA de l'accueil.
//
// L'AUDIT A TROUVÉ DEUX DÉFAUTS DISTINCTS, pas un :
//  ① PÉRIODE INCOHÉRENTE AVEC LE CA DE LA MÊME CARTE : les macarons comptaient les commandes
//    DATÉES du mois, le CA comptait les ENCAISSEMENTS. Une commande de juillet payée en août
//    montrait son CA en août et ses macarons en juillet — deux chiffres côte à côte décrivant
//    deux choses différentes.
//  ② DOUBLE COMPTAGE MÈRE/FILLE : un client paie d'avance (commande « mère »), puis vient
//    chercher en plusieurs fois — chaque venue est une commande « fille » avec ses PROPRES
//    lignes de macarons. La somme comptait la mère ET ses filles.
//
// FORK TRANCHÉ PAR BEN : compter les macarons des commandes ENCAISSÉES ce mois, même base que le
// CA. Ce choix règle ② à la racine : une fille n'a jamais de paiement propre (RÈGLE D'OR de
// paiementsDe), donc elle pèse zéro sur cette base.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// Le calcul vit DANS renderDash (trop gros pour être extrait) : on rejoue la boucle réelle,
// copiée depuis la source et vérifiée identique par une garde statique en section D.
const src = APP.slice(APP.indexOf('  let macVendusMois = 0;'), APP.indexOf('  let _macMarches = 0;'));

function calcule(orders, mkCourant){
  const fn = new Function('orders','_mkCourant','estReprise','paiementsDe','orderMacaronsVendus',
    'orderMontantRecalcule','money2','ymKey','round3', `
    ${src}
    return macVendusMois;
  `);
  return fn(orders, mkCourant,
    o=>!!(o&&o.reprise),
    o=>(o && o.commandeMereId!=null) ? [] : (Array.isArray(o&&o.paiements)?o.paiements:[]),
    o=>(o&&o.mac)||0,
    o=>0,
    n=>Math.round((+n||0)*100)/100,
    d=>String(d||'').slice(0,7),
    n=>Math.round((+n||0)*1000)/1000);
}

// ---- A. Le cas de Ben : mère payée d'avance + filles de retrait ----
{
  const orders = [
    // Mère : 100 macarons, payée intégralement en août.
    { id:1, date:'2026-08-01', montant:200, mac:100, paiements:[{date:'2026-08-01', montant:200}] },
    // Filles : les retraits, avec leurs propres lignes — JAMAIS de paiement propre.
    { id:2, date:'2026-08-03', commandeMereId:1, mac:40, paiements:[] },
    { id:3, date:'2026-08-10', commandeMereId:1, mac:60, paiements:[] },
  ];
  check('A. les macarons de la mère sont comptés UNE fois (100, pas 200)', calcule(orders,'2026-08') === 100);
}

// ---- B. Même base que le CA : c'est le mois du PAIEMENT qui décide ----
{
  // Commande de juillet, payée en août.
  const o = [{ id:1, date:'2026-07-20', montant:100, mac:50, paiements:[{date:'2026-08-02', montant:100}] }];
  check('B. commande de juillet payée en août : comptée en AOÛT', calcule(o,'2026-08') === 50);
  check('B. …et donc PAS en juillet', calcule(o,'2026-07') === 0);
}
{
  // Commande d'août jamais payée : rien à compter (le CA n'affiche rien non plus).
  const o = [{ id:1, date:'2026-08-05', montant:100, mac:50, paiements:[] }];
  check('B. commande non payée : 0 macaron compté (cohérent avec le CA)', calcule(o,'2026-08') === 0);
}

// ---- C. Paiement partiel : prorata du montant encaissé ----
{
  // 100 macarons, 200 €. 50 € encaissés en août = un quart → 25 macarons.
  const o = [{ id:1, date:'2026-08-01', montant:200, mac:100,
    paiements:[{date:'2026-08-01', montant:50},{date:'2026-09-15', montant:150}] }];
  check('C. paiement partiel : prorata du montant (50/200 → 25 macarons)', calcule(o,'2026-08') === 25);
  check('C. le solde compte le mois où il est encaissé (150/200 → 75)', calcule(o,'2026-09') === 75);
  check('C. RÉCONCILIATION : les deux mois totalisent exactement la commande (100)',
    calcule(o,'2026-08') + calcule(o,'2026-09') === 100);
}
{
  // Trop-perçu : ne doit pas faire apparaître plus de macarons que la commande n'en contient.
  const o = [{ id:1, date:'2026-08-01', montant:100, mac:40, paiements:[{date:'2026-08-01', montant:150}] }];
  check('C. trop-perçu plafonné : jamais plus que les macarons de la commande', calcule(o,'2026-08') === 40);
}

// ---- D. Exclusions et cas limites ----
{
  check('D. reprise d\'historique exclue',
    calcule([{ id:1, date:'2026-08-01', montant:100, mac:50, reprise:true, paiements:[{date:'2026-08-01',montant:100}] }],'2026-08') === 0);
  check('D. commande historique exclue',
    calcule([{ id:1, date:'2026-08-01', montant:100, mac:50, histo:true, paiements:[{date:'2026-08-01',montant:100}] }],'2026-08') === 0);
  check('D. commande sans macaron (prestation seule) ignorée',
    calcule([{ id:1, date:'2026-08-01', montant:100, mac:0, paiements:[{date:'2026-08-01',montant:100}] }],'2026-08') === 0);
  check('D. montant à zéro : pas de division par zéro, rien inventé',
    calcule([{ id:1, date:'2026-08-01', montant:0, mac:50, paiements:[{date:'2026-08-01',montant:0}] }],'2026-08') === 0);
  // Paiement sans date : retombe sur la date de commande, comme le fait caDuMois.
  check('D. paiement sans date : rattaché au mois de la commande (comme le CA)',
    calcule([{ id:1, date:'2026-08-04', montant:100, mac:30, paiements:[{montant:100}] }],'2026-08') === 30);
}

// ---- E. Gardes statiques : la source réelle applique bien ces règles ----
{
  check('E. le calcul passe par paiementsDe (donc les filles pèsent zéro)', /paiementsDe\(o\)/.test(src));
  check('E. le ratio est plafonné à 1 (trop-perçu)', /Math\.min\(1,\s*encMois\/totalCmd\)/.test(src));
  check('E. les reprises et l\'historique restent exclus', /estReprise\(o\)/.test(src) && /o\.histo/.test(src));
  check('E. la période comparée est bien le mois courant', /_mkCourant/.test(src));
  // Le commentaire ne doit plus affirmer le contraire de ce que fait le code.
  const iCom = APP.indexOf('// [v1459] MACARONS VENDUS SUR LE MOIS');
  const com = APP.slice(iCom, iCom+1400);
  check('E. le commentaire documente la base « encaissé » (plus l\'inverse)', /MÊME BASE QUE LE CA/.test(com));
  check('E. il documente le double comptage mère/fille corrigé', /DOUBLE COMPTAGE mère\/fille/.test(com));
  // Le total affiché est arrondi une seule fois, à la fin.
  const iArr = APP.indexOf('macVendusMois = Math.round(round3(macVendusMois + _macMarches));');
  check('E. arrondi une seule fois sur le TOTAL (pas commande par commande)', iArr > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
