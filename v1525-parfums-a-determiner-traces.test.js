'use strict';
// v1525 — « les parfums d'une commande enregistrée comme parfums à définir doivent être comptabilisés dès que la
// traçabilité des macarons est établie ». Avant : les macarons « à déterminer » (sansParfum) n'apparaissaient dans AUCUN
// classement par parfum, et leur valeur gonflait les autres parfums de la commande. Maintenant : les lots liés à la
// commande (orderItems) donnent les parfums réels. Tout tourne sur le VRAI code d'app.js.
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100, round3 = x => Math.round((+x + Number.EPSILON) * 1000) / 1000;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function brut(marker){ const i = APP.indexOf(marker); if(i < 0) return ''; return APP.slice(i, APP.indexOf('\n}\n', i) + 3); }

const srcTrace = brut('function parfumsTracesDeCommande(');
const srcBuild = brut('function buildFlavorSales(');
const env = () => new Function('round3', 'money2', 'aiNormalize', 'getSettings', 'computeAvgSellPrice', 'orderToLines', 'lineTotalStored', 'estVenteAgregable', 'marketNetCA', 'swallow', 'db',
  'let _TRACE_LIENS = [];\n' + srcTrace + '\n' + srcBuild + '\nreturn { parfumsTracesDeCommande, buildFlavorSales, setLiens:l=>{ _TRACE_LIENS = l; } };')
  (round3, money2, norm, () => ({}), () => ({ prix: 2 }), o => o.lignes, ln => +ln.prixVrac || +ln.prix || 0, () => true, () => 0, () => {}, {});
const E = env();

const recettes = [{ id: 1, produitNom: 'Vanille' }, { id: 2, produitNom: 'Café' }, { id: 3, produitNom: 'Pistache' }];
const prods = [{ id: 10, recipeId: 1 }, { id: 11, recipeId: 2 }, { id: 12, recipeId: 3 }];
const prodById = Object.fromEntries(prods.map(p => [p.id, p]));
const match = nom => recettes.find(r => norm(r.produitNom) === norm(nom)) || null;
const ligne = (extra = {}) => ({ type: 'vrac', parfums: [], sansParfum: 0, ...extra });

// ---------- A. LA RÈGLE (fonction pure) ----------
{
  const L = ligne({ sansParfum: 9, parfums: [{ nom: 'Vanille', qte: 6 }] });
  let m = E.parfumsTracesDeCommande([L], [{ productionId: 10, qte: 10 }, { productionId: 11, qte: 5 }], prodById, recettes, match);
  check('A. 10 vanille + 5 café liés, 6 vanille explicites : 4 vanille + 5 café servent les 9 « à déterminer »', JSON.stringify(m.get(L)) === JSON.stringify([{ nom: 'Vanille', qte: 4 }, { nom: 'Café', qte: 5 }]));
  m = E.parfumsTracesDeCommande([L], [], prodById, recettes, match);
  check('A. aucun lien (traçabilité pas établie) : rien n\'est inventé', m.size === 0);
  m = E.parfumsTracesDeCommande([L], [{ productionId: 10, qte: 6 }], prodById, recettes, match);
  check('A. les liens ne couvrent que les parfums explicites : rien à tracer', m.size === 0);
  m = E.parfumsTracesDeCommande([L], [{ productionId: 11, qte: 3 }], prodById, recettes, match);
  check('A. traçabilité partielle (3 café sur 9) : seuls 3 sont comptés, le reste demeure à définir', m.get(L).length === 1 && m.get(L)[0].qte === 3);
  m = E.parfumsTracesDeCommande([L], [{ productionId: 12, qte: 40 }], prodById, recettes, match);
  check('A. sur-liaison (40 pistache) : plafonnée à ce qui était à déterminer (9)', m.get(L)[0].qte === 9);
  const L2 = ligne({ sansParfum: 4 }), L3 = ligne({ sansParfum: 4 });
  m = E.parfumsTracesDeCommande([L2, L3], [{ productionId: 10, qte: 5 }, { productionId: 11, qte: 3 }], prodById, recettes, match);
  check('A. deux lignes à déterminer : le pool est partagé sans double compte (4+1 vanille / 3 café = 8)', (m.get(L2) || []).reduce((s, p) => s + p.qte, 0) + (m.get(L3) || []).reduce((s, p) => s + p.qte, 0) === 8);
  check('A. lien vers un lot inconnu ou sans recette : ignoré sans exception', E.parfumsTracesDeCommande([L], [{ productionId: 999, qte: 5 }, { productionId: 10 }], prodById, recettes, match).size === 0);
  const Lgf = { type: 'grand', items: [{ nom: 'Vanille', qte: 2 }], sansParfum: 0 };
  check('A. une commande sans macaron à déterminer ne produit rien', E.parfumsTracesDeCommande([Lgf], [{ productionId: 10, qte: 2 }], prodById, recettes, match).size === 0);
}

// ---------- B. LES CLASSEMENTS PAR PARFUM (buildFlavorSales réel) ----------
{
  const o = { id: 7, paiement: 'Payé', montant: 30, lignes: [ligne({ nbMacarons: 15, prixVrac: 30, parfums: [{ nom: 'Vanille', qte: 6 }], sansParfum: 9, spMode: 'adeterminer' })] };
  const lire = rows => Object.fromEntries(rows.map(r => [r.nom, r]));
  let av = lire(E.buildFlavorSales([o], [], [], recettes, prods, {}, []));
  check('B. AVANT traçabilité : seule la vanille explicite compte… et elle absorbe TOUT le CA (30 €)', av.Vanille.piecesVendues === 6 && av.Vanille.caVentes === 30 && !av.Café);
  const liens = [{ orderId: 7, productionId: 10, qte: 10 }, { orderId: 7, productionId: 11, qte: 5 }];
  let ap = lire(E.buildFlavorSales([o], [], [], recettes, prods, {}, liens));
  check('B. APRÈS traçabilité : vanille 10 pièces, café 5 pièces (les 9 « à déterminer » sont comptés)', ap.Vanille.piecesVendues === 10 && ap['Café'].piecesVendues === 5);
  check('B. le CA se répartit au prorata des pièces (20 € / 10 €), total inchangé = 30 €', ap.Vanille.caVentes === 20 && ap['Café'].caVentes === 10 && money2(ap.Vanille.caVentes + ap['Café'].caVentes) === 30);
  check('B. total de pièces conservé (15 = 6 + 9)', ap.Vanille.piecesVendues + ap['Café'].piecesVendues === 15);
  // lien d'une autre commande : sans effet
  ap = lire(E.buildFlavorSales([o], [], [], recettes, prods, {}, [{ orderId: 99, productionId: 11, qte: 5 }]));
  check('B. lien d\'une AUTRE commande : sans effet', !ap.Café && ap.Vanille.piecesVendues === 6);
  // cache mémoire (utilisé par l'app) quand aucun lien n'est passé
  E.setLiens(liens);
  ap = lire(E.buildFlavorSales([o], [], [], recettes, prods, {}));
  check('B. sans argument, l\'app utilise la copie mémoire des liens (_TRACE_LIENS)', ap['Café'] && ap['Café'].piecesVendues === 5);
  E.setLiens([]);
  // commande 100 % à déterminer, liée entièrement
  const o2 = { id: 8, paiement: 'Payé', montant: 20, lignes: [ligne({ prixVrac: 20, sansParfum: 10 })] };
  check('B. commande 100 % « à déterminer » non tracée : aucune ligne parfum', E.buildFlavorSales([o2], [], [], recettes, prods, {}, []).length === 0);
  const t = lire(E.buildFlavorSales([o2], [], [], recettes, prods, {}, [{ orderId: 8, productionId: 12, qte: 10 }]));
  check('B. … puis tracée (10 pistache) : 10 pièces et 20 € au bon parfum', t.Pistache.piecesVendues === 10 && t.Pistache.caVentes === 20);
  // dons
  const od = { id: 9, paiement: 'Non payé', montant: 0, lignes: [{ type: 'don', parfums: [], sansParfum: 4 }] };
  const d = lire(E.buildFlavorSales([od], [], [], recettes, prods, {}, [{ orderId: 9, productionId: 11, qte: 4 }]));
  check('B. un don « à déterminer » tracé compte en pièces offertes sur le bon parfum', d['Café'] && d['Café'].piecesDon === 4 && d['Café'].caVentes === 0);
}

// ---------- C. CÂBLAGE ----------
check('C. la copie mémoire des liens est rafraîchie à chaque affichage (render)', /function render\(\)\{\n  try\{ majLiensTrace\(\); \}catch\(_\)\{\}/.test(APP));
check('C. … et juste après la liaison commande↔lot (« Commande prête » et affectation manuelle)', (APP.match(/await majLiensTrace\(\);/g) || []).length >= 2);
check('C. analyzeFlavorProfitability transmet les liens éventuels de l\'appelant', /buildFlavorSales\(ordersMarge, markets, marketMoves, recipes, productions, s, data\.orderItems\)/.test(APP));
check('C. APP_VERSION v1525', /const APP_VERSION = 'v15\d\d'/.test(APP));
check('C. cache du service worker v555', /sm-iphone-v5\d\d/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'service-worker.js'), 'utf8')));

console.log(`v1525 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
