#!/usr/bin/env node
/* ============================================================
   OUTIL — « j'ai touché X, qu'est-ce que je reteste ? »  (v1374)
   ------------------------------------------------------------
   Usage :
     node tests/quoi-retester.js charges kv:sm_settings
     node tests/quoi-retester.js orders --run
     node tests/quoi-retester.js toutes

   Lit la carte des chiffres (FIGURES) DANS app.js — jamais une
   copie — et en déduit : les chiffres périmés par ces sources,
   puis l'union des suites qui les protègent. Avec --run, lance
   ces suites et rend un verdict.

   C'est la moitié « compilo » de l'axe 3 du chantier fiabilité :
   quand une source change, l'outil dit quoi retester — au lieu de
   relire 60 000 lignes ou de relancer 79 suites pour une retouche
   de charges.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { APP, stripComments, extractFunction } = require('./_extract');

function extraitFigures(){
  const i = APP.indexOf('const FIGURES = {');
  if(i === -1) throw new Error('FIGURES introuvable dans app.js');
  const clean = stripComments(APP.slice(i, i + 30000));
  const j = clean.indexOf('\n};');
  return eval('(() => { ' + clean.slice(0, j + 3) + ' return FIGURES; })()');
}
const FIGURES = extraitFigures();
const _figAval = eval('(' + extractFunction('_figAval').replace(/^function _figAval/, 'function') + ')');
const _figSuitesPour = (() => {
  const src = extractFunction('_figSuitesPour');
  return new Function('_figAval', 'return ' + src.replace(/^function _figSuitesPour/, 'function'))(_figAval);
})();

const args = process.argv.slice(2).filter(a => a !== '--run');
const lancer = process.argv.includes('--run');
if(!args.length){
  console.log('Usage : node tests/quoi-retester.js <table|kv:cle|figure|toutes> [...] [--run]');
  console.log('Sources connues de la carte :');
  const srcs = new Set();
  Object.values(FIGURES).forEach(f => (f.tables || []).forEach(t => srcs.add(t)));
  console.log('  ' + [...srcs].sort().join(', '));
  console.log('Figures : ' + Object.keys(FIGURES).sort().join(', '));
  process.exit(0);
}

const sources = args.includes('toutes')
  ? [...new Set(Object.values(FIGURES).flatMap(f => f.tables || []))]
  : args;

// Une source inconnue de la carte n'est pas une erreur silencieuse : on le DIT.
const connues = new Set(Object.keys(FIGURES));
Object.values(FIGURES).forEach(f => (f.tables || []).forEach(t => connues.add(t)));
const inconnues = sources.filter(s => !connues.has(s));
if(inconnues.length){
  console.log(`⚠ Source(s) inconnue(s) de la carte : ${inconnues.join(', ')}`);
  console.log('  Soit la source ne nourrit aucun chiffre (possible), soit la carte a un trou (à vérifier).');
}

const r = _figSuitesPour(FIGURES, sources);
console.log(`\nSources modifiées : ${sources.join(', ')}`);
if(!r.figures.length){
  console.log('Aucun chiffre de la carte ne dépend de ces sources.');
  process.exit(0);
}
console.log(`\nChiffres périmés (${r.figures.length}) :`);
r.figures.forEach(f => console.log(`  • ${FIGURES[f] ? FIGURES[f].libelle : f}`));
console.log(`\nSuites à relancer (${r.suites.length}) :`);
r.suites.forEach(s => console.log(`  ${s}`));
const sansSuite = r.figures.filter(f => FIGURES[f] && !(FIGURES[f].suites || []).length);
if(sansSuite.length){
  console.log(`\n⚠ Sans suite dédiée (angle mort déclaré) : ${sansSuite.join(', ')} — à vérifier à la main.`);
}

if(lancer){
  console.log('\n──── exécution ────');
  let ko = 0;
  for(const s of r.suites){
    const p = path.join(__dirname, s);
    if(!fs.existsSync(p)){ console.log(`✗ ${s} : fichier ABSENT`); ko++; continue; }
    try{ execFileSync('node', [p], { encoding:'utf8' }); console.log(`✓ ${s}`); }
    catch(e){ console.log(`✗ ${s}`); ko++; }
  }
  console.log(ko ? `\n✗ ${ko} suite(s) en échec.` : '\n✓ Tout le périmètre touché est vert.');
  process.exit(ko ? 1 : 0);
}
