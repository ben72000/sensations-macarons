/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 15 : ventilation du panier moyen par type
   ----------------------------------------------------------------------------
   Fige orderDominantType (classification d'une commande par sa ligne la plus
   lourde en €) et l'agrégation computePanierMoyenVentile/panierMoyenTypeCounts.
   C'est le correctif direct du "panier moyen à 66,40€" trompeur (mélange
   commandes courantes + événements) : on vérifie ici que chaque type est bien
   isolé, et qu'un mélange coffret+don classe correctement sur le montant dominant.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const money2 = extractConstLine('money2');
  const orderToLines = extractFunction('orderToLines');
  const estReprise = extractFunction('estReprise');
  const orderDominantType = extractFunction('orderDominantType');
  const computePanierMoyenVentile = extractFunction('computePanierMoyenVentile');
  const panierMoyenTypeCounts = extractFunction('panierMoyenTypeCounts');
  const code = `
    ${money2}
    ${orderToLines}
    ${estReprise}
    function lineTotalStored(ln){ return +ln._val||0; }
    // PANIER_TYPE_LABELS réimplémenté localement (extractConstLine ne gère que le mono-ligne ;
    // même contenu que app.js — seules les clés comptent pour orderDominantType).
    const PANIER_TYPE_LABELS = { coffret:'Coffrets', evenement:'Événements', grand:'Grand format', vrac:'Vrac', don:'Dons', prestation:'Prestations', autre:'Autre' };
    ${orderDominantType}
    ${computePanierMoyenVentile}
    ${panierMoyenTypeCounts}
    return { orderDominantType, computePanierMoyenVentile, panierMoyenTypeCounts };
  `;
  const factory = new Function('db', code);
  return factory;
}

function makeDb({orders=[], clients=[]}){
  return {
    orders: { toArray: async()=>orders.slice() },
    clients: { toArray: async()=>clients.slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Classification simple : une commande = un type de ligne ──
{
  const m = buildModule()(makeDb({}));
  const oCoffret  = { id:1, lignes:[{type:'coffret', _val:20}] };
  const oEvenement= { id:2, lignes:[{type:'evenement', _val:400}] };
  const oGrand    = { id:3, lignes:[{type:'grand', _val:60}] };
  const oVrac     = { id:4, lignes:[{type:'vrac', _val:30}] };
  const oDon      = { id:5, lignes:[{type:'don', _val:0}] };
  const oPresta   = { id:6, lignes:[{type:'prestation', _val:150}] };
  eq(m.orderDominantType(oCoffret), 'coffret', 'CAS1 · coffret pur');
  eq(m.orderDominantType(oEvenement), 'evenement', 'CAS1 · événement pur');
  eq(m.orderDominantType(oGrand), 'grand', 'CAS1 · grand format pur');
  eq(m.orderDominantType(oVrac), 'vrac', 'CAS1 · vrac pur');
  eq(m.orderDominantType(oDon), 'don', 'CAS1 · don pur');
  eq(m.orderDominantType(oPresta), 'prestation', 'CAS1 · prestation pure');
}

// ── CAS 2 — LE cas qui a motivé ce chantier : commande mixte coffret + don, classée sur le
//    montant dominant (le coffret, 25€, l'emporte sur le don gratuit, 0€) ──
{
  const m = buildModule()(makeDb({}));
  const oMixte = { id:7, lignes:[{type:'coffret', _val:25}, {type:'don', _val:0}] };
  eq(m.orderDominantType(oMixte), 'coffret', 'CAS2 · mélange coffret(25)+don(0) → classé coffret (montant dominant)');
}

// ── CAS 3 — Commande sans lignes → 'autre', pas de crash ──
{
  const m = buildModule()(makeDb({}));
  eq(m.orderDominantType({id:8, lignes:[]}), 'autre', 'CAS3 · commande vide → autre');
}

// ── CAS 4 — computePanierMoyenVentile('tous') : moyenne globale mélange tout, comme avant le fix ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, lignes:[{type:'coffret', _val:20}] },
    { id:2, clientId:1, date:'2026-05-02', montant:400, lignes:[{type:'evenement', _val:400}] }
  ];
  const m = buildModule()(makeDb({orders, clients:[{id:1,nom:'Client A'}]}));
  const r = await m.computePanierMoyenVentile('tous', {});
  eq(r.nb, 2, 'CAS4 · tous : 2 commandes comptées');
  eq(r.moyenne, 210, 'CAS4 · tous : moyenne mélangée (20+400)/2 = 210 — exactement le biais signalé');
}

// ── CAS 5 — computePanierMoyenVentile('coffret') isole le type, donne un panier réaliste ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, lignes:[{type:'coffret', _val:20}] },
    { id:2, clientId:1, date:'2026-05-02', montant:400, lignes:[{type:'evenement', _val:400}] },
    { id:3, clientId:1, date:'2026-05-03', montant:25, lignes:[{type:'coffret', _val:25}] }
  ];
  const m = buildModule()(makeDb({orders, clients:[{id:1,nom:'Client A'}]}));
  const rCoffret = await m.computePanierMoyenVentile('coffret', {});
  eq(rCoffret.nb, 2, 'CAS5 · coffret : 2 commandes (événement exclu)');
  eq(rCoffret.moyenne, 22.5, 'CAS5 · coffret : moyenne réaliste (20+25)/2 = 22.5, pas 210');
  const rEvt = await m.computePanierMoyenVentile('evenement', {});
  eq(rEvt.nb, 1, 'CAS5 · événement : 1 commande isolée');
  eq(rEvt.moyenne, 400, 'CAS5 · événement : moyenne = 400');
}

// ── CAS 6 — Reprise (histo) exclue de toute ventilation ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, histo:true, lignes:[{type:'coffret', _val:20}] },
    { id:2, clientId:1, date:'2026-05-02', montant:25, lignes:[{type:'coffret', _val:25}] }
  ];
  const m = buildModule()(makeDb({orders, clients:[{id:1,nom:'Client A'}]}));
  const r = await m.computePanierMoyenVentile('tous', {});
  eq(r.nb, 1, 'CAS6 · reprise exclue : seule la vraie commande compte');
  eq(r.moyenne, 25, 'CAS6 · moyenne sur la seule commande non-reprise');
}

// ── CAS 7 — Filtre de période appliqué correctement ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-04-15', montant:20, lignes:[{type:'coffret', _val:20}] },
    { id:2, clientId:1, date:'2026-05-15', montant:40, lignes:[{type:'coffret', _val:40}] }
  ];
  const m = buildModule()(makeDb({orders, clients:[{id:1,nom:'Client A'}]}));
  const r = await m.computePanierMoyenVentile('coffret', {periodeStart:'2026-05-01', periodeEnd:'2026-05-31'});
  eq(r.nb, 1, 'CAS7 · période mai seule : 1 commande');
  eq(r.moyenne, 40, 'CAS7 · moyenne sur la commande de mai uniquement');
}

// ── CAS 8 — panierMoyenTypeCounts : compteurs par type pour les onglets ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, lignes:[{type:'coffret', _val:20}] },
    { id:2, clientId:1, date:'2026-05-02', montant:25, lignes:[{type:'coffret', _val:25}] },
    { id:3, clientId:1, date:'2026-05-03', montant:400, lignes:[{type:'evenement', _val:400}] }
  ];
  const m = buildModule()(makeDb({orders, clients:[{id:1,nom:'Client A'}]}));
  const r = await m.panierMoyenTypeCounts({});
  eq(r.total, 3, 'CAS8 · total 3 commandes');
  eq(r.counts.coffret, 2, 'CAS8 · 2 coffrets comptés');
  eq(r.counts.evenement, 1, 'CAS8 · 1 événement compté');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 15 : ventilation panier moyen ===\n');
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
