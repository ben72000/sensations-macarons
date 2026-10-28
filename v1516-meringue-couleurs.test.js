'use strict';
// v1516 — « COQUES — 2 À 3 COULEURS (MERINGUE COMMUNE) » : N COULEURS SUR UNE MÊME PRODUCTION.
// Ben : « dans Nouvelle production, je ne devrais plus voir « coques — 2 à 3 parfums (meringue commune) » mais « coques — 2 à 3
// couleurs (meringue commune) », et enlever « coques par couleur (sans parfum) » : dissocier les parfums des couleurs, c'est offrir plus
// de possibilités à la fabrication. Si je veux créer 4 couleurs sur une même production, je dois pouvoir le faire, et bénéficier du
// calcul des recettes ajusté en conséquence. »
//
// DÉCISIONS : le mode « duo/trio par parfums » est REMPLACÉ (pas doublé) par un mode « couleurs » à lignes libres (1 à 8) ; l'option
// mono-couleur v1514 disparaît (une ligne = le même résultat). Le MOTEUR de calcul (`_meringueCommuneCalc`) est inchangé : il dimensionne la
// base commune sur le total et laisse à chaque ligne ses ajouts propres ; la recette de chaque ligne ne sert qu'à décompter les matières.
// ⚠️ SUITES RETIRÉES (obsolètes par décision de Ben) : v1443 (champ « Macarons Pn » suit le parfum), v1448 (aperçu des lots du duo par
// parfums), v1449 (parfum bicolore combiné). Leurs invariants durables sont repris ici : les quantités ne dépendent pas de la recette
// (C), l'aperçu et le lancement utilisent le MÊME plan de lots (D/F), les champs trompeurs sont masqués dans ce mode (B).
// LEÇONS : exécuter le VRAI code · valider TOUT avant la moindre écriture (aucune couleur créée si le lancement échoue) · prouver le
// « calcul ajusté » avec le vrai moteur sur 4 couleurs · chaque garde prouvée par mutation.
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

// ---------- Chargement des VRAIES fonctions ----------
const iC = APP.indexOf('const COQUE_COULEURS = {'), jC = APP.indexOf('\n};\n', iC) + 4;
const iK = APP.indexOf('const COQUE_COULEUR_CODES = {'), jK = APP.indexOf('\n};\n', iK) + 4;
const srcPalette = APP.slice(iC, jC) + '\n' + APP.slice(iK, jK);
const srcConsts = [ligne('const COULEURS_PERSO_CLE ='), ligne('const COULEUR_PERSO_HEX_DEFAUT ='), ligne('const COULEUR_PERSO_LABEL_MAX ='), ligne('const PROD_COULEURS_MAX =')].join('\n');
const srcCoul = [ligne('function coqueCouleurLabel(k){'), fn('function coqueCouleurCode(k){'), fn('function recCoqueColors(rec){'),
  fn('function couleurNormaliser(txt){'), fn('function couleurLabelNettoyer(txt){'), fn('function couleursPersoLire(){'), ligne('function couleursPersoEcrire(liste){'),
  fn('function couleurExistante(label, sauf){'), fn('function couleurPersoCode(label, utilises){'), fn('function couleurPersoCreer(labelBrut, hexBrut){')].join('\n');
const noms = ['_prodCouleursRecettes','prodCouleursRecetteDeCouleur','prodCouleursRecetteDefaut','prodCouleursRecetteOptions','prodCouleursInit','prodCouleursRender','prodCouleursSet','prodCouleursAjouter','prodCouleursRetirer','prodCouleursRepartir','prodCouleursResoudre','prodCouleursPlan'];
const srcNouv = noms.map(n => fn('function ' + n + '(')).join('\n') + '\n' + fn('async function prodCouleursApercu(){') + '\n' + fn('async function prodLancerCouleurs(rows, dateD){') + '\n' + fn('async function prodCouleursSave(){');
const srcMoteur = ['var _aiNormCache;', fn('function _aiNormalizeRaw('), fn('function aiNormalize('), fn('function _isTantPourTant('), fn('function _isBaseMeringue('), fn('function _natureCoque('), fn('function _meringueCommuneCalc(parfums, dispOf, matName){'), fn('async function ficheMeringueProduction(parts, meringueBatchId){')].join('\n');
check('0. palette, couleurs, 14 fonctions du mode, moteur et fiche retrouvés', srcPalette.length > 600 && srcCoul.length > 1500 && noms.every(n => new RegExp('function ' + n + '\\(').test(srcNouv)) && /prodLancerCouleurs/.test(srcNouv) && /_meringueCommuneCalc/.test(srcMoteur) && /ficheMeringueProduction/.test(srcMoteur) && /function _natureCoque\(/.test(srcMoteur));

const MATS = [{ id: 1, nom: 'Poudre d\'amande', unite: 'kg' }, { id: 2, nom: 'Sucre glace', unite: 'kg' }, { id: 3, nom: 'Blanc d\'œuf', unite: 'kg' }, { id: 4, nom: 'Colorant rouge', unite: 'g' }, { id: 5, nom: 'Colorant bleu', unite: 'g' }, { id: 6, nom: 'Colorant jaune', unite: 'g' }, { id: 7, nom: 'Colorant vert', unite: 'g' }, { id: 8, nom: 'Crème', unite: 'kg' }];
// Une recette de coque : 4 matières de base + SON colorant ; rendement 120 macarons.
const itemsCoque = colorant => [{ partie: 'coque', materialId: 1, qteParBatch: 0.12 }, { partie: 'coque', materialId: 2, qteParBatch: 0.12 }, { partie: 'coque', materialId: 3, qteParBatch: 0.09 }, ...(colorant ? [{ partie: 'coque', materialId: colorant, qteParBatch: 2 }] : []), { partie: 'ganache', materialId: 8, qteParBatch: 0.5 }];
const RECS = [
  { id: 10, produitNom: 'Framboise', rendement: 120, coqueColors: ['rouge', 'rouge'] }, { id: 11, produitNom: 'Myrtille', rendement: 120, coqueColors: ['bleu_ciel', 'bleu_ciel'] },
  { id: 12, produitNom: 'Citron', rendement: 120, coqueColors: ['jaune', 'jaune'] }, { id: 13, produitNom: 'Pistache', rendement: 120, coqueColors: ['vert_pistache', 'vert_pistache'] },
  { id: 14, produitNom: 'Vanille', rendement: 120, coqueColors: ['blanc', 'blanc'] }, { id: 15, produitNom: 'Sans coque', rendement: 120, coqueColors: ['rose', 'rose'] },
  { id: 16, produitNom: 'Fraise GF', rendement: 40, grandFormat: true, coqueColors: ['rouge', 'rouge'] }];
const ITEMS = { 10: itemsCoque(4), 11: itemsCoque(5), 12: itemsCoque(6), 13: itemsCoque(7), 14: itemsCoque(0), 15: [{ partie: 'ganache', materialId: 8, qteParBatch: 0.5 }], 16: itemsCoque(4).map(i => Object.assign({}, i, { qteParBatch: i.qteParBatch / 3 })) };

function monde(o){
  o = o || {};
  const store = Object.assign({}, o.storage || {});
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { if(localStorage.plein) throw new Error('QuotaExceededError'); store[k] = String(v); } };
  const trace = { toasts: [], enreg: [], taches: [], fiches: [], fichesSimples: [], upd: [], opens: [], closes: 0, renders: 0 };
  const prods = o.prods || [];
  const recettes = o.recs || RECS;
  const dbm = {
    recipes: { get: async id => recettes.find(r => r.id === id), toArray: async () => recettes },
    recipeItems: { where: () => ({ equals: rid => ({ toArray: async () => (o.items || ITEMS)[rid] || [] }) }) },
    materials: { toArray: async () => MATS },
    productions: { toArray: async () => prods, update: async (id, patch) => { trace.upd.push({ id, patch }); } } };
  const els = {};
  const document = { getElementById: id => { if(id in els) return els[id]; if(/^f_couleursCoq/.test(id)) return (els[id] = { textContent: '' }); return null; } };
  const win = { _allRecipesCache: o.cache || recettes };
  const f = new Function('document','window','localStorage','db','toast','closeModal','renderProductions','enregistrerProduction','prodTaskStartForBatch','ficheRecetteProduction','genLotCode','lotDateJJMMAA','qty','esc','round3','COQUES_PAR_MACARON','MACARONS_PAR_MERINGUE','GF_COQUE_RATIO','openModal','today',
    srcPalette + '\n' + srcConsts + '\n' + srcCoul + '\n' + srcNouv + '\n' + srcMoteur + `
    return { COQUE_COULEURS, couleursPersoLire, couleurPersoCreer, couleurExistante, coqueCouleurLabel, coqueCouleurCode,
      prodCouleursRecetteDefaut, prodCouleursRecetteDeCouleur, prodCouleursRecetteOptions, prodCouleursInit, prodCouleursRender, prodCouleursSet, prodCouleursAjouter, prodCouleursRetirer, prodCouleursRepartir,
      prodCouleursResoudre, prodCouleursPlan, prodCouleursApercu, prodLancerCouleurs, prodCouleursSave, ficheMeringueProduction, _meringueCommuneCalc,
      rows: () => _prodCouleursRows, setRows: r => { _prodCouleursRows = r; } };`)(
    document, win, localStorage, dbm, t => trace.toasts.push(t), () => { trace.closes++; }, () => { trace.renders++; },
    async (...a) => { trace.enreg.push(a); return 500 + trace.enreg.length; }, m => { trace.taches.push(m); return 'T' + trace.taches.length; },
    async (...a) => { trace.fichesSimples.push(a); }, () => 'XYZ', d => String(d).slice(8, 10) + String(d).slice(5, 7) + String(d).slice(2, 4),
    x => String(x), x => String(x).replace(/</g, '&lt;'), round3, 2, 120, 1.5, h => trace.opens.push(h), () => '2026-10-26');
  return Object.assign(f, { trace, store, els, localStorage, recettes });
}
const NB_ORIGINE = Object.keys(monde().COQUE_COULEURS).length;
const row = (couleur, q, rid, extra) => Object.assign({ couleur, q, rid, nouvelleNom: '', nouvelleHex: '#c9b8a8' }, extra || {});

(async () => {
  // ---------- A. Menu « Nouvelle production » + plus aucune trace de l'ancien mode ----------
  {
    const pf = fn('async function prodForm(prefill){');
    check('A. le menu propose « Coques — 2 couleurs et + » (valeur couleurs) — libellé choisi par Ben (v1517)', /<option value="couleurs">Coques — 2 couleurs et \+<\/option>/.test(pf));
    check('A. plus aucun « 2 à 3 » dans le menu de production (ni parfums, ni couleurs : le mode accepte 2 couleurs et plus)', !/2 à 3/.test(pf.slice(pf.indexOf('<select id="f_mode"'), pf.indexOf('</select>', pf.indexOf('<select id="f_mode"')))));
    check('A. « 2 à 3 parfums (meringue commune) » a disparu du menu', !/2 à 3 parfums \(meringue commune\)/.test(pf));
    check('A. « Coques par couleur (sans parfum) » a disparu du menu', !/Coques par couleur \(sans parfum\)/.test(pf) && !/value="couleur"/.test(pf));
    check('A. plus de valeur de mode « duo » dans le formulaire', !/value="duo"/.test(pf));
    const src = stripComments(APP);
    const sansArchive = src.replace(/const _APP_MAJ_v1443_ARCHIVE_INUTILISEE[\s\S]*?';\n/, '');   // la chaîne d'archive (historique v1443) cite l'ancien mode : on l'exclut, rien d'autre
    check('A. plus aucune référence à prodDuo*, f_duo*, _duoEls, prodFormCouleur, prodLancerCoquesCouleur, prodCouleurSave', !/prodDuo|f_duo|_duoEls|prodFormCouleur|prodLancerCoquesCouleur|prodCouleurSave\b|prodCouleurRecettesRefresh/.test(sansArchive));
    check('A. saveProd aiguille le mode « couleurs » vers prodCouleursSave', /if\(_mode==='couleurs'\)\{ await prodCouleursSave\(\); return; \}/.test(src));
    check('A. les boutons du stock par couleur ouvrent le formulaire de production en mode couleurs', /prodForm\(\{mode:'couleurs',couleur:'\$\{g\.couleur\}'\}\)/.test(src) && /prodForm\(\{mode:'couleurs'\}\)/.test(src));
    check('A. ouverture directe : la couleur de départ est reprise', /if\(prefill && prefill\.mode==='couleurs'\)\{[\s\S]*prodCouleursInit\(prefill\.couleur\);[\s\S]*prodModeSwitch\('couleurs'\);/.test(pf));
    check('A. chaque ouverture repart de lignes neuves et recharge le cache de recettes', /window\._allRecipesCache = recipes;\n  _prodCouleursRows = \[\];/.test(pf));
  }

  // ---------- B. Bascule de mode : champs trompeurs masqués ----------
  {
    const sw = fn('function prodModeSwitch(mode){');
    function bascule(mode, lignesDeja){
      const els = {}; const el = id => (els[id] || (els[id] = { style: {}, closest: () => ({ style: {} }) }));
      const spy = []; let rec = el('f_rec'); const recField = { style: {} }; rec.closest = () => recField;
      new Function('document','prodSyncTheorique','prodApercuGarniture','prodRefreshLot','prodCompSwitch','prodCouleursInit','prodCouleursRender','_prodCouleursRows', sw + '\nprodModeSwitch(' + JSON.stringify(mode) + ');')(
        { getElementById: id => el(id) }, () => spy.push('theo'), () => spy.push('garn'), () => spy.push('lot'), () => spy.push('comp'), () => spy.push('init'), () => spy.push('render'), lignesDeja ? [{}] : []);
      return { els, recField, spy };
    }
    const c = bascule('couleurs');
    check('B. mode couleurs : le bloc s\'affiche', c.els.f_couleursWrap.style.display === 'block');
    check('B. mode couleurs : recette unique, quantité unique, quantité réelle et N° de lot masqués (aucun champ trompeur)', c.recField.style.display === 'none' && c.els.f_qteRow.style.display === 'none' && c.els.f_qtereelWrap.style.display === 'none' && c.els.f_lotWrap.style.display === 'none');
    check('B. première ouverture : lignes initialisées', c.spy.includes('init') && !c.spy.includes('render'));
    check('B. retour au mode après avoir quitté : lignes redessinées, pas réinitialisées (saisie conservée)', (r => r.spy.includes('render') && !r.spy.includes('init'))(bascule('couleurs', true)));
    const n = bascule('complet');
    check('B. autre mode : le bloc couleurs est masqué et les champs standard reviennent', n.els.f_couleursWrap.style.display === 'none' && n.recField.style.display === 'block' && n.els.f_qteRow.style.display === 'flex' && n.els.f_lotWrap.style.display === 'block');
    check('B. le mode « garniture » garde sa règle (recette unique masquée)', bascule('garniture').recField.style.display === 'none');
  }

  // ---------- C. Lignes : ajouter, retirer, répartir, suivre la couleur ----------
  {
    const w = monde(); w.prodCouleursInit();
    check('C. départ : 2 couleurs différentes, 60 macarons chacune', w.rows().length === 2 && w.rows()[0].couleur !== w.rows()[1].couleur && w.rows().every(r => r.q === 60));
    w.prodCouleursInit('rouge');
    check('C. ouverture depuis le stock : la couleur choisie est la 1re ligne, avec une recette de cette couleur (Framboise)', w.rows()[0].couleur === 'rouge' && w.rows()[0].rid === 10);
    check('C. une recette grand format n\'est PAS proposée par défaut quand une recette standard porte la couleur (Fraise GF ignorée pour Framboise)', w.prodCouleursRecetteDefaut('rouge') === 10);
    w.prodCouleursSet(1, 'couleur', 'bleu_ciel');
    check('C. changer la couleur propose une recette de cette couleur (Myrtille)', w.rows()[1].rid === 11 && w.rows()[1].couleur === 'bleu_ciel');
    w.prodCouleursSet(1, 'rid', '14');
    check('C. choisir la recette ne touche ni la couleur ni la quantité (invariant v1443 : la quantité ne dépend pas de la recette)', w.rows()[1].rid === 14 && w.rows()[1].couleur === 'bleu_ciel' && w.rows()[1].q === 60);
    w.prodCouleursSet(1, 'couleur', 'jaune');
    check('C. changer la couleur quand la recette courante ne la porte pas → recette de la couleur (Citron)', w.rows()[1].rid === 12);
    w.prodCouleursSet(1, 'rid', '14'); w.prodCouleursSet(1, 'couleur', 'blanc');
    check('C. si la recette courante porte déjà la couleur (Vanille/blanc), elle est CONSERVÉE', w.rows()[1].rid === 14);
    w.prodCouleursSet(0, 'q', '80'); w.prodCouleursSet(0, 'q', '-5'); 
    check('C. quantité : entier, jamais négatif', w.rows()[0].q === 0);
    w.prodCouleursSet(0, 'q', '12.7'); check('C. quantité décimale arrondie', w.rows()[0].q === 13);
    // ajouter jusqu'à 8
    const w2 = monde(); w2.prodCouleursInit();
    for(let i = 0; i < 6; i++) w2.prodCouleursAjouter();
    check('C. on peut aller jusqu\'à 8 couleurs (4 « sur une même production » en fait partie)', w2.rows().length === 8 && new Set(w2.rows().map(r => r.couleur)).size === 8);
    w2.prodCouleursAjouter();
    check('C. au-delà de 8 : refus clair, rien ajouté', w2.rows().length === 8 && w2.trace.toasts.some(t => /8 couleurs au maximum/.test(t)));
    check('C. une couleur ajoutée prend une couleur NON déjà utilisée, quantité 0 à saisir', w2.rows().slice(2).every(r => r.q === 0));
    w2.prodCouleursRetirer(3); check('C. retirer une ligne', w2.rows().length === 7);
    const w3 = monde(); w3.prodCouleursInit(); w3.prodCouleursRetirer(0); w3.prodCouleursRetirer(0);
    check('C. impossible de retirer la dernière ligne', w3.rows().length === 1);
    // répartir
    const w4 = monde(); w4.prodCouleursInit(); w4.prodCouleursAjouter(); w4.prodCouleursAjouter(); w4.els.f_couleursTotal = { value: '240' }; w4.prodCouleursRepartir();
    check('C. 240 coques sur 4 couleurs → 30 macarons chacune, total conservé (4 × 30 × 2 = 240)', w4.rows().length === 4 && w4.rows().every(r => r.q === 30) && w4.rows().reduce((a, r) => a + r.q * 2, 0) === 240);
    const w5 = monde(); w5.prodCouleursInit(); w5.prodCouleursAjouter(); w5.els.f_couleursTotal = { value: '250' }; w5.prodCouleursRepartir();
    check('C. répartition inégale : 125 macarons sur 3 → 42, 42, 41 (le reste va aux premières), total conservé', w5.rows().map(r => r.q).join() === '42,42,41');
    const w6 = monde(); w6.prodCouleursInit(); w6.prodCouleursAjouter(); w6.els.f_couleursTotal = { value: '4' }; w6.prodCouleursRepartir();
    check('C. total trop petit : refus, quantités inchangées', w6.rows().every(r => r.q === 60 || r.q === 0) && w6.trace.toasts.some(t => /trop petit/.test(t)));
    const w7 = monde(); w7.prodCouleursInit(); w7.prodCouleursSet(0, 'couleur', '__nouvelle__');
    check('C. « Autre couleur » : aucune recette ne la porte, toutes proposées', /Autres recettes/.test(w7.prodCouleursRecetteOptions('__nouvelle__', 10)) && !/Recettes de cette couleur/.test(w7.prodCouleursRecetteOptions('__nouvelle__', 10)));
    check('C. liste des recettes : celles de la couleur d\'abord, le grand format signalé', w7.prodCouleursRecetteOptions('rouge', 10).indexOf('Framboise') < w7.prodCouleursRecetteOptions('rouge', 10).indexOf('Vanille') && /Fraise GF \(grand format\)/.test(w7.prodCouleursRecetteOptions('rouge', 10))); }

  // ---------- D. Résolution des couleurs et plan des lots (un seul plan pour l'aperçu et le lancement) ----------
  {
    const w = monde();
    const base = '261026';
    let plan = w.prodCouleursPlan(w.prodCouleursResoudre([row('rouge', 60, 10), row('bleu_ciel', 60, 11), row('jaune', 40, 12), row('vert_pistache', 20, 13)], false), Object.fromEntries(RECS.map(r => [r.id, r])), base, []);
    check('D. 4 couleurs → 4 sous-lots, un par ligne', plan.length === 4);
    check('D. chaque lot : date + code de la couleur + « -CO »', plan.every(L => L.lot === L.base + '-CO' && L.base.startsWith(base) && L.base === (base + w.coqueCouleurCode(L.couleur)).toUpperCase()));
    check('D. nom du lot = couleur, parCouleur, recette source conservée pour les matières', plan[0].nom === 'Rouge' && plan.every(L => L.parCouleur === true) && plan[0].rid === 10 && plan[1].rid === 11);
    check('D. codes de lot tous différents', new Set(plan.map(L => L.lot)).size === 4);
    plan = w.prodCouleursPlan(w.prodCouleursResoudre([row('rouge', 60, 10)], false), Object.fromEntries(RECS.map(r => [r.id, r])), base, [base + w.coqueCouleurCode('rouge')]);
    check('D. 2e fournée du jour, même couleur → base numérotée (…2)', plan[0].base === base + w.coqueCouleurCode('rouge') + '2');
    plan = w.prodCouleursPlan(w.prodCouleursResoudre([row('rouge', 60, 10)], false), Object.fromEntries(RECS.map(r => [r.id, r])), base, ['251025ROU', base + w.coqueCouleurCode('rouge'), base + w.coqueCouleurCode('rouge') + '2']);
    check('D. 3e fournée → …3 ; les autres dates ne comptent pas', plan[0].base === base + w.coqueCouleurCode('rouge') + '3');
    check('D. grand format signalé dans le plan', w.prodCouleursPlan(w.prodCouleursResoudre([row('rouge', 20, 16)], false), Object.fromEntries(RECS.map(r => [r.id, r])), base, [])[0].gf === true);
    // résolution
    const ap = w.prodCouleursResoudre([row('__nouvelle__', 10, 10, { nouvelleNom: 'bleu nuit' })], false);
    check('D. aperçu d\'une nouvelle couleur : SIMULÉE, rien n\'est créé', ap[0].label === 'Bleu nuit' && /^[A-Z0-9]{3}$/.test(ap[0].code) && !w.COQUE_COULEURS.perso_bleu_nuit && !('sm_couleursPerso' in w.store));
    const ex = w.prodCouleursResoudre([row('__nouvelle__', 10, 10, { nouvelleNom: 'ROUGE' })], true);
    check('D. nom déjà connu (« ROUGE ») : la couleur existante, rien de créé', ex[0].cle === 'rouge' && ex[0].dejaConnue === true && Object.keys(w.COQUE_COULEURS).length === NB_ORIGINE);
    const cr = w.prodCouleursResoudre([row('__nouvelle__', 10, 10, { nouvelleNom: 'bleu nuit', nouvelleHex: '#1f2a5a' })], true);
    check('D. création demandée : la couleur est créée avec sa teinte et entre dans la palette', cr[0].creee === true && cr[0].cle === 'perso_bleu_nuit' && w.COQUE_COULEURS.perso_bleu_nuit.hex === '#1f2a5a');
    let e = null; try{ w.prodCouleursResoudre([row('__nouvelle__', 10, 10, { nouvelleNom: '  ' })], true); }catch(x){ e = x; }
    check('D. nom vide au lancement : refus « Tape le nom »', !!e && /Tape le nom/.test(e.message)); }

  // ---------- E. Le LANCEMENT (vrai code) ----------
  {
    const w = monde();
    const r = await w.prodLancerCouleurs([row('rouge', 60, 10), row('bleu_ciel', 60, 11), row('jaune', 60, 12), row('vert_pistache', 60, 13)], '2026-10-26');
    const e = w.trace.enreg;
    check('E. 4 COULEURS sur UNE production → 4 productions enregistrées', e.length === 4 && r.lots.length === 4);
    check('E. chaque production : recette de la ligne, 120 coques (60 mac. × 2) théoriques ET réelles', e.every((a, i) => a[0] === [10, 11, 12, 13][i] && a[1] === 120 && a[2] === 120));
    check('E. méta : composant coques, couleur de la ligne, parCouleur, facteur matières = macarons de la ligne', e.every((a, i) => a[7].composant === 'coques' && a[7].couleur === ['rouge', 'bleu_ciel', 'jaune', 'vert_pistache'][i] && a[7].parCouleur === true && a[7].facteurQte === 60));
    check('E. fournée de meringue COMMUNE : un seul meringueBatchId « MER-… » partagé par les 4', /^MER-261026-XYZ$/.test(e[0][7].meringueBatchId) && e.every(a => a[7].meringueBatchId === e[0][7].meringueBatchId));
    check('E. un lot par couleur (…-CO), emplacement et DLC vides au lancement', e.every(a => /-CO$/.test(a[4]) && a[5] === '' && a[6] === '') && new Set(e.map(a => a[4])).size === 4);
    check('E. une tâche d\'atelier par lot, nommée « Coques <couleur> », rattachée à la production', w.trace.taches.map(t => t.parfumNom).join() === 'Coques Rouge,Coques Bleu ciel,Coques Jaune,Coques Vert pistache' && w.trace.upd.length === 4);
    const fiche = w.trace.opens[0] || '';
    check('E. fiche de meringue COMBINÉE : une seule (pas de fiche simple), « Une seule meringue, 4 couleurs. », 4 parts nommées par leur couleur', w.trace.fichesSimples.length === 0 && w.trace.opens.length === 1 && /Une seule meringue, 4 couleurs\./.test(fiche) && ['Rouge', 'Bleu ciel', 'Jaune', 'Vert pistache'].every(n => fiche.includes(n)));
    check('E. la fiche parle de « couleur » et de 4 sous-lots reliés, jamais de « parfum »', /par couleur/.test(fiche) && /4 sous-lots de coques reliés/.test(fiche) && !/par parfum/.test(fiche) && !/deux parfums/.test(fiche));
    check('E. fermeture, rafraîchissement et confirmation', w.trace.closes === 1 && w.trace.renders === 1 && w.trace.toasts.some(t => /Meringue commune lancée ✓ — 480 coques \(Rouge \+ Bleu ciel \+ Jaune \+ Vert pistache\)/.test(t)));
    check('E. retour exploitable', r.nbCoques === 480 && /^MER-/.test(r.meringueBatchId));
  }
  {
    const w = monde(); const r = await w.prodLancerCouleurs([row('rouge', 120, 10)], '2026-10-26');
    check('E. UNE seule couleur = le lancement mono-couleur d\'avant : pas de meringueBatchId, fiche de recette simple', w.trace.enreg.length === 1 && w.trace.enreg[0][7].meringueBatchId === undefined && w.trace.fichesSimples.length === 1 && w.trace.fichesSimples[0][0] === 10 && w.trace.fichesSimples[0][1] === 120 && w.trace.fichesSimples[0][2] === 'coques' && /^261026ROU-CO$/.test(w.trace.enreg[0][4]));
    check('E. une couleur : message « Coques Rouge lancées ✓ — 240 coques »', w.trace.toasts.some(t => /Coques Rouge lancées ✓ — 240 coques/.test(t)));
  }
  {
    const w = monde(); await w.prodLancerCouleurs([row('rouge', 60, 14), row('bleu_ciel', 60, 14)], '2026-10-26');
    check('E. la MÊME recette peut servir plusieurs couleurs (une recette de coque générique)', w.trace.enreg.length === 2 && w.trace.enreg.every(a => a[0] === 14));
  }
  {
    const base = '261026' + monde().coqueCouleurCode('rouge');
    const w = monde({ prods: [{ parCouleur: true, lotBase: base }, { lotBase: base }] }); await w.prodLancerCouleurs([row('rouge', 60, 10), row('jaune', 60, 12)], '2026-10-26');
    check('E. numérotation : une fournée « par couleurs » existante le même jour → …2 ; un lot par PARFUM ne compte pas', w.trace.enreg[0][7].lotBase === base + '2' && w.trace.enreg[1][7].lotBase.endsWith(monde().coqueCouleurCode('jaune')));
  }
  {
    const w = monde(); await w.prodLancerCouleurs([row('__nouvelle__', 60, 10, { nouvelleNom: 'bleu nuit', nouvelleHex: '#1f2a5a' }), row('rouge', 60, 10)], '2026-10-26');
    check('E. « Autre couleur » : créée AVANT les lots, lot « Coques Bleu nuit », couleur enregistrée avec sa clé', !!w.COQUE_COULEURS.perso_bleu_nuit && w.trace.enreg[0][7].couleur === 'perso_bleu_nuit' && w.trace.taches[0].parfumNom === 'Coques Bleu nuit' && w.trace.toasts.some(t => /« Bleu nuit » ajoutée à tes couleurs/.test(t)));
    const w2 = monde(); await w2.prodLancerCouleurs([row('__nouvelle__', 60, 10, { nouvelleNom: 'ROUGE' }), row('jaune', 60, 12)], '2026-10-26');
    check('E. « Autre couleur » = nom déjà connu : on réutilise « rouge » (rien de créé), et on le dit', w2.trace.enreg[0][7].couleur === 'rouge' && Object.keys(w2.COQUE_COULEURS).length === NB_ORIGINE && w2.trace.toasts.some(t => /« Rouge » existe déjà/.test(t))); }
  // validations : AUCUNE écriture, AUCUNE couleur créée
  async function refus(rows, options){
    const w = monde(options); let msg = null;
    try{ await w.prodLancerCouleurs(rows, '2026-10-26'); }catch(x){ msg = x.message; }
    return { msg, w, rien: w.trace.enreg.length === 0 && w.trace.taches.length === 0 && w.trace.fichesSimples.length === 0 && w.trace.closes === 0 };
  }
  {
    let r = await refus([]); check('E. aucune ligne refusée', /au moins une couleur/.test(r.msg) && r.rien);
    r = await refus(Array.from({ length: 9 }, (_, i) => row(Object.keys(monde().COQUE_COULEURS)[i], 10, 10))); check('E. 9 couleurs refusées (maximum 8)', /8 couleurs au maximum/.test(r.msg) && r.rien);
    r = await refus([row('rouge', 0, 10)]); check('E. 0 macaron refusé', /nombre de macarons/.test(r.msg) && r.rien);
    r = await refus([row('rouge', 60, 0)]); check('E. recette non choisie refusée', /Choisis la recette/.test(r.msg) && r.rien);
    r = await refus([row('fuchsia_inexistante', 60, 10)]); check('E. couleur inconnue refusée', /Couleur inconnue/.test(r.msg) && r.rien);
    r = await refus([row('__nouvelle__', 60, 10, { nouvelleNom: '   ' })]); check('E. nouvelle couleur sans nom refusée', /Tape le nom/.test(r.msg) && r.rien);
    r = await refus([row('rouge', 60, 10), row('rouge', 60, 11)]); check('E. même couleur sur deux lignes refusée (message nommant la couleur)', /même couleur \(Rouge\)/.test(r.msg) && r.rien);
    r = await refus([row('rouge', 60, 10), row('__nouvelle__', 60, 11, { nouvelleNom: 'rougé' })]); check('E. « Autre couleur » qui retombe sur une couleur déjà présente → doublon refusé', /même couleur/.test(r.msg) && r.rien);
    r = await refus([row('rouge', 60, 99)]); check('E. recette introuvable refusée', /Recette introuvable/.test(r.msg) && r.rien);
    r = await refus([row('rouge', 60, 15)]); check('E. recette SANS matière « coque » refusée (sinon un lot serait créé sans rien décompter)', /pas de matières « coque »/.test(r.msg) && r.rien);
    r = await refus([row('__nouvelle__', 60, 10, { nouvelleNom: 'bleu nuit' }), row('rose', 60, 15)]);
    check('E. un refus de validation ne crée PAS la couleur nouvelle (valider tout avant la moindre écriture)', /pas de matières « coque »/.test(r.msg) && r.rien && !r.w.COQUE_COULEURS.perso_bleu_nuit && !('sm_couleursPerso' in r.w.store));
    r = await refus([row('__nouvelle__', 60, 10, { nouvelleNom: 'Corail' })], { storage: {} }); 
    const wp = monde(); wp.localStorage.plein = true; let m2 = null; try{ await wp.prodLancerCouleurs([row('__nouvelle__', 60, 10, { nouvelleNom: 'Corail' })], '2026-10-26'); }catch(x){ m2 = x.message; }
    check('E. création impossible (stockage plein) : erreur, AUCUN lot (pas de lot dans une couleur fantôme)', !!m2 && wp.trace.enreg.length === 0);
  }

  // ---------- F. Aperçu : même plan que le lancement, calcul ajusté à N couleurs (vrai moteur) ----------
  {
    const w = monde(); w.els.f_couleursApercu = { innerHTML: '' }; w.els.f_couleursDate = { value: '2026-10-26' };
    w.setRows([row('rouge', 60, 10), row('bleu_ciel', 60, 11), row('jaune', 60, 12), row('vert_pistache', 60, 13)]);
    await w.prodCouleursApercu(); const h = w.els.f_couleursApercu.innerHTML;
    check('F. répartition à 4 : 25 % / 25 % / 25 % / 25 %', /<b>25 % \/ 25 % \/ 25 % \/ 25 %<\/b>/.test(h));
    check('F. une ligne par couleur avec macarons et coques', ['Rouge', 'Bleu ciel', 'Jaune', 'Vert pistache'].every(n => new RegExp('<span>' + n + '</span><span>60 mac\\. → 120 coques').test(h)));
    check('F. meringue à réaliser : 480 coques → 200 % d\'une meringue, alerte « il en faudrait 2 »', /480 coques std éq\./.test(h) && /200% d'une meringue/.test(h) && /il en faudrait <b>2<\/b>/.test(h));
    const lotsAffiches = [...h.matchAll(/→ <b>([^<]+)<\/b>/g)].map(m => m[1]);
    const w2 = monde(); const r = await w2.prodLancerCouleurs(w.rows().map(x => Object.assign({}, x)), '2026-10-26');
    check('F. INVARIANT (v1448) : les lots de l\'aperçu sont EXACTEMENT ceux qui seront écrits', lotsAffiches.join() === r.lots.map(L => L.lot).join() && lotsAffiches.length === 4);
    { const base = '261026' + w.coqueCouleurCode('rouge');
      const wn = monde({ prods: [{ parCouleur: true, lotBase: base }] }); wn.els.f_couleursApercu = { innerHTML: '' }; wn.els.f_couleursDate = { value: '2026-10-26' };
      wn.setRows([row('rouge', 60, 10), row('jaune', 60, 12)]); await wn.prodCouleursApercu();
      const aff = [...wn.els.f_couleursApercu.innerHTML.matchAll(/→ <b>([^<]+)<\/b>/g)].map(m => m[1]);
      const wl = monde({ prods: [{ parCouleur: true, lotBase: base }] }); const rl = await wl.prodLancerCouleurs([row('rouge', 60, 10), row('jaune', 60, 12)], '2026-10-26');
      check('F. INVARIANT avec une fournée du jour déjà existante : l\'aperçu annonce « …2 » et c\'est EXACTEMENT ce que le lancement écrit', aff[0] === base + '2-CO' && aff.join() === rl.lots.map(L => L.lot).join()); }
    check('F. fiche détaillée : base commune « mutualisée sur les 4 couleurs » + bloc propre à chacune', /mutualisée sur les 4 couleurs/.test(h) && ['Rouge', 'Bleu ciel', 'Jaune', 'Vert pistache'].every(n => h.includes('<b>' + n + '</b></div>')));
    // LE CALCUL, AJUSTÉ : 4 recettes × 60/120 de base chacune → base commune = 2 recettes entières ; colorants PROPRES à chaque couleur
    const calc = w.prodCouleursApercu && null;
    // CLASSIFICATION RÉELLE du moteur : seuls blanc d'œuf / eau / sucre semoule forment la BASE commune ; poudre d'amande et sucre glace
    // (« tant pour tant ») et colorants restent PROPRES à chaque couleur.
    check('F. base commune = blanc d\'œuf seul : 4 × (0,09 kg × 60/120) = 180 g, mutualisé', /Blanc d'œuf<\/span><b>180 g<\/b>/.test(h) && (h.match(/Blanc d'œuf/g) || []).length === 1);
    check('F. chaque couleur porte SES propres quantités : amande 60 g et sucre glace 60 g (0,12 kg × 60/120) × 4', (h.match(/Poudre d'amande<\/span><b>60 g<\/b>/g) || []).length === 4 && (h.match(/Sucre glace<\/span><b>60 g<\/b>/g) || []).length === 4);
    check('F. colorants PROPRES à chaque couleur (2 g × 60/120 = 1 g chacun), jamais fondus dans la base', /Colorant rouge<\/span><b>1 g<\/b>/.test(h) && /Colorant bleu<\/span><b>1 g<\/b>/.test(h) && /Colorant jaune<\/span><b>1 g<\/b>/.test(h) && /Colorant vert<\/span><b>1 g<\/b>/.test(h));
    check('F. les colorants n\'apparaissent PAS dans la base commune (chacun sous sa couleur)', h.indexOf('Base commune') > h.lastIndexOf('Colorant vert') && !/Base commune[\s\S]*Colorant/.test(h)); }
  {
    // L'ajustement suit le nombre de couleurs ET leurs quantités : 2 couleurs inégales
    const w = monde(); w.els.f_couleursApercu = { innerHTML: '' }; w.els.f_couleursDate = { value: '2026-10-26' };
    w.setRows([row('rouge', 90, 10), row('bleu_ciel', 30, 11)]); await w.prodCouleursApercu(); const h = w.els.f_couleursApercu.innerHTML;
    check('F. 2 couleurs 75 % / 25 % : base = blanc d\'œuf 0,09 × (90+30)/120 = 90 g ; amande 90 g (rouge) et 30 g (bleu) ; colorants 1,5 g et 0,5 g — tout suit les QUANTITÉS de chaque couleur', /75 % \/ 25 %/.test(h) && /Blanc d'œuf<\/span><b>90 g<\/b>/.test(h) && /Poudre d'amande<\/span><b>90 g<\/b>/.test(h) && /Poudre d'amande<\/span><b>30 g<\/b>/.test(h) && /Colorant rouge<\/span><b>1\.5 g<\/b>/.test(h) && /Colorant bleu<\/span><b>0\.5 g<\/b>/.test(h));
    check('F. 120 macarons = une meringue pleine : aucune alerte de dépassement', /100% d'une meringue/.test(h) && !/il en faudrait/.test(h));
    check('F. mutualisée sur les 2 couleurs', /mutualisée sur les 2 couleurs/.test(h)); }
  {
    const w = monde(); w.els.f_couleursApercu = { innerHTML: '' }; w.els.f_couleursDate = { value: '2026-10-26' };
    w.setRows([row('rouge', 0, 10), row('jaune', 0, 12)]); await w.prodCouleursApercu();
    check('F. aucune quantité : message d\'invite, pas de calcul', /Indique un nombre de macarons/.test(w.els.f_couleursApercu.innerHTML));
    w.setRows([row('rouge', 60, 10), row('rouge', 20, 11)]); await w.prodCouleursApercu();
    check('F. deux lignes de la même couleur : alerte visible dans l\'aperçu', /Deux lignes portent la même couleur/.test(w.els.f_couleursApercu.innerHTML));
    w.setRows([row('rouge', 20, 16), row('jaune', 60, 12)]); await w.prodCouleursApercu();
    check('F. mélange grand format + standard : note explicative, capacité en équivalent standard', /grand format<\/b> et un <b>standard<\/b>/.test(w.els.f_couleursApercu.innerHTML));
    w.setRows([row('rouge', 60, 14), row('jaune', 60, 14)]); await w.prodCouleursApercu();
    { const hh = w.els.f_couleursApercu.innerHTML;
      check('F. même recette pour les deux couleurs (recette générique sans colorant) : base commune mutualisée (blanc d\'œuf 90 g) ET mêmes propres sous chaque couleur (amande 60 g × 2)', /Blanc d'œuf<\/span><b>90 g<\/b>/.test(hh) && (hh.match(/Poudre d'amande<\/span><b>60 g<\/b>/g) || []).length === 2 && !/Colorant/.test(hh)); }
    w.setRows([row('rouge', 60, 15), row('jaune', 60, 15)]); await w.prodCouleursApercu();
    check('F. recettes sans aucune matière coque : message d\'aide, jamais une fiche vide', /Aucun ingrédient « coque » étiqueté/.test(w.els.f_couleursApercu.innerHTML));
    w.setRows([row('__nouvelle__', 60, 10, { nouvelleNom: 'bleu nuit' }), row('jaune', 60, 12)]); await w.prodCouleursApercu();
    check('F. aperçu avec une couleur à créer : son nom et son futur lot s\'affichent, rien n\'est créé', /Bleu nuit/.test(w.els.f_couleursApercu.innerHTML) && !w.COQUE_COULEURS.perso_bleu_nuit); }

  // ---------- G. Fiche de meringue : libellés « couleur » (vrai code) ----------
  {
    const w = monde(); w.trace.opens.length = 0;
    const fiche = new Function('db','openModal','esc','qty','round3','COQUES_PAR_MACARON','GF_COQUE_RATIO','coqueCouleurLabel','today','toast','_meringueCommuneCalc','_natureCoque','closeModal',
      srcMoteur.slice(srcMoteur.indexOf('async function ficheMeringueProduction(')) + '\nreturn ficheMeringueProduction;');
    check('G. ficheMeringueProduction retrouvée', srcMoteur.indexOf('async function ficheMeringueProduction(') > 0 && /modeCouleurs/.test(srcMoteur));
    const src = fn('async function ficheMeringueProduction(parts, meringueBatchId){');
    check('G. mode couleurs reconnu quand TOUTES les parts sont « parCouleur »', /const modeCouleurs = \(parts\|\|\[\]\)\.length>0 && parts\.every\(p=>p && p\.parCouleur === true\);/.test(src));
    check('G. libellés adaptés : « N couleurs », « par couleur », « cette couleur partage », « N sous-lots »', /parts\.length \+ ' couleurs' : 'deux parfums'/.test(src) && /par \$\{modeCouleurs \? 'couleur' : 'parfum'\}/.test(src) && /modeCouleurs \? 'cette couleur' : 'ce parfum'/.test(src) && /\$\{modeCouleurs \? parts\.length : 2\} sous-lots/.test(src));
    check('G. le nom d\'une part (couleur) prime sur « recette — couleur » ; les parts de parfum gardent leur affichage', /const nom = part\.nom \? part\.nom : \(part\.couleur \? `\$\{nomBase\} — \$\{coqueCouleurLabel\(part\.couleur\)\}` : nomBase\);/.test(src));
    check('G. relecture d\'une fournée existante (bouton « Voir la recette » d\'un sous-lot) : parts marquées parCouleur avec le nom de la couleur', /parCouleur: f\.parCouleur===true,\s*\n\s*nom: \(f\.parCouleur===true && f\.couleur\) \? coqueCouleurLabel\(f\.couleur\) : undefined/.test(APP)); }

  // ---------- H. Enregistrement via le bouton ----------
  {
    const w = monde(); w.els.f_couleursDate = { value: '2026-10-27' };
    w.setRows([row('rouge', 60, 10), row('jaune', 60, 12)]);
    await w.prodCouleursSave();
    check('H. prodCouleursSave lit la date du bloc et lance toutes les lignes', w.trace.enreg.length === 2 && w.trace.enreg[0][3] === '2026-10-27');
    const w2 = monde(); w2.setRows([row('rouge', 0, 10)]); await w2.prodCouleursSave();
    check('H. erreur de validation : message affiché, rien d\'écrit, pas de plantage', w2.trace.enreg.length === 0 && w2.trace.toasts.length === 1 && /nombre de macarons/.test(w2.trace.toasts[0])); }

  check('I. APP_VERSION >= v1516', (m => !!m && +m[1] >= 1516)(APP.match(/const APP_VERSION = 'v(\d+)';/)));
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.log('PLANTAGE', e && e.stack || e); process.exitCode = 1; });
