'use strict';
// v1443 — LE CHAMP « MACARONS Pn » NE SUIVAIT PAS LE PARFUM CHOISI. Signalé par Ben, capture à
// l'appui : en mode duo (« 2 parfums, meringue commune »), il choisit « Coco citron vert
// (100/batch) » en Parfum 2 — le champ « Macarons P2 » reste affiché à 60 (la valeur codée en dur
// du formulaire, ou ce que portait le parfum précédemment sélectionné), jamais resynchronisée sur
// le rendement du parfum réellement choisi. « 100/batch » écrit juste au-dessus, « 60 » dedans :
// trompeur, et un lancement sans y toucher produirait la mauvaise quantité pour ce parfum.
//
// Le mode mono-parfum avait déjà ce réflexe (prodSyncTheorique() resynchronise f_qte à chaque
// changement de recette) — il manquait en mode duo/trio, sur les 3 emplacements.
const path = require('path');
const { extractFunction, extractConstLine } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- Petit DOM factice : juste des éléments <select>/<input> adressables par id ----
function makeInput(value){ return { value, tagName:'INPUT' }; }
function makeSelect(options, selectedIndex){
  return { tagName:'SELECT', selectedIndex, options: options.map(o => ({ dataset: { rend: o.rend } })) };
}
function makeFakeDocument(registry){
  return { getElementById: id => registry[id] || null };
}

// ---- Construit le vrai module (prodDuoSyncQte + ses dépendances réelles) ----
const src = [
  extractConstLine('COQUES_PAR_MACARON'),
  extractFunction('_duoEls'),
  extractFunction('_duoSetLabel'),
  extractFunction('prodDuoQteChange'),
  extractFunction('prodDuoSyncQte'),
].join('\n');

function buildModule(document, apercuStub){
  const fn = new Function('document', 'prodDuoApercu', `
    ${src}
    return { prodDuoSyncQte };
  `);
  return fn(document, apercuStub || (()=>{}));
}

// ---- A. Cas exact de Ben : Parfum 2 passe de "Citron crémeux (60/batch)" à
// "Coco citron vert (100/batch)" — le champ doit suivre, pas rester bloqué à 60. ----
{
  const registry = {
    f_duoRec1: makeSelect([{rend:'60'}, {rend:'100'}], 0),                 // reste sur Citron crémeux
    f_duoQte1: makeInput('60'),
    f_duoRec2: makeSelect([{rend:'60'}, {rend:'100'}], 1),                 // vient de passer à Coco citron vert
    f_duoQte2: makeInput('60'),                                           // ← valeur AVANT correction (le bug de Ben)
    f_duoQte3: makeInput('0'),
    f_duoTotal: makeInput(''),
    f_duoSlider: makeInput('50'),
    f_duoPctLbl: { textContent:'' },
  };
  const doc = makeFakeDocument(registry);
  const M = buildModule(doc);
  M.prodDuoSyncQte(2);
  check('A. Macarons P2 suit désormais le rendement du parfum choisi (100, pas 60)', +registry.f_duoQte2.value === 100);
  check('A. Macarons P1 non affecté (reste 60, celui de Citron crémeux)', +registry.f_duoQte1.value === 60);
  check('A. le total (coques) est recalculé avec la nouvelle quantité : (60+100)×2 = 320',
    +registry.f_duoTotal.value === 320);
}

// ---- B. Même correction pour le Parfum 1 (symétrie : le bug ne doit pas être à moitié corrigé) ----
{
  const registry = {
    f_duoRec1: makeSelect([{rend:'60'}, {rend:'100'}], 1),   // vient de passer à 100/batch
    f_duoQte1: makeInput('60'),
    f_duoRec2: makeSelect([{rend:'60'}], 0),
    f_duoQte2: makeInput('60'),
    f_duoQte3: makeInput('0'),
    f_duoTotal: makeInput(''),
    f_duoSlider: makeInput('50'),
    f_duoPctLbl: { textContent:'' },
  };
  const doc = makeFakeDocument(registry);
  const M = buildModule(doc);
  M.prodDuoSyncQte(1);
  check('B. Macarons P1 suit aussi le rendement de SON parfum (symétrie avec P2)', +registry.f_duoQte1.value === 100);
}

// ---- C. Parfum 3 (facultatif) : choisir un vrai parfum synchronise sa quantité, comme P1/P2 ----
{
  const registry = {
    f_duoRec1: makeSelect([{rend:'60'}], 0), f_duoQte1: makeInput('60'),
    f_duoRec2: makeSelect([{rend:'60'}], 0), f_duoQte2: makeInput('60'),
    f_duoRec3: makeSelect([{rend:undefined}, {rend:'40'}], 1),   // option 0 = "— aucun —" (pas de data-rend)
    f_duoQte3: makeInput('0'),
    f_duoTotal: makeInput(''), f_duoSlider: makeInput('50'), f_duoPctLbl: { textContent:'' },
  };
  const doc = makeFakeDocument(registry);
  const M = buildModule(doc);
  M.prodDuoSyncQte(3);
  check('C. Macarons P3 suit le rendement du parfum facultatif choisi (40)', +registry.f_duoQte3.value === 40);
}

// ---- D. Revenir à "— aucun —" en Parfum 3 remet sa quantité à 0 (pas de valeur fantôme sous un
// sélecteur qui dit "aucun") ----
{
  const registry = {
    f_duoRec1: makeSelect([{rend:'60'}], 0), f_duoQte1: makeInput('60'),
    f_duoRec2: makeSelect([{rend:'60'}], 0), f_duoQte2: makeInput('60'),
    f_duoRec3: makeSelect([{rend:undefined}, {rend:'40'}], 0),   // revient sur "— aucun —"
    f_duoQte3: makeInput('40'),                                  // valeur laissée par un choix précédent
    f_duoTotal: makeInput(''), f_duoSlider: makeInput('50'), f_duoPctLbl: { textContent:'' },
  };
  const doc = makeFakeDocument(registry);
  const M = buildModule(doc);
  M.prodDuoSyncQte(3);
  check('D. revenir à "— aucun —" remet Macarons P3 à 0 (pas de valeur fantôme)', +registry.f_duoQte3.value === 0);
}

// ---- E. Câblage réel : les 3 sélecteurs du formulaire appellent bien prodDuoSyncQte (preuve que
// le fix est branché, pas seulement écrit) ----
{
  const srcForm = extractFunction('prodForm');
  check('E. Parfum 1 appelle prodDuoSyncQte(1)', /id="f_duoRec1"[^>]*onchange="[^"]*prodDuoSyncQte\(1\)/.test(srcForm));
  check('E. Parfum 2 appelle prodDuoSyncQte(2)', /id="f_duoRec2"[^>]*onchange="[^"]*prodDuoSyncQte\(2\)/.test(srcForm));
  check('E. Parfum 3 appelle prodDuoSyncQte(3)', /id="f_duoRec3"[^>]*onchange="[^"]*prodDuoSyncQte\(3\)/.test(srcForm));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
