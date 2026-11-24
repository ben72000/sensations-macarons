'use strict';
// v1534 — « DEPUIS LA DERNIÈRE MISE À JOUR iOS JE N'ARRIVE PLUS À IMPRIMER LES FACTURES. LE BOUTON SEMBLE INACTIF. »
//
// CAUSE : le bouton « 🖨 Imprimer » de l'aperçu demandait à l'IFRAME d'aperçu de s'imprimer
// (frame.contentWindow.print()). Depuis la mise à jour, iOS ignore cet appel en silence dans l'app
// installée : pas d'exception → le repli window.print() du catch n'était jamais atteint → rien.
//
// CORRECTIF : à l'ouverture de l'aperçu, une copie du document est posée dans la page principale
// (#pvPrintHost, racine fantôme, invisible à l'écran). Le clic appelle window.print() sur la page
// principale, tout de suite, sans attente ; @media print n'y laisse sortir que la copie.
// Le bouton interne au document (barre « Imprimer / Enregistrer en PDF ») suit le même chemin.
//
// Vérifié aussi hors de cette suite, dans Chromium sans tête (app complète chargée) : facture de 14
// commandes → 2 pages A4, logo et polices présents, reste de l'app absent, aperçu écran inchangé.
const fs = require('fs'), path = require('path');
const { APP, extractFunction } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const fn = nom => { const i = APP.indexOf('function ' + nom + '('); const j = APP.indexOf('\n}\n', i); return i < 0 ? '' : APP.slice(i, j + 3); };

// ── A. Transformation des styles (fonction pure, sur le VRAI style des factures) ──
const cssPour = new Function(fn('_pvCssPourCopie') + '\nreturn _pvCssPourCopie;')();
const i0 = APP.indexOf('const FACT_STYLE = `') + 'const FACT_STYLE = `'.length;
const FACT_STYLE = APP.slice(i0, APP.indexOf('`;', i0));
const cssBrut = FACT_STYLE.replace(/<\/?style>/g, '');
const r = cssPour(cssBrut);
check('A. aucune police embarquée laissée dans la racine fantôme (iOS les y ignore)', !/@font-face/.test(r.shadowCss));
check('A. les 4 polices de la facture passent au niveau du document', (r.docCss.match(/@font-face/g) || []).length === (cssBrut.match(/@font-face/g) || []).length && (r.docCss.match(/@font-face/g) || []).length >= 4);
check('A. familles renommées pvh-… partout : jamais de remplacement des polices de l\'app', !/font-family\s*:\s*'(Outfit|Bellota)'/.test(r.docCss) && !/'(Outfit|Bellota)'/.test(r.shadowCss) && /'pvh-Outfit'/.test(r.shadowCss) && /'pvh-Bellota'/.test(r.shadowCss));
check('A. la police de chaque bloc @font-face correspond à son renommage', /font-family:'pvh-Bellota';font-weight:700/.test(r.docCss));
check('A. @page (A4, marges) sorti de la racine et placé sous @media print', !/@page/.test(r.shadowCss) && /@media print\{\s*@page \{ size: A4; margin: 0; \}\s*\}/.test(r.docCss));
check('A. sélecteurs body / html réécrits vers les enveloppes', /\.pvh-body \{ font-family:'pvh-Outfit'/.test(r.shadowCss) && /\.pvh-html,\.pvh-body \{ background:#e8e2da; \}/.test(r.shadowCss) && !/(^|[\s,{}>+~(])(html|body)(?=[\s,{.:#\[>+~)])/.test(r.shadowCss));
check('A. classes contenant « body » intactes (.cmd-body)', /\.cmd-body/.test(cssBrut) ? /\.cmd-body/.test(r.shadowCss) && !/\.cmd-\.pvh-body/.test(r.shadowCss) : true);
check('A. règles d\'impression de la facture conservées (.noprint, couleurs exactes)', /@media print \{ \.noprint\{display:none;\} \.pvh-body\{-webkit-print-color-adjust:exact/.test(r.shadowCss));
const vide = cssPour('');
check('A. document sans style : rien à ajouter, pas d\'erreur', vide.shadowCss === '' && vide.docCss === '');
const cgv = cssPour('body{font-family:-apple-system,Helvetica;margin:0} h1{color:red}');
check('A. document sans police embarquée (CGV) : styles réécrits, aucun @font-face inventé', /\.pvh-body\{font-family:-apple-system/.test(cgv.shadowCss) && cgv.docCss === '');

// ── B. Le clic imprime la PAGE PRINCIPALE, tout de suite ──
const pp = fn('printPrintView');
const iHost = pp.indexOf("getElementById('pvPrintHost')"), iWin = pp.indexOf('window.print(); return;'), iFrame = pp.indexOf('frame.contentWindow.focus(); frame.contentWindow.print();');
check('B. printPrintView : window.print() sur la page principale quand la copie existe', iHost > 0 && iWin > iHost);
check('B. … AVANT l\'ancien appel à l\'iframe (gardé seulement en repli)', iFrame > iWin);
check('B. aucune attente avant l\'impression (le geste doit rester valable pour iOS)', !/await|setTimeout|\.then\(/.test(pp.slice(0, iWin)));
check('B. le titre (nom du PDF) est réappliqué avant l\'impression', pp.indexOf('document.title = _pvWantTitle') > 0 && pp.indexOf('document.title = _pvWantTitle') < iWin);

// ── C. Cycle de vie : copie préparée à l'ouverture, retirée à la fermeture ──
const op = fn('openPrintView');
check('C. openPrintView prépare la copie juste après l\'écriture de l\'aperçu', op.indexOf('_pvBuildPrintHost(htmlDoc)') > op.indexOf('doc.close()'));
check('C. un échec de préparation ne bloque pas l\'aperçu (try/catch + nettoyage)', /try\{ _pvBuildPrintHost\(htmlDoc\); \}catch\(e\)\{ _pvRemovePrintHost\(\);/.test(op));
check('C. bouton interne au document (window.print de l\'iframe) redirigé vers printPrintView', /frame\.contentWindow\.print = function\(\)\{ printPrintView\(\); \}/.test(op));
check('C. closePrintView retire la copie et ses polices', /_pvRemovePrintHost\(\);/.test(fn('closePrintView')) && /pvPrintHostCss/.test(fn('_pvRemovePrintHost')));
const bh = fn('_pvBuildPrintHost');
check('C. une seule copie à la fois (nettoyage avant reconstruction)', bh.indexOf('_pvRemovePrintHost();') > 0 && bh.indexOf('_pvRemovePrintHost();') < bh.indexOf("createElement('div')"));
check('C. scripts et barre .noprint jamais copiés', /querySelectorAll\('script, \.noprint, style, link, meta, title'\)\.forEach\(n => n\.remove\(\)\)/.test(bh));
check('C. racine fantôme (styles isolés dans les deux sens)', /attachShadow\(\{ mode:'open' \}\)/.test(bh));
check('C. navigateur sans racine fantôme : ancien chemin, aucune copie posée', bh.indexOf("typeof host.attachShadow!=='function'") > 0 && bh.indexOf("typeof host.attachShadow!=='function'") < bh.indexOf('document.body.appendChild(host)'));

// ── D. Règles d'impression de index.html ──
check('D. copie invisible à l\'écran', /#pvPrintHost\{display:none\}/.test(HTML));
check('D. à l\'impression : tout le reste de l\'app masqué, la copie seule visible', /body:has\(#pvPrintHost\)>\*:not\(#pvPrintHost\)\{display:none!important\}/.test(HTML) && /body>#pvPrintHost\{display:block!important;position:static!important\}/.test(HTML));
check('D. à l\'impression : plus de blocage overflow:hidden (une facture longue sort sur plusieurs pages)', /html:has\(#pvPrintHost\),body:has\(#pvPrintHost\)\{overflow:visible!important;height:auto!important/.test(HTML));
check('D. ancienne règle (aperçu iframe) conservée quand il n\'y a pas de copie', /body:not\(:has\(#pvPrintHost\)\)>\*:not\(#printView\)\{display:none!important\}/.test(HTML));

// ── E. Livraison ──
check('E. APP_VERSION >= v1534', (m => !!m && +m[1] >= 1534)(APP.match(/const APP_VERSION = 'v(\d+)';/)));
const SW = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
check('E. cache du service worker incrémenté (>= v564)', (m => !!m && +m[1] >= 564)(SW.match(/const CACHE = 'sm-iphone-v(\d+)'/)));

console.log(`v1534 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
