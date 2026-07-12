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

// Retire commentaires (// … et /* … */) en préservant les chaînes ET LES LITTÉRAUX DE REGEX.
//
// [FIX v1327 — L'EXTRACTEUR ÉTAIT AVEUGLE AUX REGEX] Cette fonction ne connaissait que trois
// délimiteurs de chaîne (" ' `) et deux formes de commentaire. Elle ignorait totalement les
// LITTÉRAUX DE REGEX. Conséquence, sur une ligne comme :
//
//     if(/\b(prod|fournee)\b.{0,18}\b(de|d')\b/.test(t))      ← parseIntent, ligne 33022
//
// l'apostrophe de « d' » était prise pour le début d'une chaîne : le stripper avalait alors tout
// le code jusqu'à l'apostrophe suivante (parfois des dizaines de lignes plus bas), les accolades
// se déséquilibraient, et l'extraction se terminait BEAUCOUP trop tôt.
// Effet mesuré : `parseIntent` (769 lignes) était extraite… sur 66 lignes, et produisait du JS
// invalide. Le CERVEAU du copilote — la fonction qui comprend le langage naturel — était donc
// littéralement INTESTABLE. Ce n'est pas un hasard si la vague 36 n'avait pu tester que
// `_aiDispatch` (l'aiguillage, un simple switch) et jamais la compréhension elle-même.
//
// L'échec était BRUYANT (SyntaxError au `new Function`), donc aucun test n'est passé au vert à
// tort. Mais un angle mort qui se défend en refusant d'être testé reste un angle mort.
//
// On sait désormais distinguer un `/` qui OUVRE UNE REGEX d'un `/` de DIVISION : c'est le
// dernier caractère significatif qui tranche (après `(`, `=`, `,`, `!`, `&&`, `return`… → regex ;
// après `)`, `]`, un identifiant ou un chiffre → division).
const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>']);
const REGEX_KEYWORDS  = ['return','typeof','instanceof','in','of','new','delete','void','throw','case','do','else','yield','await'];

// Un `/` à l'index idx de `code` ouvre-t-il une regex, ou est-ce une division ?
// Scan ARRIÈRE depuis idx (O(1) amorti) : app.js fait 5,5 Mo, on ne peut pas se permettre de
// re-scanner un préfixe à chaque caractère.
function regexPeutCommencerAt(code, idx){
  let i = idx - 1;
  while(i >= 0 && /\s/.test(code[i])) i--;
  if(i < 0) return true;                               // tout début de source
  const c = code[i];
  if(REGEX_PRECEDERS.has(c)) return true;
  if(/[A-Za-z_$]/.test(c)){                            // fin d'un mot : mot-clé, ou identifiant ?
    let j = i;
    while(j >= 0 && /[\w$]/.test(code[j])) j--;
    return REGEX_KEYWORDS.includes(code.slice(j + 1, i + 1));
  }
  return false;                                        // après `)`, `]`, un chiffre… → division
}

// Avance jusqu'au `/` fermant d'un littéral de regex ouvert à l'index idx.
// Renvoie l'index de ce `/` fermant (ou la fin de ligne, filet de sécurité).
// Les classes [...] sont suivies : un `/` à l'intérieur ne ferme PAS la regex (ex. /[a-z/]/).
function finDeRegex(code, idx){
  let i = idx + 1, inClass = false, esc = false;
  while(i < code.length){
    const d = code[i];
    if(esc){ esc = false; i++; continue; }
    if(d === '\\'){ esc = true; i++; continue; }
    if(d === '\n') return i - 1;                       // une regex ne franchit pas une ligne
    if(d === '[') inClass = true;
    else if(d === ']') inClass = false;
    else if(d === '/' && !inClass) return i;           // fin du littéral
    i++;
  }
  return code.length - 1;
}

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
    // Les commentaires se testent AVANT la regex : `//` et `/*` ne sont jamais des regex.
    if(c === '/' && n === '/'){ while(i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
    if(c === '/' && n === '*'){ i += 2; while(i < code.length && !(code[i] === '*' && code[i+1] === '/')) i++; i++; continue; }
    // LITTÉRAL DE REGEX — recopié tel quel, sans jamais interpréter les quotes qu'il contient.
    if(c === '/' && regexPeutCommencerAt(code, i)){
      const fin = finDeRegex(code, i);
      out += code.slice(i, fin + 1);
      i = fin;
      continue;
    }
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
    // [FIX v1327] L'équilibreur souffrait du MÊME aveuglement que le stripper : l'apostrophe d'une
    // regex (`/\b(de|d')\b/`) ouvrait une fausse chaîne, et il sautait alors toutes les accolades
    // jusqu'à l'apostrophe suivante → profondeur faussée → fonction tronquée. On saute désormais
    // le littéral de regex en bloc : ni ses quotes, ni ses accolades (`.{0,18}`) ne sont comptées.
    if(c === '/' && regexPeutCommencerAt(clean, j)){ j = finDeRegex(clean, j); continue; }
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
