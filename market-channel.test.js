/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 30 : computeMarketChannelAnalysis (taux d'écoulement)
   ----------------------------------------------------------------------------
   Fige le calcul du taux d'écoulement marché (écoulé/emporté, anti-biais de
   volume) et la détection des "stars cachées" (taux ≥90% mais petit volume sous
   la médiane → probable demande insatisfaite) et du "surstock" (taux <55%).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const computeMarketChannelAnalysis = extractFunction('computeMarketChannelAnalysis');
  const code = `
    const BIG_FORMATS = ['Chocolat', 'Myrtille framboise', 'Mangue passion', 'Madeleine'];
    function aiNormalize(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim(); }
    ${computeMarketChannelAnalysis}
    return computeMarketChannelAnalysis;
  `;
  return new Function('db', code);
}

function makeDb({moves=[], recipes=[]}){
  return {
    marketMoves: { toArray: async()=>moves.slice() },
    recipes: { toArray: async()=>recipes.slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){
const factory = buildModule();

// ── CAS 1 — Taux d'écoulement simple : (sortie - retour - don - perte) / sortie ──
{
  const moves = [
    { marketId:1, parfum:'Chocolat noir', type:'sortie', qte:20 },
    { marketId:1, parfum:'Chocolat noir', type:'retour', qte:5 }
  ];
  const cmca = factory(makeDb({moves}));
  const r = await cmca({});
  const l = r.lignes.find(x=>x.parfum==='Chocolat noir');
  eq(l.emporte, 20, 'CAS1 · emporté = total sortie (20)');
  eq(l.ecoule, 15, 'CAS1 · écoulé = 20 sortie - 5 retour = 15');
  eq(l.taux, 75, 'CAS1 · taux = 15/20 = 75%');
}

// ── CAS 2 — Don et perte comptent aussi en déduction de l'écoulement (pas vendus non plus) ──
{
  const moves = [
    { marketId:1, parfum:'Vanille', type:'sortie', qte:30 },
    { marketId:1, parfum:'Vanille', type:'don', qte:2 },
    { marketId:1, parfum:'Vanille', type:'perte', qte:3 }
  ];
  const cmca = factory(makeDb({moves}));
  const r = await cmca({});
  const l = r.lignes.find(x=>x.parfum==='Vanille');
  eq(l.ecoule, 25, 'CAS2 · écoulé = 30 - 0(retour) - 2(don) - 3(perte) = 25');
}

// ── CAS 3 — Parfum jamais sorti (emporte=0) : exclu des lignes retournées ──
{
  const moves = [
    { marketId:1, parfum:'Fantome', type:'retour', qte:5 }   // retour sans sortie préalable enregistrée
  ];
  const cmca = factory(makeDb({moves}));
  const r = await cmca({});
  eq(r.lignes.some(l=>l.parfum==='Fantome'), false, 'CAS3 · parfum sans sortie (emporte=0) exclu des lignes (filter l.emporte>0)');
}

// ── CAS 4 — STAR CACHÉE : taux très élevé (≥90%) mais volume sous la médiane, pas grand format ──
{
  const moves = [
    // Parfum A : gros volume, taux moyen (60%) → sert à définir la médiane haute
    { marketId:1, parfum:'A', type:'sortie', qte:100 }, { marketId:1, parfum:'A', type:'retour', qte:40 },
    // Parfum B : petit volume, taux quasi parfait (95%) → star cachée
    { marketId:1, parfum:'B', type:'sortie', qte:10 }, { marketId:1, parfum:'B', type:'retour', qte:0 },
    { marketId:2, parfum:'B', type:'sortie', qte:10 }, { marketId:2, parfum:'B', type:'retour', qte:1 }
  ];
  const cmca = factory(makeDb({moves}));
  const r = await cmca({});
  const b = r.lignes.find(l=>l.parfum==='B');
  eq(b.taux>=90, true, 'CAS4 · parfum B a bien un taux ≥90%');
  eq(b.starCachee, true, 'CAS4 · petit volume + taux quasi parfait → détecté comme star cachée');
}

// ── CAS 5 — SURSTOCK : taux <55% → signalé, jamais star cachée en même temps ──
{
  const moves = [
    { marketId:1, parfum:'Invendu', type:'sortie', qte:50 },
    { marketId:1, parfum:'Invendu', type:'retour', qte:30 }   // écoulé = 20/50 = 40%
  ];
  const cmca = factory(makeDb({moves}));
  const r = await cmca({});
  const l = r.lignes.find(x=>x.parfum==='Invendu');
  eq(l.surstock, true, 'CAS5 · taux 40% (<55%) → signalé surstock');
  eq(l.starCachee, false, 'CAS5 · jamais star cachée en même temps que surstock');
}

// ── CAS 6 — Grand format JAMAIS marqué star cachée, même avec un taux élevé et petit volume ──
{
  const moves = [
    { marketId:1, parfum:'A', type:'sortie', qte:100 }, { marketId:1, parfum:'A', type:'retour', qte:40 },
    { marketId:1, parfum:'Chocolat', type:'sortie', qte:5 }, { marketId:1, parfum:'Chocolat', type:'retour', qte:0 }
  ];
  const cmca = factory(makeDb({moves}));
  const r = await cmca({});
  const choc = r.lignes.find(l=>l.parfum==='Chocolat');
  eq(choc.isGF, true, 'CAS6 · Chocolat reconnu comme grand format (BIG_FORMATS)');
  eq(choc.starCachee, false, 'CAS6 · un grand format n\'est JAMAIS marqué star cachée, même avec taux 100% et petit volume');
  eq(r.grandsFormats.some(l=>l.parfum==='Chocolat'), true, 'CAS6 · classé dans grandsFormats');
  eq(r.standards.some(l=>l.parfum==='Chocolat'), false, 'CAS6 · jamais dans standards');
}

// ── CAS 7 — Aucun mouvement du tout : hasData=false, pas de crash ──
{
  const cmca = factory(makeDb({}));
  const r = await cmca({});
  eq(r.hasData, false, 'CAS7 · aucun mouvement marché → hasData=false');
  eq(r.lignes.length, 0, 'CAS7 · aucune ligne');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 30 : computeMarketChannelAnalysis ===\n');
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
