/* ============================================================
   TESTS — v1381 : le VRAI moteur dexie.min.js tient le contrat
   ------------------------------------------------------------
   LA PANNE (découverte grâce à Ben, qui a montré le vrai runtime) :
   dexie.min.js — la micro-implémentation qui tourne en prod depuis un
   mois — ne fournissait NI table.hook(), NI db.tables, NI bulkPut/
   bulkDelete, NI primaryKeys, NI Dexie.ignoreTransaction. Résultat :
   le stockage unifié kv n'a JAMAIS recopié un réglage (chaque flush
   échouait), et le journal d'audit + la validation à l'entrée n'ont
   JAMAIS été installés (auditInstalle/valideInstalle plantaient à la
   première ligne, erreur avalée).

   POURQUOI MES TESTS ÉTAIENT VERTS QUAND MÊME : ils fournissaient
   eux-mêmes des db factices AVEC hook() — ils prouvaient la logique,
   jamais son exécution réelle. Un test qui fournit l'API qu'il
   prétend vérifier ne vérifie rien.

   CETTE SUITE charge LE fichier dexie.min.js livré (via vm, jamais
   une copie) sur un IndexedDB mémoire minimal, et prouve chaque
   morceau du contrat — jusqu'au bout-en-bout exact qui était mort :
   valideInstalle + auditInstalle réels, sur le moteur réel, refusant
   une vraie écriture mal typée et journalisant une vraie création.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');
const { chargeVraiShim, attendCommits } = require('./_faux-idb');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

function extraitBloc(marqueur, closer, portee){
  const i = APP.indexOf(marqueur);
  if(i === -1) throw new Error('Introuvable : ' + marqueur);
  const clean = stripComments(APP.slice(i, i + (portee || 20000)));
  const j = clean.indexOf(closer);
  return clean.slice(0, j + closer.length);
}

(async () => {
console.log('\n=== TESTS — v1381 : le vrai moteur dexie.min.js tient le contrat ===\n');

// ---------------------------------------------------------------------------
// A. LA SURFACE — tout ce qui manquait existe désormais sur le VRAI fichier
// ---------------------------------------------------------------------------
const { Dexie } = chargeVraiShim();
const db = new Dexie('test-v1381');
db.version(1).stores({ charges: '++id, date', kv: 'cle', auditLog: '++id, ts, tbl' });
{
  ok(Array.isArray(db.tables) && db.tables.length === 3 && db.tables.every(t => typeof t.name === 'string'),
     'A1 · db.tables existe : la liste des tables sur laquelle auditInstalle s\'installe');
  ok(typeof db.charges.hook === 'function' && typeof db.charges.bulkPut === 'function' &&
     typeof db.charges.bulkDelete === 'function' && typeof db.charges.put === 'function',
     'A2 · hook / put / bulkPut / bulkDelete existent sur chaque table');
  ok(typeof Dexie.ignoreTransaction === 'function',
     'A3 · Dexie.ignoreTransaction existe (écrire au journal depuis un hook)');
  ok(typeof db.on === 'function' && typeof db.close === 'function' && typeof db.open === 'function',
     'A4 · db.on / db.close / db.open existent (diagnostic « base bloquée » + chemin de réparation)');
  ok(typeof db.charges.orderBy('date').primaryKeys === 'function',
     'A5 · Collection.primaryKeys existe (rétention du journal d\'audit)');
  ok(typeof db.charges.where('date').between === 'function' && typeof db.charges.where('date').anyOf === 'function',
     'A6 · where().between / anyOf existent (fenêtres de dates, suppression en masse)');
}

// ---------------------------------------------------------------------------
// B. LE STOCKAGE UNIFIÉ kv — bulkPut/bulkDelete, LE flux mort depuis un mois
// ---------------------------------------------------------------------------
{
  await db.kv.bulkPut([{ cle:'sm_settings', valeur:'{"a":1}', ts:1 }, { cle:'sm_factSeq', valeur:'7', ts:1 }]);
  ok(await db.kv.count() === 2,
     'B1 · db.kv.bulkPut ÉCRIT enfin — la table kv ne restera plus vide (le flush v1372 fonctionne)');
  await db.kv.bulkPut([{ cle:'sm_settings', valeur:'{"a":2}', ts:2 }]);
  const s = await db.kv.get('sm_settings');
  ok(await db.kv.count() === 2 && s.valeur === '{"a":2}',
     'B2 · bulkPut sur clé existante MET À JOUR (upsert) — la réconciliation « pousser » écrit vraiment');
  await db.kv.bulkDelete(['sm_factSeq']);
  ok(await db.kv.count() === 1 && (await db.kv.get('sm_factSeq')) === undefined,
     'B3 · bulkDelete retire — la suppression d\'une clé métier se propage à la base');
}

// ---------------------------------------------------------------------------
// C. LES HOOKS — sémantique Dexie : arguments, onsuccess, et REFUS qui avorte
// ---------------------------------------------------------------------------
{
  const vu = { creating:null, updating:null, deleting:null, idRecu:null };
  let refuse = false;
  const subs = [];
  subs.push(db.charges.hook('creating', function(pk, obj, trans){
    vu.creating = { pk, obj:{...obj}, aTrans:!!(trans && typeof trans.on === 'function') };
    this.onsuccess = id => { vu.idRecu = id; };
    if(refuse) throw new Error('RefusTest');
  }));
  subs.push(db.charges.hook('updating', function(mods, pk, obj, trans){
    vu.updating = { mods:{...mods}, pk, avant:{...obj}, aTrans:!!(trans && typeof trans.on === 'function') };
    if(refuse) throw new Error('RefusTest');
  }));
  subs.push(db.charges.hook('deleting', function(pk, obj){ vu.deleting = { pk, obj:{...obj} }; }));

  const id = await db.charges.add({ date:'2026-07-01', montant:32.5 });
  ok(vu.creating && vu.creating.pk === undefined && vu.creating.obj.montant === 32.5 && vu.creating.aTrans,
     'C1 · hook creating : (clé auto = undefined, objet, trans avec .on) — la signature qu\'app.js attend');
  ok(vu.idRecu === id && id != null,
     'C2 · this.onsuccess reçoit la clé générée — le journal connaît la clé des créations auto');
  await db.charges.update(id, { montant:40 });
  ok(vu.updating && vu.updating.mods.montant === 40 && vu.updating.pk === id && vu.updating.avant.montant === 32.5,
     'C3 · hook updating : (modifs, clé, objet AVANT) — le diff avant/après du journal est possible');

  // LE REFUS — la promesse de la validation, enfin réelle sur le vrai moteur.
  refuse = true;
  let err = null;
  try{ await db.charges.add({ date:'2026-07-02', montant:1 }); }catch(e){ err = e; }
  ok(err && /RefusTest/.test(err.message),
     'C4 · une exception dans le hook REJETTE la promesse — l\'appelant voit le refus');
  ok(await db.charges.count() === 1,
     'C5 · … et RIEN n\'est écrit : le refus avorte l\'opération, pas seulement le message');
  let err2 = null;
  try{ await db.charges.update(id, { montant:99 }); }catch(e){ err2 = e; }
  const apres = await db.charges.get(id);
  ok(err2 && apres.montant === 40,
     'C6 · refus en modification : la ligne reste EXACTEMENT comme avant');
  refuse = false;

  await db.charges.delete(id);
  ok(vu.deleting && vu.deleting.pk === id && vu.deleting.obj.montant === 40 && await db.charges.count() === 0,
     'C7 · hook deleting : (clé, objet supprimé) — le journal sait CE QUI part, pas juste que ça part');
  subs.forEach(s => s.unsubscribe());
}

// ---------------------------------------------------------------------------
// D. trans.on('complete') — le tampon d'audit ne part qu'au COMMIT
// ---------------------------------------------------------------------------
{
  let flush = 0; const tampon = [];
  const sub = db.charges.hook('creating', function(pk, obj, trans){
    if(!trans._smTest){ trans._smTest = []; trans.on('complete', () => { flush++; }); }
    trans._smTest.push(obj.date);
    tampon.push(trans._smTest.length);
  });
  await db.transaction('rw', db.charges, async () => {
    await db.charges.add({ date:'2026-07-03', montant:1 });
    await db.charges.add({ date:'2026-07-04', montant:2 });
  });
  await attendCommits();
  ok(tampon.join(',') === '1,2' && flush === 1,
     'D1 · DEUX écritures d\'une même transaction partagent le MÊME tampon, et « complete » ne part qu\'UNE fois, au commit');
  sub.unsubscribe();
}

// ---------------------------------------------------------------------------
// E. L'ATOMICITÉ — un refus au milieu d'une transaction explicite annule TOUT
//    (la promesse « tout ou rien » de fusionnerBoites, enfin prouvée en vrai)
// ---------------------------------------------------------------------------
{
  const idA = await db.charges.add({ date:'2026-07-05', montant:10 });
  const idB = await db.charges.add({ date:'2026-07-06', montant:20 });
  const sub = db.charges.hook('updating', function(mods){ if(mods.montant === 666) throw new Error('RefusMilieu'); });
  let err = null;
  try{
    await db.transaction('rw', db.charges, async () => {
      await db.charges.update(idA, { montant:11 });     // passe
      await db.charges.update(idB, { montant:666 });    // REFUSÉ → toute la transaction avorte
    });
  }catch(e){ err = e; }
  await attendCommits();
  const a = await db.charges.get(idA), b = await db.charges.get(idB);
  ok(err && a.montant === 10 && b.montant === 20,
     'E1 · le refus au MILIEU annule aussi la 1ʳᵉ écriture (rollback) — tout ou rien, comme promis en v1376');
  sub.unsubscribe();
  await db.charges.clear();
}

// ---------------------------------------------------------------------------
// F. Dexie.ignoreTransaction — écrire ailleurs PENDANT une transaction
// ---------------------------------------------------------------------------
{
  const sub = db.charges.hook('creating', function(pk, obj, trans){
    // Depuis le hook (transaction charges active), on journalise dans auditLog — une autre table,
    // hors de la transaction en cours : c'est exactement le geste de _horsTransaction.
    Dexie.ignoreTransaction(() => db.auditLog.add({ ts:1, tbl:'charges', op:'test' }));
  });
  await db.transaction('rw', db.charges, async () => {
    await db.charges.add({ date:'2026-07-07', montant:5 });
  });
  await attendCommits(); await attendCommits();
  ok(await db.auditLog.count() === 1,
     'F1 · une écriture ignoreTransaction lancée depuis un hook ATTERRIT (dans sa propre transaction)');
  sub.unsubscribe();
  await db.auditLog.clear(); await db.charges.clear();
}

// ---------------------------------------------------------------------------
// G. primaryKeys + la rétention réelle du journal (_auditPrune, extrait d'app.js)
// ---------------------------------------------------------------------------
{
  for(let i = 1; i <= 5; i++) await db.auditLog.add({ ts:i, tbl:'t', op:'x' });
  const srcPrune = extractFunction('_auditPrune');
  const _auditPrune = new Function('db', 'AUDIT_MAX_ENTREES', 'swallow',
    'return ' + srcPrune.replace(/^async function _auditPrune/, 'async function'))(db, 3, () => {});
  const purge = await _auditPrune();
  const restants = (await db.auditLog.toArray()).map(r => r.ts).sort();
  ok(purge === 2 && restants.join(',') === '3,4,5',
     'G1 · le VRAI _auditPrune d\'app.js, sur le VRAI moteur : garde les 3 plus récentes, purge les 2 plus vieilles');
  await db.auditLog.clear();
}

// ---------------------------------------------------------------------------
// H. LE BOUT-EN-BOUT QUI ÉTAIT MORT — valideInstalle + auditInstalle réels
// ---------------------------------------------------------------------------
// On assemble les VRAIES fonctions d'app.js (validation v1373 + audit v1372), on les installe sur
// le VRAI moteur, et on rejoue le chemin de prod : une charge mal typée est REFUSÉE et journalisée
// (« rejet »), une charge saine est écrite ET journalisée (« création », clé comprise).
{
  const db2 = new (chargeVraiShim().Dexie)('test-v1381-e2e');
  db2.version(1).stores({ charges:'++id, date', auditLog:'++id, ts, tbl' });

  const code = [
    extraitBloc('const VALIDE_TYPES = {', '\n};'),
    extraitBloc('const VALIDE_SCHEMAS = {', '\n};'),
    extractFunction('_valideChamp'),
    extractFunction('_valideDecrit'),
    extractFunction('_valideObjet'),
    extraitBloc('class ValidationRefusee', '\n}'),
    extractFunction('_valideApplique'),
    extractFunction('valideInstalle'),
    extractFunction('_auditResume'),
    extractFunction('_auditDiff'),
    extractFunction('_auditPousse'),
    extractFunction('auditInstalle')
  ].join('\n');
  const toasts = [];
  const env = new Function('db', 'Dexie', 'toast', 'swallow', 'view', 'APP_VERSION',
    'valideStricteActive', '_valideCompteurs', '_importEnCours', 'AUDIT_TABLES_EXCLUES',
    'AUDIT_MAX_RESUME', '_figSignale', `
    const _horsTransaction = fn => { try{ if(Dexie.ignoreTransaction) return void Dexie.ignoreTransaction(fn); }catch(e){} setTimeout(fn, 0); };
    ${code}
    return { valideInstalle, auditInstalle };
  `)(db2, Dexie, m => toasts.push(m), () => {}, 'test', 'vTEST',
     () => true, { rejets:0, suspects:0 }, false, new Set(['auditLog','backups']),
     1200, () => {});

  env.valideInstalle();     // l'ordre du boot : la validation refuse AVANT que l'audit ne journalise
  env.auditInstalle();

  // 1) LE bug promis impossible : un montant en chaîne est refusé, rien n'est écrit, rejet journalisé.
  let err = null;
  try{ await db2.charges.add({ date:'2026-07-17', montant:'32,50' }); }catch(e){ err = e; }
  await attendCommits(); await attendCommits();
  const rejets = (await db2.auditLog.toArray()).filter(e => e.op === 'rejet');
  ok(err && err.name === 'ValidationRefusee',
     'H1 · BOUT-EN-BOUT — le montant en chaîne est refusé par une ValidationRefusee (le vrai code, le vrai moteur)');
  ok(await db2.charges.count() === 0,
     'H2 · … la charge mal typée N\'EST PAS en base (le refus avorte réellement)');
  ok(rejets.length === 1 && toasts.some(t => /refusée/.test(t)),
     'H3 · … et le refus est journalisé (« rejet ») ET dit à l\'écran — un mois de silence, terminé');

  // 2) Une charge saine passe, et sa création est journalisée avec sa clé.
  const idOk = await db2.charges.add({ date:'2026-07-17', montant:32.5, categorie:'Assurance' });
  await attendCommits(); await attendCommits();
  const creations = (await db2.auditLog.toArray()).filter(e => e.op === 'creation' && e.tbl === 'charges');
  ok(idOk != null && await db2.charges.count() === 1,
     'H4 · une charge saine s\'écrit normalement (aucun faux refus — v1370)');
  ok(creations.length === 1 && creations[0].cle === idOk,
     'H5 · … et le journal porte sa création, AVEC la clé générée (this.onsuccess a fait son travail)');

  // 3) Une modification est journalisée champ par champ (avant → après).
  await db2.charges.update(idOk, { montant:40 });
  await attendCommits(); await attendCommits();
  const modifs = (await db2.auditLog.toArray()).filter(e => e.op === 'modification');
  const resume = modifs.length ? JSON.parse(modifs[0].resume) : {};
  ok(modifs.length === 1 && resume.montant && resume.montant.avant === 32.5 && resume.montant.apres === 40,
     'H6 · la modification est journalisée avec avant (32,5) → après (40) — le diff v1372 vit enfin');
}

// ---------------------------------------------------------------------------
// I. LA GARDE ANTI-RETOUR — le contrat est désormais TENU PAR LE FICHIER LIVRÉ
// ---------------------------------------------------------------------------
{
  const shim = require('fs').readFileSync(require('path').join(__dirname, '..', 'dexie.min.js'), 'utf8');
  const requis = ['hook(', 'bulkPut', 'bulkDelete', 'primaryKeys', 'ignoreTransaction', 'get tables()', 'between(', 'anyOf('];
  const manquants = requis.filter(m => !shim.includes(m));
  ok(manquants.length === 0,
     'I1 · dexie.min.js contient toute la surface requise — retirer un morceau met cette suite au rouge' +
     (manquants.length ? ' — manquants : ' + manquants.join(', ') : ''));
  ok(/DIVERGENCES DÉCLARÉES/.test(shim),
     'I2 · les divergences avec le vrai Dexie sont DÉCLARÉES en tête de fichier (clear sans hooks, ignoreTransaction en macrotâche)');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
})().catch(e => { console.error('ERREUR HARNAIS v1381 :', e); process.exit(1); });
