/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 14 : computeScenarioPrix (module scénarios)
   ----------------------------------------------------------------------------
   Fige le comportement du calcul d'impact d'un changement de prix : volume
   constant vs ajusté, extrapolation mensuelle/annuelle, cas sans vente.
   Ne teste PAS l'impact runway (dépend de computeTresorerie, déjà couvert
   séparément par la vague 13) — testé ici en isolation sur la mécanique prix.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const money2 = extractConstLine('money2');
  const round3 = extractConstLine('round3');
  // On stub analyzeFlavorProfitability et estReprise/computeTresorerie pour isoler
  // strictement la mécanique de calcul du scénario (pas re-tester le moteur de marge,
  // déjà source de vérité ailleurs).
  const computeScenarioPrix = extractFunction('computeScenarioPrix');
  const code = `
    ${money2}
    ${round3}
    const today = () => '2026-07-09';
    ${computeScenarioPrix}
    return { computeScenarioPrix };
  `;
  const factory = new Function('db', 'getSettings', 'getRecurringCharges', 'analyzeFlavorProfitability', 'estReprise', 'computeTresorerie', '_computeTresorerieAvec', code);
  return factory;
}

function makeEnv({totals, settings={}}){
  const db = {
    orders:{toArray:async()=>[]}, markets:{toArray:async()=>[]}, marketMoves:{toArray:async()=>[]},
    recipes:{toArray:async()=>[]}, recipeItems:{toArray:async()=>[]}, materialLots:{toArray:async()=>[]},
    materials:{toArray:async()=>[]}, productions:{toArray:async()=>[]}, charges:{toArray:async()=>[]}
  };
  const getSettings = () => Object.assign({socialGoods:12.3, socialService:25.6}, settings);
  const getRecurringCharges = () => [];
  const analyzeFlavorProfitability = () => ({ totals });
  const estReprise = () => false;
  const computeTresorerie = async () => ({ solde:null, soldeDate:null, jalons:[] });   // pas testé ici
  const _computeTresorerieAvec = async () => [];
  return { db, getSettings, getRecurringCharges, analyzeFlavorProfitability, estReprise, computeTresorerie, _computeTresorerieAvec };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, label, tol=0.5){
  if(Math.abs(actual-expected)<=tol){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu ≈ ${expected}\n      obtenu   : ${actual}`); }
}

async function run(){

// ── CAS 1 — Aucune vente sur la période : retourne ok:false, pas de crash ──
{
  const env = makeEnv({ totals:{ca:0, pieces:0, margeNette:0} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges, env.analyzeFlavorProfitability, env.estReprise, env.computeTresorerie, env._computeTresorerieAvec);
  const r = await m.computeScenarioPrix({periodeStart:'2026-06-01', periodeEnd:'2026-06-30', pctPrix:10});
  eq(r.ok, false, 'CAS1 · pas de vente → ok:false');
}

// ── CAS 2 — Volume CONSTANT, hausse de prix +10% : CA et marge montent proportionnellement ──
{
  // Base : 1000 pièces vendues, CA 1400€ (1.40€/pièce), marge nette 400€ (donc coût ~1.00€/pièce)
  const env = makeEnv({ totals:{ca:1400, pieces:1000, margeNette:400} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges, env.analyzeFlavorProfitability, env.estReprise, env.computeTresorerie, env._computeTresorerieAvec);
  const r = await m.computeScenarioPrix({periodeStart:'2026-06-01', periodeEnd:'2026-06-30', pctPrix:10, mode:'constant'});
  eq(r.ok, true, 'CAS2 · ok:true');
  eq(r.piecesSim, 1000, 'CAS2 · volume constant : pièces simulées = pièces de base');
  near(r.prixMoyenSim, 1.54, 'CAS2 · nouveau prix moyen = 1.40 × 1.10 = 1.54');
  near(r.caSim, 1540, 'CAS2 · CA simulé = 1.54 × 1000 = 1540');
  near(r.deltaCa, 140, 'CAS2 · delta CA = 1540 - 1400 = 140');
}

// ── CAS 3 — Volume AJUSTÉ, hausse prix +10% mais volume -5% (élasticité saisie) ──
{
  const env = makeEnv({ totals:{ca:1400, pieces:1000, margeNette:400} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges, env.analyzeFlavorProfitability, env.estReprise, env.computeTresorerie, env._computeTresorerieAvec);
  const r = await m.computeScenarioPrix({periodeStart:'2026-06-01', periodeEnd:'2026-06-30', pctPrix:10, mode:'ajuste', pctVolume:-5});
  eq(r.piecesSim, 950, 'CAS3 · volume ajusté : 1000 × (1-0.05) = 950');
  near(r.caSim, 1463, 'CAS3 · CA simulé = 1.54 × 950 ≈ 1463', 1);
}

// ── CAS 4 — Baisse de prix : delta négatif cohérent ──
{
  const env = makeEnv({ totals:{ca:1400, pieces:1000, margeNette:400} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges, env.analyzeFlavorProfitability, env.estReprise, env.computeTresorerie, env._computeTresorerieAvec);
  const r = await m.computeScenarioPrix({periodeStart:'2026-06-01', periodeEnd:'2026-06-30', pctPrix:-10, mode:'constant'});
  near(r.prixMoyenSim, 1.26, 'CAS4 · baisse 10% : nouveau prix = 1.40 × 0.90 = 1.26');
  eq(r.deltaCa<0, true, 'CAS4 · delta CA négatif en cas de baisse de prix (volume constant)');
}

// ── CAS 5 — Extrapolation mensuelle : période de 30 jours ≈ 1 mois équivalent ──
{
  const env = makeEnv({ totals:{ca:1400, pieces:1000, margeNette:400} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges, env.analyzeFlavorProfitability, env.estReprise, env.computeTresorerie, env._computeTresorerieAvec);
  const r = await m.computeScenarioPrix({periodeStart:'2026-06-01', periodeEnd:'2026-06-30', pctPrix:10, mode:'constant'});
  near(r.moisEquiv, 1, 'CAS5 · période de 30 jours ≈ 1 mois équivalent', 0.1);
  near(r.deltaCaMois, r.deltaCa, 'CAS5 · delta mensuel ≈ delta de la période (1 mois, tolérance jours/mois moyen)', 3);
  near(r.deltaCaAn, r.deltaCaMois*12, 'CAS5 · delta annuel = delta mensuel × 12', 1);
}

// ── CAS 6 — Extrapolation sur une période de 90 jours (≈3 mois) : delta mensuel divisé par 3 ──
{
  const env = makeEnv({ totals:{ca:4200, pieces:3000, margeNette:1200} });   // volume 3x sur 3 mois
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges, env.analyzeFlavorProfitability, env.estReprise, env.computeTresorerie, env._computeTresorerieAvec);
  const r = await m.computeScenarioPrix({periodeStart:'2026-04-01', periodeEnd:'2026-06-29', pctPrix:10, mode:'constant'});
  near(r.moisEquiv, 3, 'CAS6 · période de ~90 jours ≈ 3 mois équivalent', 0.15);
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 14 : computeScenarioPrix ===\n');
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
