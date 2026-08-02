'use strict';
// v1438 — _activeTx est un champ PARTAGÉ sur l'instance Dexie : sous exécution concurrente
// (plusieurs db.transaction() en vol, ou un rappel différé type Dexie.ignoreTransaction qui
// reprend la main après coup), une opération peut hériter la transaction d'un AUTRE appel —
// déjà terminée, ou ne portant pas la table visée. C'est EXACTEMENT ce que le journal d'incident
// de Ben montrait : « audit flush … The transaction finished » et « atParfumsDispo … The
// specified object store was not found », ce dernier vu 148× (⇒ recipes.toArray() avalée par le
// .catch(()=>[]) d'atParfumsDispo ⇒ chaque batch affiche '#'+id au lieu du nom du parfum).
//
// On ne rejoue pas la course elle-même (fragile, dépend du scheduler) : on pose directement
// `db._activeTx` dans l'état où la course la laisse — une transaction ÉTRANGÈRE ou déjà FINIE —
// et on vérifie que l'opération suivante s'en sort quand même, sans planter et sans mentir.

const path = require('path');
const { loadDexie } = require('./_loadDexie');

const DEXIE_PATH = path.join(__dirname, '..', 'dexie.min.js');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
async function throws(fn){ try{ await fn(); return null; }catch(e){ return e; } }

async function openDb(Dexie){
  const db = new Dexie('t-' + Math.random());
  db.version(1).stores({ recipes: '++id, name', auditLog: '++id', productions: '++id' });
  await db.open();
  return db;
}

async function run(){
  const Dexie = loadDexie(DEXIE_PATH);

  // ---- Scénario A : « The specified object store was not found » ----
  // db._activeTx pointe vers une transaction bien VIVANTE, mais scopée à une AUTRE table
  // (ex : une migration `db.transaction('rw', db.auditLog, …)` encore en vol pendant qu'un
  // autre appel lit db.recipes).
  {
    const db = await openDb(Dexie);
    await db.recipes.add({ id: 1, name: 'Cannelle' });
    const txEtrangere = db._idb.transaction(['auditLog'], 'readwrite');
    db._activeTx = txEtrangere;   // ← état laissé par la course
    const err = await throws(() => db.recipes.toArray());
    check('A. plus de crash "object store not found" sur une lecture recipes', err === null);
    if(!err){
      const rows = await (async()=>{ db._activeTx = null; return db.recipes.toArray(); })();
      check('A. les données restent lisibles/correctes malgré la transaction étrangère',
        rows.length === 1 && rows[0].name === 'Cannelle');
    }
  }

  // ---- Scénario B : « The transaction finished » ----
  // db._activeTx pointe vers une transaction déjà COMMITÉE (auto-commit pendant un await non-IDB
  // à l'intérieur d'un db.transaction(), ou tout simplement une ancienne référence qui traîne).
  {
    const db = await openDb(Dexie);
    const txMorte = db._idb.transaction(['recipes'], 'readwrite');
    if(Dexie._internalTestHooks) Dexie._internalTestHooks.watchTxFinish(txMorte);  // suivi identique à une vraie transaction() explicite ; absent = fichier pré-correctif
    txMorte._complete();          // simule l'auto-commit déjà survenu (course réelle : gap non-IDB)
    db._activeTx = txMorte;       // ← état laissé par la course
    const err = await throws(() => db.recipes.add({ id: 2, name: 'Madeleine' }));
    check('B. plus de crash "transaction finished" sur une écriture recipes', err === null);
    db._activeTx = null;
    const rows = await db.recipes.toArray();
    check('B. l\'écriture a bien eu lieu (via la transaction de secours ouverte)',
      rows.some(r => r.name === 'Madeleine'));
  }

  // ---- Scénario C (exact) : reproduit le symptôme visible par Ben ----
  // atParfumsDispo avale l'erreur en .catch(()=>[]) → avec le bug, ça retombait à [] et chaque
  // batch affichait '#'+id. Avec le fix, .catch(()=>[]) ne se déclenche même plus : la vraie
  // liste de recettes revient.
  {
    const db = await openDb(Dexie);
    await db.recipes.add({ id: 3, name: 'Pistache' });
    const txEtrangere = db._idb.transaction(['productions'], 'readwrite');
    db._activeTx = txEtrangere;
    const recipes = await db.recipes.toArray().catch(() => []);
    db._activeTx = null;
    check('C. atParfumsDispo verrait la vraie liste (pas [] de repli)', recipes.length === 1 && recipes[0].name === 'Pistache');
  }

  // ---- Non-régression : une transaction explicite légitime, multi-tables, dans le MÊME appel,
  // continue de tout écrire dans une seule et même transaction IDB (atomicité conservée). ----
  {
    const db = await openDb(Dexie);
    await db.transaction('rw', db.recipes, db.auditLog, async () => {
      await db.recipes.add({ id: 4, name: 'Framboise' });
      await db.auditLog.add({ note: 'création Framboise' });
    });
    const recipes = await db.recipes.toArray();
    const audit = await db.auditLog.toArray();
    check('D. transaction explicite légitime : recipes écrite', recipes.some(r => r.name === 'Framboise'));
    check('D. transaction explicite légitime : auditLog écrit dans le même bloc', audit.some(a => a.note === 'création Framboise'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
