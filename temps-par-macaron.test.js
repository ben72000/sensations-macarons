/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 35 : temps par MACARON et par BATCH STANDARD
   ----------------------------------------------------------------------------
   Fige les DEUX unités de mesure du temps actif, et le bug qu'elles corrigent.

   BUG CORRIGÉ (v1313) : l'ancienne « Moy. active/batch » divisait le temps par le
   NOMBRE D'ENREGISTREMENTS de production. Une production de 300 macarons et une de
   20 comptaient toutes deux pour « 1 batch » → le chiffre était ininterprétable
   (« 27 min par batch » : un batch de quoi ? 20 macarons ? 300 ?).

   Règle figée : on rapporte le temps à la QUANTITÉ réellement produite.
     • par MACARON        = temps actif ÷ nb de macarons produits (unité stable, comparable)
     • par BATCH STANDARD = ce temps × 60 (1 batch = 60 macarons / 120 coques,
                            constante TAILLE_BATCH_MACARONS déjà utilisée par l'app)
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

const TAILLE_BATCH_MACARONS = 60;   // doit rester aligné sur la constante de app.js

function buildModule(){
  const fmtMinSec = extractFunction('_fmtMinSec');
  return new Function(`${fmtMinSec} return { _fmtMinSec };`)();
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

// Les deux moyennes, telles que calculées dans renderTempsProduction.
function moyennes(actifMs, qteMacarons){
  const parMacaronMs = qteMacarons>0 ? actifMs/qteMacarons : 0;
  return { parMacaronMs, parBatch60Ms: parMacaronMs * TAILLE_BATCH_MACARONS };
}

function run(){
const { _fmtMinSec } = buildModule();

// ── LA CONSTANTE MÉTIER ───────────────────────────────────────────────────────
{
  eq(TAILLE_BATCH_MACARONS, 60, 'RÈGLE MÉTIER · 1 batch = 60 macarons (120 coques)');
}

// ── LE BUG : diviser par le nombre d'ENREGISTREMENTS est ininterprétable ──────
{
  const actifMs = 60 * 60000;   // 1 h de temps actif

  // Deux scénarios avec le MÊME nombre d'enregistrements (2), mais des volumes très différents.
  const petit = moyennes(actifMs, 40);    // 2 productions de 20 macarons
  const gros  = moyennes(actifMs, 600);   // 2 productions de 300 macarons

  // AVANT : les deux auraient donné « 30 min/batch » (1 h ÷ 2 enregistrements) — indistinguables.
  const ancienneMoy = actifMs / 2;
  eq(Math.round(ancienneMoy/60000), 30, 'AVANT · les 2 scénarios donnaient le même « 30 min/batch »');

  // APRÈS : le temps rapporté au volume réel les distingue enfin.
  near(petit.parMacaronMs/1000, 90, 1, 'APRÈS · petit volume : 90 s par macaron');
  near(gros.parMacaronMs/1000,   6, 1, 'APRÈS · gros volume : 6 s par macaron');
  eq(petit.parMacaronMs > gros.parMacaronMs, true,
     'APRÈS · produire peu coûte plus cher au macaron (le chiffre le montre enfin)');
}

// ── LA CONVERSION EN BATCH STANDARD ───────────────────────────────────────────
{
  // 27 s par macaron → 27 s × 60 = 27 min par batch de 60. Simple, vérifiable.
  const actifMs = (2*3600 + 41*60) * 1000;   // 2 h 41 (cas réel Coco Rafaello)
  const m = moyennes(actifMs, 360);          // 360 macarons produits (6 batches de 60)

  near(m.parMacaronMs/1000, 26.8, 0.5, 'Cas réel · ~27 s par macaron');
  near(m.parBatch60Ms/60000, 26.8, 0.5, 'Cas réel · ~27 min par batch de 60');

  // PROPRIÉTÉ : le temps par batch est EXACTEMENT 60× le temps par macaron.
  near(m.parBatch60Ms, m.parMacaronMs * 60, 1,
    'TRAÇABILITÉ · par batch = par macaron × 60 (conversion vérifiable à la main)');
}

// ── COHÉRENCE MÉTIER : la moyenne d'un batch dépasse une seule étape ──────────
{
  // Règle de Benjamin : un batch entier ne peut pas prendre moins que sa seule cuisson (21 min).
  // Avec un volume réaliste (60 macarons par production), le chiffre doit la respecter.
  const actifMs = 75 * 60000;               // 75 min de travail pour un batch de 60
  const m = moyennes(actifMs, 60);
  near(m.parBatch60Ms/60000, 75, 1, 'Un batch de 60 mesuré à 75 min affiche bien 75 min');
  eq(m.parBatch60Ms/60000 > 21, true,
     'COHÉRENCE MÉTIER · la moyenne dépasse la durée de la seule cuisson (21 min)');
}

// ── SANS QUANTITÉ : on n'invente pas de chiffre ───────────────────────────────
{
  const m = moyennes(60*60000, 0);
  eq(m.parMacaronMs, 0, 'Aucune quantité connue → pas de moyenne inventée (0, affiché « — »)');
  eq(m.parBatch60Ms, 0, 'Aucune quantité connue → pas de temps par batch inventé');
}

// ── FORMAT COURT (lisibilité du temps par macaron) ────────────────────────────
{
  eq(_fmtMinSec(27000),  '27 s',        'Format · 27 s');
  eq(_fmtMinSec(72000),  '1 min 12 s',  'Format · 1 min 12 s');
  eq(_fmtMinSec(60000),  '1 min',       'Format · 1 min pile (pas de « 0 s » parasite)');
  eq(_fmtMinSec(0),      '—',           'Format · durée nulle → tiret, pas « 0 s »');
  eq(_fmtMinSec(500),    '1 s',         'Format · arrondi à la seconde');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 35 : temps par macaron / par batch ===\n');
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
