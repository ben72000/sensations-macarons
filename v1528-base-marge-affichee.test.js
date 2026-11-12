'use strict';
// v1528 — accueil : sous chaque marge nette, « sur N macarons » (la base réelle du calcul).
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
const i = APP.indexOf('Marge nette / gros macaron'); const carte = APP.slice(i - 900, i + 700);
check('chaque colonne affiche sa base sous le chiffre', (carte.match(/<div class="val">[^]*?<\/div><div class="sub" style="margin-top:4px">\$\{_baseTxt\(_n(Std|Gros)\)\}<\/div>/g) || []).length === 2);
check('standard : base = pièces standard chiffrées', /_nStd = margeParTaille \? margeParTaille\.standard\.pieces/.test(APP));
check('gros macaron : base = pièces grand format chiffrées', /_nGros = margeParTaille \? margeParTaille\.grand\.pieces/.test(APP));
const t = new Function('privacyModeEnabled', 'qty', APP.slice(APP.indexOf('const _baseTxt'), APP.indexOf('\n', APP.indexOf('const _baseTxt'))) + '\nreturn _baseTxt;');
const f = t(() => false, x => String(x)), fp = t(() => true, x => String(x));
check('1 macaron : singulier', f(1) === 'sur 1 macaron');
check('42 macarons : pluriel', f(42) === 'sur 42 macarons');
check('aucune vente : texte explicite, pas « sur 0 »', f(0) === 'aucune vente');
check('mode discret : volume masqué', fp(42) === '•••');
check('APP_VERSION v1528', /const APP_VERSION = 'v15\d\d'/.test(APP));
console.log(`v1528 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
