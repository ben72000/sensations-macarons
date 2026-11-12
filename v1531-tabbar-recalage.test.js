'use strict';
// v1531 — la barre d'onglets ne doit plus flotter au milieu de l'écran (viewport iOS désynchronisé).
const fs = require('fs'), path = require('path');
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
const i = APP.indexOf('function tabbarEcartBas('); const j = APP.indexOf('\n}\n', i);
const e = new Function(APP.slice(i, j + 3) + '\nreturn tabbarEcartBas;')();
check('cas normal (innerHeight = viewport visible) : aucun écart', e(800, 800, 0, 1) === 0);
check('écart de 1-2 px toléré (arrondis)', e(800, 799, 0, 1) === 0 && e(800, 798, 0, 1) === 0);
check('layout plus court que le visible (capture de Ben) : écart négatif = on descend la barre', e(500, 800, 0, 1) === -300);
check('layout plus haut que le visible : écart positif = on remonte la barre', e(800, 500, 0, 1) === 300);
check('décalage de défilement du viewport visuel pris en compte', e(800, 700, 100, 1) === 0 && e(800, 700, 50, 1) === 50);
check('zoom au pincement : on ne touche à rien', e(500, 800, 0, 2) === 0);
check('valeurs absentes/invalides : 0', e(0, 800, 0, 1) === 0 && e(800, NaN, 0, 1) === 0);
check('recalage branché aux évènements visualViewport/focus/pageshow/visibilité', /visualViewport\.addEventListener\('resize', tabbarRecaler\)/.test(APP) && /addEventListener\('pageshow', go\)/.test(APP) && /visibilitychange/.test(APP.slice(i, i + 3000)));
check('le correctif ne peut pas bloquer le boot (try/catch)', /function tabbarRecaler\(\)\{\s*try\{/.test(APP));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check('tabbar promue en couche GPU (translateZ)', /\.tabbar\{display:flex;position:fixed[^}]*translateZ\(0\)/.test(html));
check('APP_VERSION v1531', /const APP_VERSION = 'v1531'/.test(APP));
console.log(`v1531 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
