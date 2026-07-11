/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 34 : _estBatchComptable (dénominateur des moyennes)
   ----------------------------------------------------------------------------
   VERROUILLE LE BUG DE LA « MOYENNE ÉCRASÉE ».

   Contexte : « Moy. active/batch » = temps actif du parfum ÷ NOMBRE DE BATCHES.
   Le filtre du dénominateur comptait TOUTE production terminée — y compris les simples
   COMPOSANTS (fournée de coques, ganache seule, chantache, dégustation). Chaque composant
   étant compté comme un batch à part entière, le dénominateur était gonflé et la moyenne
   s'effondrait : « Framboise = 17 min/batch », soit MOINS que la seule cuisson des coques
   (21 min) — arithmétiquement impossible, et signalé par Benjamin.

   Règle figée ici : seul un macaron RÉELLEMENT PRODUIT compte comme un batch
   (composant 'complet' ou 'assemble'). Tout le reste est exclu du dénominateur.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

function buildModule(){
  const estBatchComptable = extractFunction('_estBatchComptable');
  return new Function(`${estBatchComptable} return _estBatchComptable;`)();
}

const SINCE = '2026-07-01';
const OK_DATE = '2026-07-07T10:00:00';

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

function run(){
const estBatch = buildModule();

// ── LE CŒUR DU BUG : les composants ne sont PAS des batches ───────────────────
{
  const base = { prodStatut:'termine', prodTermineTs:OK_DATE };

  eq(estBatch({...base, composant:'complet'},  SINCE), true,
     'Un macaron COMPLET compte comme un batch');
  eq(estBatch({...base, composant:'assemble'}, SINCE), true,
     'Un macaron ASSEMBLÉ compte comme un batch');

  // Ce sont ces 4 lignes qui empêchent le retour du bug.
  eq(estBatch({...base, composant:'coques'},      SINCE), false,
     'BUG VERROUILLÉ · une fournée de COQUES n\'est PAS un batch');
  eq(estBatch({...base, composant:'ganache'},     SINCE), false,
     'BUG VERROUILLÉ · une GANACHE seule n\'est PAS un batch');
  eq(estBatch({...base, composant:'chantache'},   SINCE), false,
     'BUG VERROUILLÉ · une CHANTACHE n\'est PAS un batch');
  eq(estBatch({...base, composant:'degustation'}, SINCE), false,
     'BUG VERROUILLÉ · une DÉGUSTATION n\'est PAS un batch');
}

// ── composant absent → traité comme 'complet' (rétro-compatibilité) ───────────
{
  eq(estBatch({ prodStatut:'termine', prodTermineTs:OK_DATE }, SINCE), true,
     'Composant absent = ancien enregistrement → compté comme complet');
  eq(estBatch({ prodStatut:'termine', prodTermineTs:OK_DATE, composant:null }, SINCE), true,
     'Composant null → compté comme complet');
}

// ── DÉMONSTRATION ARITHMÉTIQUE : la moyenne redevient sensée ──────────────────
{
  // Cas réel de Benjamin : 2 macarons finis, mais aussi 2 fournées de coques et 2 ganaches.
  const prods = [
    { prodStatut:'termine', prodTermineTs:OK_DATE, composant:'complet' },
    { prodStatut:'termine', prodTermineTs:OK_DATE, composant:'complet' },
    { prodStatut:'termine', prodTermineTs:OK_DATE, composant:'coques'  },
    { prodStatut:'termine', prodTermineTs:OK_DATE, composant:'coques'  },
    { prodStatut:'termine', prodTermineTs:OK_DATE, composant:'ganache' },
    { prodStatut:'termine', prodTermineTs:OK_DATE, composant:'ganache' },
  ];
  const nbBatches = prods.filter(p=>estBatch(p, SINCE)).length;
  eq(nbBatches, 2, 'Dénominateur = 2 macarons produits (et non 6 « productions »)');

  const actifMs = (2*3600 + 13*60) * 1000;          // 2 h 13 de temps actif chronométré
  const moyMin  = Math.round(actifMs / nbBatches / 60000);
  eq(moyMin, 67, 'Moyenne = 1 h 07/batch (et non 22 min) — supérieure à la cuisson seule (21 min)');

  // La propriété métier que Benjamin a repérée : la moyenne d'un batch COMPLET ne peut pas
  // être inférieure à la durée d'une seule de ses étapes.
  const CUISSON_COQUES_MIN = 21;                     // cf. PROD_PASSIVE_DEFAULTS
  eq(moyMin > CUISSON_COQUES_MIN, true,
     'COHÉRENCE MÉTIER · la moyenne d\'un batch dépasse la durée d\'une seule étape');
}

// ── LE 2e BUG (v1312) : ne compter QUE les batches réellement CHRONOMÉTRÉS ────
{
  // Le numérateur (temps actif) ne vient QUE des séances chronométrées. Si le dénominateur compte
  // aussi les batches produits SANS chrono, on divise le temps de N batches par (N + M) batches :
  // la moyenne s'effondre. C'est ce qui donnait « Coco Rafaello : 20 min/batch », soit MOINS que
  // la seule cuisson des coques (21 min) — arithmétiquement impossible.
  //
  // Le rapprochement se fait sur RECETTE + JOUR (clé 'recipeId|YYYY-MM-DD').
  // /!\ La v1311 s'appuyait sur le champ `atelierTaskId` : il est vide dans l'usage réel, et le
  // dénominateur tombait à ZÉRO partout (écran cassé). Ces tests figent le bon lien.
  const cles = new Set(['1|2026-07-07']);   // framboise (id 1) chronométrée le 7 juillet
  const base = { prodStatut:'termine', composant:'complet', recipeId:1 };

  eq(estBatch({...base, prodTermineTs:'2026-07-07T18:00:00'}, SINCE, cles), true,
     'BUG VERROUILLÉ · batch dont la recette a été chronométrée CE JOUR-LÀ → compte');
  eq(estBatch({...base, prodTermineTs:'2026-07-09T18:00:00'}, SINCE, cles), false,
     'BUG VERROUILLÉ · batch d\'un jour SANS chrono → ne compte pas');
  eq(estBatch({...base, recipeId:2, prodTermineTs:'2026-07-07T18:00:00'}, SINCE, cles), false,
     'BUG VERROUILLÉ · autre recette non chronométrée ce jour-là → ne compte pas');

  // Batch démarré la veille, terminé le lendemain (repos de nuit) : le chrono est celui du jour de
  // DÉBUT. Sans tolérance sur la date, un batch réellement chronométré serait exclu à tort.
  eq(estBatch({...base, prodDebutTs:'2026-07-07T20:00:00', prodTermineTs:'2026-07-08T09:00:00'}, SINCE, cles), true,
     'RÉGRESSION ÉVITÉE · batch commencé le jour du chrono et fini le lendemain → compte quand même');

  // Rétro-compatibilité : sans ensemble fourni, comportement d'origine.
  eq(estBatch({...base, prodTermineTs:'2026-07-09T18:00:00'}, SINCE), true,
     'Rétro-compatibilité · sans le filtre chrono, le comportement d\'origine est conservé');
}

// ── DÉMONSTRATION : la moyenne redevient interprétable ────────────────────────
{
  const cles = new Set(['1|2026-07-07']);
  // 3 batches chronométrés le 7, 7 produits un autre jour sans chrono (10 au total).
  const prods = [];
  for(let i=0;i<3;i++) prods.push({ prodStatut:'termine', prodTermineTs:'2026-07-07T18:00:00', composant:'complet', recipeId:1 });
  for(let i=0;i<7;i++) prods.push({ prodStatut:'termine', prodTermineTs:'2026-07-09T18:00:00', composant:'complet', recipeId:1 });

  const avant = prods.filter(p=>estBatch(p, SINCE)).length;
  const apres = prods.filter(p=>estBatch(p, SINCE, cles)).length;
  eq(avant, 10, 'AVANT · le dénominateur comptait les 10 batches (dont 7 jamais chronométrés)');
  eq(apres, 3,  'APRÈS · le dénominateur ne compte que les 3 batches chronométrés');

  const actifMs = 3 * 75 * 60000;   // 3 batches réellement mesurés à ~75 min chacun
  eq(Math.round(actifMs/avant/60000), 23, 'AVANT · moyenne écrasée à 23 min (sous la cuisson seule = impossible)');
  eq(Math.round(actifMs/apres/60000), 75, 'APRÈS · moyenne = 75 min, cohérente avec la somme des étapes');
  eq(Math.round(actifMs/apres/60000) > 21, true,
     'COHÉRENCE MÉTIER · la moyenne dépasse enfin la durée d\'une seule étape (cuisson = 21 min)');
}

// ── RÉGRESSION v1311 : le filtre ne doit JAMAIS tout exclure ──────────────────
{
  // Le bug que j'ai introduit : en se fiant à un champ absent des données réelles, le filtre
  // excluait TOUS les batches → « 0 batch chronométré » partout, écran inexploitable.
  // Ce test garantit qu'avec un rapprochement valide, il reste au moins un batch.
  const cles = new Set(['1|2026-07-07']);
  const prods = [
    { prodStatut:'termine', prodTermineTs:'2026-07-07T18:00:00', composant:'complet', recipeId:1 },
  ];
  const gardes = prods.filter(p=>estBatch(p, SINCE, cles));
  eq(gardes.length > 0, true,
     'RÉGRESSION v1311 VERROUILLÉE · un batch chronométré n\'est jamais exclu par erreur');
}

// ── statut / fenêtre : les autres conditions restent intactes ─────────────────
{
  eq(estBatch({ prodStatut:'en_cours', prodTermineTs:'', composant:'complet' }, SINCE), false,
     'Production NON terminée → exclue');
  eq(estBatch({ prodStatut:'termine', prodTermineTs:'2026-06-01T10:00:00', composant:'complet' }, SINCE), false,
     'Production hors fenêtre (avant SINCE) → exclue');
  eq(estBatch(null, SINCE), false,
     'Entrée nulle → exclue proprement (pas de crash)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 34 : _estBatchComptable ===\n');
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
