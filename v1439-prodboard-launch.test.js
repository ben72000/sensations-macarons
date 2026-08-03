'use strict';
// v1439 — LE BOUTON « ＋ LANCER UNE TÂCHE » DE L'ATELIER COMPLET N'OUVRAIT RIEN. Signalé par Ben,
// capture du journal d'incident à l'appui : « GLOBAL onerror @app.js:61626 Can't find variable:
// prodTaskPicker, écran: atelier ». prodBoardLaunch() (le gestionnaire du bouton) appelait
// prodTaskPicker() — une fonction MODALE qui n'a jamais existé dans app.js (seule une ligne de
// commentaire prétendait le contraire). Le vrai sélecteur, depuis le passage à la « couche
// flottante », s'ouvre en posant `_atPicker = true` puis en redessinant le board — exactement ce
// que fait déjà atTogglePicker() pour le panneau flottant jumeau. Chaque clic levait un
// ReferenceError et n'ouvrait rien.
'use strict';
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Garde statique globale : plus AUCUNE définition sous ce nom nulle part dans app.js ----
check('A. prodTaskPicker : aucune fonction de ce nom dans app.js (garde anti-réintroduction)',
  !/function\s+prodTaskPicker\s*\(/.test(APP));

// ---- B/C. Le corps réel de prodBoardLaunch ----
const src = extractFunction('prodBoardLaunch');
check('B. prodBoardLaunch ne référence plus prodTaskPicker', !src.includes('prodTaskPicker'));
check('C. prodBoardLaunch pose _atPicker = true', /_atPicker\s*=\s*true/.test(src));
check('C. prodBoardLaunch redessine le board (prodRenderBoard)', /prodRenderBoard\s*\(/.test(src));

// ---- D. Comportement réel, en isolation : appeler la fonction pose bien le drapeau et redessine ----
{
  let _atPicker = false;
  let renderCalls = 0;
  const prodRenderBoard = () => { renderCalls++; };
  const fn = new Function('_atPicker_ref', 'prodRenderBoard', `
    let _atPicker = _atPicker_ref.value;
    ${src}
    prodBoardLaunch();
    _atPicker_ref.value = _atPicker;
  `);
  const ref = { value: _atPicker };
  fn(ref, prodRenderBoard);
  check('D. après appel : _atPicker est passé à true', ref.value === true);
  check('D. après appel : prodRenderBoard a été invoqué exactement une fois', renderCalls === 1);
}

// ---- E. Preuve par réintroduction : l'ancienne version aurait dû planter ----
{
  const ancienneVersion = `function prodBoardLaunch(){\n  prodTaskPicker();\n}`;
  let leve = false;
  try{
    const fn = new Function(`
      ${ancienneVersion}
      prodBoardLaunch();
    `);
    fn();
  }catch(e){ leve = (e instanceof ReferenceError) && /prodTaskPicker/.test(e.message); }
  check('E. réintroduction : l\'ancien appel à prodTaskPicker lève bien un ReferenceError', leve);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
