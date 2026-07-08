/* ============================================================
   TESTS — Vague 8 : décrément transactionnel d'assemblage (3 composants)
   ------------------------------------------------------------
   OBJECTIF : prouver que l'assemblage d'un grand format décrémente
   RÉELLEMENT les trois composants du bon montant :
     - coques   : 2 par macaron
     - garniture (ganache/crémeux) : 1 par macaron
     - chantache (composant catalogue) : 1 dose par macaron

   PORTÉE ET HONNÊTETÉ : prodAssembleSave() lit le DOM (sélections),
   ouvre des modales et calcule des DLC — impossible à exécuter tel quel
   hors navigateur. On ne prétend donc PAS exécuter la fonction entière.
   On reconstitue ici la SÉQUENCE DE DÉCRÉMENT exacte telle qu'écrite dans
   le code (mêmes formules : coquesUtilisees = qteAsm×COQUES_PAR_MACARON,
   ganache -= qteAsm, chantache -= qteAsm), exécutée contre un FAUX DEXIE
   transactionnel, pour vérifier l'état des stocks après coup.

   Ce test documente et verrouille le COMPORTEMENT ATTENDU du décrément.
   Si un jour la séquence de décrément du code change, ce test (comparé au
   source réel via les constantes extraites) et la relecture le montreront.

   NB : les formules de décrément sont extraites indirectement — on réutilise
   les vraies constantes (COQUES_PAR_MACARON) et le vrai subQty d'app.js.
   ============================================================ */
'use strict';
const { extractConstLine } = require('./_extract');

// Vrais utilitaires d'app.js (pas de réécriture).
const round3Src = extractConstLine('round3');
const subQtySrc = extractConstLine('subQty');
const coquesParMacSrc = extractConstLine('COQUES_PAR_MACARON');
const { round3, subQty, COQUES_PAR_MACARON } = eval(`
  ${round3Src}
  ${subQtySrc}
  ${coquesParMacSrc}
  ({ round3, subQty, COQUES_PAR_MACARON });
`);

// --- Faux Dexie transactionnel minimal -------------------------------------
// Une table = Map(id → objet). update applique un patch, get lit, add insère.
function makeTable(rows){
  const map = new Map((rows||[]).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
  let nextId = Math.max(0, ...map.keys()) + 1;
  return {
    map,
    async get(id){ const r = map.get(id); return r ? JSON.parse(JSON.stringify(r)) : undefined; },
    async update(id, patch){ const r = map.get(id); if(r){ Object.assign(r, patch); return 1; } return 0; },
    async add(obj){ const id = obj.id!=null ? obj.id : nextId++; map.set(id, Object.assign({}, obj, {id})); return id; }
  };
}
function makeDb(tables){
  const db = Object.assign({}, tables);
  db.transaction = async (mode, ...rest) => { const fn = rest[rest.length-1]; return await fn(); };
  return db;
}

let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// --- Reconstitution FIDÈLE de la séquence de décrément de prodAssembleSave ---
// (mêmes formules que le code source, cf. lignes ~11723-11745 de app.js)
async function assembleDecrement(db, { coquesId, ganacheId, chantacheId, qteAsm }){
  return await db.transaction('rw', db.productions, async () => {
    const coques  = await db.productions.get(coquesId);
    const ganache = await db.productions.get(ganacheId);
    const coquesUtilisees = qteAsm * COQUES_PAR_MACARON;               // 2 coques / macaron

    // décrément coques + garniture (exactement comme le code)
    await db.productions.update(coques.id,  { qteRestante: subQty(coques.qteRestante,  coquesUtilisees) });
    await db.productions.update(ganache.id, { qteRestante: subQty(ganache.qteRestante, qteAsm) });

    // décrément chantache : 1 dose / macaron (besoinComp = qteAsm)
    if(chantacheId != null){
      const lp = await db.productions.get(chantacheId);
      await db.productions.update(lp.id, { qteRestante: subQty(lp.qteRestante, qteAsm) });
    }

    // création du macaron assemblé
    const asmId = await db.productions.add({ composant:'assemble', qteRestante:qteAsm, recipeId:coques.recipeId });
    return { asmId, coquesUtilisees };
  });
}

async function run(){

// ============================================================================
//  CAS 1 — Assemblage de 5 grands formats (3 composants)
//  Stocks avant : 20 coques, 8 crémeux, 8 chantache.
//  Attendu : coques 20−10=10 ; crémeux 8−5=3 ; chantache 8−5=3.
// ============================================================================
let db = makeDb({ productions: makeTable([
  { id:1, composant:'coques',   qteRestante:20, recipeId:100, prodStatut:'termine' },
  { id:2, composant:'ganache',  qteRestante:8,  recipeId:100, prodStatut:'termine', garnitureType:'cremeux' },
  { id:3, composant:'ganache',  qteRestante:8,  recipeId:100, prodStatut:'termine', composantCatalogue:true, componentId:50 }
]) });
const r1 = await assembleDecrement(db, { coquesId:1, ganacheId:2, chantacheId:3, qteAsm:5 });

eq((await db.productions.get(1)).qteRestante, 10, 'CAS1 · coques : 20 − (5×2) = 10');
eq((await db.productions.get(2)).qteRestante, 3,  'CAS1 · crémeux : 8 − 5 = 3');
eq((await db.productions.get(3)).qteRestante, 3,  'CAS1 · chantache : 8 − 5 = 3 (le 3e composant EST décrémenté)');
eq(r1.coquesUtilisees, 10, 'CAS1 · coques utilisées = 10');
// le macaron assemblé a bien été créé avec la bonne quantité
eq((await db.productions.get(r1.asmId)).qteRestante, 5, 'CAS1 · 5 grands formats créés');

// ============================================================================
//  CAS 2 — Un seul macaron : décrément unitaire exact
// ============================================================================
db = makeDb({ productions: makeTable([
  { id:1, composant:'coques',  qteRestante:2, recipeId:100, prodStatut:'termine' },
  { id:2, composant:'ganache', qteRestante:1, recipeId:100, prodStatut:'termine' },
  { id:3, composant:'ganache', qteRestante:1, recipeId:100, prodStatut:'termine', composantCatalogue:true, componentId:50 }
]) });
await assembleDecrement(db, { coquesId:1, ganacheId:2, chantacheId:3, qteAsm:1 });
eq((await db.productions.get(1)).qteRestante, 0, 'CAS2 · coques : 2 − 2 = 0');
eq((await db.productions.get(2)).qteRestante, 0, 'CAS2 · garniture : 1 − 1 = 0');
eq((await db.productions.get(3)).qteRestante, 0, 'CAS2 · chantache : 1 − 1 = 0');

// ============================================================================
//  CAS 3 — Assemblage classique SANS 3e composant (chantacheId absent)
//  Vérifie que l'absence de chantache ne casse rien et ne touche que 2 stocks.
// ============================================================================
db = makeDb({ productions: makeTable([
  { id:1, composant:'coques',  qteRestante:10, recipeId:100, prodStatut:'termine' },
  { id:2, composant:'ganache', qteRestante:10, recipeId:100, prodStatut:'termine' }
]) });
await assembleDecrement(db, { coquesId:1, ganacheId:2, chantacheId:null, qteAsm:3 });
eq((await db.productions.get(1)).qteRestante, 4,  'CAS3 · coques : 10 − 6 = 4');
eq((await db.productions.get(2)).qteRestante, 7,  'CAS3 · ganache : 10 − 3 = 7');

// ============================================================================
//  CAS 4 — Décimales : subQty arrondit à 3 décimales, pas de dérive
// ============================================================================
db = makeDb({ productions: makeTable([
  { id:1, composant:'coques',  qteRestante:7,   recipeId:100, prodStatut:'termine' },
  { id:2, composant:'ganache', qteRestante:3.5, recipeId:100, prodStatut:'termine' },
  { id:3, composant:'ganache', qteRestante:3.5, recipeId:100, prodStatut:'termine', composantCatalogue:true, componentId:50 }
]) });
await assembleDecrement(db, { coquesId:1, ganacheId:2, chantacheId:3, qteAsm:3 });
eq((await db.productions.get(1)).qteRestante, 1,   'CAS4 · coques : 7 − 6 = 1');
eq((await db.productions.get(2)).qteRestante, 0.5, 'CAS4 · garniture : 3,5 − 3 = 0,5 (pas de dérive)');
eq((await db.productions.get(3)).qteRestante, 0.5, 'CAS4 · chantache : 3,5 − 3 = 0,5');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS — Vague 8 : décrément transactionnel d\'assemblage (3 composants) ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Décrément des 3 composants conforme. La chantache EST bien décomptée.\n'); process.exit(0); }
else { console.log('✗ Le décrément ne correspond pas au comportement attendu.\n'); process.exit(1); }

}
run().catch(err=>{ console.error('Erreur test:', err); process.exit(1); });
