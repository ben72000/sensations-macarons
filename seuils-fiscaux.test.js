/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 19 : computeSeuilsFiscaux (jauges TVA/micro)
   ----------------------------------------------------------------------------
   Fige le calcul des jauges de seuils fiscaux (statut, % de remplissage,
   projection fin d'année, mois d'atteinte estimé) et le flag de péremption
   des seuils (anneeValidite). computeMonthlyBilan est STUBBÉE (déjà couverte
   en profondeur par la vague 4) pour isoler strictement la logique de jauge.
   Filet de sécurité en vue d'un futur refactoring.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(monthlyBilanStub, fakeNow){
  const money2 = extractConstLine('money2');
  const moisDeLannee = extractFunction('_moisDeLannee');
  const computeSeuilsFiscaux = extractFunction('computeSeuilsFiscaux');
  // On extrait aussi la déclaration de SEUILS_FISCAUX_2026 (multi-ligne → réimplémentée
  // localement avec les MÊMES valeurs que app.js, pour rester fidèle au comportement réel).
  const code = `
    ${money2}
    ${moisDeLannee}
    const SEUILS_FISCAUX_2026 = {
      anneeValidite: 2026,
      tvaVenteBase:85000, tvaVenteMajore:93500,
      tvaServiceBase:37500, tvaServiceMajore:41250,
      microVente:203100, microService:83600, microGlobal:203100
    };
    // computeMonthlyBilan STUBBÉE : appelée par son nom depuis computeSeuilsFiscaux (fidèle au
    // code réel), déjà testée en profondeur ailleurs (vague 4) — on ne la reteste pas ici.
    async function computeMonthlyBilan(ym){ return monthlyBilanStub(ym); }
    // Date figée pour un test déterministe (computeSeuilsFiscaux utilise new Date() SANS
    // argument une seule fois, pour lire l'année/mois "courants"). On redéfinit Date comme
    // une fonction constructeur simple qui délègue au vrai Date, sans argument → date figée,
    // avec argument(s) → comportement normal (utilisé par ailleurs dans le module).
    const __RealDate = globalThis.Date;
    function Date(...args){
      const d = args.length ? new __RealDate(...args) : new __RealDate(fakeNow);
      return d;
    }
    Date.prototype = __RealDate.prototype;
    ${computeSeuilsFiscaux}
    return computeSeuilsFiscaux;
  `;
  const factory = new Function('monthlyBilanStub', 'fakeNow', code);
  return factory(monthlyBilanStub, fakeNow);
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Statut des jauges : ok / attention / proche / dépassé selon le % de remplissage ──
{
  // 3 mois écoulés (jan-mar) à 20000/mois → cumul RÉEL sur l'année dépend de computeMonthlyBilan
  // par mois : on ne simule du CA que sur les mois <= mars (les mois futurs sont à 0, cohérent
  // avec une vraie base — aucune commande n'existe encore pour des mois qui n'ont pas eu lieu).
  const stub = (ym) => (ym<='2026-03') ? { goods: 20000, service: 0 } : { goods:0, service:0 };
  const cs = buildModule(stub, '2026-03-15T12:00:00');
  const r = await cs('2026');
  // tvaVenteBase = 85000. 60000/85000 ≈ 70.6% → statut 'attention' (>=70%, <90%)
  eq(r.tvaVente.statut, 'attention', 'CAS1 · ~70% du seuil TVA vente → statut attention');
}

// ── CAS 2 — Seuil dépassé (>=100%) ──
{
  const stub = (ym) => ({ goods: 90000, service: 0 });   // sur 1 seul mois déjà > seuil 85000
  const cs = buildModule(stub, '2026-01-31T12:00:00');
  const r = await cs('2026');
  eq(r.tvaVente.statut, 'depasse', 'CAS2 · CA cumulé > seuil TVA vente → statut dépassé');
  eq(r.tvaVente.pct, 100, 'CAS2 · pct plafonné à 100 même si dépassement réel plus important');
}

// ── CAS 3 — Statut ok en dessous de 70% ──
{
  const stub = (ym) => (ym<='2026-02') ? { goods: 5000, service: 0 } : { goods:0, service:0 };
  const cs = buildModule(stub, '2026-02-15T12:00:00');
  const r = await cs('2026');
  // 5000 × 2 mois = 10000 / 85000 ≈ 11.8% → ok
  eq(r.tvaVente.statut, 'ok', 'CAS3 · loin du seuil (~12%) → statut ok');
}

// ── CAS 4 — Ventilation goods/service alimente des jauges DISTINCTES ──
{
  const stub = (ym) => (ym<='2026-01') ? { goods: 10000, service: 30000 } : { goods:0, service:0 };
  const cs = buildModule(stub, '2026-01-31T12:00:00');
  const r = await cs('2026');
  eq(r.tvaVente.pctReel < 20, true, 'CAS4 · jauge vente loin de son seuil (10000/85000)');
  eq(r.tvaService.pctReel > 75, true, 'CAS4 · jauge service proche de son seuil (30000/37500), jauges bien séparées');
}

// ── CAS 5 — Projection fin d'année : extrapolation linéaire au rythme des mois écoulés ──
{
  const stub = (ym) => (ym<='2026-03') ? { goods: 10000, service: 0 } : { goods:0, service:0 };
  const cs = buildModule(stub, '2026-03-31T12:00:00');   // 3 mois écoulés (jan, fév, mar)
  const r = await cs('2026');
  eq(r.goods, 30000, 'CAS5 · CA cumulé réel = 10000 × 3 mois = 30000');
  eq(r.projGoods, 120000, 'CAS5 · projection annuelle = (30000/3)×12 = 120000');
}

// ── CAS 6 — Année PASSÉE (révolue) : moisEcoules forcé à 12, pas de projection nécessaire ──
{
  const stub = (ym) => ({ goods: 5000, service: 0 });
  const cs = buildModule(stub, '2026-06-15T12:00:00');   // "aujourd'hui" est en 2026
  const r = await cs('2025');   // on demande l'année 2025, déjà terminée
  eq(r.moisEcoules, 12, 'CAS6 · année révolue → moisEcoules=12 (les 12 mois comptent, pas de troncature)');
}

// ── CAS 7 — Année FUTURE : moisEcoules=0, aucune activité, pas de projection ni de crash ──
{
  const stub = (ym) => ({ goods: 0, service: 0 });
  const cs = buildModule(stub, '2026-06-15T12:00:00');
  const r = await cs('2027');   // année pas encore commencée
  eq(r.moisEcoules, 0, 'CAS7 · année future → moisEcoules=0');
  eq(r.projGoods, 0, 'CAS7 · aucune projection possible (division par 0 évitée), retourne 0 proprement');
}

// ── CAS 8 — [v1284] Flag de péremption des seuils : année demandée > anneeValidite (2026) ──
{
  const stub = (ym) => ({ goods: 0, service: 0 });
  const cs = buildModule(stub, '2027-02-01T12:00:00');
  const r = await cs('2027');
  eq(r.seuilsPerimes, true, 'CAS8 · année 2027 > anneeValidite 2026 → seuils signalés potentiellement obsolètes');
  eq(r.seuilsAnneeValidite, 2026, 'CAS8 · anneeValidite exposée telle quelle pour affichage');
}

// ── CAS 9 — Pas de péremption pour l'année de référence elle-même ──
{
  const stub = (ym) => ({ goods: 0, service: 0 });
  const cs = buildModule(stub, '2026-06-01T12:00:00');
  const r = await cs('2026');
  eq(r.seuilsPerimes, false, 'CAS9 · année 2026 = anneeValidite → pas de péremption signalée');
}

// ── CAS 10 — Mois d'atteinte estimé au rythme actuel (null si jamais atteint dans l'année) ──
{
  const stub = (ym) => (ym<='2026-01') ? { goods: 30000, service: 0 } : { goods:0, service:0 };
  const cs = buildModule(stub, '2026-01-31T12:00:00');   // 1 seul mois écoulé
  const r = await cs('2026');
  // seuil tvaVenteBase=85000, rythme=30000/mois → 85000/30000 ≈ 2.83 → mois 3
  eq(r.tvaVente.moisAtteinte, 3, 'CAS10 · au rythme de 30000/mois, seuil 85000 atteint au mois 3');
}
{
  const stub = (ym) => (ym<='2026-01') ? { goods: 100, service: 0 } : { goods:0, service:0 };
  const cs = buildModule(stub, '2026-01-31T12:00:00');
  const r = await cs('2026');
  eq(r.tvaVente.moisAtteinte, null, 'CAS10bis · rythme trop faible → seuil jamais atteint dans l\'année (null)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 19 : computeSeuilsFiscaux ===\n');
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
