'use strict';
// v1503 — DEUX INCIDENTS DU JOURNAL SANTÉ DE L'APP, REPÉRÉS PAR BEN SUR UNE CAPTURE.
//
// ① IMPORTANT — « Failed to execute 'getAll' on 'IDBObjectStore': The transaction is inactive or
// finished. » pendant `_etiqValiderGo` (étiquetage de boîtes), écran productions, v1493.
// CAUSE : v1438 avait déjà documenté et en partie corrigé le risque du champ PARTAGÉ `_activeTx`
// sous exécution concurrente — mais uniquement pour le cas où `_txFinished` sait DÉJÀ que la
// transaction est terminée (l'événement 'complete'/'abort' a eu le temps de se déclencher). Il
// reste une fenêtre plus étroite, documentée dans le commentaire v1438 lui-même mais pas encore
// couverte : entre le moment où IndexedDB rend une transaction INACTIVE (refuse toute nouvelle
// requête) et le moment où l'événement 'complete' se déclenche RÉELLEMENT (qui seul alimente
// `_txFinished`). Dans cette fenêtre, `_txStore()` juge la transaction « réutilisable » à tort :
// pas encore dans `_txFinished`, donc rien ne l'arrête — et l'opération suivante plante.
// FIX : `get`/`toArray`/`count` (lectures SANS HOOK, donc rejouables sans risque d'effet de bord
// dupliqué) retentent une fois avec une transaction fraîche si l'erreur est bien de ce type
// (`TransactionInactiveError` ou `InvalidStateError` — selon le point exact où ça casse).
//
// ② MINEUR (3×) — « GLOBAL onerror @index.html#modal:1 : Unexpected EOF », écran matières, v1495.
// CAUSE : `onclick='inventaireConfirm(${JSON.stringify(...)})'` insère du JSON dans un attribut
// HTML délimité par des APOSTROPHES. Un nom de matière contenant lui-même une apostrophe
// (« poudre d'amande », ingrédient courant de macaron) referme l'attribut en plein milieu — le
// reste du JSON devient un fragment JS tronqué, syntaxiquement incomplet.
// FIX : `escAttrJson()`, qui échappe le JSON pour un attribut entre apostrophes (`'` → `&#39;`,
// en plus de &, <, >, " déjà couverts par `esc()`).
const path = require('path');
const { extractFunction, extractConstLine, APP } = require('./_extract');
const { loadDexie } = require('./_loadDexie');

const DEXIE_PATH = path.join(__dirname, '..', 'dexie.min.js');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
async function throws(fn){ try{ await fn(); return null; }catch(e){ return e; } }

async function openDb(Dexie){
  const db = new Dexie('t-' + Math.random());
  db.version(1).stores({ productions: '++id, name', auditLog: '++id' });
  await db.open();
  return db;
}

async function run(){
  const Dexie = loadDexie(DEXIE_PATH);

  // ---- A. [LE DÉFAUT IMPORTANT CORRIGÉ] La fenêtre étroite que v1438 ne couvrait pas encore ----
  // On simule EXACTEMENT cette fenêtre : la transaction est déjà morte côté navigateur (notre
  // proxy : `_finished`), mais SANS passer par `_watchTxFinish` — donc `_txFinished` l'ignore
  // encore, exactement comme entre l'inactivation réelle et l'événement 'complete' qui n'a pas
  // encore eu le temps de se propager. `_txStore()` la croira réutilisable ; c'est justement le
  // cas que le filet v1438 (seul) ne rattrape pas.
  {
    const db = await openDb(Dexie);
    await db.productions.add({ id: 1, name: 'Chocolat' });
    const txFenetre = db._idb.transaction(['productions'], 'readonly');
    // Pas de watchTxFinish ici — volontaire : _txFinished doit rester aveugle à cette mort.
    txFenetre._complete();
    db._activeTx = txFenetre;

    const err = await throws(() => db.productions.toArray());
    check('A. [LE DÉFAUT CORRIGÉ] toArray() ne plante plus dans la fenêtre étroite non couverte par v1438',
      err === null);

    db._activeTx = txFenetre;   // toArray() ne l'a pas changé : on rejoue get()/count() pareil
    const errGet = await throws(() => db.productions.get(1));
    check('A. get() bénéficie du même filet', errGet === null);

    db._activeTx = txFenetre;
    const errCount = await throws(() => db.productions.count());
    check('A. count() bénéficie du même filet', errCount === null);

    db._activeTx = null;
    const rows = await db.productions.toArray();
    check('A. les données restent exactes malgré la transaction morte traversée',
      rows.length === 1 && rows[0].name === 'Chocolat');
  }

  // ---- B. Sensibilité : sans le correctif (retour à la version d'avant), ce même scénario plante ----
  {
    const Dexie2 = loadDexie(DEXIE_PATH);   // instance fraîche, indépendante
    const db = await (async()=>{
      const d = new Dexie2('t-' + Math.random());
      d.version(1).stores({ productions: '++id, name' });
      await d.open();
      return d;
    })();
    const txFenetre = db._idb.transaction(['productions'], 'readonly');
    txFenetre._complete();
    db._activeTx = txFenetre;
    // Rejoue l'ANCIEN chemin directement (sans passer par le get() corrigé) : _txStore() seul,
    // sans filet — c'est exactement ce que faisait dexie.min.js avant la v1503.
    const errAncien = await throws(() => {
      const { store } = db.productions._txStore('readonly');
      return store.get(1);
    });
    check('B. [SENSIBILITÉ] sans passer par le filet, la même transaction morte jette bien une erreur',
      errAncien !== null);
  }

  // ---- C. Câblage réel dans dexie.min.js : _txStore() est DANS le try, pas avant ----
  const fs = require('fs');
  const dexieSrc = fs.readFileSync(DEXIE_PATH, 'utf8');
  {
    const iGet = dexieSrc.indexOf('async get(id) {');
    const bloc = dexieSrc.slice(iGet, iGet + 300);
    check('C. get() construit son store DANS le bloc try (sinon un InvalidStateError le contournerait)',
      /try\{ const \{ store \} = this\._txStore/.test(bloc));
    check('C. get() couvre les deux noms d\'erreur réels observables',
      /TransactionInactiveError.*InvalidStateError/.test(bloc));
  }
  {
    const iArr = dexieSrc.indexOf('async toArray() {');
    const bloc = dexieSrc.slice(iArr, iArr + 300);
    check('C. toArray() suit le même câblage', /try\{ const \{ store \} = this\._txStore/.test(bloc));
  }
  {
    const iCnt = dexieSrc.indexOf('async count() {\n      try{');
    check('C. count() (Table) est bien celui patché, trouvé sans ambiguïté', iCnt > -1);
    const bloc = dexieSrc.slice(iCnt, iCnt + 300);
    check('C. count() suit le même câblage', /try\{ const \{ store \} = this\._txStore/.test(bloc));
  }
  // Les méthodes d'ÉCRITURE (add/update/put/delete) ne sont délibérément PAS retentées : leurs
  // hooks (creating/updating/deleting) auraient déjà pu produire un effet de bord avant l'échec
  // (ex. journal d'audit) — les rejouer les déclencherait une seconde fois.
  check('C. add() n\'a pas été touché (risque de double effet de bord via les hooks)',
    !/async add\(obj\) \{[\s\S]{0,50}try\{/.test(dexieSrc));

  // ---- D. [LE DÉFAUT MINEUR CORRIGÉ] escAttrJson protège l'apostrophe dans un attribut ----
  {
    const escAttrJsonSrc = extractFunction('escAttrJson');
    const M = new Function(`
      ${extractConstLine('esc')}
      ${escAttrJsonSrc}
      return escAttrJson;
    `);
    const escAttrJson = M();
    const donnee = [{ id: 7, nom: "Poudre d'amande", delta: -50 }];
    const attribut = escAttrJson(donnee);
    check('D. [LE DÉFAUT CORRIGÉ] l\'apostrophe de « Poudre d\'amande » ne referme plus l\'attribut',
      !attribut.includes("'"));
    check('D. …elle est encodée en entité HTML, décodable par le navigateur',
      attribut.includes('&#39;'));
    // Reconstitue ce que fait vraiment le navigateur : décode l'attribut HTML puis parse en JS.
    const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const roundTrip = JSON.parse(decode(attribut));
    check('D. le contenu original (avec son apostrophe) est fidèlement restitué après décodage',
      roundTrip[0].nom === "Poudre d'amande");
  }

  // ---- E. Sensibilité : JSON.stringify seul (l'ancien code) casse bien l'attribut ----
  {
    const donnee = [{ id: 7, nom: "Poudre d'amande", delta: -50 }];
    const ancien = JSON.stringify(donnee);
    check('E. [SENSIBILITÉ] JSON.stringify seul contient bien une apostrophe non protégée',
      ancien.includes("'"));
    // Simule ce qu'un navigateur voit dans onclick='inventaireConfirm(${ancien})' : tout ce qui
    // suit la PREMIÈRE apostrophe sort de l'attribut.
    const attributHTML = `inventaireConfirm(${ancien})`;
    const premierePart = attributHTML.split("'")[0];
    check('E. …et l\'attribut HTML serait bien tronqué à la première apostrophe rencontrée',
      premierePart.length < attributHTML.length && !premierePart.includes('amande'));
  }

  // ---- F. Les deux points d'appel réels utilisent bien escAttrJson, plus JSON.stringify nu ----
  {
    check('F. inventaireConfirm (le déclencheur réel) utilise escAttrJson',
      /onclick='inventaireConfirm\(\$\{escAttrJson\(/.test(APP));
    check('F. fixIntegrityIssue (même motif fragile, durci par précaution) aussi',
      /onclick='fixIntegrityIssue\(\$\{escAttrJson\(/.test(APP));
    const codeSeul = APP.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    check('F. plus aucun onclick entre apostrophes n\'insère un JSON.stringify nu (hors commentaires)',
      !/onclick='[^']*\$\{JSON\.stringify/.test(codeSeul));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
