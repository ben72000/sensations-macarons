// ════════════════════════════════════════════════════════════════════════════
//  VAGUE 66 (v1351) — LE SCHÉMA DEXIE : CHAQUE `db.xxx` DOIT EXISTER
//
//  Ben : « ça a échoué / erreur » sur le générateur de coffrets. En RELISANT mon propre code
//  avant même sa capture, j'ai trouvé `db.lots.toArray()` — une table qui N'EXISTE PAS. Le
//  schéma réel s'appelle `materialLots`. Pire : LA MÊME FAUTE DE FRAPPE existait déjà dans
//  `figerCoutMatiere` (v1342) — silencieuse depuis DEUX VAGUES, avalée par un `swallow()`.
//  Aucune commande n'a jamais eu son coût matière figé depuis l'introduction de la fonction.
//
//  CE TEST N'EST PAS UN TEST DE LOGIQUE MÉTIER. C'est un test de PLOMBERIE : chaque `db.xxx`
//  cité dans le fichier doit correspondre à une table déclarée dans db.version(1).stores (ou
//  une version ultérieure). Ce genre d'erreur ne casse RIEN à la lecture du code — seulement
//  à l'exécution, et souvent avalée par un catch bien intentionné. D'où l'intérêt de la
//  vérifier mécaniquement plutôt que de compter sur une relecture qui ne viendra pas toujours.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok=0, ko=0;
const T=(n,a,b)=>{ const p = JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++;console.log('  OK '+n);} else {ko++;console.log('  X '+n+'\n      obtenu  '+JSON.stringify(a)+'\n      attendu '+JSON.stringify(b));} };

// 1) Extraire les tables RÉELLEMENT déclarées dans le schéma (tous les .stores({...}) cumulés,
//    puisque Dexie empile les versions : une table déclarée une fois existe pour toujours après).
const tablesDeclarees = new Set();
const reStores = /\.stores\(\{([^}]*)\}\)/g;
let m;
while((m = reStores.exec(SRC))){
  const bloc = m[1];
  const reCle = /(\w+)\s*:\s*'/g;
  let mc;
  while((mc = reCle.exec(bloc))) tablesDeclarees.add(mc[1]);
}

console.log('\n-- Tables declarees dans le schema Dexie (' + tablesDeclarees.size + ') --');
console.log('  ' + [...tablesDeclarees].sort().join(', '));

// 2) Extraire tous les usages `db.NomTable` dans le code (hors commentaires evidents et hors
//    methodes Dexie comme db.transaction, db.open, db.version qui ne sont pas des tables).
const NON_TABLES = new Set(['transaction','open','version','close','delete','on','table','tables','name','verno','backendDB','isOpen','hasBeenClosed','hasFailed','dynamicallyOpened','_novip']);
// On retire les lignes de COMMENTAIRE avant de chercher les usages — sinon un commentaire QUI
// DECRIT le bug (comme celui-ci, juste au-dessus) serait lu comme une NOUVELLE occurrence du
// bug. Un test doit distinguer le code qui s'exécute de la prose qui en parle.
const SRC_SANS_COMMENTAIRES = SRC
  .split('\n')
  .map(l => l.replace(/\/\/.*$/, ''))   // retire // jusqu'à fin de ligne
  .join('\n');
const usages = new Set();
const reUsage = /\bdb\.(\w+)\s*\.\s*(?:toArray|get|add|put|update|delete|where|orderBy|count|bulkAdd|bulkPut|each|toCollection|filter|clear)\b/g;
let mu;
while((mu = reUsage.exec(SRC_SANS_COMMENTAIRES))){
  const nom = mu[1];
  if(!NON_TABLES.has(nom)) usages.add(nom);
}

console.log('\n-- Tables REFERENCEES dans le code (' + usages.size + ') --');
console.log('  ' + [...usages].sort().join(', '));

// 3) LE TEST QUI COMPTE : chaque table référencée doit être déclarée.
console.log('\n-- CHAQUE db.xxx REFERENCE DOIT EXISTER DANS LE SCHEMA --');
const manquantes = [...usages].filter(u => !tablesDeclarees.has(u));
T('aucune table referencee et non declaree (le bug db.lots, exactement)', manquantes, []);

if(manquantes.length){
  console.log('  TABLES FANTOMES : ' + manquantes.join(', '));
  console.log('  -> chacune leve une exception Dexie a l\'execution, souvent avalee par un catch.');
}

// 4) Non-regression nominative : le bug precis qui a motive ce test ne doit plus exister.
T('db.lots (le bug precis) n\'est plus reference nulle part dans le code executable', usages.has('lots'), false);
T('db.materialLots (la vraie table) est bien utilisee a la place', usages.has('materialLots'), true);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- schema Dexie coherent')));
process.exit(ko ? 1 : 0);
