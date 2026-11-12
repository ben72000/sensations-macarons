'use strict';
// v1530 — « une ligne distincte de livraison sur chaque devis / facture, avec le montant, une réduction (€ ou %) dédiée, et « offert » si gratuit ».
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
const money2 = x => { const v = +x; return isFinite(v) ? Math.round(v * 100) / 100 : 0; };
const euro = x => money2(x).toFixed(2).replace('.', ',') + ' €';
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function fn(m){ const i = APP.indexOf(m); if(i < 0) throw new Error('introuvable ' + m); const j = APP.indexOf('\n}\n', i); return APP.slice(i, j + 3); }
function lineRemiseEuro(ln){ const base = money2(+ln.montantHT || 0); if(ln.remiseType === 'euro') return Math.min(base, money2(+ln.remiseEuro || 0)); return money2(base * Math.max(0, Math.min(100, +ln.remisePct || 0)) / 100); }
const factGrouperCoffrets = l => l.map(ln => ({ kind: 'ligne', ln }));
const factLineRows = (ln) => `<tr class="std"><td>${esc(ln.libelle || ln.type)}</td></tr>`;
const factGroupeCoffretRows = () => '';
const src = fn('function livraisonInfo(') + fn('function estLigneLivraison(') + fn('function factLivraisonRows(') + fn('function factRowsHtml(');
const mk = new Function('money2', 'lineRemiseEuro', 'esc', 'euro', 'factGrouperCoffrets', 'factLineRows', 'factGroupeCoffretRows', src + '\nreturn {livraisonInfo, estLigneLivraison, factLivraisonRows, factRowsHtml};');
const { livraisonInfo, estLigneLivraison, factLivraisonRows, factRowsHtml } = mk(money2, lineRemiseEuro, esc, euro, factGrouperCoffrets, factLineRows, factGroupeCoffretRows);
const liv = (o) => Object.assign({ type: 'prestation', isLivraison: true, libelle: 'Livraison', montantHT: 12, remiseType: 'pct', remisePct: 0, remiseEuro: 0 }, o);

// A. calcul
{
  let L = livraisonInfo(liv({}));
  check('A. sans réduction : net = montant, pas offert', L.base === 12 && L.net === 12 && L.remise === 0 && !L.offert);
  L = livraisonInfo(liv({ remisePct: 25 }));
  check('A. 25 % de 12 € : réduction 3 €, net 9 €', L.remise === 3 && L.net === 9 && !L.offert && L.pct === 25);
  L = livraisonInfo(liv({ remiseType: 'euro', remiseEuro: 5 }));
  check('A. −5 € fixe : net 7 €, % équivalent 41,7', L.net === 7 && L.remise === 5 && L.pct === 41.7);
  L = livraisonInfo(liv({ remisePct: 100 }));
  check('A. 100 % : gratuité → offert', L.net === 0 && L.offert === true);
  L = livraisonInfo(liv({ remiseType: 'euro', remiseEuro: 12 }));
  check('A. réduction fixe égale au montant : offert', L.net === 0 && L.offert === true);
  L = livraisonInfo(liv({ remiseType: 'euro', remiseEuro: 50 }));
  check('A. réduction supérieure au montant : plafonnée, jamais négatif, offert', L.net === 0 && L.remise === 12 && L.offert);
  L = livraisonInfo(liv({ remisePct: 250 }));
  check('A. % > 100 plafonné à 100', L.net === 0 && L.pct === 100);
  L = livraisonInfo(liv({ montantHT: 0 }));
  check('A. montant 0 : pas « offert » (rien à offrir)', L.offert === false && L.net === 0);
  check('A. détection de la ligne livraison', estLigneLivraison(liv({})) && !estLigneLivraison({ type: 'prestation' }) && !estLigneLivraison(null));
}
// B. rendu
{
  const h = factLivraisonRows(liv({ remisePct: 100 }), false);
  check('B. offerte : mention « Offert » + montant barré', /Offert/.test(h) && /<s [^>]*>12,00 €<\/s>/.test(h) && /livraison offerte/.test(h));
  check('B. offerte : aucun montant facturé affiché hors barré', !/>12,00 €<\/td>/.test(h));
  const p = factLivraisonRows(liv({ remisePct: 25 }), false);
  check('B. devis (net) réduction %: ligne à 12 € puis sous-ligne « réduction livraison −25 % » = −3 €', /12,00 €/.test(p) && /réduction livraison −25 %/.test(p) && /−3,00 €/.test(p));
  check('B. la somme affichée (12 − 3) retombe sur le net 9 €', money2(12 - 3) === livraisonInfo(liv({ remisePct: 25 })).net);
  const e = factLivraisonRows(liv({ remiseType: 'euro', remiseEuro: 4 }), false);
  check('B. réduction en € : libellé sans %', /réduction livraison</.test(e) && !/%/.test(e) && /−4,00 €/.test(e));
  const b = factLivraisonRows(liv({ remisePct: 25 }), true);
  check('B. facture (brut) : montant avant réduction, pas de sous-ligne (déjà agrégée aux réductions)', /12,00 €/.test(b) && !/réduction livraison/.test(b));
  const n = factLivraisonRows(liv({}), false);
  check('B. sans réduction : une seule ligne, 12,00 €', (n.match(/<tr/g) || []).length === 1 && /12,00 €/.test(n));
  check('B. ligne vide (0 €) : rien', factLivraisonRows(liv({ montantHT: 0 }), false) === '');
  check('B. libellé personnalisé échappé', /Livraison &lt;b>/.test(factLivraisonRows(liv({ libelle: 'Livraison <b>' }), false)));
}
// C. ordre dans le document
{
  const lignes = [liv({}), { type: 'coffret', libelle: 'Coffret A' }, { type: 'prestation', libelle: 'Coaching' }];
  const h = factRowsHtml(lignes, false);
  check('C. la livraison est rendue À PART, en dernier', h.indexOf('Coffret A') < h.indexOf('Coaching') && h.indexOf('Coaching') < h.indexOf('livraison-ligne'));
  check('C. une seule ligne livraison, jamais doublée par le rendu générique', (h.match(/Livraison/g) || []).length === 1);
  check('C. sans livraison : rendu inchangé', !/livraison-ligne/.test(factRowsHtml([{ type: 'coffret', libelle: 'X' }], false)));
}
// D. branchements dans app.js
check('D. factRowsHtml sépare la livraison (source)', /const livs = toutes\.filter\(estLigneLivraison\)/.test(APP));
check('D. éditeur dédié branché sur les lignes isLivraison', /function drawPrestationLine\(ln,i\)\{\s*if\(ln\.isLivraison\) return drawLivraisonLine\(ln,i\);/.test(APP));
check('D. bouton « + Livraison » ajoute une ligne livraison unique', /addLine\('livraison'\)/.test(APP) && /Une ligne livraison existe déjà/.test(APP));
check('D. bouton « Offrir la livraison » = réduction 100 %', /function cmdOffrirLivraison\(i\)\{[^]*?ln\.remisePct=100/.test(APP));
check('D. le champ isLivraison survit à l\'enregistrement (2 normalisations)', (APP.match(/\.\.\.\(ln\.isLivraison\?\{isLivraison:true\}:\{\}\)/g) || []).length >= 2);
check('D. APP_VERSION v1530', /const APP_VERSION = 'v15\d\d'/.test(APP));
console.log(`v1530 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
