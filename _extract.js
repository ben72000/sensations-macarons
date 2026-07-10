/* ============================================================
   EXTRACTEUR DE SOURCE — utilitaire partagé des tests
   ------------------------------------------------------------
   Lit app.js (JAMAIS ne le modifie) et en extrait le code source
   exact de fonctions/constantes ciblées, pour les évaluer en
   isolation dans les tests de caractérisation.

   Robuste aux commentaires français (apostrophes « d'un », « l'input »)
   qui, prises pour des chaînes, fausseraient le comptage d'accolades.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, '..', 'app.js');
const APP = fs.readFileSync(APP_PATH, 'utf8');

// Retire commentaires (// … et /* … */) en préservant les chaînes.
function stripComments(code){
  let out = '', inStr = null, esc = false;
  for(let i = 0; i < code.length; i++){
    const c = code[i], n = code[i+1];
    if(inStr){
      out += c;
      if(esc){ esc = false; }
      else if(c === '\\'){ esc = true; }
      else if(c === inStr){ inStr = null; }
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; out += c; continue; }
    if(c === '/' && n === '/'){ while(i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
    if(c === '/' && n === '*'){ i += 2; while(i < code.length && !(code[i] === '*' && code[i+1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}

// [FIX v1293] MÉMOÏSATION — app.js dépasse désormais 60 000 lignes / 5,6 Mo. Plusieurs fichiers de
// test (ex. order-margins.test.js) appellent buildModule() — donc extractFunction()/extractConstLine()
// pour le MÊME jeu de noms — une fois par cas de test (jusqu'à 8 fois). Sans cache, chaque appel
// rescanne des centaines de Ko à plusieurs Mo de code source, ce qui pouvait faire dépasser les
// timeouts habituels (le fichier a beaucoup grossi depuis l'écriture de cet extracteur). APP ne
// change jamais pendant l'exécution d'un test (lu une seule fois au chargement du module), donc le
// résultat pour un nom donné est toujours identique : la mémoïsation est strictement sans risque.
const _fnCache = new Map();
const _constCache = new Map();
const _arrCache = new Map();

// Extrait `function NAME(...) { ... }` (ou `async function NAME...`) en équilibrant les
// accolades (commentaires neutralisés). Le mot-clé `async` éventuel est inclus, sinon une
// fonction async extraite contiendrait `await` sans `async` → SyntaxError à l'évaluation.
function extractFunction(name){
  if(_fnCache.has(name)) return _fnCache.get(name);
  const sigRe = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'g');
  const m = sigRe.exec(APP);
  if(!m) throw new Error('Introuvable (function): ' + name);
  const clean = stripComments(APP.slice(m.index));
  let i = clean.indexOf('{');
  if(i === -1) throw new Error('Corps introuvable: ' + name);
  let depth = 0, inStr = null, esc = false;
  for(let j = i; j < clean.length; j++){
    const c = clean[j];
    if(inStr){
      if(esc){ esc = false; }
      else if(c === '\\'){ esc = true; }
      else if(c === inStr){ inStr = null; }
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0){ const res = clean.slice(0, j+1); _fnCache.set(name, res); return res; } }
  }
  throw new Error('Accolades non équilibrées: ' + name);
}

// Extrait une const/let/var mono-ligne : `const NAME = ... ;`
function extractConstLine(name){
  if(_constCache.has(name)) return _constCache.get(name);
  const re = new RegExp('^(?:const|let|var)\\s+' + name + '\\s*=.*;', 'm');
  const m = APP.match(re);
  if(!m) throw new Error('Introuvable (const): ' + name);
  _constCache.set(name, m[0]);
  return m[0];
}

// Extrait un littéral `const NAME = [ ... ];` en bornant au 1er '];' du fragment nettoyé.
function extractArrayConst(name){
  if(_arrCache.has(name)) return _arrCache.get(name);
  const idx = APP.indexOf('const ' + name + ' = [');
  if(idx === -1) throw new Error('Introuvable (array): ' + name);
  const clean = stripComments(APP.slice(idx));
  const end = clean.indexOf('];');
  if(end === -1) throw new Error('Fin ' + name + ' introuvable');
  const res = clean.slice(0, end + 2);
  _arrCache.set(name, res);
  return res;
}

module.exports = { APP, APP_PATH, stripComments, extractFunction, extractConstLine, extractArrayConst };
