'use strict';
// v1439 — LE BOUTON « ＋ LANCER UNE TÂCHE » DE L'ATELIER COMPLET N'OUVRAIT RIEN. Signalé par Ben,
// capture du journal d'incident à l'appui : « GLOBAL onerror @app.js:61626 Can't find variable:
// prodTaskPicker, écran: atelier ». prodBoardLaunch() (le gestionnaire du bouton) appelait
// prodTaskPicker() — une fonction MODALE qui n'a jamais existé dans app.js (seule une ligne de
// commentaire prétendait le contraire). Le vrai sélecteur, depuis le passage à la « couche
// flottante », s'ouvre en posant `_atPicker = true` puis en redessinant le board — exactement ce
// que fait déjà atTogglePicker() pour le panneau flottant jumeau. Chaque clic levait un
// ReferenceError et n'ouvrait rien.
//
// v1440 (même wave) — CORRIGÉ MAIS INVISIBLE. Une fois le crash réparé, Ben a signalé : « le bouton
// ne renvoie plus d'erreur, mais quand je clique dessus plus rien ne se passe ». Le sélecteur
// s'ouvre BEL ET BIEN (même mécanisme que le bouton ▼ « Voir toutes les tâches », qui a toujours
// fonctionné) mais plus bas dans l'écran, après les tâches en cours — et si `_atPicker` était déjà
// à `true` d'un essai précédent (rien ne le remet à `false` entre deux rendus), rouvrir un panneau
// déjà ouvert ne change RIEN à l'écran. Fix : prodBoardLaunch attend le rendu puis fait défiler la
// liste dans le cadre — un clic sur ce bouton a désormais TOUJOURS un effet visible constaté.
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
check('C. prodBoardLaunch est async (peut attendre le rendu avant de défiler)', /^\s*async\s+function\s+prodBoardLaunch/.test(src));
check('C. prodBoardLaunch fait défiler la liste ouverte dans le cadre (scrollIntoView)', /scrollIntoView/.test(src));

// Petit DOM factice : juste assez pour prouver le ciblage, pas un navigateur.
function fakeDocument(withList){
  const calls = { queries: [], scrolled: [] };
  const elList = { scrollIntoView(opts){ calls.scrolled.push({ el:'at-list', opts }); } };
  const elSugg = { scrollIntoView(opts){ calls.scrolled.push({ el:'pb-sugg', opts }); } };
  const doc = {
    querySelector(sel){
      calls.queries.push(sel);
      if(sel.includes('.at-list')) return withList ? elList : null;
      if(sel.includes('.pb-sugg')) return elSugg;
      return null;
    }
  };
  return { doc, calls };
}

// ---- D. Comportement réel, en isolation : le drapeau passe à true, le board est redessiné, ET on
// défile bien vers la liste (cas normal : la liste existe après rendu). ----
async function testD(){
  let renderCalls = 0;
  const { doc, calls } = fakeDocument(true);
  const prodRenderBoard = async () => { renderCalls++; };
  const fn = new Function('_atPicker_ref', 'prodRenderBoard', 'document', `
    return (async () => {
      let _atPicker = _atPicker_ref.value;
      ${src}
      await prodBoardLaunch();
      _atPicker_ref.value = _atPicker;
    })();
  `);
  const ref = { value: false };
  await fn(ref, prodRenderBoard, doc);
  check('D. après appel : _atPicker est passé à true', ref.value === true);
  check('D. après appel : prodRenderBoard a été attendu exactement une fois', renderCalls === 1);
  check('D. après appel : la liste .at-list a bien reçu scrollIntoView (effet TOUJOURS visible)',
    calls.scrolled.some(c => c.el === 'at-list'));
}

// ---- D2. Le cas signalé par Ben : _atPicker DÉJÀ à true avant le clic (essai précédent). Le
// drapeau ne « change » pas, mais le défilement doit quand même avoir lieu — sinon le clic reste
// indiscernable d'un clic sans effet, exactement le symptôme signalé. ----
async function testD2(){
  let renderCalls = 0;
  const { doc, calls } = fakeDocument(true);
  const prodRenderBoard = async () => { renderCalls++; };
  const fn = new Function('_atPicker_ref', 'prodRenderBoard', 'document', `
    return (async () => {
      let _atPicker = _atPicker_ref.value;
      ${src}
      await prodBoardLaunch();
      _atPicker_ref.value = _atPicker;
    })();
  `);
  const ref = { value: true };   // déjà ouvert avant le clic
  await fn(ref, prodRenderBoard, doc);
  check('D2. cas "déjà ouvert" : prodRenderBoard est quand même appelé', renderCalls === 1);
  check('D2. cas "déjà ouvert" : le défilement a quand même lieu (le clic reste visible)',
    calls.scrolled.some(c => c.el === 'at-list'));
}

// ---- D3. Repli : si .at-list est absent au moment du défilement (liste vide), on cible .pb-sugg
// plutôt que de planter sur un querySelector qui renvoie null. ----
async function testD3(){
  const { doc, calls } = fakeDocument(false);
  const prodRenderBoard = async () => {};
  const fn = new Function('_atPicker_ref', 'prodRenderBoard', 'document', `
    return (async () => {
      let _atPicker = _atPicker_ref.value;
      ${src}
      await prodBoardLaunch();
    })();
  `);
  await fn({ value:false }, prodRenderBoard, doc);
  check('D3. repli sans planter quand .at-list est absent : .pb-sugg reçoit le scroll',
    calls.scrolled.some(c => c.el === 'pb-sugg'));
}

// ---- E. Preuve par réintroduction : l'ancienne version (celle qui a provoqué le rapport de Ben)
// aurait dû planter avec le ReferenceError exact. ----
function testE(){
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

// ---- E2. Preuve par réintroduction du symptôme v1440 : la version v1439 « corrigée mais
// invisible » (sans scrollIntoView) ne défile jamais, même quand la liste existe. ----
async function testE2(){
  const srcV1439 = `async function prodBoardLaunch(){\n  _atPicker = true;\n  if(typeof prodRenderBoard==='function') await prodRenderBoard();\n}`;
  const { doc, calls } = fakeDocument(true);
  const prodRenderBoard = async () => {};
  const fn = new Function('prodRenderBoard', 'document', `
    return (async () => {
      let _atPicker = false;
      ${srcV1439}
      await prodBoardLaunch();
    })();
  `);
  await fn(prodRenderBoard, doc);
  check('E2. réintroduction du symptôme v1440 : la version v1439 seule ne défile jamais (aucun scrollIntoView)',
    calls.scrolled.length === 0);
}

(async () => {
  await testD();
  await testD2();
  await testD3();
  testE();
  await testE2();

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})();
