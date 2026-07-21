/* ============================================================
   TESTS — v1391 : PORTÉE TRANSACTIONNELLE DU MOTEUR DE RANGEMENT
   ------------------------------------------------------------
   LE BUG (v1389→v1390, vu en atelier par Ben — écran « Affichage
   indisponible · Vue dash ») :
     prodPreparerBoites (le moteur) ouvrait
        db.transaction('rw', db.productions, …)
     et appelait, DEDANS, doMoveEmplacement — qui LIT db.recipes
     (règle « congélateur obligatoire », app.js ~l.13274). Une transaction
     IndexedDB ne voit QUE les tables de sa portée. `recipes` absente →
     l'accès jette « The specified object store was not found », ce qui
     AVORTE la transaction : le db.productions.update qui suit échoue à son
     tour et l'erreur remonte jusqu'à casser la vue.

   POURQUOI LA SUITE NE L'AVAIT PAS VU : le faux-IDB (tests/_faux-idb.js)
   ne modélisait pas la portée — objectStore() servait n'importe quelle
   table. Durci en v1391 : un accès hors portée jette NotFoundError, comme
   le vrai runtime.

   CE TEST PROTÈGE SUR DEUX PLANS :
     • statique — la transaction du moteur déclare bien productions ET
       recipes (tombe si quelqu'un rétrécit la portée) ;
     • fidélité — le faux-IDB durci jette bien NotFoundError sur un accès
       hors portée (sans quoi aucun test ne pourrait attraper ce type de
       bug à l'avenir).

   RÈGLE GRAVÉE : une transaction doit déclarer TOUTES les tables touchées
   par ce qu'elle appelle, transitivement. Ici : le moteur appelle
   doMoveEmplacement → doMoveEmplacement lit recipes → la portée du moteur
   doit inclure recipes.
   ============================================================ */
'use strict';
const { stripComments, extractFunction } = require('./_extract');
const { chargeVraiShim, attendCommits } = require('./_faux-idb');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

(async () => {
console.log('\n=== TESTS — v1391 : portée transactionnelle du moteur ===\n');

// ---------------------------------------------------------------------------
// 1. GARDE STATIQUE — la transaction du moteur déclare productions ET recipes
// ---------------------------------------------------------------------------
{
  const clean = stripComments(extractFunction('prodPreparerBoites'));
  ok(/db\.transaction\(\s*['"]rw['"]\s*,\s*db\.productions\s*,\s*db\.recipes/.test(clean),
     '1 · la transaction du moteur déclare db.productions ET db.recipes');
}

// ---------------------------------------------------------------------------
// 2. GARDE DE COHÉRENCE — doMoveEmplacement lit bien recipes (la raison du fix)
// ---------------------------------------------------------------------------
// Si doMoveEmplacement se met à toucher une AUTRE table, il faudra l'ajouter à
// la portée du moteur : ce test le signale au lieu de laisser le bug réapparaître.
{
  const move = stripComments(extractFunction('doMoveEmplacement'));
  const tables = [...move.matchAll(/db\.([a-zA-Z_]+)\.(get|toArray|add|put|update|delete|where|count)/g)]
    .map(m => m[1]);
  const uniq = [...new Set(tables)];
  ok(uniq.includes('recipes'),
     '2 · doMoveEmplacement lit bien db.recipes (justifie recipes dans la portée)');
  const horsPortee = uniq.filter(t => t !== 'productions' && t !== 'recipes');
  if(horsPortee.length){
    console.log('    → ⚠ doMoveEmplacement touche aussi : ' + horsPortee.join(', ') +
                ' — à ajouter à la portée du moteur !');
  }
  ok(horsPortee.length === 0,
     '2b · doMoveEmplacement ne touche QUE productions+recipes (portée du moteur suffisante)');
}

// ---------------------------------------------------------------------------
// 3. FIDÉLITÉ DU BANC — le faux-IDB durci jette NotFoundError hors portée
// ---------------------------------------------------------------------------
{
  const { Dexie } = chargeVraiShim();
  const db = new Dexie('test-v1391-portee');
  db.version(1).stores({ productions: '++id', recipes: '++id' });
  await db.recipes.add({ id:1, congelObligatoire:true });
  await db.productions.add({ id:1, recipeId:1 });

  // 3a) accès à une table HORS portée → doit jeter NotFoundError (comme le vrai IDB).
  let horsPortee = null;
  try{
    await db.transaction('rw', db.productions, async()=>{
      await db.recipes.get(1);           // recipes hors portée
    });
    await attendCommits();
  }catch(e){ horsPortee = e; }
  ok(horsPortee && /object store was not found/i.test(horsPortee.message),
     '3 · le faux-IDB durci jette « object store not found » sur accès hors portée');

  // 3b) même accès mais recipes DANS la portée → aucun jet (le fix du moteur).
  let dansPortee = null;
  try{
    await db.transaction('rw', db.productions, db.recipes, async()=>{
      await db.recipes.get(1);
      await db.productions.update(1, { emplacement:'frigo' });
    });
    await attendCommits();
  }catch(e){ dansPortee = e; }
  ok(!dansPortee, '4 · portée productions+recipes → l\'accès recipes passe (le fix est valide)');
  if(dansPortee) console.log('    → ' + dansPortee.name + ': ' + dansPortee.message);
}

console.log(`\n=== v1391 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
})().catch(e => { console.error('ERREUR FATALE', e); process.exit(1); });
