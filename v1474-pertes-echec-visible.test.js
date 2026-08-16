'use strict';
// v1474 — DEUXIÈME PASSE D'AUDIT : DEUX ÉCRITURES DE PERTE DONT L'ÉCHEC ÉTAIT INVISIBLE.
//
// 🚨 LE DÉFAUT, vérifié dans le code et non supposé : sur ces deux chemins, l'écriture de la perte
// se terminait par `.catch(e=>console.error(...))`. En cas d'échec, l'erreur partait dans la
// console — invisible pour Ben — et le flux CONTINUAIT : le toast annonçait le succès et l'écran
// se fermait.
//
// Ce qui rend ça grave, c'est l'ORDRE des opérations :
//  · casse en production : le stock est DÉCRÉMENTÉ juste avant (db.productions.update). Échec →
//    stock diminué, perte absente → coût matières et compta faussés, sans aucun signe.
//  · perte matière       : le lot est SUPPRIMÉ juste après (db.materialLots.delete). Échec → lot
//    perdu ET trace de la perte perdue, avec un message « perte matière enregistrée ».
//
// RÈGLE POSÉE : une écriture qui échoue doit se VOIR. Les écritures accessoires (journal d'audit,
// événements de calendrier) gardent leur `.catch` silencieux — leur échec ne fausse ni le stock ni
// la comptabilité, et interrompre l'utilisateur pour elles serait du bruit.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Casse en production : l'échec interrompt et prévient ----
{
  const i = APP.indexOf('await db.losses.add(loss)');
  const src = APP.slice(Math.max(0, i-400), i+600);
  check('A. l\'écriture n\'est plus suivie d\'un .catch silencieux',
    !/db\.losses\.add\(loss\)\.catch\(/.test(src));
  check('A. elle est enveloppée dans un try/catch explicite', /try\{[\s\S]{0,120}db\.losses\.add\(loss\);/.test(src));
  check('A. l\'échec prévient Ben par un toast', /toast\('⚠ La casse n\\?'a PAS été enregistrée/.test(src));
  check('A. l\'échec INTERROMPT le flux (pas de toast de succès derrière)', /return;\s*\n\s*\}\s*\n\s*closeModal\(\)/.test(src));
  check('A. le message dit quoi faire (le stock a déjà bougé)', /corrige-le à la main/.test(src));
}

// ---- B. Perte matière : le lot n'est PAS supprimé si la perte n'est pas écrite ----
{
  const i = APP.indexOf('db.materialLosses.add({');
  const src = APP.slice(Math.max(0, i-500), i+900);
  check('B. l\'écriture n\'est plus suivie d\'un .catch silencieux',
    !/materialLosses\.add\(\{[\s\S]{0,300}\}\)\.catch\(/.test(src));
  check('B. elle est enveloppée dans un try/catch', /try\{[\s\S]{0,80}db\.materialLosses\.add\(/.test(src));
  check('B. l\'échec prévient Ben', /toast\('⚠ La perte matière n\\?'a pas pu être enregistrée/.test(src));
  check('B. RÈGLE CLÉ : le lot n\'est supprimé QU\'APRÈS une écriture réussie',
    src.indexOf('return;') < src.indexOf('db.materialLots.delete(lotId)'));
  check('B. le message précise que le lot est conservé', /le lot est conservé/.test(src));
}

// ---- C. Les écritures ACCESSOIRES gardent leur silence (c'est voulu, pas un oubli) ----
{
  check('C. le journal d\'audit reste silencieux (son échec ne fausse aucun chiffre)',
    /db\.auditLog\.add\(entree\)\.catch\(/.test(APP));
  check('C. les événements de calendrier restent silencieux',
    /db\.events\.add\(\{[\s\S]{0,200}?\}\)\.catch\(/.test(APP));
}

// ---- D. GARDE DE MOTIF : aucune écriture de PERTE ou de STOCK ne doit avaler son échec ----
// Porte sur le code, pas sur les commentaires — ceux-ci citent le motif fautif pour l'expliquer.
{
  let code = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  // ⚠️ Une écriture DANS UNE TRANSACTION n'a pas besoin de try/catch : si elle échoue, toute la
  // transaction est annulée, donc le décrément de stock qui l'accompagne aussi — aucune
  // désynchronisation possible. Le détecteur les exclut, sinon il condamnerait du code sain
  // (constaté : la perte du copilote, l.43231, est justement protégée de cette façon).
  const critiques = ['losses', 'materialLosses', 'stockMoves', 'marketMoves'];
  critiques.forEach(t => {
    const re = new RegExp('db\\.' + t + '\\.(?:add|put|update|bulkAdd)\\([^;]{0,400}?\\)\\.catch\\(', 'g');
    const coupables = [...code.matchAll(re)].filter(m => {
      const amont = code.slice(Math.max(0, m.index - 500), m.index);
      const dernierTx = amont.lastIndexOf('db.transaction(');
      if (dernierTx === -1) return true;                     // pas de transaction en amont
      const depuis = amont.slice(dernierTx);
      // encore dans la transaction si les accolades ne sont pas refermées
      const ouv = (depuis.match(/\{/g) || []).length, fer = (depuis.match(/\}/g) || []).length;
      return ouv <= fer;                                     // refermée ⇒ hors transaction ⇒ coupable
    });
    check(`D. aucune écriture avalée HORS transaction sur « ${t} »`, coupables.length === 0);
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
