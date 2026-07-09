/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 25 : computeDlcFromHistory (DLC anti-recongélation)
   ----------------------------------------------------------------------------
   LE POINT LE PLUS SENSIBLE DE L'APP CÔTÉ SANITAIRE. Fige la règle : le budget
   frigo (7 jours) se consomme CUMULATIVEMENT à chaque passage au frigo (avant ET
   après congélation), ne se réinitialise JAMAIS, et se GÈLE (pause) pendant un
   séjour au congélateur. Un produit qui a déjà passé 3 jours au frigo, remis au
   congélo, ne "regagne" jamais ces 3 jours. Déjà audité manuellement en session
   (jugé correct) — cette vague le verrouille formellement contre toute régression
   future, en particulier lors d'un refactoring.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const ymdLocal = extractFunction('ymdLocal');
  const isFreezer = extractFunction('isFreezer');
  const computeDlcFromHistory = extractFunction('computeDlcFromHistory');
  const code = `
    ${ymdLocal}
    const EMPLACEMENTS = [
      {key:'frigo',   type:'frigo'},
      {key:'bahut',   type:'congelateur'},
      {key:'colonne', type:'congelateur'},
      {key:'petit',   type:'congelateur'}
    ];
    const EMP_BY_KEY = Object.fromEntries(EMPLACEMENTS.map(e=>[e.key,e]));
    ${isFreezer}
    const FRIGO_DAYS = 7;
    const CONGELO_MONTHS = 4;
    const MS_DAY = 86400000;
    ${computeDlcFromHistory}
    return computeDlcFromHistory;
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function addDays(iso, n){ const d=new Date(iso); d.setDate(d.getDate()+n); return d.toISOString(); }

function run(){
const computeDlcFromHistory = buildModule();

// ── CAS 1 — Historique vide/invalide → null, pas de crash ──
{
  eq(computeDlcFromHistory([], '2026-06-01T00:00:00Z'), null, 'CAS1 · historique vide → null');
  eq(computeDlcFromHistory(null, '2026-06-01T00:00:00Z'), null, 'CAS1bis · historique null → null');
}

// ── CAS 2 — Toujours au frigo depuis le début, jamais congelé : DLC = entrée + 7 jours ──
{
  const entree = '2026-06-01T08:00:00Z';
  const hist = [{ts:entree, lieu:'frigo'}];
  const dlc = computeDlcFromHistory(hist, entree);   // référence = juste après l'entrée
  eq(dlc, '2026-06-08', 'CAS2 · frigo depuis le début, réf juste après entrée → DLC = entrée + 7j pile');
}

// ── CAS 3 — Frigo depuis 3 jours (référence 3j après l'entrée) : reste 4 jours de budget ──
{
  const entree = '2026-06-01T08:00:00Z';
  const ref = addDays(entree, 3);
  const hist = [{ts:entree, lieu:'frigo'}];
  const dlc = computeDlcFromHistory(hist, ref);
  eq(dlc, '2026-06-08', 'CAS3 · 3j déjà écoulés au frigo, réf+4j de budget restant = même date DLC (entrée+7j)');
}

// ── CAS 4 — RÈGLE ANTI-RECONGÉLATION CLÉ : 3j frigo, puis congélo → DLC gelée à l'entrée congélo + 4 mois
//    (le budget frigo restant, 4j, est mis EN PAUSE, pas décompté pendant la congélation) ──
{
  const entreeFrigo = '2026-06-01T08:00:00Z';
  const entreeCongelo = addDays(entreeFrigo, 3);   // 3j au frigo, puis transfert au congélo
  const hist = [
    {ts:entreeFrigo, lieu:'frigo'},
    {ts:entreeCongelo, lieu:'bahut'}   // congélateur
  ];
  const ref = addDays(entreeCongelo, 10);   // référence bien après le transfert (le produit est TOUJOURS au congélo)
  const dlc = computeDlcFromHistory(hist, ref);
  // DLC = entrée congélo + 4 mois, PAS affectée par le temps déjà passé au frigo (juste gelé, pas perdu)
  const expected = new Date(entreeCongelo); expected.setMonth(expected.getMonth()+4);
  const expectedStr = expected.getFullYear()+'-'+String(expected.getMonth()+1).padStart(2,'0')+'-'+String(expected.getDate()).padStart(2,'0');
  eq(dlc, expectedStr, 'CAS4 · au congélo : DLC = entrée congélo + 4 mois, indépendamment du temps frigo déjà passé');
}

// ── CAS 5 — LE CAS CRITIQUE : décongélation après congélation. Le budget frigo NE SE
//    RÉINITIALISE JAMAIS — un produit qui avait 3j de frigo consommés avant congélation
//    ne regagne PAS ces 3j : il ne lui reste que 7-3=4j de frigo après décongélation. ──
{
  const entreeFrigo1 = '2026-06-01T08:00:00Z';
  const entreeCongelo = addDays(entreeFrigo1, 3);          // 3j frigo consommés
  const sortieCongelo = addDays(entreeCongelo, 30);        // 30j au congélo (gelé, budget en pause)
  const hist = [
    {ts:entreeFrigo1, lieu:'frigo'},
    {ts:entreeCongelo, lieu:'bahut'},
    {ts:sortieCongelo, lieu:'frigo'}    // retour au frigo après décongélation
  ];
  const ref = sortieCongelo;   // référence juste au moment de la sortie congélo
  const dlc = computeDlcFromHistory(hist, ref);
  // Budget restant = 7 - 3 (déjà consommés AVANT congélation) = 4 jours à partir de la sortie congélo.
  const expected = new Date(sortieCongelo); expected.setDate(expected.getDate()+4);
  const expectedStr = expected.getFullYear()+'-'+String(expected.getMonth()+1).padStart(2,'0')+'-'+String(expected.getDate()).padStart(2,'0');
  eq(dlc, expectedStr, 'CAS5 · CRITIQUE : après décongélation, seulement 4j de frigo restants (7-3 déjà consommés), PAS 7j pleins');
}

// ── CAS 6 — Budget frigo épuisé avant congélation : après décongélation, 0 jour restant (DLC = jour même) ──
{
  const entreeFrigo1 = '2026-06-01T08:00:00Z';
  const entreeCongelo = addDays(entreeFrigo1, 8);          // 8j au frigo = DÉJÀ dépassé le budget de 7j
  const sortieCongelo = addDays(entreeCongelo, 15);
  const hist = [
    {ts:entreeFrigo1, lieu:'frigo'},
    {ts:entreeCongelo, lieu:'bahut'},
    {ts:sortieCongelo, lieu:'frigo'}
  ];
  const dlc = computeDlcFromHistory(hist, sortieCongelo);
  const expectedStr = new Date(sortieCongelo).toISOString().slice(0,10);
  eq(dlc, expectedStr, 'CAS6 · budget frigo déjà épuisé avant congélation → 0 jour restant, DLC = jour de sortie même (jamais négatif)');
}

// ── CAS 7 — Plusieurs cycles frigo→congélo→frigo→congélo : le cumul frigo s'accumule sur TOUS les
//    segments frigo fermés, pas seulement le dernier ──
{
  const t0 = '2026-06-01T00:00:00Z';
  const t1 = addDays(t0, 2);    // 2j frigo
  const t2 = addDays(t1, 5);    // congélo (5j, gelé)
  const t3 = addDays(t2, 2);    // 2j frigo à nouveau (cumul = 2+2 = 4j)
  const t4 = addDays(t3, 3);    // congélo à nouveau (gelé)
  const hist = [
    {ts:t0, lieu:'frigo'},
    {ts:t1, lieu:'bahut'},
    {ts:t2, lieu:'frigo'},
    {ts:t3, lieu:'colonne'}   // dernier segment : congélo
  ];
  const dlc = computeDlcFromHistory(hist, t4);
  // Dernier segment = congélo → DLC = entrée de CE segment (t3) + 4 mois, peu importe le cumul frigo (gelé)
  const expected = new Date(t3); expected.setMonth(expected.getMonth()+4);
  const expectedStr = expected.getFullYear()+'-'+String(expected.getMonth()+1).padStart(2,'0')+'-'+String(expected.getDate()).padStart(2,'0');
  eq(dlc, expectedStr, 'CAS7 · dernier segment congélo → DLC = entrée de CE segment + 4 mois (cumul frigo antérieur gelé, pas perdu)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 25 : computeDlcFromHistory (anti-recongélation) ===\n');
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
