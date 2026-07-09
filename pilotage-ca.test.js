/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 20 : computePilotageCA (leviers stratégiques)
   ----------------------------------------------------------------------------
   Fige le calcul des leviers affichés en Pilotage (marché moyen, panier moyen
   HORS ÉVÉNEMENT, animation moyenne) et des mois creux/forts. Verrouille en
   particulier le correctif [v1284-fix] : une commande événement (mariage,
   réception) ne doit JAMAIS gonfler le "panier moyen" affiché — c'est le bug
   concret que Ben a signalé (66,40€ qui semblait énorme) et qu'on a corrigé
   dans cette même session. computeSeuilsFiscaux est STUBBÉE (déjà couverte
   par la vague 19) pour isoler strictement la logique propre à cette fonction.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(seuilsFiscauxStub){
  const money2 = extractConstLine('money2');
  const addMoney = extractConstLine('addMoney');
  const orderToLines = extractFunction('orderToLines');
  const orderIsEvent = extractFunction('orderIsEvent');
  const marketNetCA = extractFunction('marketNetCA');
  const computePilotageCA = extractFunction('computePilotageCA');
  const code = `
    ${money2}
    ${addMoney}
    ${orderToLines}
    ${orderIsEvent}
    ${marketNetCA}
    // computeSeuilsFiscaux STUBBÉE : appelée par son nom depuis computePilotageCA (fidèle au
    // code réel), déjà testée en profondeur ailleurs (vague 19).
    async function computeSeuilsFiscaux(year){ return seuilsFiscauxStub(year); }
    ${computePilotageCA}
    return computePilotageCA;
  `;
  const factory = new Function('db', 'seuilsFiscauxStub', code);
  return (dbArg) => factory(dbArg, seuilsFiscauxStub);
  return factory;
}

function makeDb({orders=[], markets=[]}){
  return {
    orders: { toArray: async()=>orders.slice() },
    markets: { toArray: async()=>markets.slice() }
  };
}

function baseSeuils(overrides){
  return Object.assign({
    caTotal:0, projTotal:0, moisEcoules:6,
    parMois: [1,2,3,4,5,6].map(m=>({ym:`2026-0${m}`, goods:0, service:0}))
  }, overrides||{});
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — LE CORRECTIF : une commande événement à 400€ ne doit PAS gonfler coffretMoyen ──
{
  const orders = [
    { id:1, date:'2026-05-01', montant:20, lignes:[{type:'coffret'}] },
    { id:2, date:'2026-05-02', montant:25, lignes:[{type:'coffret'}] },
    { id:3, date:'2026-05-03', montant:400, lignes:[{type:'evenement'}] }   // mariage
  ];
  const db1 = makeDb({orders});
  const cp = buildModule(()=>baseSeuils())(db1);
  const r = await cp(2026);
  eq(r.leviers.coffretMoyen, 22.5, 'CAS1 · panier moyen = (20+25)/2 = 22.5, ÉVÉNEMENT EXCLU (pas 148.33)');
}

// ── CAS 2 — Sans aucune commande courante (seulement des événements) : repli à 35€ ──
{
  const orders = [
    { id:1, date:'2026-05-01', montant:400, lignes:[{type:'evenement'}] }
  ];
  const db2 = makeDb({orders});
  const cp = buildModule(()=>baseSeuils())(db2);
  const r = await cp(2026);
  eq(r.leviers.coffretMoyen, 35, 'CAS2 · aucune commande courante cette année → repli conventionnel 35€');
}

// ── CAS 3 — Repli sur TOUTES années si l'année demandée n'a pas de commande courante ──
{
  const orders = [
    { id:1, date:'2025-05-01', montant:18, lignes:[{type:'coffret'}] }   // année précédente
  ];
  const db3 = makeDb({orders});
  const cp = buildModule(()=>baseSeuils())(db3);
  const r = await cp(2026);   // demande 2026, mais seule une commande 2025 existe
  eq(r.leviers.coffretMoyen, 18, 'CAS3 · repli sur toutes années si rien sur l\'année demandée (18€, pas 35 de secours)');
}

// ── CAS 4 — Reprise (histo) exclue du panier moyen ──
{
  const orders = [
    { id:1, date:'2026-05-01', montant:1000, histo:true, lignes:[{type:'coffret'}] },   // reprise, montant énorme
    { id:2, date:'2026-05-02', montant:20, lignes:[{type:'coffret'}] }
  ];
  const db4 = makeDb({orders});
  const cp = buildModule(()=>baseSeuils())(db4);
  const r = await cp(2026);
  eq(r.leviers.coffretMoyen, 20, 'CAS4 · reprise exclue : panier moyen = 20, pas gonflé par les 1000 de la reprise');
}

// ── CAS 5 — Marché moyen : moyenne des marchés CLOS de l'année, ouverts ignorés ──
{
  const markets = [
    { statut:'clos', date:'2026-03-01', ca:{especes:100, cb:50, autre:0}, fondCaisse:0 },
    { statut:'clos', date:'2026-04-01', ca:{especes:200, cb:0, autre:0}, fondCaisse:0 },
    { statut:'ouvert', date:'2026-05-01', ca:{especes:9999, cb:0, autre:0}, fondCaisse:0 }   // pas clos : ignoré
  ];
  const db5 = makeDb({markets});
  const cp = buildModule(()=>baseSeuils())(db5);
  const r = await cp(2026);
  eq(r.leviers.marcheMoyen, 175, 'CAS5 · moyenne des 2 marchés clos = (150+200)/2 = 175, le marché ouvert ignoré');
}

// ── CAS 6 — Marché moyen : aucun marché clos → repli conventionnel 250€ ──
{
  const db6 = makeDb({markets:[]});
  const cp = buildModule(()=>baseSeuils())(db6);
  const r = await cp(2026);
  eq(r.leviers.marcheMoyen, 250, 'CAS6 · aucun marché clos → repli 250€');
}

// ── CAS 7 — Animation moyenne : moyenne des lignes prestation (montantHT), repli 150€ ──
{
  const orders = [
    { id:1, date:'2026-05-01', montant:0, lignes:[{type:'prestation', montantHT:100}] },
    { id:2, date:'2026-05-02', montant:0, lignes:[{type:'prestation', montantHT:200}] }
  ];
  const db7 = makeDb({orders});
  const cp = buildModule(()=>baseSeuils())(db7);
  const r = await cp(2026);
  eq(r.leviers.animationMoyenne, 150, 'CAS7 · moyenne des prestations = (100+200)/2 = 150 (coïncide avec le repli ici)');
}
{
  const db7b = makeDb({orders:[]});
  const cp = buildModule(()=>baseSeuils())(db7b);
  const r = await cp(2026);
  eq(r.leviers.animationMoyenne, 150, 'CAS7bis · aucune prestation observée → repli conventionnel 150€');
}

// ── CAS 8 — Mois creux / mois fort : détectés parmi les mois ÉCOULÉS uniquement (année en cours) ──
{
  const stub = () => baseSeuils({
    moisEcoules: 3,
    parMois: [
      {ym:'2026-01', goods:1000, service:0},
      {ym:'2026-02', goods:200,  service:0},   // le plus faible → mois creux
      {ym:'2026-03', goods:1500, service:0},   // le plus fort
      {ym:'2026-04', goods:9999, service:0},   // mois FUTUR (pas encore écoulé) : ignoré pour creux/fort
    ]
  });
  const cp = buildModule(stub)(makeDb({}));
  const r = await cp(new Date().getFullYear());   // année en cours pour activer le filtre isCurrentYear
  eq(r.moisCreux.ym, '2026-02', 'CAS8 · mois creux = février (200), le mois futur (avril) est ignoré');
  eq(r.moisFort.ym, '2026-03', 'CAS8 · mois fort = mars (1500), pas avril malgré son CA plus élevé (futur)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 20 : computePilotageCA ===\n');
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
