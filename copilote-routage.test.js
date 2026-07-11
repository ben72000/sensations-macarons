/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 36 : diagnostic du routage du copilote
   ----------------------------------------------------------------------------
   Outils tracés ici (purement diagnostiques, aucun changement de comportement) :
     • _smTableSkills() : dérive la table « intention → fonction » du code source de
       _aiDispatch (via Function.toString), pour qu'elle soit TOUJOURS à jour.
     • smWhy(question)  : explique le routage d'une question, étape par étape.
     • smSkills(filtre) : liste les compétences du copilote.

   Propriété centrale : AUCUNE compétence fantôme. Chaque intention routée doit pointer
   vers une fonction qui EXISTE réellement — c'est exactement le type de bug qui avait
   fait que le bouton « Plan de production » renvoyait à l'accueil (vue jamais câblée).
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// Reproduit la dérivation faite par _smTableSkills() : lecture du switch de _aiDispatch.
function tableSkills(){
  const start = APP.indexOf('async function _aiDispatch(r, txt, _ctx){');
  if(start === -1) throw new Error('_aiDispatch introuvable');
  const body = APP.slice(start, start + 40000);
  const re = /case\s*'([^']+)'\s*:\s*return\s+([A-Za-z0-9_$]+)\s*\(/g;
  const table = {}; let m;
  while((m = re.exec(body)) !== null){ table[m[1]] = m[2]; }
  return table;
}

function run(){
const table = tableSkills();
const intentions = Object.keys(table);

// ── La table est bien dérivée, et non vide ────────────────────────────────────
{
  eq(intentions.length > 50, true,
     'La table intention→fonction est dérivée du code (plus de 50 compétences trouvées)');
  eq(table['query_stock'], 'aiQueryStock',
     'Routage connu · query_stock → aiQueryStock');
  eq(table['query_retards'], 'aiQueryRetards',
     'Routage connu · query_retards → aiQueryRetards');
}

// ── PROPRIÉTÉ CENTRALE : aucune compétence fantôme ────────────────────────────
{
  // Chaque fonction routée doit exister dans app.js. Une intention pointant vers une
  // fonction inexistante = le copilote plante ou ne répond pas, silencieusement.
  const fantomes = [];
  intentions.forEach(k=>{
    const fn = table[k];
    const existe = new RegExp('(?:async\\s+)?function\\s+' + fn + '\\s*\\(').test(APP);
    if(!existe) fantomes.push(k + ' → ' + fn);
  });
  eq(fantomes, [],
     'PROPRIÉTÉ CENTRALE · aucune compétence fantôme (toute fonction routée existe vraiment)');
}

// ── Les outils de diagnostic sont bien définis et exposés ─────────────────────
{
  eq(/function smWhy\(/.test(APP), true,        'smWhy() est défini');
  eq(/function smSkills\(/.test(APP), true,     'smSkills() est défini');
  eq(/function _smTableSkills\(/.test(APP), true, '_smTableSkills() est défini');
  eq(/window\.smWhy\s*=\s*smWhy/.test(APP), true,     'smWhy est exposé dans la console');
  eq(/window\.smSkills\s*=\s*smSkills/.test(APP), true, 'smSkills est exposé dans la console');
}

// ── La table n'est PAS recopiée à la main (sinon elle se désynchroniserait) ───
{
  // _smTableSkills doit lire le SOURCE de _aiDispatch, pas contenir une liste en dur.
  const i = APP.indexOf('function _smTableSkills(');
  const corps = APP.slice(i, i + 800);
  eq(/String\(_aiDispatch\)/.test(corps), true,
     'TRAÇABILITÉ · la table est dérivée de _aiDispatch, jamais recopiée à la main');
}

// ── smWhy expose toutes les étapes de la décision ─────────────────────────────
{
  const i = APP.indexOf('function smWhy(');
  const corps = APP.slice(i, i + 2000);
  eq(/aiNormalize/.test(corps), true,      'smWhy · montre le texte normalisé');
  eq(/aiCorrigeFautes/.test(corps), true,  'smWhy · montre la correction des fautes');
  eq(/parseIntent/.test(corps), true,      'smWhy · montre l\'intention détectée');
  eq(/critical/.test(corps), true,         'smWhy · indique si l\'action est critique');
  eq(/unknown/.test(corps), true,          'smWhy · avertit quand l\'intention n\'est pas reconnue');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 36 : diagnostic du routage copilote ===\n');
console.log(`(${intentions.length} compétences détectées dans _aiDispatch)`);
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
