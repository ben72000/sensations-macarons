'use strict';
// v1515 — COULEURS DE COQUES SAISIES LIBREMENT.
// Ben : « je veux être capable de rajouter de nouvelles couleurs en les tapant librement. Puis cette nouvelle couleur sera
// rajoutée au stock et figurera aux côtés des autres couleurs comme si elle avait toujours été là. »
//
// PRINCIPE : la palette COQUE_COULEURS n'est plus figée ; un REGISTRE persistant (`sm_couleursPerso`, recopié dans `kv` donc
// sauvegardé et restauré) la complète. Tous les écrans lisent COQUE_COULEURS / COQUE_COULEUR_CODES et REJETTENT toute clé qui
// n'y figure pas (recCoqueColors, coqueColorProfile) : la couleur doit donc être posée dans la palette avant tout écran, au
// chargement, après la réconciliation kv du démarrage ET après une restauration — sinon une purge la ferait « oublier ».
// GARDES : un nom déjà connu (même retapé « ROUGE », « rougé », « Marron foncé ») retrouve la couleur existante — jamais de
// doublon ; une couleur d'origine ne s'écrase jamais ; la clé ne change jamais (renommer ne casse aucun lot) ; une couleur
// utilisée ne se supprime pas ; les codes de lot restent uniques.
// LEÇONS : une donnée ajoutée doit être classée dans la sauvegarde (v1372/v1473) · prouver « comme si elle avait toujours été là »
// en faisant tourner les VRAIES fonctions de stock, de libellé et de profil sur la nouvelle couleur · mutation de chaque garde.
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
const noms = ['couleurNormaliser','couleurLabelNettoyer','couleursPersoLire','couleursPersoEcrire','couleursPersoRecharger','couleurExistante','couleurPersoCode','couleurPersoCreer','couleurPersoModifier','couleurPersoUtilisation','couleurPersoSupprimer'];
const srcNouv = noms.map(n => fn((n === 'couleurPersoUtilisation' || n === 'couleurPersoSupprimer' ? 'async ' : '') + 'function ' + n + '(')).join('\n');
const srcConsts = [ligne("const COULEURS_PERSO_CLE ="), ligne("const COULEUR_PERSO_HEX_DEFAUT ="), ligne("const COULEUR_PERSO_LABEL_MAX =")].join('\n');
const srcAnc = [ligne('function coqueCouleurLabel(k){'), ligne('function coqueCouleurHex(k){'), ligne('function coqueCouleurPastille(k){'), fn('function coqueCouleurCode(k){'), fn('function recCoqueColors(rec){'), fn('function coqueColorProfile(prod, recById){'), fn('function coqueLotLibelle(lot, recById, nomFn){'), fn('function coquesStockByColor(prods, recipesById){'), fn('function prodNomComplet(p, recipes){')].join('\n');
check('0. palette, fonctions nouvelles et anciennes retrouvées', srcPalette.length > 600 && noms.every(n => new RegExp('function ' + n + '\\(').test(srcNouv)) && srcConsts.split('\n').every(l => l.length > 20) && srcAnc.length > 2000);

function monde(initial, dbm){
  const store = Object.assign({}, initial || {});
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { if(localStorage.plein) throw new Error('QuotaExceededError'); store[k] = String(v); } };
  const db = dbm || { productions: { toArray: async () => [] }, recipes: { toArray: async () => [] } };
  const api = new Function('localStorage','db','round3','prodComposant','window', srcPalette + '\n' + srcConsts + '\n' + srcAnc + '\n' + srcNouv + `
    return { COQUE_COULEURS, COQUE_COULEUR_CODES, couleurPersoCreer, couleurPersoModifier, couleurPersoSupprimer, couleursPersoRecharger, couleursPersoLire, couleurExistante, couleurNormaliser, couleurLabelNettoyer, couleurPersoCode,
             coqueCouleurLabel, coqueCouleurHex, coqueCouleurCode, recCoqueColors, coqueColorProfile, coqueLotLibelle, coquesStockByColor, prodNomComplet };`)(
    localStorage, db, round3, p => p.composant || 'complet', { _allRecipesCache: [] });
  return Object.assign(api, { store, localStorage });
}
const CLE = 'sm_couleursPerso';
const NB_ORIGINE = Object.keys(monde().COQUE_COULEURS).length;

(async () => {
  // ---------- A. Création : on tape un nom, la couleur existe ----------
  { const w = monde(); const r = w.couleurPersoCreer('bleu nuit', '#1f2a5a');
    check('A. une nouvelle couleur est créée (creee:true), clé « perso_… » lisible', r.creee === true && r.cle === 'perso_bleu_nuit');
    check('A. le nom est nettoyé et mis en forme comme les autres (1re lettre en majuscule) : « Bleu nuit »', r.label === 'Bleu nuit' && w.coqueCouleurLabel(r.cle) === 'Bleu nuit');
    check('A. elle entre dans la PALETTE vivante avec sa teinte', w.COQUE_COULEURS[r.cle] && w.COQUE_COULEURS[r.cle].hex === '#1f2a5a' && w.coqueCouleurHex(r.cle) === '#1f2a5a');
    check('A. elle figure dans la liste des couleurs, à côté des couleurs d\'origine (les formulaires lisent Object.keys)', Object.keys(w.COQUE_COULEURS).length === NB_ORIGINE + 1 && Object.keys(w.COQUE_COULEURS).includes('blanc') && Object.keys(w.COQUE_COULEURS).includes(r.cle));
    const sauve = JSON.parse(w.store[CLE]);
    check('A. elle est ENREGISTRÉE (clé, nom, teinte, code)', sauve.length === 1 && sauve[0].cle === r.cle && sauve[0].label === 'Bleu nuit' && sauve[0].hex === '#1f2a5a' && /^[A-Z0-9]{3}$/.test(sauve[0].code));
    check('A. son code de lot est lu par coqueCouleurCode (comme les couleurs d\'origine)', w.coqueCouleurCode(r.cle) === sauve[0].code && !/[ILO]/.test(sauve[0].code.slice(0, 1)));
    const r2 = w.couleurPersoCreer('Vert émeraude');
    check('A. teinte absente → teinte neutre par défaut (modifiable ensuite)', r2.creee && w.coqueCouleurHex(r2.cle) === '#c9b8a8');
    const r3 = w.couleurPersoCreer('Gris', 'pas-une-teinte');
    check('A. teinte invalide → teinte par défaut (jamais « undefined » dans un style)', w.coqueCouleurHex(r3.cle) === '#c9b8a8');
    check('A. nom avec espaces superflus → nettoyé', w.couleurPersoCreer('   turquoise    clair  ').label === 'Turquoise clair');
    check('A. nom trop long → tronqué à 32 caractères', w.couleurPersoCreer('x'.repeat(60)).label.length === 32);
    const w2 = monde(); w2.localStorage.plein = true;
    let err = null; try{ w2.couleurPersoCreer('Corail'); }catch(e){ err = e; }
    check('A. stockage plein : erreur levée ET palette INCHANGÉE (jamais une couleur « fantôme » non sauvegardée)', !!err && !w2.COQUE_COULEURS.perso_corail && Object.keys(w2.COQUE_COULEURS).length === NB_ORIGINE); }

  // ---------- B. Jamais de doublon ----------
  { const w = monde();
    check('B. « rouge » retapé → la couleur d\'ORIGINE (rien créé)', (r => r.cle === 'rouge' && r.creee === false)(w.couleurPersoCreer('rouge')));
    check('B. « ROUGE » (majuscules) → même couleur', w.couleurPersoCreer('ROUGE').cle === 'rouge');
    check('B. « Rougé » (accent) → même couleur', w.couleurPersoCreer('Rougé').cle === 'rouge');
    check('B. « Marron foncé » → marron_fonce', w.couleurPersoCreer('Marron foncé').cle === 'marron_fonce');
    check('B. « marron   fonce » (espaces, sans accent) → marron_fonce', w.couleurPersoCreer('marron   fonce').cle === 'marron_fonce');
    check('B. la clé saisie telle quelle (« marron_fonce ») → même couleur', w.couleurPersoCreer('marron_fonce').cle === 'marron_fonce');
    check('B. rien n\'a été enregistré par ces retrouvailles', !(CLE in w.store) && Object.keys(w.COQUE_COULEURS).length === NB_ORIGINE);
    const a = w.couleurPersoCreer('Bleu nuit'), b = w.couleurPersoCreer('BLEU  nuit'), c = w.couleurPersoCreer('bleu-nuit');
    check('B. une couleur ajoutée se retrouve aussi (3 saisies différentes → UNE seule couleur)', a.creee && !b.creee && !c.creee && a.cle === b.cle && a.cle === c.cle && JSON.parse(w.store[CLE]).length === 1);
    for(const [lab, v] of [['vide', ''], ['espaces', '    '], ['symboles', '###'], ['emoji', '🎨🎨'], ['null', null], ['undefined', undefined]]){
      let e = null; try{ w.couleurPersoCreer(v); }catch(x){ e = x; }
      check(`B. nom ${lab} refusé avec un message clair`, !!e && /nom/i.test(e.message)); }
    check('B. aucune création n\'a eu lieu avec ces noms invalides', JSON.parse(w.store[CLE]).length === 1);
    const x = w.couleurPersoCreer('<b>Rose</b> poudré');
    check('B. un nom contenant du HTML est conservé tel quel en données (l\'échappement se fait à l\'affichage, voir H)', x.creee && /<b>/.test(x.label)); }

  // ---------- B2. Codes de lot uniques ----------
  { const w = monde();
    const a = w.couleurPersoCreer('Ros'), b = w.couleurPersoCreer('Rosse'), c = w.couleurPersoCreer('Rosée vive');
    const codes = [a, b, c].map(r => w.coqueCouleurCode(r.cle));
    const tous = Object.keys(w.COQUE_COULEURS).map(k => w.coqueCouleurCode(k));
    check('B2. chaque couleur ajoutée a un code distinct de TOUTES les autres (3 caractères)', new Set(tous).size === tous.length && codes.every(c => c.length === 3));
    check('B2. code court (« Ros » = 2 lettres sans O) complété et distinct de « ROS » (rose)', codes[0] !== 'ROS' && codes[0].length === 3);
    const w2 = monde(); const p = w2.couleurPersoCode('Bleu nuit', []), q = w2.couleurPersoCode('Bleu nuit', [p]);
    check('B2. collision → variante numérotée (jamais le même code deux fois)', p === 'BEU' && q !== p && /^BE[0-9]$/.test(q)); }

  // ---------- C. Persistance : purge, restauration, corruption ----------
  { const w = monde(); const r = w.couleurPersoCreer('Bleu nuit', '#1f2a5a');
    const w2 = monde({ [CLE]: w.store[CLE] });
    check('C. avant rechargement, un appareil neuf (palette d\'origine) ne connaît pas la couleur', !w2.COQUE_COULEURS[r.cle]);
    w2.couleursPersoRecharger();
    check('C. APRÈS rechargement (démarrage, restauration), la couleur est de retour avec sa teinte et son code', !!w2.COQUE_COULEURS[r.cle] && w2.coqueCouleurHex(r.cle) === '#1f2a5a' && w2.coqueCouleurCode(r.cle) === JSON.parse(w.store[CLE])[0].code);
    w2.couleursPersoRecharger(); w2.couleursPersoRecharger();
    check('C. rechargement répété = idempotent (pas de doublon)', Object.keys(w2.COQUE_COULEURS).length === NB_ORIGINE + 1);
    w2.localStorage.setItem(CLE, '[]'); w2.couleursPersoRecharger();
    check('C. une couleur absente du stockage disparaît de la palette au rechargement (la source de vérité est le stockage)', !w2.COQUE_COULEURS[r.cle] && Object.keys(w2.COQUE_COULEURS).length === NB_ORIGINE); }
  { const w = monde({ [CLE]: '{pas du json' }); w.couleursPersoRecharger();
    check('C. stockage CORROMPU : aucun plantage, palette d\'origine intacte', Object.keys(w.COQUE_COULEURS).length === NB_ORIGINE);
    const w2 = monde({ [CLE]: JSON.stringify({ pas: 'un tableau' }) }); w2.couleursPersoRecharger();
    check('C. stockage de mauvaise forme (objet) ignoré', Object.keys(w2.COQUE_COULEURS).length === NB_ORIGINE);
    const w3 = monde({ [CLE]: JSON.stringify([{ cle: 'rouge', label: 'PIRATE', hex: '#000000', code: 'XXX' }, { cle: 'perso_ok', label: 'Ok', hex: '#123456', code: 'OKK' }, { cle: 'perso_sans_nom' }, { cle: 'PERSO_Maj', label: 'x' }, null, 'texte']) });
    w3.couleursPersoRecharger();
    check('C. une entrée portant la clé d\'une couleur d\'ORIGINE ne l\'écrase jamais (« rouge » reste « Rouge »)', w3.coqueCouleurLabel('rouge') === 'Rouge' && w3.coqueCouleurHex('rouge') === '#c0392b');
    check('C. les entrées invalides sont écartées, la valide est gardée', !!w3.COQUE_COULEURS.perso_ok && !w3.COQUE_COULEURS.perso_sans_nom && !w3.COQUE_COULEURS.PERSO_Maj && Object.keys(w3.COQUE_COULEURS).length === NB_ORIGINE + 1);
    const w4 = monde({ [CLE]: JSON.stringify([{ cle: 'perso_a', label: 'A', hex: 'rouge', code: 'AAA' }, { cle: 'perso_a', label: 'Doublon', hex: '#000000', code: 'BBB' }]) }); w4.couleursPersoRecharger();
    check('C. teinte invalide à la relecture → teinte par défaut ; clé en double → la première gagne', w4.coqueCouleurHex('perso_a') === '#c9b8a8' && w4.coqueCouleurLabel('perso_a') === 'A'); }

  // ---------- D. « Comme si elle avait toujours été là » : les VRAIES fonctions de l'app ----------
  { const w = monde(); const r = w.couleurPersoCreer('Bleu nuit', '#1f2a5a'); const K = r.cle;
    const recs = { 1: { id: 1, produitNom: 'Myrtille', coqueColors: [K, 'blanc'] } };
    check('D. recCoqueColors ACCEPTE la nouvelle couleur dans une recette (elle ne serait pas filtrée)', w.recCoqueColors(recs[1]).includes(K) && w.recCoqueColors(recs[1]).includes('blanc'));
    const prof = w.coqueColorProfile({ recipeId: 1, couleur: K }, recs);
    check('D. coqueColorProfile reconnaît un lot de cette couleur (monochrome)', !!prof && prof.colors.every(c => c === K));
    const lots = [{ id: 10, composant: 'coques', prodStatut: 'termine', qteRestante: 120, couleur: K, parCouleur: true, recipeId: 1, lotProduction: 'BX-CO' }, { id: 11, composant: 'coques', prodStatut: 'termine', qteRestante: 60, recipeId: 1, couleur: 'blanc', lotProduction: 'BL' }];
    const st = w.coquesStockByColor(lots, recs);
    check('D. le STOCK par couleur la range à côté des autres, avec son nom et son total', st.length === 2 && st.some(g => g.couleur === K && g.total === 120) && st.some(g => g.couleur === 'blanc' && g.total === 60));
    check('D. classement alphabétique avec les autres (« Blanc » avant « Bleu nuit »)', st.map(g => w.coqueCouleurLabel(g.couleur)).join() === 'Blanc,Bleu nuit');
    check('D. libellé d\'un lot : « Coques Bleu nuit · issues de… »', w.coqueLotLibelle(lots[0], recs, l => 'Myrtille') === 'Coques Bleu nuit · issues de « Myrtille »');
    check('D. nom d\'un lot lancé par couleur : « Coques Bleu nuit »', w.prodNomComplet({ recipeId: 1, couleur: K, parCouleur: true }) === 'Coques Bleu nuit');
    check('D. aucun repère « couleur inconnue » : le groupe porte sa clé, pas une valeur vide', st.every(g => g.couleur !== '')); }

  // ---------- E. Modifier (clé stable) ----------
  { const w = monde(); const r = w.couleurPersoCreer('Bleu nuit', '#1f2a5a'); const K = r.cle;
    const m = w.couleurPersoModifier(K, 'bleu marine', '#102040');
    check('E. renommer garde la CLÉ (les lots et recettes qui l\'utilisent suivent)', m.cle === K && w.coqueCouleurLabel(K) === 'Bleu marine' && w.coqueCouleurHex(K) === '#102040');
    check('E. le changement est enregistré', JSON.parse(w.store[CLE])[0].label === 'Bleu marine' && JSON.parse(w.store[CLE])[0].hex === '#102040' && JSON.parse(w.store[CLE])[0].cle === K);
    check('E. le code de lot ne change PAS (les lots déjà numérotés restent cohérents)', JSON.parse(w.store[CLE])[0].code === w.coqueCouleurCode(K));
    w.couleurPersoModifier(K, 'Bleu marine', 'invalide');
    check('E. teinte invalide à la modification → l\'ancienne est gardée', w.coqueCouleurHex(K) === '#102040');
    const e = (f) => { try{ f(); return null; }catch(x){ return x.message; } };
    check('E. renommer vers le nom d\'une couleur d\'ORIGINE refusé', /existe déjà/.test(e(() => w.couleurPersoModifier(K, 'ROUGE'))));
    w.couleurPersoCreer('Corail');
    check('E. renommer vers le nom d\'une AUTRE couleur ajoutée refusé', /existe déjà/.test(e(() => w.couleurPersoModifier(K, 'corail'))));
    check('E. se renommer en soi-même (ex. changer la casse) est accepté', e(() => w.couleurPersoModifier(K, 'BLEU MARINE')) === null);
    check('E. nom vide refusé', /Tape le nom/.test(e(() => w.couleurPersoModifier(K, '   '))));
    check('E. une couleur d\'origine ne se modifie pas', /Couleur introuvable/.test(e(() => w.couleurPersoModifier('rouge', 'Rouge vif'))) && w.coqueCouleurLabel('rouge') === 'Rouge'); }

  // ---------- F. Supprimer (jamais une couleur utilisée) ----------
  { const lots = [], recs = [];
    const w = monde({}, { productions: { toArray: async () => lots }, recipes: { toArray: async () => recs } });
    const a = w.couleurPersoCreer('Bleu nuit'), b = w.couleurPersoCreer('Corail');
    const rej = async (k) => { try{ await w.couleurPersoSupprimer(k); return null; }catch(x){ return x.message; } };
    lots.push({ id: 1, couleur: a.cle });
    check('F. couleur UTILISÉE par un lot : suppression refusée, message chiffré, suggère de renommer', /utilisée \(1 lot\(s\), 0 recette\(s\)\)/.test(await rej(a.cle)) && /renomme-la/.test(await rej(a.cle)) && !!w.COQUE_COULEURS[a.cle]);
    lots.length = 0; recs.push({ id: 5, coqueColors: ['blanc', a.cle] });
    check('F. couleur utilisée par une RECETTE : refusée aussi', /0 lot\(s\), 1 recette\(s\)/.test(await rej(a.cle)));
    check('F. couleur inutilisée : supprimée de la palette ET du stockage', (await rej(b.cle)) === null && !w.COQUE_COULEURS[b.cle] && JSON.parse(w.store[CLE]).every(c => c.cle !== b.cle) && JSON.parse(w.store[CLE]).length === 1);
    check('F. une couleur d\'origine ne se supprime pas', /Couleur introuvable/.test(await rej('rouge')) && !!w.COQUE_COULEURS.rouge);
    check('F. couleur inconnue : message clair', /Couleur introuvable/.test(await rej('perso_inexistante'))); }

  // ---------- G. Sauvegarde et rechargement : le câblage ----------
  { const iKv = APP.indexOf('const KV_METIER = {'), jKv = APP.indexOf('\n};\n', iKv) + 4;
    const kv = new Function(APP.slice(iKv, jKv) + '\nreturn KV_METIER;')();
    check('G. `sm_couleursPerso` est classée MÉTIER (recopiée dans kv = sauvegardée, restaurable)', typeof kv.sm_couleursPerso === 'string' && kv.sm_couleursPerso.length > 20);
    const boot = stripComments(fn('async function kvBoot(){'));
    check('G. kvBoot recharge la palette APRÈS avoir regarni localStorage', boot.indexOf('couleursPersoRecharger()') > boot.indexOf('localStorage.setItem(cle, enBase.get(cle))') && boot.indexOf('couleursPersoRecharger()') > 0);
    const rest = stripComments(fn('async function kvRestaureLSDepuisBase(){'));
    check('G. la restauration d\'une sauvegarde recharge aussi la palette', rest.indexOf('couleursPersoRecharger()') > rest.indexOf('rows.forEach'));
    const src = stripComments(APP);
    check('G. la palette est complétée dès le chargement du script, AVANT tout écran', APP.indexOf('couleursPersoRecharger();   // la palette vivante est complète') > APP.indexOf('function couleursPersoRecharger(') && APP.indexOf('couleursPersoRecharger();   // la palette vivante est complète') < APP.indexOf('// Mapping par défaut des 19 parfums'));
    check('G. la clé de stockage est écrite à UN seul endroit (couleursPersoEcrire)', (src.match(/localStorage\.setItem\(COULEURS_PERSO_CLE/g) || []).length === 1); }

  // ---------- H. Les écrans ----------
  { const html = []; const toasts = []; const confirms = [];
    const w = monde();
    const sf = fn('function couleursPersoForm(){');
    check('H. couleursPersoForm retrouvée', sf.length > 800);
    w.couleurPersoCreer('<img src=x onerror=alert(1)>Pirate', '#ff0000');
    const montrer = (store) => new Function('couleursPersoLire','openModal','coqueCouleurPastille','coqueCouleurLabel','esc','COULEUR_PERSO_LABEL_MAX','COULEUR_PERSO_HEX_DEFAUT', sf + '\ncouleursPersoForm();')(
      w.couleursPersoLire, h => html.push(h), w.coqueCouleurHex ? (k => '●') : null, w.coqueCouleurLabel, x => String(x).replace(/</g, '&lt;').replace(/>/g, '&gt;'), 32, '#c9b8a8');
    montrer();
    check('H. le formulaire propose nom + teinte + bouton Ajouter', /id="f_cpNom"/.test(html[0]) && /id="f_cpHex"/.test(html[0]) && /couleurPersoAjouterUI\(\)/.test(html[0]));
    check('H. un nom contenant du HTML est ÉCHAPPÉ dans la liste (aucune balise injectée)', !/<img src=x/.test(html[0]) && /&lt;img src=x/.test(html[0]));
    check('H. chaque couleur ajoutée a ses boutons Modifier / Supprimer', /couleurPersoEditerForm\('perso_[a-z0-9_]+'\)/.test(html[0]) && /couleurPersoSupprimerUI\('perso_[a-z0-9_]+'\)/.test(html[0]));
    const ed = fn('function couleurPersoEditerForm(cle){');
    const h2 = []; const clePirate = w.couleursPersoLire()[0].cle;   // le nom est tronqué à 32 caractères : on lit la vraie clé
    new Function('couleursPersoLire','openModal','esc','toast','COULEUR_PERSO_LABEL_MAX','COULEUR_PERSO_HEX_DEFAUT', ed + '\ncouleurPersoEditerForm(' + JSON.stringify(clePirate) + ');')(w.couleursPersoLire, x => h2.push(x), x => String(x).replace(/"/g, '&quot;').replace(/</g, '&lt;'), t => toasts.push(t), 32, '#c9b8a8');
    check('H. le formulaire de modification échappe aussi le nom dans l\'attribut value (aucune balise brute)', h2.length === 1 && !/<img src=x/.test(h2[0]) && /value="&lt;img src=x/.test(h2[0])); }

  // [v1516] Les tests de « création de la couleur AVANT le lancement » et du formulaire de lancement ciblaient prodCouleurSave /
  // prodFormCouleur, supprimés avec l'option « Coques par couleur (sans parfum) ». Le même comportement vit dans le mode « couleurs »
  // (`prodLancerCouleurs`, lignes « ➕ Autre couleur ») : voir tests/v1516-meringue-couleurs.test.js.

  // gestion des couleurs : suppression avec confirmation
  { const sup = fn('async function couleurPersoSupprimerUI(cle){');
    async function essayer(confirmeOui, utilisee){
      const lots = utilisee ? [{ id: 1 }] : [];
      const w = monde({}, { productions: { toArray: async () => lots.map(l => Object.assign(l, { couleur: 'perso_corail' })) }, recipes: { toArray: async () => [] } });
      w.couleurPersoCreer('Corail'); const toasts = []; let reouvert = 0;
      await new Function('couleursPersoLire','confirm','couleurPersoSupprimer','toast','couleursPersoForm', sup + '\nreturn couleurPersoSupprimerUI("perso_corail");')(w.couleursPersoLire, () => confirmeOui, w.couleurPersoSupprimer, t => toasts.push(t), () => { reouvert++; });
      return { w, toasts, reouvert };
    }
    let r = await essayer(false, false);
    check('H. suppression : « Annuler » à la confirmation → rien ne change', !!r.w.COQUE_COULEURS.perso_corail && r.toasts.length === 0);
    r = await essayer(true, false);
    check('H. suppression confirmée d\'une couleur inutilisée → supprimée, liste rouverte', !r.w.COQUE_COULEURS.perso_corail && r.reouvert === 1 && /supprimée/.test(r.toasts[0]));
    r = await essayer(true, true);
    check('H. suppression d\'une couleur utilisée → refus expliqué, la couleur reste', !!r.w.COQUE_COULEURS.perso_corail && /utilisée/.test(r.toasts[0]) && r.reouvert === 0); }

  // panneau de stock
  { const p = fn('async function _stockCoquesCouleurHtml(){');
    check('H. le panneau « Coques par couleur » donne accès à « 🎨 Nouvelle couleur »', /onclick="couleursPersoForm\(\)">🎨 Nouvelle couleur<\/button>/.test(p)); }

  check('I. APP_VERSION >= v1515', (m => !!m && +m[1] >= 1515)(APP.match(/const APP_VERSION = 'v(\d+)';/)));
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.log('PLANTAGE', e && e.stack || e); process.exitCode = 1; });
