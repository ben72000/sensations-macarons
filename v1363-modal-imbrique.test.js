// ════════════════════════════════════════════════════════════════════════════
//  v1363 — ON N'EMPILE PAS LES MODALS
//
//  Ben : « En créant les boîtes dans l'onglet étiquettes groupées je subis un crash au moment
//  d'appuyer sur chaque bouton emplacement. À l'issue du crash je perds toutes les informations
//  qui étaient en attente de validation et dois recommencer depuis zéro. »
//
//  LA CAUSE, ENTIEREMENT DE MON FAIT : l'écran « Étiquettes groupées » EST LUI-MEME UN MODAL
//  (`labelsBatchForm` appelle `openModal`). Mon `lbPickEmp` appelait `openModal` A SON TOUR.
//
//  `openModal` fait `modal.innerHTML = html` : ce n'est PAS une pile, c'est un REMPLACEMENT.
//  L'appeler depuis un modal ouvert DETRUIT le contexte de travail en cours.
//
//  REGLE GRAVEE (v1363) : UN SELECTEUR QUI INTERROMPT UNE SAISIE DOIT S'AFFICHER *DANS* LA SAISIE,
//  JAMAIS PAR-DESSUS.
//
//  ET LE CORRECTIF CONTENAIT LE BUG QU'IL CORRIGEAIT : `labelsBatchForm()` fait `_lbLignes = []`.
//  Ma restauration d'ecran l'appelait — donc elle EFFACAIT ce qu'elle voulait sauver.
//  Une reinitialisation legitime devient destructrice quand on la rappelle dans un contexte
//  qu'elle n'a pas prevu.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? fa() : fa; b = (typeof fb === 'function') ? fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '\n      EXCEPTION : ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

const grab = (n) => { const i = SRC.indexOf('function ' + n + '('); if (i < 0) throw new Error('introuvable: ' + n);
  let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); } } };
const sansCom = (t) => t.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

console.log('\n-- LE BUG : openModal appele DEPUIS un modal ouvert');
T('lbPickEmp n appelle PLUS openModal (il ecrasait l ecran des etiquettes)',
  () => /openModal\s*\(/.test(sansCom(grab('lbPickEmp'))), false);
T('... il bascule un selecteur EN PLACE (_empOuvert)',
  () => sansCom(grab('lbPickEmp')).includes('_empOuvert'), true);
T('lbSetEmp ne fait PLUS closeModal (il fermait tout l ecran)',
  () => /closeModal\s*\(/.test(sansCom(grab('lbSetEmp'))), false);
console.log('      -> openModal fait `modal.innerHTML = html` : REMPLACEMENT, pas empilement.');

console.log('\n-- LA RESTAURATION apres la modale de confirmation');
const R = sansCom(grab('lbRestaurerEcran'));
T('lbRestaurerEcran existe (la modale de dispatch ecrase l ecran, il faut le reconstruire)',
  () => R.length > 0, true);
T('... et SAUVEGARDE _lbLignes AVANT de rappeler labelsBatchForm',
  () => R.indexOf('_sauvegarde = _lbLignes') < R.indexOf('await labelsBatchForm'), true);
T('... puis les RESTAURE apres',
  () => R.includes('_lbLignes = _sauvegarde'), true);
console.log('      -> labelsBatchForm fait `_lbLignes = []`. Sans cette precaution, la');
console.log('         restauration EFFACAIT exactement ce qu elle voulait sauver.');

console.log('\n-- LE PRINCIPE, verifie sur TOUTES les fonctions de ligne');
['lbAddLigne', 'lbDelLigne', 'lbSetLigne', 'lbPickEmp', 'lbSetEmp', 'lbRenderLignes'].forEach(f => {
  T(`${f} n ouvre aucun modal (elles vivent DANS le modal des etiquettes)`,
    () => /openModal\s*\(/.test(sansCom(grab(f))), false);
});

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- aucun modal imbrique')));
process.exit(ko ? 1 : 0);
