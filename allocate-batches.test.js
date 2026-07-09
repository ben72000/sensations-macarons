/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 17 : allocateBatches (moteur d'allocation)
   ----------------------------------------------------------------------------
   Fige le comportement du moteur central du picking (batch et normal) : cascade
   FIFO par DLC au sein d'une zone, priorité de zone par pertinence (zones qui
   couvrent le plus de parfums en premier), jamais de mélange grand format /
   petit format, et calcul des manques (shortages) quand le stock ne suffit pas.
   Filet de sécurité en vue d'un futur refactoring.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const round3 = extractConstLine('round3');
  const prodComposant = extractFunction('prodComposant');
  const prodVendable = extractFunction('prodVendable');
  const pickFlavorMatch = extractFunction('pickFlavorMatch');
  const empInfo = extractFunction('empInfo');
  const allocateBatches = extractFunction('allocateBatches');
  const code = `
    ${round3}
    const normTxt = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
    const GF_MARK = '\\u0001GF';
    function isGFKey(k){ return typeof k==='string' && k.endsWith(GF_MARK); }
    function gfBase(k){ return isGFKey(k) ? k.slice(0, -GF_MARK.length) : k; }
    ${prodComposant}
    ${prodVendable}
    ${pickFlavorMatch}
    // MATURATION_ETATS/prodMaturation réimplémentés localement (objet multi-ligne, non extractible
    // via extractConstLine) — seul le fait de retourner null ou une valeur importe ici.
    const MATURATION_ETATS = { fait:{}, apres:{}, nonrequis:{} };
    function prodMaturation(p){ return p && MATURATION_ETATS[p.maturation] ? p.maturation : null; }
    // EMPLACEMENTS réimplémenté localement (même clés que app.js), nécessaire à empInfo.
    const EMPLACEMENTS = [
      {key:'frigo',   lettre:'F', nom:'Frigo',                type:'frigo',      icon:'🧊'},
      {key:'bahut',   lettre:'B', nom:'Congélateur bahut',    type:'congelateur',icon:'❄️'},
      {key:'colonne', lettre:'C', nom:'Congélateur colonne',  type:'congelateur',icon:'❄️'},
      {key:'petit',   lettre:'A', nom:'Petit congélateur',    type:'congelateur',icon:'❄️'}
    ];
    const EMP_BY_KEY = Object.fromEntries(EMPLACEMENTS.map(e=>[e.key,e]));
    ${empInfo}
    ${allocateBatches}
    return { allocateBatches, GF_MARK };
  `;
  return new Function(code)();
}

function prod(id, recipeId, qte, opts){
  opts=opts||{};
  return Object.assign({id, recipeId, qteRestante:qte, emplacement:opts.emp||'frigo',
    lotProduction:opts.lot||('L'+id), dlcProduit:opts.dlc||'2026-08-01',
    niveauNom:'', boiteNom:''}, opts.extra||{});
}
function recipe(id, nom, grandFormat){ return {id, produitNom:nom, grandFormat:!!grandFormat}; }

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

function run(){
const { allocateBatches } = buildModule();

// ── CAS 1 — Allocation simple : un seul parfum, un seul lot suffisant ──
{
  const needs = {Chocolat: 10};
  const prods = [prod(1, 100, 20, {emp:'frigo', dlc:'2026-08-01'})];
  const recipes = [recipe(100, 'Chocolat')];
  const r = allocateBatches(needs, prods, recipes);
  eq(r.plan.length, 1, 'CAS1 · un seul pick dans le plan');
  eq(r.plan[0].qte, 10, 'CAS1 · quantité exacte prélevée');
  eq(r.shortages.length, 0, 'CAS1 · aucun manque');
}

// ── CAS 2 — FIFO par DLC au sein d'une même zone : le lot le plus proche d'abord ──
{
  const needs = {Chocolat: 15};
  const prods = [
    prod(1, 100, 10, {emp:'frigo', dlc:'2026-09-01'}),   // DLC lointaine
    prod(2, 100, 10, {emp:'frigo', dlc:'2026-07-15'})    // DLC proche
  ];
  const recipes = [recipe(100, 'Chocolat')];
  const r = allocateBatches(needs, prods, recipes);
  eq(r.plan[0].prodId, 2, 'CAS2 · le lot à DLC la plus proche (juillet) est pioché en premier');
  eq(r.plan[0].qte, 10, 'CAS2 · tout le lot proche est épuisé (10)');
  eq(r.plan[1].prodId, 1, 'CAS2 · complément pris sur le lot suivant (DLC septembre)');
  eq(r.plan[1].qte, 5, 'CAS2 · complément = 15-10 = 5');
}

// ── CAS 3 — Manque de stock : shortage correctement calculé ──
{
  const needs = {Chocolat: 30};
  const prods = [prod(1, 100, 12, {emp:'frigo'})];
  const recipes = [recipe(100, 'Chocolat')];
  const r = allocateBatches(needs, prods, recipes);
  eq(r.plan[0].qte, 12, 'CAS3 · tout le stock disponible est alloué (12)');
  eq(r.shortages, [{flavor:'Chocolat', manque:18}], 'CAS3 · manque tracé explicitement (30-12=18)');
}

// ── CAS 4 — Grand format et petit format JAMAIS mélangés, même parfum ──
{
  const needs = {Vanille: 5};   // besoin PETIT format (pas de suffixe GF)
  const prods = [
    prod(1, 200, 50, {emp:'frigo', extra:{}}),      // recette Vanille grand format
  ];
  const recipes = [recipe(200, 'Vanille', true)];   // grandFormat:true
  const r = allocateBatches(needs, prods, recipes);
  eq(r.plan.length, 0, 'CAS4 · le lot grand format n\'est PAS utilisé pour un besoin petit format');
  eq(r.shortages, [{flavor:'Vanille', manque:5}], 'CAS4 · manque total car aucun stock petit format compatible');
}

// ── CAS 5 — Priorité de ZONE : la zone couvrant le plus de parfums est traitée en premier ──
{
  // 2 parfums demandés. Zone "frigo" couvre les 2 parfums ; zone "bahut" n'en couvre qu'1.
  // → le plan doit d'abord épuiser ce qu'il peut en "frigo" avant de aller chercher en "bahut".
  const needs = {Chocolat: 5, Citron: 5};
  const prods = [
    prod(1, 100, 5, {emp:'frigo', dlc:'2026-08-01'}),    // Chocolat en frigo
    prod(2, 101, 5, {emp:'frigo', dlc:'2026-08-01'}),    // Citron en frigo
    prod(3, 101, 5, {emp:'bahut', dlc:'2026-08-01'})     // Citron aussi en bahut (zone à 1 seul parfum)
  ];
  const recipes = [recipe(100,'Chocolat'), recipe(101,'Citron')];
  const r = allocateBatches(needs, prods, recipes);
  // Le frigo (zoneScore=2, couvre les 2 parfums) doit être traité avant le bahut (zoneScore=1).
  const zonesOrdre = r.byZone.map(z=>z.emp);
  eq(zonesOrdre[0], 'frigo', 'CAS5 · la zone "frigo" (couvre 2 parfums) est traitée avant "bahut" (1 parfum)');
  eq(r.shortages.length, 0, 'CAS5 · les deux besoins sont entièrement couverts');
}

// ── CAS 6 — Lots à quantité nulle ou négative ignorés (pas de division par zéro / prise fantôme) ──
{
  const needs = {Chocolat: 5};
  const prods = [
    prod(1, 100, 0, {emp:'frigo'}),     // vide, ne doit jamais être proposé
    prod(2, 100, 5, {emp:'frigo'})
  ];
  const recipes = [recipe(100, 'Chocolat')];
  const r = allocateBatches(needs, prods, recipes);
  eq(r.plan.length, 1, 'CAS6 · un seul pick (le lot vide est filtré en amont)');
  eq(r.plan[0].prodId, 2, 'CAS6 · seul le lot avec du stock réel est utilisé');
}

// ── CAS 7 — Parfum non demandé : n'apparaît jamais dans le plan même s'il y a du stock ──
{
  const needs = {Chocolat: 5};
  const prods = [
    prod(1, 100, 10, {emp:'frigo'}),
    prod(2, 999, 10, {emp:'frigo'})   // recette différente, pas demandée
  ];
  const recipes = [recipe(100,'Chocolat'), recipe(999,'Pistache')];
  const r = allocateBatches(needs, prods, recipes);
  eq(r.plan.length, 1, 'CAS7 · seul le parfum demandé apparaît dans le plan');
  eq(r.plan[0].prodId, 1, 'CAS7 · le lot Pistache (non demandé) n\'est jamais pioché');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 17 : allocateBatches ===\n');
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
