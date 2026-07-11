/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 38 : comparaisons à PÉRIMÈTRE COMPARABLE
   ----------------------------------------------------------------------------
   BUG CORRIGÉ (v1318) : l'app comparait la période EN COURS (partielle) à la période
   PASSÉE COMPLÈTE. Le 3 du mois, elle comparait 3 jours de CA à 30 jours du mois
   précédent, et annonçait une chute de −89 % qui ne reflétait QUE le calendrier.
   La recommandation « CA en baisse → relance tes clients » se déclenchait donc à tort,
   tous les débuts de mois.

   Règle métier (Benjamin) : « le 3 du mois, on ne compare pas l'évolution du CA avec le
   mois complet précédent ; il faut une comparaison au prorata du temps écoulé. »

   Règles figées :
     1. Mois en cours → la base de comparaison est le CA du mois précédent RAMENÉ au
        même nombre de jours écoulés.
     2. Mois terminé → comparaison pleine (ratio = 1), aucun prorata parasite.
     3. La base est EXPOSÉE (jours écoulés, jours du mois précédent, ratio) pour être
        vérifiable à la main — exigence de traçabilité.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

function buildModule(){
  const money2 = "const money2 = n => Math.round(n*100)/100;";
  const basePeriodeComparable = extractFunction('_basePeriodeComparable');
  return new Function(`${money2} ${basePeriodeComparable} return { _basePeriodeComparable };`)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, tol, label){
  if(Math.abs(actual-expected) <= tol){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ~${expected} (±${tol})\n      obtenu : ${actual}`); }
}
const evo = (courant, base) => base>0 ? Math.round((courant-base)/base*1000)/10 : (courant>0?100:0);

function run(){
const { _basePeriodeComparable } = buildModule();

// ── LE BUG : le 3 du mois, 3 jours comparés à 30 ─────────────────────────────
{
  // Juin (30 j) a fait 3 000 €. Le 3 juillet, on a déjà fait 320 €.
  const le3juillet = new Date(2026, 6, 3);
  const c = _basePeriodeComparable(3000, le3juillet);

  eq(c.joursEcoules, 3,   'Le 3 juillet → 3 jours écoulés');
  eq(c.joursTotal, 30,    'Juin compte 30 jours');
  eq(c.partiel, true,     'Le mois est encore en cours');
  near(c.ratio, 3/30, 0.001, 'Ratio = 3 j / 30 j');
  near(c.base, 300, 0.01,
    'BASE COMPARABLE · 3 000 € × (3/30) = 300 € réalisés sur les 3 premiers jours de juin');

  // AVANT : comparaison au mois COMPLET → panique injustifiée.
  eq(evo(320, 3000), -89.3, 'AVANT · l\'app annonçait −89,3 % (3 jours comparés à 30)');

  // APRÈS : comparaison à périmètre comparable → la réalité.
  eq(evo(320, c.base), 6.7,
    'BUG VERROUILLÉ · en réalité +6,7 % : tu es EN AVANCE sur le rythme de juin');

  // La conclusion s'inverse : plus d'alerte « CA en baisse » à tort.
  eq(evo(320, 3000) < 0, true,  'AVANT · déclenchait l\'alerte « CA en baisse »');
  eq(evo(320, c.base) < 0, false, 'APRÈS · plus d\'alerte injustifiée');
}

// ── Mois TERMINÉ : comparaison pleine, aucun prorata parasite ────────────────
{
  // Le 31 juillet (dernier jour) : le mois est complet, on compare 1:1.
  const le31juillet = new Date(2026, 6, 31);
  const c = _basePeriodeComparable(3000, le31juillet);
  eq(c.partiel, false, 'Le 31 juillet → le mois est terminé');
  eq(c.ratio, 1,       'Mois terminé → ratio = 1 (aucun prorata)');
  near(c.base, 3000, 0.01, 'Mois terminé → la base est le CA COMPLET du mois précédent');
  eq(evo(3300, c.base), 10, 'Mois terminé · 3 300 € vs 3 000 € = +10 %, comparaison pleine');
}

// ── Longueurs de mois différentes (février !) ────────────────────────────────
{
  // Le 15 mars : février 2026 compte 28 jours (et non 31).
  const le15mars = new Date(2026, 2, 15);
  const c = _basePeriodeComparable(2800, le15mars);
  eq(c.joursTotal, 28, 'Février 2026 compte bien 28 jours (pas 30/31)');
  near(c.base, 2800 * (15/28), 0.01,
    'La base tient compte de la VRAIE longueur du mois précédent (28 j)');
}

// ── Année bissextile ─────────────────────────────────────────────────────────
{
  // Le 10 mars 2025 : février 2024… non — mois précédent = février 2025 (28 j).
  // On vérifie surtout que février d'une année bissextile compte 29 j.
  const le10mars2024 = new Date(2024, 2, 10);
  const c = _basePeriodeComparable(2900, le10mars2024);
  eq(c.joursTotal, 29, 'Février 2024 (bissextile) compte 29 jours');
}

// ── 1er du mois : la base ne doit pas être nulle ni exploser ─────────────────
{
  const le1er = new Date(2026, 6, 1);
  const c = _basePeriodeComparable(3000, le1er);
  eq(c.joursEcoules, 1, 'Le 1er → 1 jour écoulé');
  near(c.base, 100, 0.01, 'Base = 3 000 € / 30 j = 100 € (le CA d\'une journée moyenne)');
  eq(isFinite(evo(120, c.base)), true, 'Aucun calcul aberrant le 1er du mois');
}

// ── Mois précédent à zéro : aucune division par zéro ─────────────────────────
{
  const c = _basePeriodeComparable(0, new Date(2026, 6, 3));
  eq(c.base, 0, 'CA précédent nul → base nulle (pas de NaN)');
  eq(evo(500, c.base), 100, 'Base nulle mais CA positif → +100 % (et non division par zéro)');
}

// ── TRAÇABILITÉ : tout est exposé pour vérification manuelle ─────────────────
{
  const c = _basePeriodeComparable(3000, new Date(2026, 6, 3));
  eq(typeof c.base, 'number',         'TRAÇABILITÉ · la base est exposée');
  eq(typeof c.ratio, 'number',        'TRAÇABILITÉ · le ratio est exposé');
  eq(typeof c.joursEcoules, 'number', 'TRAÇABILITÉ · les jours écoulés sont exposés');
  eq(typeof c.joursTotal, 'number',   'TRAÇABILITÉ · les jours du mois précédent sont exposés');
  // Le calcul doit être refaisable à la main : base = caPrec × joursEcoules / joursTotal
  near(c.base, 3000 * c.joursEcoules / c.joursTotal, 0.01,
    'TRAÇABILITÉ · base = CA précédent × (jours écoulés ÷ jours du mois) — vérifiable à la main');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 38 : comparaisons à périmètre comparable ===\n');
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
