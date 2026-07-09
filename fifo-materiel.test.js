/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 16 : FIFO matières (décrément/restock)
   ----------------------------------------------------------------------------
   Fige le comportement du décrément réel de stock (decrementLotsByMaterial) et
   de son inverse partiel (restockLotsByMaterial), ainsi que l'ordre de tri FIFO
   (lotFifoCompare). C'est le cœur physique de l'app : une erreur ici peut mener
   à vendre un stock qui n'existe pas ou à perdre la trace d'un lot.
   Filet de sécurité posé en vue d'un futur refactoring (aucune fonction non
   testée ne doit être touchée sans couverture préalable).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const round3 = extractConstLine('round3');
  const addQty = extractConstLine('addQty');
  const subQty = extractConstLine('subQty');
  const lotFifoCompare = extractFunction('lotFifoCompare');
  const decrementLotsByMaterial = extractFunction('decrementLotsByMaterial');
  const restockLotsByMaterial = extractFunction('restockLotsByMaterial');
  const code = `
    ${round3}
    ${addQty}
    ${subQty}
    ${lotFifoCompare}
    ${decrementLotsByMaterial}
    ${restockLotsByMaterial}
    return { lotFifoCompare, decrementLotsByMaterial, restockLotsByMaterial };
  `;
  const factory = new Function('db', code);
  return factory;
}

function makeDb(lots){
  const store = lots.map(l=>Object.assign({}, l));
  return {
    materialLots: {
      where: (field) => ({
        equals: (val) => ({
          toArray: async () => store.filter(l=>l[field]===val)
        })
      }),
      update: async (id, patch) => {
        const l = store.find(x=>x.id===id); if(l) Object.assign(l, patch);
      }
    },
    _store: store   // accès direct pour les assertions post-opération
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — lotFifoCompare : un lot de REPRISE passe toujours en premier ──
{
  const m = buildModule()(makeDb([]));
  const lots = [
    {id:1, repriseStock:false, dlc:'2026-08-01', dateReception:'2026-06-01'},
    {id:2, repriseStock:true,  dlc:'2026-12-01', dateReception:'2026-01-01'}   // reprise, DLC lointaine
  ];
  const sorted = lots.slice().sort(m.lotFifoCompare);
  eq(sorted[0].id, 2, 'CAS1 · le lot de reprise passe en premier malgré une DLC plus lointaine');
}

// ── CAS 2 — lotFifoCompare : sans reprise, DLC la plus proche d'abord ──
{
  const m = buildModule()(makeDb([]));
  const lots = [
    {id:1, repriseStock:false, dlc:'2026-09-01', dateReception:'2026-01-01'},
    {id:2, repriseStock:false, dlc:'2026-07-15', dateReception:'2026-06-01'}
  ];
  const sorted = lots.slice().sort(m.lotFifoCompare);
  eq(sorted[0].id, 2, 'CAS2 · DLC la plus proche (juillet) passe avant DLC lointaine (septembre)');
}

// ── CAS 3 — lotFifoCompare : DLC égales, réception la plus ancienne d'abord ──
{
  const m = buildModule()(makeDb([]));
  const lots = [
    {id:1, repriseStock:false, dlc:'2026-08-01', dateReception:'2026-06-01'},
    {id:2, repriseStock:false, dlc:'2026-08-01', dateReception:'2026-01-01'}
  ];
  const sorted = lots.slice().sort(m.lotFifoCompare);
  eq(sorted[0].id, 2, 'CAS3 · même DLC : réception la plus ancienne (janvier) passe en premier');
}

// ── CAS 4 — decrementLotsByMaterial : consomme un seul lot suffisant ──
{
  const db1 = makeDb([{id:1, materialId:10, qteRestante:50, dlc:'2026-08-01', dateReception:'2026-01-01', repriseStock:false}]);
  const m = buildModule()(db1);
  const r = await m.decrementLotsByMaterial(10, 20);
  eq(r.consomme, 20, 'CAS4 · consomme exactement la quantité demandée');
  eq(r.manque, 0, 'CAS4 · aucun manque');
  eq(db1._store[0].qteRestante, 30, 'CAS4 · le lot est bien décrémenté en base (50-20=30)');
}

// ── CAS 5 — decrementLotsByMaterial : cascade sur plusieurs lots en ordre FIFO ──
{
  const db2 = makeDb([
    {id:1, materialId:10, qteRestante:8,  dlc:'2026-07-20', dateReception:'2026-01-01', repriseStock:false},
    {id:2, materialId:10, qteRestante:20, dlc:'2026-09-01', dateReception:'2026-02-01', repriseStock:false}
  ]);
  const m = buildModule()(db2);
  const r = await m.decrementLotsByMaterial(10, 12);
  eq(r.consomme, 12, 'CAS5 · 12 consommés au total');
  eq(r.manque, 0, 'CAS5 · aucun manque');
  eq(db2._store[0].qteRestante, 0, 'CAS5 · lot 1 (DLC proche) épuisé en premier : 8-8=0');
  eq(db2._store[1].qteRestante, 16, 'CAS5 · complément pris sur lot 2 : 20-4=16');
}

// ── CAS 6 — decrementLotsByMaterial : stock insuffisant, ne lève pas, retourne le manque ──
{
  const db3 = makeDb([{id:1, materialId:10, qteRestante:5, dlc:'2026-08-01', dateReception:'2026-01-01', repriseStock:false}]);
  const m = buildModule()(db3);
  const r = await m.decrementLotsByMaterial(10, 15);
  eq(r.consomme, 5, 'CAS6 · consomme tout ce qui est disponible (5)');
  eq(r.manque, 10, 'CAS6 · manque tracé explicitement (10), pas d\'exception levée');
  eq(db3._store[0].qteRestante, 0, 'CAS6 · le lot est vidé, jamais négatif');
}

// ── CAS 7 — decrementLotsByMaterial : materialId absent → retour gracieux ──
{
  const m = buildModule()(makeDb([]));
  const r = await m.decrementLotsByMaterial(null, 10);
  eq(r.absent, true, 'CAS7 · materialId manquant signalé explicitement');
  eq(r.consomme, 0, 'CAS7 · rien consommé');
  eq(r.manque, 10, 'CAS7 · manque = demande totale');
}

// ── CAS 8 — decrementLotsByMaterial : reprise consommée avant un lot DLC plus proche ──
{
  const db4 = makeDb([
    {id:1, materialId:10, qteRestante:6, dlc:'2026-07-10', dateReception:'2026-05-01', repriseStock:false},
    {id:2, materialId:10, qteRestante:9, dlc:'2026-12-01', dateReception:'2026-01-01', repriseStock:true}
  ]);
  const m = buildModule()(db4);
  const r = await m.decrementLotsByMaterial(10, 3);
  eq(r.consomme, 3, 'CAS8 · 3 consommés');
  eq(db4._store[1].qteRestante, 6, 'CAS8 · pris sur le lot de REPRISE en priorité (9-3=6), pas sur la DLC proche');
  eq(db4._store[0].qteRestante, 6, 'CAS8 · lot DLC proche intact (pas touché tant que la reprise n\'est pas épuisée)');
}

// ── CAS 9 — restockLotsByMaterial : recrédite le lot le plus RÉCEMMENT reçu ──
{
  const db5 = makeDb([
    {id:1, materialId:10, qteRestante:5, dateReception:'2026-01-01'},
    {id:2, materialId:10, qteRestante:5, dateReception:'2026-06-01'}   // plus récent
  ]);
  const m = buildModule()(db5);
  const r = await m.restockLotsByMaterial(10, 4);
  eq(r.credite, 4, 'CAS9 · 4 unités créditées');
  eq(r.lotId, 2, 'CAS9 · crédité sur le lot le plus récent (id 2)');
  eq(db5._store[1].qteRestante, 9, 'CAS9 · quantité du lot récent augmentée (5+4=9)');
  eq(db5._store[0].qteRestante, 5, 'CAS9 · lot ancien inchangé');
}

// ── CAS 10 — restockLotsByMaterial : aucun lot existant → rien où recréditer ──
{
  const m = buildModule()(makeDb([]));
  const r = await m.restockLotsByMaterial(10, 4);
  eq(r.credite, 0, 'CAS10 · rien crédité si aucun lot du matériau n\'existe');
  eq(r.absent, true, 'CAS10 · absence explicitement signalée');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 16 : FIFO matières ===\n');
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
