/* ============================================================
   TESTS — v1405 : COHÉRENCE « PRALINÉ NOISETTE » (singulier)
   ------------------------------------------------------------
   Ben voyait deux lignes « Praliné noisette » / « Praliné noisettes » dans
   « Stock par parfum ». Après diagnostic : ce n'était NI un doublon de
   recette, NI une garniture — mais une FAUTE DE FRAPPE dans la liste FLAVORS
   (codée en dur) : « Praliné noisettes » (pluriel) alors que la recette et
   les productions sont « Praliné noisette » (singulier). La vue Stock part
   de FLAVORS → affichait une pastille fantôme à 0 pour le nom au pluriel.

   Le nom au pluriel était aussi dans FLAVOR_COLORS (clé couleur) et le
   mapping des codes courts → il fallait TOUT aligner sur le singulier,
   sinon la pastille perdait sa couleur ou son code.

   CE QUE CE TEST GÈLE :
     1. FLAVORS contient « Praliné noisette » (singulier).
     2. AUCUNE structure fonctionnelle ne garde « Praliné noisettes » (pluriel).
     3. la couleur se résout bien pour le nom au singulier (clé alignée).
   ============================================================ */
'use strict';
const { APP } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1405 : cohérence Praliné noisette (singulier) ===\n');

// 1. FLAVORS contient le singulier
{
  const G = global;
  const m = APP.match(/const FLAVORS = \[[\s\S]*?\];/);
  new Function('G', `with(G){ ${m[0]}\n G.FLAVORS = FLAVORS; }`)(G);
  ok(G.FLAVORS.includes('Praliné noisette'), '1 · FLAVORS contient « Praliné noisette » (singulier)');
  ok(!G.FLAVORS.includes('Praliné noisettes'), '2 · FLAVORS ne contient PLUS « Praliné noisettes » (pluriel)');
}

// 2. aucune structure fonctionnelle ne garde le pluriel. On retire les commentaires
// (lignes commençant par // et les notes qui citent l'exemple) avant de chercher.
{
  // On cible les 3 zones à risque : la clé couleur, le mapping code court, le mapping praline.
  const clesFonctionnelles = [
    "'praline noisettes'",     // clé couleur
    "'Praliné noisettes':'",   // code court
    "praline:'Praliné noisettes'", // mapping
  ];
  const present = clesFonctionnelles.filter(s => APP.includes(s));
  ok(present.length === 0, '3 · aucune clé fonctionnelle (couleur/code/mapping) ne garde le pluriel');
}

// 3. la couleur se résout pour le singulier (clé « praline noisette » alignée)
{
  const G = global;
  G.normTxt = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const mc = APP.match(/const FLAVOR_COLORS = \{[\s\S]*?\};/);
  new Function('G', `with(G){ ${mc[0]}\n G.FLAVOR_COLORS = FLAVOR_COLORS; }`)(G);
  // reproduit flavorColor : FLAVOR_COLORS[normTxt(nom)] || défaut
  const couleur = G.FLAVOR_COLORS[G.normTxt('Praliné noisette')];
  ok(!!couleur && couleur !== '#cbb89f', '4 · « Praliné noisette » a bien une couleur dédiée (clé couleur alignée)');
}

console.log(`\n=== v1405 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
