/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 32 : computeGaspillage (coût du gaspillage marché)
   ----------------------------------------------------------------------------
   Fige le filtre STRICT sur le vrai gaspillage (type='retour' ET destination=
   'ecarte' — un retour recongelé n'est PAS un gaspillage), le calcul du coût
   complet (matière + main d'œuvre + quote-part déplacement au prorata de ce qui
   a été embarqué), et l'agrégation par parfum. avgMacaronCost/coutRecette/
   computeDeliveryCost sont STUBBÉES (calcul de coût détaillé, hors périmètre).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(opts){
  opts = opts || {};
  const avgMat = opts.avgMat!=null ? opts.avgMat : 0.20;
  const livTotal = opts.livTotal!=null ? opts.livTotal : 0;
  const money2 = extractConstLine('money2');
  const round3 = extractConstLine('round3');
  const computeGaspillage = extractFunction('computeGaspillage');
  const code = `
    ${money2}
    ${round3}
    function getSettings(){ return { laborRate: 15 }; }
    function avgMacaronCost(){ return ${avgMat}; }
    function coutRecette(){ return 0; }   // pas de recette précise dans ces tests → repli avgMat
    function computeDeliveryCost(){ return { total: ${livTotal} }; }
    ${computeGaspillage}
    return computeGaspillage;
  `;
  return new Function('db', code);
}

function makeDb({recipes=[], recipeItems=[], lots=[], markets=[], moves=[]}){
  return {
    recipes: { toArray: async()=>recipes.slice() },
    recipeItems: { toArray: async()=>recipeItems.slice() },
    materialLots: { toArray: async()=>lots.slice() },
    markets: { toArray: async()=>markets.slice() },
    marketMoves: { toArray: async()=>moves.slice() }
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — SEUL le retour 'ecarte' (vraiment jeté) compte, jamais un retour recongelé ──
{
  const markets = [{id:1, date:'2026-05-01', distanceKm:0}];
  const moves = [
    { marketId:1, type:'retour', destination:'ecarte', parfum:'Chocolat', qte:5 },
    { marketId:1, type:'retour', destination:'recongele', parfum:'Vanille', qte:20 }   // recongelé : PAS un gaspillage
  ];
  const cg = buildModule({})(makeDb({markets, moves}));
  const r = await cg({});
  eq(r.lignes.some(l=>l.parfum==='Chocolat'), true, 'CAS1 · le retour écarté (jeté) est bien compté');
  eq(r.lignes.some(l=>l.parfum==='Vanille'), false, 'CAS1 · le retour recongelé n\'est JAMAIS compté comme gaspillage');
  eq(r.totQte, 5, 'CAS1 · quantité totale gaspillée = 5 (pas 25)');
}

// ── CAS 2 — Coût matière = quantité × coût moyen (repli sans recette précise) ──
{
  const markets = [{id:1, date:'2026-05-01'}];
  const moves = [{ marketId:1, type:'retour', destination:'ecarte', parfum:'Chocolat', qte:10 }];
  const cg = buildModule({avgMat:0.30})(makeDb({markets, moves}));
  const r = await cg({});
  eq(r.totMat, 3, 'CAS2 · coût matière = 10 × 0.30 = 3 (repli sur le coût moyen)');
}

// ── CAS 3 — Quote-part de déplacement : coût du trajet réparti au prorata de ce qui a été EMBARQUÉ ──
{
  const markets = [{id:1, date:'2026-05-01'}];
  const moves = [
    { marketId:1, type:'sortie', parfum:'Chocolat', qte:100 },   // 100 emportés au total
    { marketId:1, type:'retour', destination:'ecarte', parfum:'Chocolat', qte:10 }   // 10 jetés
  ];
  const cg = buildModule({livTotal:50})(makeDb({markets, moves}));   // coût du trajet = 50€ pour 100 emportés
  const r = await cg({});
  // quote-part par macaron = 50/100 = 0.5€. 10 jetés × 0.5 = 5€ de coût déplacement gaspillé.
  eq(r.totDep, 5, 'CAS3 · coût déplacement gaspillé = 10 jetés × (50€/100 emportés) = 5');
}

// ── CAS 4 — Aucun embarquement enregistré sur un marché : quote-part déplacement = 0 (pas de crash division/0) ──
{
  const markets = [{id:1, date:'2026-05-01'}];
  const moves = [{ marketId:1, type:'retour', destination:'ecarte', parfum:'Chocolat', qte:5 }];   // pas de 'sortie'
  const cg = buildModule({livTotal:50})(makeDb({markets, moves}));
  const r = await cg({});
  eq(r.totDep, 0, 'CAS4 · aucun embarquement connu → quote-part déplacement = 0, pas de division par zéro');
}

// ── CAS 5 — Filtre par date (opts.start) : marchés antérieurs exclus ──
{
  const markets = [
    { id:1, date:'2026-04-01' },   // avant le filtre
    { id:2, date:'2026-05-15' }    // après le filtre
  ];
  const moves = [
    { marketId:1, type:'retour', destination:'ecarte', parfum:'A', qte:10 },
    { marketId:2, type:'retour', destination:'ecarte', parfum:'B', qte:5 }
  ];
  const cg = buildModule({})(makeDb({markets, moves}));
  const r = await cg({start:'2026-05-01'});
  eq(r.lignes.some(l=>l.parfum==='A'), false, 'CAS5 · marché antérieur au filtre de date exclu');
  eq(r.lignes.some(l=>l.parfum==='B'), true, 'CAS5 · marché après la date filtrée inclus');
}

// ── CAS 6 — Agrégation par parfum sur PLUSIEURS marchés, triée par coût total décroissant ──
{
  const markets = [{id:1, date:'2026-05-01'},{id:2, date:'2026-05-08'}];
  const moves = [
    { marketId:1, type:'retour', destination:'ecarte', parfum:'Petit', qte:2 },
    { marketId:2, type:'retour', destination:'ecarte', parfum:'Gros', qte:20 }
  ];
  const cg = buildModule({avgMat:1})(makeDb({markets, moves}));
  const r = await cg({});
  eq(r.lignes[0].parfum, 'Gros', 'CAS6 · le parfum au coût total le plus élevé (Gros, 20 unités) arrive en tête');
}

// ── CAS 7 — Aucun gaspillage du tout : lignes vides, totaux à 0, pas de crash ──
{
  const cg = buildModule({})(makeDb({}));
  const r = await cg({});
  eq(r.lignes.length, 0, 'CAS7 · aucun marché ni mouvement → aucune ligne');
  eq(r.totalEuro, 0, 'CAS7 · total euro = 0 proprement');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 32 : computeGaspillage ===\n');
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
