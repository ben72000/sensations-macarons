'use strict';
// v1513 — ASSEMBLAGE LIBRE COULEUR × PARFUM (phase 1 du chantier « coques définies par leurs couleurs »).
// Ben : « toutes les coques de macarons définies par leurs couleurs, et que je puisse facilement assembler n'importe
// quelle couleur avec n'importe quel parfum — ainsi on ferait sauter tous les verrous liés à ces restrictions ».
// RÉPONSES DE BEN : production par COULEUR directement (phase 2) · lots existants CONVERTIS en coques de couleur, tout
// parfum · « d'abord l'assemblage libre, la production ensuite ».
//
// CE QUI TOMBE : le verrou « un seul parfum » de l'entrée Stock par parfum (v1426) ; le filtre de couleur de la
// mutualisation (v1249) ; la couleur « manquante » imposée au 2e lot (v1506) ; le sélecteur forcé des recettes bicolores.
// CE QUI RESTE (physique, pas une règle de couleur) : coques STANDARD et GRAND FORMAT ne se mélangent pas ; la règle
// du grand format vendable (le crémeux du même parfum que les coques, sauf dégustation) — hors périmètre, à confirmer.
//
// DÉFAUT DÉCOUVERT EN CHEMIN : le lot assemblé prenait la recette des COQUES. Invisible tant que coques et garniture
// venaient du même parfum, FAUX dès qu'on les mélange (un macaron framboise monté sur des coques « vanille » aurait été
// enregistré « vanille » : stock, étiquette, prix). Le parfum est désormais celui de la GARNITURE ; la couleur est
// une propriété des coques, tracée à part (`coquesCouleurs`).
// « Convertir » les lots existants = les PRÉSENTER par leurs couleurs (la couleur vient de `couleur` ou de la recette) ;
// aucune donnée n'est réécrite : lot, recette d'origine et traçabilité restent.
// LEÇONS : exécuter le VRAI prodAssembleSave (pas seulement lire son texte) · un verrou qu'on retire est prouvé par
// réintroduction · retirer un contrôle exige d'inventorier ce qu'il permettait.
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

// ---------- Fonctions RÉELLES de couleur ----------
const iC = APP.indexOf('const COQUE_COULEURS = {'), jC = APP.indexOf('\n};\n', iC) + 4;
const srcCouleurs = APP.slice(iC, jC);
const srcColFns = [ligne('function coqueCouleurLabel(k){'), fn('function recCoqueColors(rec){'), fn('function coqueColorProfile(prod, recById){'), fn('function coqueLotLibelle(lot, recById, nomFn){')].join('\n');
check('0. couleurs et fonctions retrouvées', srcCouleurs.length > 300 && srcColFns.length > 500 && /coqueLotLibelle/.test(srcColFns));
const couleurApi = new Function(srcCouleurs + '\n' + srcColFns + '\nreturn { coqueCouleurLabel, recCoqueColors, coqueColorProfile, coqueLotLibelle, COQUE_COULEURS };')();
const L = couleurApi.coqueCouleurLabel;

// ---------- A. Libellé d'un lot par sa COULEUR ----------
{
  const recs = { 1: { id: 1, produitNom: 'Vanille', coqueColors: ['blanc', 'blanc'] }, 2: { id: 2, produitNom: 'Framboise', coqueColors: ['rouge', 'rouge'] },
    3: { id: 3, produitNom: 'Praliné', coqueColors: ['marron_fonce', 'blanc'] }, 4: { id: 4, produitNom: 'Mystère' }, 5: { id: 5, produitNom: 'Pistache GF', coqueColors: ['vert_pistache', 'vert_pistache'], grandFormat: true } };
  const nom = lot => (recs[lot.recipeId] || {}).produitNom || '';
  const lib = lot => couleurApi.coqueLotLibelle(lot, recs, nom);
  check('A. lot monochrome → « Coques <couleur> · issues de « parfum » »', lib({ recipeId: 1 }) === `Coques ${L('blanc')} · issues de « Vanille »`);
  check('A. la couleur vient AVANT le parfum (le parfum n\'est que l\'origine)', lib({ recipeId: 2 }).indexOf(L('rouge')) < lib({ recipeId: 2 }).indexOf('Framboise'));
  check('A. lot bicolore non divisé → les DEUX couleurs', lib({ recipeId: 3 }) === `Coques ${L('marron_fonce')} + ${L('blanc')} · issues de « Praliné »`);
  check('A. lot divisé (couleur explicite) → UNE seule couleur, malgré la recette bicolore', lib({ recipeId: 3, couleur: 'blanc' }) === `Coques ${L('blanc')} · issues de « Praliné »`);
  check('A. deux fois la même couleur = une seule affichée', !/\+/.test(lib({ recipeId: 1 })));
  check('A. couleur non renseignée → proposé quand même, avec la mention (jamais écarté)', lib({ recipeId: 4 }) === 'Coques couleur non renseignée · issues de « Mystère »');
  check('A. grand format signalé', /\(grand format\)/.test(lib({ recipeId: 5 })));
  check('A. sans fonction de nom : pas de « issues de »', couleurApi.coqueLotLibelle({ recipeId: 1 }, recs) === `Coques ${L('blanc')}`);
}

// ---------- B. LE VRAI prodAssembleSave dans un bac à sable ----------
const srcSave = fn('async function prodAssembleSave(thisId){');
check('B. prodAssembleSave retrouvée', srcSave.length > 4000);
function monde(opts){
  opts = opts || {};
  const recs = {
    1: { id: 1, produitNom: 'Vanille', coqueColors: ['blanc', 'blanc'] },
    2: { id: 2, produitNom: 'Framboise', coqueColors: ['rouge', 'rouge'] },
    3: { id: 3, produitNom: 'Chocolat au lait', coqueColors: ['marron_fonce', 'marron_fonce'] },
    4: { id: 4, produitNom: 'Praliné', coqueColors: ['marron_fonce', 'blanc'] },
    9: { id: 9, produitNom: 'Pistache GF', grandFormat: true, coqueColors: ['vert_pistache', 'vert_pistache'], componentRefs: [{ componentId: 7 }] },
    10: { id: 10, produitNom: 'Framboise GF', grandFormat: true, coqueColors: ['rouge', 'rouge'], componentRefs: [{ componentId: 7 }] }
  };
  const lots = {
    100: { id: 100, recipeId: 1, composant: 'coques', couleur: 'blanc', lotBase: 'VAN-1', lotProduction: 'VAN-1-C', qteRestante: 120, prodStatut: 'termine' },
    101: { id: 101, recipeId: 1, composant: 'ganache', lotBase: 'VAN-1', lotProduction: 'VAN-1-G', qteRestante: 60, prodStatut: 'termine' },
    102: { id: 102, recipeId: 2, composant: 'ganache', lotBase: 'FRB-1', lotProduction: 'FRB-1-G', qteRestante: 60, prodStatut: 'termine' },
    103: { id: 103, recipeId: 3, composant: 'coques', couleur: 'marron_fonce', lotBase: 'CHO-1', lotProduction: 'CHO-1-C', qteRestante: 100, prodStatut: 'termine' },
    104: { id: 104, recipeId: 4, composant: 'coques', lotBase: 'PRA-1', lotProduction: 'PRA-1-C', qteRestante: 100, prodStatut: 'termine' },   // bicolore non divisé
    105: { id: 105, recipeId: 9, composant: 'coques', lotBase: 'PIS-1', lotProduction: 'PIS-1-C', qteRestante: 100, prodStatut: 'termine' },
    106: { id: 106, recipeId: 10, composant: 'ganache', garnitureType: 'cremeux', lotBase: 'FRB-GF', lotProduction: 'FRB-GF-G', qteRestante: 40, prodStatut: 'termine' },
    107: { id: 107, recipeId: null, produitLibre: 'Ganache maison', composant: 'ganache', lotBase: 'LIB-1', lotProduction: 'LIB-1-G', qteRestante: 60, prodStatut: 'termine' },
    108: { id: 108, composantCatalogue: true, componentId: 7, composant: 'chantache', lotProduction: 'CHA-1', qteRestante: 50, prodStatut: 'termine' }   // dose de chantache (grand format)
  };
  Object.values(lots).forEach(l => { l.recipeId = l.recipeId; });
  let nextId = 900; const ajoutes = [], moves = [], toasts = [], form = Object.assign({ f_asmQte: '10', f_asmOther: '', f_asmCoques2: '' }, opts.form || {});
  const dbm = {
    transaction: async (mode, ...args) => { const f = args[args.length - 1]; return await f(); },
    productions: {
      get: async id => lots[id] ? JSON.parse(JSON.stringify(lots[id])) : undefined,
      update: async (id, patch) => { Object.assign(lots[id], patch); },
      add: async o => { const id = nextId++; lots[id] = Object.assign({ id }, o); ajoutes.push(lots[id]); return id; }
    },
    prodConsumption: {}, components: { get: async () => ({ nom: 'Chantache' }) },
    recipes: { get: async id => recs[id], toArray: async () => Object.values(recs) }
  };
  const doc = { querySelectorAll: () => (opts.comp ? [{ getAttribute: () => '7', value: '108' }] : []), getElementById: id => (id === 'f_asmDeg' ? { checked: !!opts.deg } : null), querySelector: () => ({ value: 'frigo' }) };
  const val = id => (form[id] != null ? form[id] : '');
  const enc = [];
  const f = new Function('val','document','db','toast','window','prodComposant','qty','round3','subQty','repartitionCoques','COQUES_PAR_MACARON','today','isFreezer','computeDlcFromHistory','computeAssemblyDlc','lotBaseSansSuffixe','genLotCode','lotAvecEmplacement','logStockMove','closeModal','renderProductions','fmtDate','asmAfterAssemble','coqueColorProfile','coqueLotLibelle',
    srcSave + '\nreturn prodAssembleSave;')(
    val, doc, dbm, t => toasts.push(t), { _prodRecName: id => (recs[id] ? recs[id].produitNom : '') },
    p => p.composant, x => String(x), round3, (a, b) => round3(a - b),
    (q, deux) => (deux ? { lot1: q, lot2: q } : { lot1: q * 2, lot2: 0 }), 2, () => '2026-10-26', () => false,
    () => '2026-11-02', (base, congelo, dlcs) => base, x => String(x || '').replace(/-(C|G|AS|DG)$/, ''), () => 'XXX', (b, d) => b + '-F',
    async mv => { moves.push(mv); }, () => {}, () => {}, d => d, async () => {}, couleurApi.coqueColorProfile, couleurApi.coqueLotLibelle);
  return { lots, ajoutes, moves, toasts, form, run: id => f(id), recs };
}
const asm = async (w, a, b) => { w.form.f_asmOther = String(b); await w.run(a); return w.ajoutes[0]; };

(async () => {
  // B1. même parfum des deux côtés : comportement d'origine
  { const w = monde(); const r = await asm(w, 100, 101);
    check('B1. même parfum : macaron « Vanille » (recette 1), comme avant', !!r && r.recipeId === 1);
    check('B1. couleur des coques tracée : [blanc]', JSON.stringify(r.coquesCouleurs) === '["blanc"]');
    check('B1. base de lot historique (celle des coques) conservée', r.lotBase === 'VAN-1');
    check('B1. stocks décomptés : coques −20, garniture −10', w.lots[100].qteRestante === 100 && w.lots[101].qteRestante === 50); }
  // B2. MÉLANGE LIBRE : coques blanches (vanille) + garniture framboise
  { const w = monde(); const r = await asm(w, 100, 102);
    check('B2. coques « vanille » + garniture framboise : AUCUN refus', !!r && !/(parfum|Max assemblable)/i.test(w.toasts.join(' ')) && w.ajoutes.length === 1);
    check('B2. [LE DÉFAUT CORRIGÉ] le macaron est « Framboise » — le parfum de la GARNITURE, pas des coques', r.recipeId === 2);
    check('B2. la couleur des coques est tracée à part : [blanc]', JSON.stringify(r.coquesCouleurs) === '["blanc"]');
    check('B2. journal de stock : le macaron entre au parfum « Framboise »', w.moves.some(m => m.composant === 'macaron' && m.sens === 1 && m.parfumNom === 'Framboise'));
    check('B2. journal de stock : les coques sortent sous leur parfum d\'origine (traçabilité intacte)', w.moves.some(m => m.composant === 'coques' && m.sens === -1 && m.parfumNom === 'Vanille' && m.qte === 20));
    check('B2. traçabilité : assembleFrom garde le lot de coques, son parfum d\'origine ET sa couleur', (a => !!a && a.parfum === 'Vanille' && a.couleur.indexOf(L('blanc')) === 0 && a.lot === 'VAN-1-C')(r.assembleFrom.find(x => x.composant === 'coques')));
    check('B2. la base du lot suit la GARNITURE quand les parfums diffèrent', r.lotBase === 'FRB-1');
    check('B2. stocks décomptés : coques −20, garniture −10', w.lots[100].qteRestante === 100 && w.lots[102].qteRestante === 50); }
  // B3. l'ancien champ caché « un seul parfum » n'a plus aucun effet
  { const w = monde({ form: { f_asmSansMelange: '1' } }); const r = await asm(w, 100, 102);
    check('B3. même avec l\'ancien indicateur « un seul parfum » à 1 : plus de refus (verrou v1426 supprimé)', !!r && r.recipeId === 2 && !/un seul parfum/i.test(w.toasts.join(' '))); }
  // B4. deux lots de coques de couleurs différentes (macaron bicolore libre)
  { const w = monde({ form: { f_asmCoques2: '103' } }); const r = await asm(w, 100, 102);
    check('B4. bicolore libre : blanc (vanille) + marron foncé (chocolat) avec une garniture framboise', !!r && r.recipeId === 2);
    check('B4. les deux couleurs sont tracées', JSON.stringify(r.coquesCouleurs) === JSON.stringify(['blanc', 'marron_fonce']));
    check('B4. 1 coque de chaque lot par macaron (10 + 10)', w.lots[100].qteRestante === 110 && w.lots[103].qteRestante === 90);
    check('B4. assembleFrom liste les deux lots de coques avec leur couleur', r.assembleFrom.filter(x => x.composant === 'coques').length === 2 && r.assembleFrom.filter(x => x.composant === 'coques').every(x => !!x.couleur)); }
  // B5. un lot bicolore non divisé porte ses deux couleurs
  { const w = monde(); const r = await asm(w, 104, 102);
    check('B5. lot bicolore non divisé (praliné) → couleurs [marron foncé, blanc] tracées, parfum framboise', !!r && r.recipeId === 2 && JSON.stringify(r.coquesCouleurs) === JSON.stringify(['marron_fonce', 'blanc'])); }
  // B6. garniture « produit libre » sans recette : repli sur la recette des coques (rien ne casse)
  { const w = monde(); const r = await asm(w, 100, 107);
    check('B6. garniture sans recette : le lot garde la recette des coques (pas de recipeId nul)', !!r && r.recipeId === 1); }
  // B7. RÈGLE CONSERVÉE : grand format vendable = crémeux du même parfum que les coques
  { const w = monde({ comp: true }); await asm(w, 105, 106);
    check('B7. grand format : coques pistache + crémeux framboise, vendable → REFUSÉ (règle conservée)', w.ajoutes.length === 0 && /grand format vendable/.test(w.toasts.join(' ')));
    const w2 = monde({ deg: true, comp: true }); await asm(w2, 105, 106);
    check('B7. …mais en dégustation c\'est libre, et le macaron suit la garniture', w2.ajoutes.length === 1 && w2.ajoutes[0].recipeId === 10 && w2.ajoutes[0].degustation === true); }
  // B8. les vraies limites restent : capacité, quantité
  { const w = monde({ form: { f_asmQte: '70' } }); await asm(w, 100, 102);
    check('B8. quantité au-delà de la capacité (coques 60, garniture 60 → 70 demandés) → refus clair, rien d\'écrit', w.ajoutes.length === 0 && /Max assemblable/.test(w.toasts.join(' '))); }
  { const w = monde({ form: { f_asmCoques2: '100' } }); await asm(w, 100, 102);
    check('B8. un 2e lot identique au 1er reste refusé', w.ajoutes.length === 0 && /doit être différent/.test(w.toasts.join(' '))); }

  // ---------- C. Le formulaire : plus aucun verrou (garde par PATTERN) ----------
  {
    const form = stripComments(APP.slice(APP.indexOf('async function prodAssembleForm('), APP.indexOf('function prodAsmDegSwitch(')));
    check('C. le formulaire n\'utilise plus `sansMelange`', !/sansMelange/.test(form));
    check('C. plus de champ caché f_asmSansMelange', !/f_asmSansMelange/.test(form));
    check('C. plus de filtre de couleur de la mutualisation (coquesMutualisables)', !/coquesMutualisables\(/.test(form));
    check('C. plus de sélection imposée par couleur (coquesPourCouleur, _coul2, _bicolore)', !/coquesPourCouleur\(|_coul2|_bicolore/.test(form));
    check('C. plus d\'avertissement « parfum différent » ni « coques compatibles »', !/parfum différent/.test(form) && !/coques compatibles/.test(form));
    check('C. les coques sont libellées par leur COULEUR (coqueLotLibelle) dans les deux sélecteurs', (form.match(/coqueLotLibelle\(/g) || []).length >= 2);
    check('C. standard et grand format restent séparés (garde physique conservée, expressions EXACTES)', form.includes('return !!(rx && rx.grandFormat) === _gfCible;') && form.includes('return !!(rx && rx.grandFormat) === !!(_rec && _rec.grandFormat);'));
    check('C. le texte annonce : toutes les couleurs avec tous les parfums, parfum = garniture', /Toutes les couleurs de coques vont avec tous les parfums/.test(form) && /parfum du macaron est celui de la <b>garniture<\/b>/.test(form));
    const save = stripComments(srcSave);
    check('C. l\'enregistrement ne relit plus l\'indicateur « un seul parfum »', !/_sansMelange|f_asmSansMelange/.test(save));
    check('C. le lot assemblé prend la recette de la GARNITURE', /recipeId: _recIdMac,/.test(save) && /const _recIdMac = \(ganache\.recipeId!=null\) \? ganache\.recipeId : coques\.recipeId;/.test(save));
    check('C. les couleurs des coques sont écrites sur le lot assemblé', /coquesCouleurs: _couleursCoques/.test(save));
  }
  // ---------- D. Stock par parfum : le bouton n'envoie plus de verrou ----------
  {
    const i = APP.indexOf('const _ligneComposantAssemblable'); const bloc = APP.slice(i, APP.indexOf('const rows = prods.map', i));
    check('D. les boutons « Assembler » ne passent plus {sansMelange:true}', !/sansMelange/.test(bloc) && /prodAssembleForm\(\$\{p\.id\},\{\}\)/.test(bloc) && /prodAssembleLotEntier\(\$\{p\.id\},\{\}\)/.test(bloc));
    check('D. les libellés disent « de ton choix » au lieu d\'imposer le parfum', /avec \$\{esc\(quoi\)\} de ton choix/.test(bloc) && !/du même parfum/.test(bloc));
    check('D. plus aucun appel avec {sansMelange:true} dans toute l\'app', !/\{sansMelange:true\}/.test(stripComments(APP)));
  }
  // ---------- E. Version ----------
  check('E. APP_VERSION >= v1513', (m => !!m && +m[1] >= 1513)(APP.match(/const APP_VERSION = 'v(\d+)';/)));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.log('PLANTAGE', e && e.stack || e); process.exitCode = 1; });
