'use strict';
// v1442 — MERINGUE MUTUALISÉE ACCESSIBLE À TOUT MOMENT. Demande de Ben :
// « je dois pouvoir accéder à la recette donnant la quantité totale de meringue mutualisée au
// même titre que le reste de la recette […] indiquer de manière séparée mais sur la même vue le
// détail et poids des ingrédients qui suivent pour chaque recette (coques chocolat et praliné par
// exemple) […] disponible à tout moment à l'intérieur de ce bouton-là présent en haut de la page
// fabrication. »
//
// Le calcul existait déjà et était déjà correct (ficheMeringueProduction, moteur v1379) : base
// commune cumulée + détail propre de CHAQUE parfum, sur une seule vue. Le trou, c'est qu'il ne
// s'affichait qu'UNE fois, juste après le lancement du duo — ensuite, le bouton « Voir la recette »
// d'un sous-lot ne montrait plus QUE ce parfum, jamais la base commune ni l'autre parfum.
'use strict';
const path = require('path');
const { extractFunction, extractConstLine } = require('./_extract');
const { loadDexie } = require('./_loadDexie');

const DEXIE_PATH = path.join(__dirname, '..', 'dexie.min.js');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- Statique : la source de la fonction fait bien ce qu'elle doit faire ----
const src = extractFunction('ficheRecetteProductionFromBatch');
check('A. vérifie p.meringueBatchId', /p\.meringueBatchId/.test(src));
check("A. interroge productions.where('meringueBatchId')", /where\(\s*'meringueBatchId'\s*\)/.test(src));
check('A. route vers ficheMeringueProduction quand 2+ frères', /ficheMeringueProduction\(/.test(src));
check('A. conserve le repli vers ficheRecetteProduction (non-régression mono-parfum)', /ficheRecetteProduction\(/.test(src));

// ---- Comportemental : sur une vraie (fausse) IndexedDB, avec de vraies requêtes .where() ----
async function buildDb(){
  const Dexie = loadDexie(DEXIE_PATH);
  const db = new Dexie('t-' + Math.random());
  db.version(1).stores({ productions: '++id, recipeId, date' });
  await db.open();
  return db;
}

async function run(){
  // ---- B. Batch appartenant à une fournée de meringue à 2 parfums : route vers la fiche combinée,
  // avec les bons rid/q/lot reconstruits pour CHAQUE parfum — pas seulement celui cliqué. ----
  {
    const db = await buildDb();
    await db.productions.bulkPut([
      { id:1, recipeId:10, meringueBatchId:'MER-A', qteTheorique:120, lotProduction:'020826CIT-CO', composant:'coques' },
      { id:2, recipeId:20, meringueBatchId:'MER-A', qteTheorique:80,  lotProduction:'020826PRA-CO', composant:'coques' },
    ]);
    let appelMeringue = null, appelSimple = null;
    const fn = new Function('db', 'ficheMeringueProduction', 'ficheRecetteProduction', 'toast', 'prodComposant', 'COQUES_PAR_MACARON', 'round3', `
      return (async () => {
        ${extractConstLine('COQUES_PAR_MACARON')}
        ${extractConstLine('round3')}
        ${extractFunction('prodComposant')}
        ${src}
        await ficheRecetteProductionFromBatch(1);   // clic sur le PREMIER sous-lot (Citron crémeux)
      })();
    `);
    await fn(db,
      (parts, mbid) => { appelMeringue = { parts, mbid }; },
      (...args) => { appelSimple = args; },
      () => {}, undefined, undefined, undefined);
    check('B. ficheMeringueProduction appelée (pas ficheRecetteProduction)', !!appelMeringue && !appelSimple);
    check('B. les DEUX parfums sont présents, pas seulement celui cliqué', appelMeringue && appelMeringue.parts.length === 2);
    check('B. rid du 1er parfum correct', appelMeringue && appelMeringue.parts.some(p => p.rid === 10));
    check('B. rid du 2e parfum (l\'autre, pas celui cliqué) correct', appelMeringue && appelMeringue.parts.some(p => p.rid === 20));
    check('B. quantité en macarons reconstruite (coques÷2) pour le 1er : 60', appelMeringue && appelMeringue.parts.find(p=>p.rid===10).q === 60);
    check('B. quantité en macarons reconstruite (coques÷2) pour le 2e : 40', appelMeringue && appelMeringue.parts.find(p=>p.rid===20).q === 40);
    check('B. lot du 1er parfum correct', appelMeringue && appelMeringue.parts.find(p=>p.rid===10).lot === '020826CIT-CO');
    check("B. l'identifiant de fournée est transmis", appelMeringue && appelMeringue.mbid === 'MER-A');
  }

  // ---- C. Non-régression : un batch SANS meringueBatchId continue de montrer sa propre fiche
  // (comportement d'avant, inchangé). ----
  {
    const db = await buildDb();
    await db.productions.bulkPut([
      { id:1, recipeId:30, qteTheorique:100, qteProduite:50, lotProduction:'LOTSEUL-CO', composant:'coques' },
    ]);
    let appelMeringue = null, appelSimple = null;
    const fn = new Function('db', 'ficheMeringueProduction', 'ficheRecetteProduction', 'toast', `
      return (async () => {
        ${extractConstLine('COQUES_PAR_MACARON')}
        ${extractConstLine('round3')}
        ${extractFunction('prodComposant')}
        ${src}
        await ficheRecetteProductionFromBatch(1);
      })();
    `);
    await fn(db,
      (parts, mbid) => { appelMeringue = { parts, mbid }; },
      (...args) => { appelSimple = args; },
      () => {});
    check('C. non-régression : ficheRecetteProduction appelée (pas ficheMeringueProduction)', !appelMeringue && !!appelSimple);
    check('C. recipeId correct transmis à la fiche simple', appelSimple && appelSimple[0] === 30);
  }

  // ---- D. Cas limite : meringueBatchId présent mais UN SEUL sous-lot encore en base (l'autre a
  // été supprimé) — on ne route PAS vers la fiche combinée (qui exige 2+ parfums), on retombe sur
  // la fiche simple plutôt que de planter ou de rester muet. ----
  {
    const db = await buildDb();
    await db.productions.bulkPut([
      { id:1, recipeId:40, meringueBatchId:'MER-SOLO', qteTheorique:100, composant:'coques' },
    ]);
    let appelMeringue = null, appelSimple = null;
    const fn = new Function('db', 'ficheMeringueProduction', 'ficheRecetteProduction', 'toast', `
      return (async () => {
        ${extractConstLine('COQUES_PAR_MACARON')}
        ${extractConstLine('round3')}
        ${extractFunction('prodComposant')}
        ${src}
        await ficheRecetteProductionFromBatch(1);
      })();
    `);
    await fn(db,
      (parts, mbid) => { appelMeringue = { parts, mbid }; },
      (...args) => { appelSimple = args; },
      () => {});
    check('D. un seul sous-lot restant : repli sur la fiche simple, pas de plantage', !appelMeringue && !!appelSimple);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
