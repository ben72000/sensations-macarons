/* ============================================================
   TESTS — v1388 : _activeTx COLLÉ SUR UNE TRANSACTION MORTE
   ------------------------------------------------------------
   LA PANNE (montrée par Ben) : tous les écrans tombent sur
   « objectStore … The transaction finished » (_txStore, dexie.min.js).
   Fait décisif rapporté par Ben : FERMER PUIS ROUVRIR L'APP GUÉRIT.

   Un moteur cassé planterait aussi après réouverture. La guérison au
   redémarrage prouve un ÉTAT MÉMOIRE corrompu, pas un bug de logique.
   Le candidat unique : db._activeTx. L'enveloppe transaction() le pose,
   et ne le restaure QUE si fn() se termine/jette dans son try/catch.
   Si iOS gèle l'app en arrière-plan pendant un await de fn(), la tx
   auto-commit ; _activeTx reste collé sur cette tx MORTE ; il n'est
   remis à null qu'au constructeur (démarrage à froid). Tout _txStore
   suivant réutilise la tx finie → « The transaction finished », partout,
   jusqu'à fermeture de l'app.

   Comparaison v1385↔v1386 : moteur IDENTIQUE, chantier D ne touche pas
   les transactions → défaut LATENT depuis v1381, pas régression v1386.

   Ce test simule la mort de la transaction active (comme le gel iOS) et
   vérifie que le moteur se rétablit SEUL. Rouge sur le moteur actuel.
   ============================================================ */
'use strict';
const { chargeVraiShim, attendCommits } = require('./_faux-idb');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  \u2713 ' + label); }
  else    { nKo++; console.log('  \u2717 ' + label + '   [\u00c9CHEC]'); }
}

(async () => {
console.log('\n=== v1388 \u00b7 _activeTx coll\u00e9 sur une transaction morte ===\n');

const { Dexie, _idb } = chargeVraiShim();
const db = new Dexie('test-v1388');
db.version(1).stores({ productions: '++id, lot' });
await db.productions.bulkPut([{ id:1, lot:'A' }, { id:2, lot:'B' }]);
await attendCommits();

console.log('1. État sain : une lecture fonctionne');
try {
  const rows = await db.productions.toArray();
  ok(rows.length === 2, 'toArray() fonctionne à l\u2019état sain');
} catch(e){ ok(false, 'toArray() sain a jet\u00e9 : ' + e.message); }

console.log('\n2. Simulation du gel iOS : _activeTx pointe sur une tx TERMINÉE');
// On fabrique la situation exacte du réveil : une transaction ouverte puis
// auto-commitée pendant que l'app était en arrière-plan, laissée dans _activeTx.
const txMorte = db._idb.transaction(['productions'], 'readwrite');
db._activeTx = txMorte;               // comme après le gel : collé
await attendCommits();                // la tx s'auto-commit (macrotâche), comme iOS
// txMorte est maintenant _settled ; _activeTx pointe toujours dessus.

console.log('\n3. Le moteur doit se RÉTABLIR SEUL (sans redémarrage)');
let msg = '';
try {
  const rows = await db.productions.toArray();   // passe par _txStore → _activeTx mort
  ok(rows.length === 2, 'toArray() se rétablit malgré _activeTx mort');
} catch(e){
  msg = e.message;
  ok(false, 'toArray() a jet\u00e9 : ' + e.message);
}

console.log('\n4. Après rétablissement, l\u2019état est propre pour la suite');
let msg4 = '';
try {
  const c = await db.productions.count();
  ok(c === 2, 'count() fonctionne après rétablissement');
} catch(e){ msg4 = e.message; ok(false, 'count() a jet\u00e9 : ' + e.message); }

console.log('\n--- R\u00e9sultat : ' + nOk + ' assertion(s) vraie(s), ' + nKo + ' \u00e9chec(s) ---\n');
if(/transaction finished/i.test(msg) || /transaction finished/i.test(msg4)){
  console.log('\u26d4 « The transaction finished » REPRODUIT : _activeTx mort r\u00e9utilis\u00e9. Bug confirm\u00e9.');
}
process.exitCode = nKo > 0 ? 1 : 0;
})();
