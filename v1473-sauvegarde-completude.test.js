'use strict';
// v1473 — 15 TABLES N'ÉTAIENT PAS SAUVEGARDÉES. Trouvé lors de l'audit complet demandé par Ben
// (« repasse en vue l'ensemble de mon code et pars à la recherche de tous les bugs possible »).
//
// 🚨 LE DÉFAUT : `buildDump` parcourt exactement `TABLES` (31 entrées) alors que la base en compte
// 46. Quinze tables UTILISÉES par l'app n'étaient donc ni sauvegardées ni restaurées — perdues
// SILENCIEUSEMENT lors d'une restauration sur appareil vierge ou après une purge iOS. Les plus
// lourdes de conséquence : `stockMoves` (socle du fil de traçabilité d'une boîte), `journalCompta`
// (journal comptable), `materialLosses` (pertes matières).
//
// 🚨 LE PIÈGE DE LA CORRECTION : `applyDump` fait `db.table(t).clear()` AVANT de réinsérer. Ajouter
// des tables sans précaution aurait fait qu'une ANCIENNE sauvegarde (qui les ignore) EFFACE ces
// tables à la restauration — l'inverse exact du but recherché. D'où la garde généralisée : une
// table absente du fichier n'est pas une table vide, c'est une table INCONNUE de ce fichier.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

function listeTables(nom){
  const m = APP.match(new RegExp('const ' + nom + ' = \\[([\\s\\S]*?)\\];'));
  if(!m) throw new Error('liste introuvable : ' + nom);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
const TABLES = listeTables('TABLES');

// ---- A. Les tables critiques sont désormais sauvegardées ----
{
  ['stockMoves','journalCompta','materialLosses'].forEach(t=>{
    check(`A. « ${t} » est dans le périmètre de sauvegarde`, TABLES.includes(t));
  });
  ['rdIngredients','rdIdees','rdTests','rdPreps','rdRefs'].forEach(t=>{
    check(`A. l'espace R&D « ${t} » est sauvegardé`, TABLES.includes(t));
  });
  ['posts','blocs','prospects','personas','planOverrides'].forEach(t=>{
    check(`A. « ${t} » est sauvegardé`, TABLES.includes(t));
  });
  // Exclusions VOLONTAIRES, pas des oublis.
  check('A. « backups » reste exclu (sauvegarder la liste des sauvegardes n\'a pas de sens)', !TABLES.includes('backups'));
  check('A. « errLog » reste exclu (diagnostic local, gonflerait le fichier sans rien protéger)', !TABLES.includes('errLog'));
}

// ---- B. Aucune table UTILISÉE par l'app ne reste hors sauvegarde (hors exclusions) ----
{
  const schema = new Set();
  (APP.match(/db\.version\([\s\S]{0,80}?\.stores\(\{([\s\S]*?)\}\)/g)||[]).forEach(b=>{
    [...b.matchAll(/^\s*([A-Za-z_]+)\s*:/gm)].forEach(x=>schema.add(x[1]));
  });
  const utilisees = new Set([...APP.matchAll(/db\.([A-Za-z_]+)\.(?:toArray|get|add|put|update|delete|where|count|bulkPut|orderBy|clear)\(/g)]
    .map(x=>x[1]).filter(t=>schema.has(t)));
  const exclues = new Set(['backups','errLog']);
  const oubliees = [...utilisees].filter(t=>!TABLES.includes(t) && !exclues.has(t));
  check(`B. aucune table utilisée n'est oubliée (${oubliees.length ? oubliees.join(', ') : 'aucune'})`, oubliees.length === 0);
  check('B. le périmètre couvre bien plus de 40 tables', TABLES.length > 40);
}

// ---- C. LA GARDE : une ancienne sauvegarde ne doit RIEN effacer qu'elle ignore ----
{
  const src = extractFunction('applyDump');
  check('C. une table absente du fichier est ignorée, pas vidée', /if\(!Array\.isArray\(dump\[t\]\)\) continue;/.test(src));
  // La garde doit précéder le clear(), sinon elle ne sert à rien.
  const iGarde = src.indexOf('if(!Array.isArray(dump[t])) continue;');
  const iClear = src.indexOf('db.table(t).clear()');
  check('C. la garde s\'applique AVANT le vidage', iGarde >= 0 && iClear >= 0 && iGarde < iClear);
  // Cas distinct : une table PRÉSENTE mais vide est une mesure, elle doit vider.
  check('C. un tableau vide reste une mesure (il vide bien la table)',
    /if\(Array\.isArray\(dump\[t\]\) && dump\[t\]\.length\) await db\.table\(t\)\.bulkAdd/.test(src));
}

// ---- D. Les anciennes sauvegardes restent VALIDES (somme de contrôle) ----
{
  const src = extractFunction('backupChecksum');
  check('D. la somme utilise le périmètre inscrit DANS le fichier', /dump\._checksumTables/.test(src));
  check('D. …et la liste héritée figée à défaut, jamais TABLES courant', /TABLES_CHECKSUM_HERITAGE/.test(src));

  // Comportement : élargir TABLES ne doit PAS invalider une sauvegarde déjà faite.
  const M = new Function('TABLES','TABLES_CHECKSUM_HERITAGE', `${src}\nreturn backupChecksum;`);
  const heritage = ['clients','orders'];
  const ancienDump = { clients:[{id:1}], orders:[{id:9}], _checksumTables:['clients','orders'] };
  const avant = M(['clients','orders'], heritage)(ancienDump);
  const apres = M(TABLES, heritage)(ancienDump);   // TABLES élargi entre-temps
  check('D. RÉCONCILIATION : la somme d\'une ancienne sauvegarde est INCHANGÉE après élargissement',
    avant === apres);

  // Une sauvegarde d'avant v1372 (sans _checksumTables) reste vérifiée sur la liste figée.
  const tresAncien = { clients:[{id:1}], orders:[{id:9}] };
  check('D. sauvegarde sans périmètre : somme stable elle aussi',
    M(['clients','orders'], heritage)(tresAncien) === M(TABLES, heritage)(tresAncien));
}

// ---- E. Le fichier produit embarque le nouveau périmètre ----
{
  const src = extractFunction('buildDump');
  check('E. le dump parcourt TABLES', /for\(const t of TABLES\) dump\[t\]=await db\.table\(t\)\.toArray\(\)/.test(src));
  check('E. le périmètre voyage AVEC le fichier', /_checksumTables\s*=\s*TABLES\.slice\(\)/.test(src));
  check('E. la somme est calculée après remplissage', src.indexOf('_checksumTables') < src.indexOf('_checksum = backupChecksum'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
