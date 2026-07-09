/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 23 : rdSuggestMaterial (Pont Créatif R&D→Prod)
   ----------------------------------------------------------------------------
   Fige la logique de SUGGESTION (jamais imposée : l'utilisateur valide toujours,
   cf. écran rdTransfertRender) de correspondance entre un nom d'ingrédient généré
   par le R&D et une fiche matière réelle du stock. Une correspondance foireuse
   ici ne casse rien de dangereux en soi (l'écran de confirmation intercepte),
   mais une bonne suggestion évite une saisie manuelle à chaque transfert.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const normTxt = extractFunction('normTxt');
  const rdSuggestMaterial = extractFunction('rdSuggestMaterial');
  const code = `
    ${normTxt}
    ${rdSuggestMaterial}
    return rdSuggestMaterial;
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

function run(){
const rdSuggestMaterial = buildModule();

// ── CAS 1 — Égalité stricte (après normalisation) : gagne toujours ──
{
  const materials = [{id:1, nom:'Chocolat blanc'}, {id:2, nom:'Chocolat noir'}];
  const r = rdSuggestMaterial('Chocolat blanc', materials);
  eq(r.id, 1, 'CAS1 · égalité stricte normalisée → correspondance exacte, pas d\'ambiguïté avec "noir"');
}

// ── CAS 2 — Ordre des mots différent : toujours retrouvé (inclusion mutuelle de mots) ──
{
  const materials = [{id:1, nom:'Crème entière liquide 35%'}];
  const r = rdSuggestMaterial('Crème liquide entière', materials);
  eq(r.id, 1, 'CAS2 · ordre des mots différent, toujours associé (mots communs : crème/liquide/entière)');
}

// ── CAS 3 — Accents et casse ignorés ──
{
  const materials = [{id:1, nom:'Poivre de Timut'}];
  const r = rdSuggestMaterial('POIVRE de timût', materials);
  eq(r.id, 1, 'CAS3 · accents et casse ignorés dans la comparaison');
}

// ── CAS 4 — Aucune correspondance plausible → null, jamais un faux positif hasardeux ──
{
  const materials = [{id:1, nom:'Chocolat noir'}, {id:2, nom:'Sucre glace'}];
  const r = rdSuggestMaterial('Zeste de yuzu confit', materials);
  eq(r, null, 'CAS4 · aucun mot commun avec le stock → aucune suggestion (mieux que deviner faux)');
}

// ── CAS 5 — Meilleur score l'emporte entre plusieurs candidats partiels ──
{
  const materials = [
    {id:1, nom:'Beurre doux'},
    {id:2, nom:'Beurre de cacao Mycryo'}
  ];
  const r = rdSuggestMaterial('Beurre de cacao', materials);
  eq(r.id, 2, 'CAS5 · "Beurre de cacao Mycryo" a plus de mots communs que "Beurre doux" → gagne');
}

// ── CAS 6 — Mots trop courts (<3 lettres) ignorés dans le score, évite le bruit ──
{
  const materials = [{id:1, nom:'Praliné noisette'}];
  const r = rdSuggestMaterial('un peu de praliné', materials);
  eq(r.id, 1, 'CAS6 · mots courts ("un","de") ignorés, "praliné" suffit à faire matcher');
}

// ── CAS 7 — Liste de matières vide → null, pas de crash ──
{
  const r = rdSuggestMaterial('Chocolat blanc', []);
  eq(r, null, 'CAS7 · aucune matière en stock → null proprement');
}

// ── CAS 8 — Nom d'ingrédient vide/invalide → null, pas de crash ──
{
  const materials = [{id:1, nom:'Chocolat blanc'}];
  const r = rdSuggestMaterial('', materials);
  eq(r, null, 'CAS8 · nom d\'ingrédient vide → null sans erreur');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 23 : rdSuggestMaterial (Pont Créatif) ===\n');
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
