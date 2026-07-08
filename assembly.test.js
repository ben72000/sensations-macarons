/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 7 : assemblage (chantilly)
   ------------------------------------------------------------
   Fige la logique de POTENTIEL D'ASSEMBLAGE, qui découle du modèle
   « 1 macaron = 2 coques + 1 garniture » — le même modèle que le
   décrément 3-composants du grand format (chantache) signalé par
   l'audit.

   Cible : computeStockPotentiel(prods, recipesById) — fonction PURE
   (reçoit les productions en argument, pas de Dexie). Elle calcule :
     - les macarons déjà FINIS (vendables) ;
     - les macarons ENCORE ASSEMBLABLES : pour chaque parfum,
       min(coques ÷ 2, doses de garniture), SANS mélange de parfums ;
     - la séparation classique / grand format (GF).

   C'est le point exact où une erreur de ratio (le bug d'audit) se
   verrait : 5 coques + 10 ganaches ne font que 2 macarons, pas 10.

   Deux chemins couverts :
     A) recettes SANS empreinte couleur → repli historique strict
        min(coques propres ÷ 2, ganache) — le cœur du modèle chantilly ;
     B) recettes AVEC couleur → mutualisation des coques par couleur.

   app.js n'est jamais modifié : on extrait le source réel.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const round3 = extractConstLine('round3');
  const COQUES_PAR_MACARON = extractConstLine('COQUES_PAR_MACARON');
  const prodComposant = extractFunction('prodComposant');
  const prodVendable  = extractFunction('prodVendable');
  const recCoqueColors= extractFunction('recCoqueColors');
  const computeStockPotentiel = extractFunction('computeStockPotentiel');

  // COQUE_COULEURS stubbé : seules les clés utilisées par les tests couleur (chemin B).
  // recCoqueColors filtre sur cette table → une couleur absente est ignorée, comme dans l'app.
  const code = `
    const COQUE_COULEURS = { rouge:{label:'Rouge'}, vert_pistache:{label:'Vert pistache'}, jaune:{label:'Jaune'} };
    ${round3}
    ${COQUES_PAR_MACARON}
    ${prodComposant}
    ${prodVendable}
    ${recCoqueColors}
    ${computeStockPotentiel}
    ({ computeStockPotentiel });
  `;
  return eval(code);
}
const M = buildModule();

let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// Recettes SANS couleur (chemin repli = cœur du modèle). Recette 1 = classique, 2 = grand format.
const recNoColor = { 1:{ id:1, produitNom:'Vanille' }, 2:{ id:2, produitNom:'Pistache GF', grandFormat:true } };

// Helpers pour fabriquer des sous-lots de production.
const coques  = (rid, q, extra) => Object.assign({ recipeId:rid, composant:'coques',  qteRestante:q, prodStatut:'termine' }, extra||{});
const ganache = (rid, q, extra) => Object.assign({ recipeId:rid, composant:'ganache', qteRestante:q, prodStatut:'termine' }, extra||{});
const fini    = (rid, q, extra) => Object.assign({ recipeId:rid, composant:'assemble',qteRestante:q, prodStatut:'termine' }, extra||{});

// ============================================================================
// 1) Le cœur : min(coques ÷ 2, ganache) — le ratio du bug d'audit
// ============================================================================
// 10 coques (= 5 macarons possibles côté coques) + 3 ganaches → min(5,3) = 3.
let r = M.computeStockPotentiel([ coques(1,10), ganache(1,3) ], recNoColor);
eq(r.assemblable, 3, '10 coques + 3 ganaches → min(5, 3) = 3 macarons assemblables');

// Le piège classique : beaucoup de ganache, peu de coques.
// 5 coques (= 2 macarons) + 10 ganaches → min(2,10) = 2. (5 coques ne font pas 10 macarons !)
r = M.computeStockPotentiel([ coques(1,5), ganache(1,10) ], recNoColor);
eq(r.assemblable, 2, '5 coques + 10 ganaches → min(2, 10) = 2 (coques limitantes)');

// Coques impaires : 7 coques = 3 macarons (arrondi bas), pas 3,5.
r = M.computeStockPotentiel([ coques(1,7), ganache(1,9) ], recNoColor);
eq(r.assemblable, 3, '7 coques → floor(7/2) = 3 macarons (arrondi bas)');

// Sans ganache : rien d'assemblable même avec des coques.
r = M.computeStockPotentiel([ coques(1,20) ], recNoColor);
eq(r.assemblable, 0, '20 coques mais 0 ganache → 0 assemblable');

// Sans coques : rien d'assemblable même avec de la ganache.
r = M.computeStockPotentiel([ ganache(1,20) ], recNoColor);
eq(r.assemblable, 0, '0 coque mais 20 ganaches → 0 assemblable');

// ============================================================================
// 2) Pas de mélange de parfums : chaque parfum s'assemble avec le sien
// ============================================================================
// Parfum 1 : 4 coques (2 mac) + 5 ganaches → 2. Parfum différent (id 3, sans recette) : coques seules.
// Les coques du parfum 1 ne complètent PAS la ganache d'un autre parfum.
r = M.computeStockPotentiel([ coques(1,4), ganache(1,5), ganache(1,0) ], recNoColor);
eq(r.assemblable, 2, 'no-mélange : parfum 1 → min(2, 5) = 2 (ses propres composants)');

// Deux parfums indépendants : 1 → min(3,3)=3 ; 2(GF) → min(2,2)=2. Total 5, dont 2 GF.
r = M.computeStockPotentiel([
  coques(1,6), ganache(1,3),      // parfum 1 classique : 3 macarons
  coques(2,4), ganache(2,2)       // parfum 2 GF : 2 macarons
], recNoColor);
eq(r.assemblable, 5, 'deux parfums : 3 (classique) + 2 (GF) = 5 assemblables');
eq(r.assemblableClassique, 3, '… dont 3 classiques');
eq(r.assemblableGF, 2, '… dont 2 grand format');

// ============================================================================
// 3) Finis + assemblable = total
// ============================================================================
// 4 macarons déjà finis (parfum 1) + assemblables (3) → total 7.
r = M.computeStockPotentiel([ fini(1,4), coques(1,6), ganache(1,3) ], recNoColor);
eq(r.finis, 4, '4 macarons déjà finis comptés');
eq(r.assemblable, 3, '3 assemblables en plus');
eq(r.total, 7, 'total = finis (4) + assemblables (3) = 7');

// ============================================================================
// 4) Séparation classique / GF sur les FINIS
// ============================================================================
r = M.computeStockPotentiel([ fini(1,5), fini(2,2) ], recNoColor);
eq(r.finisClassique, 5, 'finis classiques = 5 (parfum 1)');
eq(r.finisGF, 2, 'finis GF = 2 (parfum 2 grandFormat)');

// ============================================================================
// 5) Les sous-lots NON terminés ne comptent pas
// ============================================================================
r = M.computeStockPotentiel([
  coques(1,10, {prodStatut:'demarre'}),   // en cours → ignoré
  ganache(1,5)
], recNoColor);
eq(r.assemblable, 0, 'coques non terminées (démarré) → non assemblables');

// ============================================================================
// 6) Chemin COULEUR : mutualisation des coques de même couleur (chemin B)
// ============================================================================
// Deux parfums de MÊME couleur (rouge). Coques rouges mutualisées entre eux, chacun
// plafonné par SA ganache. P1 : 3 ganaches ; P2 : 2 ganaches. Coques rouges : 12 (=6 mac).
// Total ganache = 5, coques suffisantes (6) → 5 assemblables au total.
const recColor = {
  10:{ id:10, produitNom:'Framboise', coqueColors:['rouge'] },
  11:{ id:11, produitNom:'Fraise',    coqueColors:['rouge'] }
};
r = M.computeStockPotentiel([
  coques(10,12),          // 12 coques rouges (mutualisées) = 6 macarons possibles
  ganache(10,3),          // parfum framboise : 3
  ganache(11,2)           // parfum fraise : 2
], recColor);
eq(r.assemblable, 5, 'couleur : coques rouges mutualisées, 3 + 2 ganaches = 5 assemblables');

// Coques limitantes malgré la mutualisation : seulement 4 coques rouges (=2 mac) pour 3+2=5 ganaches.
r = M.computeStockPotentiel([
  coques(10,4),           // 4 coques = 2 macarons seulement
  ganache(10,3),
  ganache(11,2)
], recColor);
eq(r.assemblable, 2, 'couleur : 4 coques rouges → 2 macarons max, réparties (coques limitantes)');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 7 : assemblage (chantilly) ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }
