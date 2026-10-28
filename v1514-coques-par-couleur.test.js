'use strict';
// v1514 — COQUES LANCÉES PAR COULEUR + STOCK PAR COULEUR (phase 2 du chantier « coques définies par leurs couleurs »).
// Ben : « le lancement des coques par couleurs, donc dissocié du parfum, et le stock par couleur qui est à disposition,
// assemblable librement ». (Phase 1 = v1513 : assemblage libre couleur × parfum.)
//
// CHOIX (annoncé à Ben) : une fournée de coques a une COULEUR et un NOMBRE DE COQUES, plus de parfum. Ses ingrédients sont
// la partie « coque » d'une recette choisie au lancement (aucune recette nouvelle) ; le lot est écrit `couleur` +
// `parCouleur:true` et se nomme « Coques <couleur> ». La couleur du lot est celle que Ben indique, pas celle de la recette.
// Le stock par couleur regroupe TOUTES les coques terminées, y compris les lots lancés par parfum avant v1514 (« convertis »).
// Le potentiel de stock traite désormais les coques comme une réserve COMMUNE : assemblables = min(garniture, coques ÷ 2).
// LIMITES ANNONCÉES : le coût de revient d'un macaron reste porté par la recette du parfum (sa partie coque) ; le plan de
// production et les suggestions d'assemblage par parfum (assemblySuggestions) ne sont pas refondus.
// LEÇONS : exécuter le VRAI code (pas seulement lire son texte) · conservation des totaux · chaque garde prouvée par mutation.
const { stripComments, APP } = require('./_extract');

let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){
  const i = APP.indexOf(marker); if(i < 0) return '';
  const j = APP.indexOf('\n}\n', i);
  return APP.slice(i, j < 0 ? i + 4000 : j + 3);
}
const ligne = marker => { const i = APP.indexOf(marker); if(i < 0) return ''; return APP.slice(i, APP.indexOf('\n', i)); };
const round3 = x => Math.round((+x + Number.EPSILON) * 1000) / 1000;

// ---------- Fonctions de couleur RÉELLES ----------
const iC = APP.indexOf('const COQUE_COULEURS = {'), jC = APP.indexOf('\n};\n', iC) + 4;
const iK = APP.indexOf('const COQUE_COULEUR_CODES = {'), jK = APP.indexOf('\n};\n', iK) + 4;
const srcCouleurs = APP.slice(iC, jC) + '\n' + APP.slice(iK, jK);   // palette + codes de lot
const srcColFns = [ligne('function coqueCouleurLabel(k){'), ligne('function coqueCouleurHex(k){'), ligne('function coqueCouleurPastille(k){'), fn('function coqueCouleurCode(k){'), fn('function recCoqueColors(rec){'), fn('function coqueColorProfile(prod, recById){')].join('\n');
const col = new Function(srcCouleurs + '\n' + srcColFns + '\nreturn { COQUE_COULEURS, coqueCouleurLabel, coqueCouleurPastille, coqueCouleurCode, recCoqueColors, coqueColorProfile };')();
const L = col.coqueCouleurLabel;
const prodComposant = p => p.composant || 'complet';
check('0. couleurs retrouvées', Object.keys(col.COQUE_COULEURS).length > 5 && !!col.COQUE_COULEURS.rouge);

// ---------- A. Stock par couleur (fonction pure, vrai code) ----------
const srcStock = fn('function coquesStockByColor(prods, recipesById){');
check('A. coquesStockByColor retrouvée', srcStock.length > 800);
const stockApi = new Function('prodComposant','round3','coqueColorProfile','coqueCouleurLabel', srcStock + '\nreturn coquesStockByColor;')(prodComposant, round3, col.coqueColorProfile, L);
const RECS = { 1: { id: 1, produitNom: 'Vanille', coqueColors: ['blanc', 'blanc'] }, 2: { id: 2, produitNom: 'Framboise', coqueColors: ['rouge', 'rouge'] },
  4: { id: 4, produitNom: 'Praliné', coqueColors: ['marron_fonce', 'blanc'] }, 5: { id: 5, produitNom: 'Mystère' }, 9: { id: 9, produitNom: 'Pistache GF', grandFormat: true, coqueColors: ['vert_pistache', 'vert_pistache'] } };
const lot = (id, o) => Object.assign({ id, composant: 'coques', prodStatut: 'termine', qteRestante: 100, lotProduction: 'L' + id, date: '2026-10-' + String(10 + id).slice(-2) }, o);
{
  const g = stockApi([lot(1, { recipeId: 1 }), lot(2, { recipeId: 2, couleur: 'rouge', parCouleur: true, qteRestante: 240 }), lot(3, { recipeId: 4, qteRestante: 80 }), lot(4, { recipeId: 5 }), lot(5, { recipeId: 9, qteRestante: 60 })], RECS);
  const par = (c, gf) => g.find(x => x.couleur === c && !!x.gf === !!gf);
  check('A. lot monochrome issu de la recette : groupé par SA couleur (blanc)', !!par('blanc') && par('blanc').lots.some(l => l.id === 1));
  check('A. lot lancé par couleur : groupe « rouge » (240 coques)', !!par('rouge') && par('rouge').total === 240 && par('rouge').lots[0].parCouleur === true);
  check('A. lot bicolore NON divisé : moitié dans chaque couleur (marron foncé 40 + blanc 40)', par('marron_fonce').total === 40 && par('blanc').lots.find(l => l.id === 3).part === 40 && par('blanc').lots.find(l => l.id === 3).moitieDeBicolore === true);
  check('A. total « blanc » = lot vanille (100) + moitié du praliné (40) = 140', par('blanc').total === 140);
  check('A. couleur NON renseignée : groupe à part, jamais écarté', !!par('') && par('').total === 100);
  check('A. grand format séparé du standard', !!par('vert_pistache', true) && par('vert_pistache', true).total === 60 && !par('vert_pistache', false));
  const somme = g.reduce((a, x) => a + x.total, 0);
  check('A. CONSERVATION : la somme des groupes = toutes les coques en stock (100+240+80+100+60 = 580)', round3(somme) === 580);
}
{
  const g = stockApi([lot(1, { recipeId: 1, prodStatut: 'demarre' }), lot(2, { recipeId: 1, degDeclasse: true }), lot(3, { recipeId: 1, qteRestante: 0 }), lot(4, { recipeId: 1, composant: 'ganache' }), lot(5, { recipeId: 1, qteRestante: 50 })], RECS);
  check('A. exclus : lot non terminé, coques déclassées, lot vide, ganache — seul le lot de 50 reste', g.length === 1 && g[0].total === 50 && g[0].lots.length === 1 && g[0].lots[0].id === 5);
  const f = stockApi([lot(1, { recipeId: 1, dlc: '', dlcProduit: '2026-11-09', date: '2026-10-11' }), lot(2, { recipeId: 1, dlcProduit: '2026-11-02' }), lot(3, { recipeId: 1, dlcProduit: '2026-11-05' })], RECS);
  check('A. lots d\'un même groupe classés par DLC la plus proche (FIFO)', f[0].lots.map(l => l.id).join() === '2,3,1');
  check('A. entrée vide / absente sans plantage', stockApi([], RECS).length === 0 && stockApi(null, RECS).length === 0);
}

// ---------- B. [v1516] Lancement par couleur : SUPERSEDÉ ----------
// `prodLancerCoquesCouleur` (une couleur, formulaire dédié) a disparu : « Coques par couleur (sans parfum) » est retiré du menu
// « Nouvelle production » à la demande de Ben ; le mode « Coques — 2 à 3 couleurs (meringue commune) » le remplace et accepte
// 1 à 8 couleurs (`prodLancerCouleurs`). Les assertions de lancement (consommation, numérotation des lots, refus impair, recette
// sans matière coque, atelier, fiche) sont reprises et étendues dans tests/v1516-meringue-couleurs.test.js.
(async () => {
  // ---------- C. Nom d'un lot ----------
  { const src = fn('function prodNomComplet(p, recipes){');
    const nom = new Function('coqueCouleurLabel','window', src + '\nreturn prodNomComplet;')(L, { _allRecipesCache: [{ id: 3, produitNom: 'Framboise' }] });
    check('C. lot lancé par couleur → « Coques Rouge » (jamais le parfum de la recette source)', nom({ recipeId: 3, couleur: 'rouge', parCouleur: true }) === 'Coques ' + L('rouge'));
    check('C. lot lancé par parfum → inchangé (nom du parfum)', nom({ recipeId: 3, couleur: 'rouge' }) === 'Framboise' && nom({ recipeId: 3 }) === 'Framboise');
    check('C. garde : parCouleur sans couleur → repli sur la recette (pas de « Coques undefined »)', nom({ recipeId: 3, parCouleur: true }) === 'Framboise'); }

  // ---------- D. Le drapeau est écrit en base ----------
  check('D. enregistrerProduction écrit parCouleur (meta.parCouleur)', /parCouleur: meta\.parCouleur\|\|undefined,/.test(stripComments(fn('async function enregistrerProduction('))));

  // ---------- E. [v1516] Formulaire de lancement : SUPERSEDÉ (voir tests/v1516-meringue-couleurs.test.js) ----------

  // ---------- F. Potentiel de stock : coques FONGIBLES (vrai code) ----------
  { const src = fn('function computeStockPotentiel(prods, recipesById){');
    check('F. computeStockPotentiel retrouvée', src.length > 900);
    const f = new Function('prodVendable','prodComposant','round3','COQUES_PAR_MACARON','coqueColorProfile', src + '\nreturn computeStockPotentiel;')(p => false, prodComposant, round3, 2, col.coqueColorProfile);
    const g = (id, rid, q, o) => Object.assign({ id, recipeId: rid, composant: 'ganache', prodStatut: 'termine', qteRestante: q }, o || {});
    const c = (id, rid, q, o) => Object.assign({ id, recipeId: rid, composant: 'coques', prodStatut: 'termine', qteRestante: q }, o || {});
    const R = RECS;
    let r = f([c(1, 2, 100), c(2, 1, 100), g(10, 1, 60), g(11, 2, 70)], R);
    check('F. 100 coques rouges + 100 blanches (200 → 100 mac.) et garniture 60 vanille + 70 framboise (130) → 100 assemblables', r.assemblableClassique === 100);
    r = f([c(1, 2, 100), g(10, 1, 60), g(11, 4, 50)], R);
    check('F. des coques « framboise » servent à monter de la vanille et du praliné : min(110 garniture, 50 mac.) = 50', r.assemblableClassique === 50);
    r = f([c(1, 5, 80), g(10, 1, 100)], R);
    check('F. coques SANS couleur renseignée comptées (plus de repli ni d\'exclusion)', r.assemblableClassique === 40);
    r = f([c(1, 1, 100), g(10, 1, 1000)], R);
    check('F. limité par les coques : 100 coques = 50 macarons', r.assemblableClassique === 50);
    r = f([c(1, 1, 1000), g(10, 1, 30)], R);
    check('F. limité par la garniture : 30 doses = 30 macarons', r.assemblableClassique === 30);
    r = f([c(1, 1, 100, { prodStatut: 'demarre' }), c(2, 1, 100, { degDeclasse: true }), g(10, 1, 100, { composantCatalogue: true }), g(11, 1, 100)], R);
    check('F. exclus : coques non terminées, déclassées ; garniture « catalogue » (chantache) → 0 assemblable', r.assemblableClassique === 0);
    r = f([c(1, 9, 60), c(2, 1, 100), g(10, 9, 80), g(11, 1, 80)], R);
    check('F. grand format et standard restent SÉPARÉS, résultats DISTINCTS (GF : 60 coques → 30 ; standard : 100 coques → 50)', r.assemblableGF === 30 && r.assemblableClassique === 50);
    r = f([c(1, 1, 100, { couleur: 'rouge', parCouleur: true }), g(10, 4, 60)], R);
    check('F. coques lancées par couleur alimentent le potentiel de n\'importe quel parfum', r.assemblableClassique === 50);
    check('F. total = finis + assemblable (structure de retour inchangée)', r.total === r.finis + r.assemblable && 'assemblableGF' in r && 'finisClassique' in r);
    check('F. plus de réserve par couleur ni de repli : poolCouleur supprimé', !/poolCouleur|_ridsSansCouleur/.test(stripComments(src))); }

  // ---------- G. Montage depuis le plan : n'importe quelles coques ----------
  { const src = fn('async function planLancerMontage(parfum, qteSuggere){');
    check('G. planLancerMontage retrouvée', src.length > 1500);
    function lancer(prods, recs){
      const calls = { forms: [], modals: [] };
      const rec = { id: 2, produitNom: 'Framboise' };
      const dbm = { productions: { toArray: async () => prods }, recipes: { toArray: async () => recs || Object.values(RECS) } };
      const f = new Function('db','_planRecetteParNom','prodComposant','round3','prodAssembleForm','openModal','esc','closeModal', src + '\nreturn planLancerMontage;')(
        dbm, async () => rec, prodComposant, round3, (id, o) => calls.forms.push({ id, o }), h => calls.modals.push(h), x => String(x), () => {});
      return f('Framboise').then(() => calls);
    }
    const gan = { id: 10, recipeId: 2, composant: 'ganache', prodStatut: 'termine', qteRestante: 50 };
    let r = await lancer([gan, lot(1, { recipeId: 1, qteRestante: 80 })]);
    check('G. garniture framboise + coques d\'un AUTRE parfum (vanille) : le formulaire s\'ouvre (plus de blocage)', r.forms.length === 1 && r.forms[0].id === 1 && r.forms[0].o.otherId === 10 && r.modals.length === 0);
    r = await lancer([gan, lot(1, { recipeId: 1, qteRestante: 80, dlcProduit: '2026-10-01' }), lot(2, { recipeId: 2, qteRestante: 80, dlcProduit: '2026-12-01' })]);
    check('G. à égalité de gabarit, les coques du MÊME parfum d\'origine passent d\'abord', r.forms[0].id === 2);
    r = await lancer([gan, lot(1, { recipeId: 9, qteRestante: 80 })]);
    check('G. des coques GRAND FORMAT ne sont pas proposées pour un parfum standard', r.forms.length === 0 && r.modals.length === 1);
    r = await lancer([gan]);
    check('G. aucune coque : message clair « de n\'importe quelle couleur », rien d\'ouvert', r.forms.length === 0 && /n'importe quelle couleur/.test(r.modals[0]) && /Il manque les <b>coques<\/b>\./.test(r.modals[0]));
    r = await lancer([lot(1, { recipeId: 1, qteRestante: 80 })]);
    check('G. pas de garniture de ce parfum : refus (la garniture définit le parfum)', r.forms.length === 0 && /garniture/.test(r.modals[0])); }

  // ---------- H. Panneau « Coques par couleur » (vrai code) ----------
  { const src = fn('async function _stockCoquesCouleurHtml(){');
    check('H. _stockCoquesCouleurHtml retrouvée', src.length > 1500);
    async function rendre(prods){
      const dbm = { productions: { toArray: async () => prods }, recipes: { toArray: async () => Object.values(RECS) } };
      return await new Function('db','coquesStockByColor','coqueCouleurPastille','coqueCouleurLabel','esc','qty','fmtDate','COQUES_PAR_MACARON', src + '\nreturn _stockCoquesCouleurHtml();')(
        dbm, stockApi, col.coqueCouleurPastille, L, x => String(x).replace(/</g, '&lt;'), x => String(x), d => d, 2);
    }
    const h = await rendre([lot(1, { recipeId: 1 }), lot(2, { recipeId: 2, couleur: 'rouge', parCouleur: true, qteRestante: 240 }), lot(5, { recipeId: 9, qteRestante: 60 })]);
    check('H. une ligne par couleur avec son total de coques et son équivalent en macarons', new RegExp(L('rouge') + '</b> — 240 coques <span[^>]*>\\(≈ 120 mac\\.\\)').test(h));
    check('H. bouton « Assembler » par couleur (premier lot FIFO) ET par lot', /prodAssembleForm\(2,\{\}\)/.test(h) && /prodAssembleForm\(1,\{\}\)/.test(h) && (h.match(/🔗 Assembler/g) || []).length >= 6);
    check('H. bouton « Lancer » prérempli sur la couleur (formulaire de production, mode couleurs)', /prodForm\(\{mode:'couleurs',couleur:'rouge'\}\)/.test(h));
    check('H. bouton général « Lancer des coques »', /onclick="prodForm\(\{mode:'couleurs'\}\)">➕ Lancer des coques/.test(h));
    check('H. l\'origine est dite : « lancées par couleur » ou « issues de « parfum » »', /lancées par couleur/.test(h) && /issues de « Vanille »/.test(h));
    check('H. grand format signalé', /grand format/.test(h));
    check('H. les boutons des lignes repliables n\'ouvrent pas/ne ferment pas le détail (stopPropagation)', /event\.stopPropagation\(\);prodAssembleForm\(/.test(h));
    const vide = await rendre([]);
    check('H. stock vide : message clair + bouton de lancement conservé', /Aucune coque terminée en stock/.test(vide) && /prodForm\(\{mode:'couleurs'\}\)/.test(vide));
    const rs = fn('async function renderStockParfums(){');
    check('H. le panneau n\'apparaît que dans la vue liste (pas dans « Espaces froids »)', /if\(_vue!=='froid'\)\{ try\{ coquesCouleurHtml = await _stockCoquesCouleurHtml\(\)/.test(rs) && /_vue==='froid' \? froidHtml : reserveHtml \+ coquesCouleurHtml \+ listeHtml/.test(rs)); }

  // ---------- I. Tableau des productions + version ----------
  check('I. le tableau des productions nomme un lot par couleur par sa couleur', /esc\(p\.parCouleur \? prodNom\(p\) : recName\(p\.recipeId\)\)/.test(fn('async function renderProductions(')) );
  check('J. APP_VERSION >= v1514', (m => !!m && +m[1] >= 1514)(APP.match(/const APP_VERSION = 'v(\d+)';/)));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.log('PLANTAGE', e && e.stack || e); process.exitCode = 1; });
