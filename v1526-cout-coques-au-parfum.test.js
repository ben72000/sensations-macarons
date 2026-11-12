'use strict';
// v1526 — « enlève le parfum associé à la couleur » + « le coût des coques associé à un parfum doit se rattacher à celui-ci au moment
// d'associer les coques à la ganache ». Tout tourne sur le VRAI code d'app.js.
//   A. l'écran « Coques — 2 couleurs et + » ne propose plus de parfum/recette ; la recette de référence est résolue en silence
//   B. coût d'un lot de coques (matières × prix) et coût des coques d'un assemblage (pur)
//   C. prodAssembleSave réel : le coût des coques est figé sur le lot assemblé, rattaché au parfum de la GANACHE
//   D. coût mesuré par parfum : bug `qte`/`qteConsommee` corrigé, ganache + coques assemblées, rien d'inventé quand les coques ne sont pas chiffrées
//   E. les lots de coques ne gonflent plus le stock d'un parfum
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(l, c){ if(c){ pass++; } else { fail++; failures.push(l); } }
function fn(marker){ const i = APP.indexOf(marker); if(i < 0) return ''; const j = APP.indexOf('\n}\n', i); return APP.slice(i, j < 0 ? i + 4000 : j + 3); }
const ligne = marker => { const i = APP.indexOf(marker); if(i < 0) return ''; return APP.slice(i, APP.indexOf('\n', i)); };
const money2 = x => { const v = +x; return isFinite(v) ? Math.round(v * 100) / 100 : 0; };
const round3 = x => { const v = +x; return isFinite(v) ? Math.round(v * 1000) / 1000 : 0; };
const subQty = (a, b) => round3(((+a) || 0) - ((+b) || 0));
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ---------- A. L'ÉCRAN ----------
{
  const render = fn('function prodCouleursRender(){');
  check('A. le rendu des lignes ne propose plus aucune recette/parfum', render.length > 300 && !/prodCouleursRecetteOptions\(/.test(render) && !/Recette — matières/.test(render) && !/'rid'/.test(render));
  check('A. le lancement n\'exige plus de recette choisie par Ben', !/Choisis la recette/.test(fn('async function prodLancerCouleurs(rows, dateD){')));
  check('A. une ligne = couleur + taille + nombre de macarons (plus de rid choisi)', /prodCouleursSet\(\$\{i\},'gf'/.test(render));
  const mk = recs => new Function('recs', 'recCoqueColors', fn('function prodCouleursCandidats(') + fn('function prodCouleursRecetteDefaut(') + fn('function prodCouleursRecetteAuto(') + fn('function prodCouleursGrandFormatDispo(') + 'function _prodCouleursRecettes(){ return recs; }\nreturn { prodCouleursCandidats, prodCouleursRecetteAuto, prodCouleursGrandFormatDispo };')(recs, r => r.coqueColors || []);
  const R = [{ id: 1, produitNom: 'Vanille', coqueColors: ['blanc'] }, { id: 2, produitNom: 'Framboise', coqueColors: ['rouge'] }, { id: 3, produitNom: 'Fraise GF', grandFormat: true, coqueColors: ['rouge'] }];
  const e = mk(R);
  check('A. couleur rouge, standard : la recette qui porte le rouge, pas la 1re de la liste', e.prodCouleursRecetteAuto('rouge', false) === 2);
  check('A. couleur rouge, grand format : la recette grand format (jamais de mélange de tailles)', e.prodCouleursRecetteAuto('rouge', true) === 3);
  check('A. couleur sans recette porteuse : repli sur une recette de la même taille', e.prodCouleursRecetteAuto('vert', false) === 1);
  check('A. « Autre couleur » : aucune recette ne la porte, repli de même taille', e.prodCouleursRecetteAuto('__nouvelle__', false) === 1);
  check('A. le choix de taille n\'apparaît que s\'il existe une recette grand format', e.prodCouleursGrandFormatDispo() === true && mk([R[0], R[1]]).prodCouleursGrandFormatDispo() === false);
}

// ---------- B. COÛT DES COQUES (pur) ----------
const srcCout = [ligne('const _qConso ='), ligne('const _arr4 ='), fn('function lotPU(l){'), fn('function coutCoqueUnitaireDeLot('), fn('function coutCoquesAssemblage(')].join('\n');
const C = new Function('money2', srcCout + '\nreturn { coutCoqueUnitaireDeLot, coutCoquesAssemblage };')(money2);
const LOTS = { 1: { id: 1, prixUnitaire: 10 }, 2: { id: 2, prixUnitaire: 20 }, 3: { id: 3 }, 4: { id: 4, prixUnitaire: 50, inventaire: true } };   // 1: 10 €/kg, 2: 20 €/kg, 3 sans prix, 4 correction d'inventaire
const CONSO = [{ productionId: 100, materialLotId: 1, qteConsommee: 0.5 }, { productionId: 100, materialLotId: 2, qteConsommee: 0.25 }, { productionId: 101, materialLotId: 1, qteConsommee: 1 }, { productionId: 102, materialLotId: 3, qteConsommee: 5 }, { productionId: 103, materialLotId: 1, qteConsommee: 2, annuleeInventaire: true }];
const P = { 100: { id: 100, composant: 'coques', qteReelle: 120 }, 101: { id: 101, composant: 'coques', qteReelle: 100 }, 102: { id: 102, composant: 'coques', qteReelle: 80 }, 103: { id: 103, composant: 'coques', qteReelle: 50 } };
{
  const u = C.coutCoqueUnitaireDeLot(P[100], CONSO, LOTS);
  check('B. coût d\'un lot de coques = matières puisées × prix du lot (0,5×10 + 0,25×20 = 10 €)', u.cout === 10 && u.complet);
  check('B. coût d\'UNE coque = coût / coques produites (10 € / 120)', near(u.pu, 10 / 120));
  check('B. lot sans prix connu : coût 0, non complet, rien d\'inventé', (x => x.pu === 0 && !x.complet)(C.coutCoqueUnitaireDeLot(P[102], CONSO, LOTS)));
  check('B. une consommation neutralisée à l\'inventaire ne compte pas', (x => x.pu === 0)(C.coutCoqueUnitaireDeLot(P[103], CONSO, LOTS)));
  check('B. lire `qteConsommee` (vraie colonne) ET, à défaut, `qte` (anciennes données/tests)', C.coutCoqueUnitaireDeLot(P[101], [{ productionId: 101, materialLotId: 1, qte: 1 }], LOTS).cout === 10);
  const af = [{ id: 100, composant: 'coques', qte: 60, lot: 'L1', couleur: 'Rouge' }, { id: 101, composant: 'coques', qte: 40, lot: 'L2', couleur: 'Bleu' }, { id: 7, composant: 'ganache', qte: 50 }];
  const r = C.coutCoquesAssemblage(af, P, CONSO, LOTS);
  check('B. assemblage : 60 coques à 10/120 + 40 coques à 10/100 = 5 + 4 = 9 €', r.total === 9 && r.complet && r.detail.length === 2);
  check('B. la ganache n\'entre pas dans le coût des coques', r.detail.every(d => d.id !== 7));
  check('B. le détail garde lot, couleur et coût unitaire par lot de coques', r.detail[0].lot === 'L1' && r.detail[0].couleur === 'Rouge' && near(r.detail[0].puCoque, 0.0833, 1e-4) && r.detail[0].cout === 5);
  const r2 = C.coutCoquesAssemblage([{ id: 100, composant: 'coques', qte: 60 }, { id: 102, composant: 'coques', qte: 40 }], P, CONSO, LOTS);
  check('B. un des lots de coques non chiffré → complet=false (pas de total partiel présenté comme complet)', r2.complet === false && r2.total === 5);
  check('B. lot d\'origine introuvable → non complet', C.coutCoquesAssemblage([{ id: 999, composant: 'coques', qte: 10 }], P, CONSO, LOTS).complet === false);
  check('B. aucune entrée « coques » → non complet, total 0', (x => x.total === 0 && !x.complet)(C.coutCoquesAssemblage([{ id: 7, composant: 'ganache', qte: 5 }], P, CONSO, LOTS)));
}

// ---------- C. prodAssembleSave RÉEL ----------
async function assembler(opts){
  opts = opts || {};
  const prods = {
    100: { id: 100, recipeId: 5, composant: 'coques', parCouleur: true, couleur: 'rouge', lotProduction: 'COQ-R', prodStatut: 'termine', qteReelle: 120, qteProduite: 120, qteRestante: 120 },
    101: { id: 101, recipeId: 5, composant: 'coques', parCouleur: true, couleur: 'bleu', lotProduction: 'COQ-B', prodStatut: 'termine', qteReelle: 100, qteProduite: 100, qteRestante: 100 },
    200: { id: 200, recipeId: 9, composant: 'ganache', lotProduction: 'GAN-PIS', prodStatut: 'termine', qteReelle: 60, qteProduite: 60, qteRestante: 60 }
  };
  Object.assign(prods, opts.prods || {});
  let nextId = 300; const ajoutees = []; const toasts = []; const moves = [];
  const conso = opts.conso || CONSO.filter(c => c.productionId === 100 || c.productionId === 101);
  const lots = opts.lots || LOTS;
  const rec = { 5: { id: 5, produitNom: 'Framboise' }, 9: { id: 9, produitNom: 'Pistache' } };
  const table = (store) => ({ get: async id => store[id], update: async (id, p) => { Object.assign(store[id], p); }, toArray: async () => Object.values(store),
    add: async o => { const id = nextId++; store[id] = Object.assign({ id }, o); ajoutees.push(store[id]); return id; } });
  const db = {
    productions: table(prods), recipes: table(rec), components: { get: async () => null },
    prodConsumption: { where: () => ({ equals: pid => ({ toArray: async () => conso.filter(c => c.productionId === +pid) }) }) },
    materialLots: { get: async id => lots[id] },
    transaction: async (...a) => a[a.length - 1]()
  };
  const els = { f_asmOther: { value: String(opts.other || 200) }, f_asmCoques2: { value: String(opts.coques2 || 0) }, f_asmQte: { value: String(opts.qte || 60) }, f_asmDeg: { checked: !!opts.deg } };
  const document = { getElementById: id => els[id] || null, querySelector: () => ({ value: 'frigo' }), querySelectorAll: () => [] };
  const win = { _prodRecName: id => (rec[id] || {}).produitNom || '' };
  const src = [fn('function prodComposant('), fn('function repartitionCoques('), srcCout, fn('async function coutCoquesAssemblageDepuisBase('), fn('async function prodAssembleSave(thisId){')].join('\n');
  const f = new Function('val', 'document', 'window', 'db', 'toast', 'closeModal', 'renderProductions', 'qty', 'money2', 'round3', 'subQty', 'COQUES_PAR_MACARON', 'coqueColorProfile', 'coqueLotLibelle', 'isFreezer', 'computeDlcFromHistory', 'computeAssemblyDlc',
    'lotBaseSansSuffixe', 'genLotCode', 'lotAvecEmplacement', 'today', 'logStockMove', 'asmAfterAssemble', 'fmtDate',
    src + '\nreturn prodAssembleSave;')(
    id => (els[id] || {}).value, document, win, db, t => toasts.push(t), () => {}, () => {}, x => String(x), money2, round3, subQty, 2,
    () => null, (lot) => 'Coques ' + (lot.couleur || ''), () => false, () => '2026-11-20', () => '2026-11-20', b => (b || '').split('-')[0], () => 'XYZ', (l, d) => l, () => '2026-11-09', async m => { moves.push(m); }, async () => {}, d => String(d));
  await f(opts.thisId || 100);
  return { asm: ajoutees[0], toasts, prods, ajoutees };
}
(async () => {
  {
    const r = await assembler({ qte: 60 });
    check('C. un lot assemblé est créé', !!r.asm && r.asm.composant === 'assemble');
    check('C. le macaron prend le parfum de la GANACHE (Pistache = recette 9), pas celui des coques', r.asm.recipeId === 9);
    check('C. coût des coques figé sur le lot : 120 coques (60 mac.) à 10/120 = 10 €', r.asm.coutCoques === 10 && r.asm.coutCoquesComplet === true);
    check('C. coût des coques PAR MACARON = 10 / 60 mac. = 0,1667 €', near(r.asm.coutCoquesParMac, 10 / 60, 1e-4));
    check('C. détail conservé par lot de coques (lot, couleur, coût)', r.asm.coutCoquesDetail.length === 1 && r.asm.coutCoquesDetail[0].lot === 'COQ-R' && r.asm.coutCoquesDetail[0].cout === 10);
    check('C. le message d\'assemblage annonce le coût rattaché au parfum', r.toasts.some(t => /coques 10,00 € rattachées à Pistache/.test(t)));
  }
  {
    const r = await assembler({ qte: 40, coques2: 101 });
    // 40 macarons, 2 lots : 1 coque de chaque lot par macaron = 40 coques du lot 1 (10/120) + 40 du lot 2 (10/100) → 3,3333 + 4 = 7,3333
    check('C. deux lots de coques (bicolore) : chaque lot compte au prorata de ses coques (40×10/120 + 40×10/100 ≈ 7,33 €)', near(r.asm.coutCoques, 7.33, 0.011) && r.asm.coutCoquesDetail.length === 2);
  }
  {
    const r = await assembler({ qte: 60, lots: { 1: { id: 1 }, 2: { id: 2 } } });
    check('C. matières sans prix : assemblage OK, coût marqué incomplet (jamais 0 présenté comme un vrai coût)', !!r.asm && r.asm.coutCoquesComplet === false && !r.toasts.some(t => /rattachées/.test(t)) && r.toasts.some(t => /incomplet/.test(t)));
  }
  {
    const r = await assembler({ qte: 60, thisId: 200, other: 100 });
    check('C. l\'ordre (ganache d\'abord ou coques d\'abord) ne change pas le résultat', r.asm && r.asm.coutCoques === 10 && r.asm.recipeId === 9);
  }

  // ---------- D. COÛT MESURÉ ----------
  const srcMes = [ligne('const _qConso ='), ligne('const _arr4 ='), fn('function lotPU('), fn('function coutCoqueUnitaireDeLot('), fn('function coutCoquesAssemblage('), fn('function prodComposant('), fn('function coutMatiereMesureParRecette(')].join('\n');
  const M = new Function('money2', 'round3', 'prodQteAffichee', srcMes + '\nreturn coutMatiereMesureParRecette;')(money2, round3, p => +p.qteReelle || +p.qteProduite || 0);
  const LM = [{ id: 1, prixUnitaire: 10 }, { id: 2, prixUnitaire: 20 }];
  {
    // recette 9 : deux fournées 'complet' de 60 macarons, 3 € de matières chacune (0,05 €/mac.) — vraies colonnes qteConsommee
    const prods = [{ id: 1, recipeId: 9, qteReelle: 60 }, { id: 2, recipeId: 9, qteReelle: 60 }];
    const conso = [{ productionId: 1, materialLotId: 1, qteConsommee: 0.3 }, { productionId: 2, materialLotId: 1, qteConsommee: 0.3 }];
    const m = M(prods, conso, LM);
    check('D. BUG corrigé : la mesure lit `qteConsommee` (avant : toujours vide en production)', m[9] && m[9].coutMatUnit === 0.05 && m[9].fiable === true);
    check('D. anciennes données au champ `qte` : toujours lues', M(prods, conso.map(c => ({ productionId: c.productionId, materialLotId: c.materialLotId, qte: c.qteConsommee })), LM)[9].coutMatUnit === 0.05);
  }
  {
    // ganache Pistache (recette 9) : 2 fournées de 40 macarons, 4 € de matières chacune ; coques assemblées : 120 coques → 10 € pour 60 mac.
    const prods = [
      { id: 10, recipeId: 9, composant: 'ganache', qteReelle: 40 }, { id: 11, recipeId: 9, composant: 'ganache', qteReelle: 40 },
      { id: 100, recipeId: 5, composant: 'coques', parCouleur: true, qteReelle: 120 },
      { id: 300, recipeId: 9, composant: 'assemble', qteProduite: 60, coutCoques: 10, coutCoquesComplet: true, assembleFrom: [{ id: 100, composant: 'coques', qte: 120 }] },
      { id: 301, recipeId: 9, composant: 'assemble', qteProduite: 20, etiquetteDe: 300, assembleFrom: [{ id: 100, composant: 'coques', qte: 40 }] }
    ];
    const conso = [{ productionId: 10, materialLotId: 1, qteConsommee: 0.4 }, { productionId: 11, materialLotId: 1, qteConsommee: 0.4 }, { productionId: 100, materialLotId: 1, qteConsommee: 1 }];
    const m = M(prods, conso, LM);
    check('D. ganache seule : 8 € / 80 mac. = 0,10 € + coques assemblées 10 € / 60 mac. = 0,1667 € → 0,27 € le macaron', m[9] && m[9].coutMatUnit === 0.27 && m[9].nbBatchs === 2 && m[9].pieces === 80);
    check('D. le lot de coques (et sa recette de référence) ne mesure aucun parfum', !m[5]);
    check('D. une boîte issue d\'une scission (etiquetteDe) ne double pas le coût des coques', m[9].coutMatUnit === 0.27);
    const sans = M(prods.filter(p => p.composant !== 'assemble'), conso, LM);
    check('D. ganache SANS coques assemblées chiffrées : coût partiel jamais présenté (non fiable, signalé)', sans[9] && sans[9].fiable === false && sans[9].coquesManquantes === true && sans[9].coutMatUnit === 0);
    // lot assemblé d'avant v1526 (sans coutCoques) : recalculé depuis assembleFrom + conso
    const ancien = prods.map(p => p.id === 300 ? { id: 300, recipeId: 9, composant: 'assemble', qteProduite: 60, assembleFrom: [{ id: 100, composant: 'coques', qte: 120 }] } : p);
    check('D. lot assemblé d\'avant v1526 : coût des coques recalculé depuis sa traçabilité', M(ancien, conso, LM)[9].coutMatUnit === 0.27);
    check('D. dégustation : n\'entre pas dans le coût d\'un parfum vendu', M(prods.map(p => p.id === 300 ? Object.assign({}, p, { composant: 'degustation' }) : p), conso, LM)[9].coquesManquantes === true);
  }

  // ---------- E. STOCK / VERSION ----------
  check('E. les lots de coques ne gonflent plus le stock d\'un parfum (analyse de rentabilité)', /stockByRecipe=\{\};\s*\(productions\|\|\[\]\)\.forEach\(p=>\{ if\(p && \(p\.composant==='coques'/.test(APP));
  check('E. APP_VERSION v1526', /const APP_VERSION = 'v15\d\d'/.test(APP));
  check('E. cache du service worker v556', /sm-iphone-v5\d\d/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'service-worker.js'), 'utf8')));

  console.log(`v1526 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error('PLANTAGE', e); process.exit(1); });
