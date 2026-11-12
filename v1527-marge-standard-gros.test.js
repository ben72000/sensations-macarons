'use strict';
// v1527 — accueil : marge nette / macaron standard ET / gros macaron, côte à côte, chiffre sous le libellé.
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
const money2 = x => { const v = +x; return isFinite(v) ? Math.round(v * 100) / 100 : 0; };
const round3 = x => { const v = +x; return isFinite(v) ? Math.round(v * 1000) / 1000 : 0; };
function fn(m){ const i = APP.indexOf(m); const j = APP.indexOf('\n}\n', i); return APP.slice(i, j + 3); }
const f = new Function('money2', 'round3', fn('function margeNetteParTaille(') + '\nreturn margeNetteParTaille;')(money2, round3);
const row = (o) => Object.assign({ margeBrute: 1, margeNette: 0, piecesVendues: 0, piecesDon: 0, coutUnitRetenu: 0, grandFormat: false }, o);
{
  const rows = [row({ margeNette: 60, piecesVendues: 40 }), row({ margeNette: 40, piecesVendues: 20 }), row({ grandFormat: true, margeNette: 30, piecesVendues: 5 })];
  const r = f(rows, { coutDons: 0 });
  check('standard : (60+40)/60 = 1,67 €', r.standard.margeParPiece === 1.67 && r.standard.pieces === 60);
  check('gros macaron : 30/5 = 6 €', r.grand.margeParPiece === 6 && r.grand.pieces === 5);
}
{
  const rows = [row({ margeNette: 100, piecesVendues: 50, piecesDon: 5, coutUnitRetenu: 1 }), row({ grandFormat: true, margeNette: 40, piecesVendues: 10 })];
  const r = f(rows, { coutDons: 5 });
  check('dons rattachés à un parfum standard : déduits de la taille standard seulement (95/50 = 1,90)', r.standard.margeParPiece === 1.9 && r.grand.margeParPiece === 4);
  const g = f(rows, { coutDons: 11 });   // 6 € de dons non rattachés : répartis au prorata des pièces (50/10)
  const pond = (g.standard.margeParPiece * 50 + g.grand.margeParPiece * 10) / 60;
  check('dons non rattachés répartis au prorata : la moyenne pondérée retombe sur le chiffre global ((140-11)/60)', Math.abs(pond - (140 - 11) / 60) < 0.02);
}
{
  const r = f([row({ margeNette: 10, piecesVendues: 5 })], { coutDons: 0 });
  check('aucun gros macaron vendu : « — » (null), jamais 0', r.grand.margeParPiece === null && r.grand.pieces === 0);
  const r2 = f([row({ margeBrute: null, margeNette: null, piecesVendues: 9 }), row({ grandFormat: true, margeNette: 8, piecesVendues: 2 })], { coutDons: 0 });
  check('parfum au coût inconnu : exclu (ne dilue pas la marge)', r2.standard.margeParPiece === null && r2.grand.margeParPiece === 4);
}
const carte = APP.slice(APP.indexOf('Marge nette / gros macaron') - 900, APP.indexOf('Marge nette / gros macaron') + 500);
check('accueil : libellé « Marge nette / gros macaron » à droite du libellé standard, même ligne (flex)', /display:flex[^>]*>\s*<div[^>]*>\s*<div class="lbl">Marge nette \/ macaron[\s\S]*Marge nette \/ gros macaron/.test(carte));
check('accueil : le chiffre est sous chaque libellé (class val dans la même colonne)', (carte.match(/<div class="lbl">[^<]*(?:<[^>]*>[^<]*)*?<\/div><div class="val">/g) || []).length >= 2);
check('accueil : mode discret respecté pour les deux chiffres', (carte.match(/privacyModeEnabled\(\)\?'•••'/g) || []).length >= 2);
check('analyse : totals.parTaille branché', /totals\.parTaille = margeNetteParTaille\(rows, totals\)/.test(APP));
check('APP_VERSION v1527', /const APP_VERSION = 'v15\d\d'/.test(APP));
check('cache SW v557', /sm-iphone-v5\d\d/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'service-worker.js'), 'utf8')));
console.log(`v1527 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
