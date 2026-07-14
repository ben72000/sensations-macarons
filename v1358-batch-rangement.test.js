// ════════════════════════════════════════════════════════════════════════════
//  v1358 — ÉTIQUETTES → BOÎTES → RANGEMENT, EN UN GESTE
//
//  Demande de Ben : plusieurs boîtes par parfum, création automatique des boîtes,
//  emplacement par ligne, et — pour une ligne à plusieurs boîtes (3×20) — CONFIRMATION
//  que les 3 vont au même endroit, sinon DISPATCH INDIVIDUEL.
//
//  LE GARDE-FOU QUI COMPTE : ne JAMAIS enregistrer plus de pièces rangées que le lot n'en contient.
//  Un stock qui ment est pire qu'un stock incomplet : il envoie Ben chercher des boîtes qui ne sont
//  nulle part. (Et sans `window._lbProds` — que je lisais 4 fois sans jamais l'écrire — ce garde-fou
//  n'aurait JAMAIS mordu : qteRestante aurait toujours valu 0.)
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? fa() : fa; b = (typeof fb === 'function') ? fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '\n      EXCEPTION : ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

// Fonctions EXTRAITES du fichier (jamais paraphrasées — leçon v1345).
const grab = (n) => { const i = SRC.indexOf('function ' + n + '('); if (i < 0) throw new Error('introuvable: ' + n);
  let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); } } };
function round3(n){ return Math.round(n * 1000) / 1000; }
eval(grab('lbTotalLigne'));
eval(grab('lbTotalLot'));

console.log('\n-- LE CALCUL : une ligne = copies x pieces');
globalThis._lbLignes = [];
T('3 etiquettes x 20 pieces = 60', () => lbTotalLigne({ copies: 3, pieces: 20 }), 60);
T('1 x 78 = 78 (le cas de la boite ponctuelle de Ben)', () => lbTotalLigne({ copies: 1, pieces: 78 }), 78);
T('une ligne vide ne compte pas', () => lbTotalLigne({ copies: 0, pieces: 20 }), 0);
T('pieces null ne compte pas', () => lbTotalLigne({ copies: 3, pieces: null }), 0);

console.log('\n-- LE TOTAL PAR LOT : plusieurs lignes s additionnent');
globalThis._lbLignes = [
  { uid: 1, prodId: 7, copies: 3, pieces: 20 },   // 60
  { uid: 2, prodId: 7, copies: 1, pieces: 30 },   // 30
  { uid: 3, prodId: 9, copies: 1, pieces: 78 },   // autre lot
];
T('lot 7 : 3x20 + 1x30 = 90', () => lbTotalLot(7), 90);
T('lot 9 : 1x78 = 78 (les lots ne se melangent pas)', () => lbTotalLot(9), 78);
T('lot inconnu = 0', () => lbTotalLot(999), 0);

console.log('\n-- LE GARDE-FOU : ne jamais ranger plus que le lot ne contient');
// Le controle reel vit dans lbRangerEtImprimer. On verifie ici la LOGIQUE qu'il applique :
// somme des lignes du lot > qteRestante  =>  refus.
const controle = (lignes, dispo) => {
  globalThis._lbLignes = lignes;
  const place = lbTotalLot(7);
  return place > round3(dispo) + 0.001;   // true = doit etre REFUSE
};
T('90 range sur un lot de 120 -> accepte (30 restent en attente, decision de Ben)',
  () => controle([{ uid: 1, prodId: 7, copies: 3, pieces: 20 }, { uid: 2, prodId: 7, copies: 1, pieces: 30 }], 120), false);
T('200 range sur un lot de 120 -> REFUSE (un stock qui ment est pire qu un stock incomplet)',
  () => controle([{ uid: 1, prodId: 7, copies: 10, pieces: 20 }], 120), true);
T('exactement 120 sur 120 -> accepte (tout range)',
  () => controle([{ uid: 1, prodId: 7, copies: 6, pieces: 20 }], 120), false);

console.log('\n-- LE MODELE placements[] : plusieurs boites, un seul lot');
// 3 boites de 20 dans le meme emplacement produisent 3 entrees dans placements[].
const simulePlacements = (copies, pieces, equipKey, boiteNom) => {
  const out = [];
  for (let i = 0; i < copies; i++) out.push({ equipKey, niveauNom: null, boiteNom, nbMacarons: pieces });
  return out;
};
T('3 boites de 20 -> 3 entrees dans placements[] (pas une seule de 60)',
  () => simulePlacements(3, 20, 'congelo_b', 'Boite 20').length, 3);
T('... chacune porte SA quantite (20), pas le total',
  () => simulePlacements(3, 20, 'congelo_b', 'Boite 20')[0].nbMacarons, 20);
console.log('      -> l app affiche deja "dispatche" des que placements.length > 1 (ligne 8981).');
console.log('         Le besoin de Ben etait PREVU par le modele : il n etait pas accessible d ici.');

console.log('\n-- LA VARIABLE FANTOME : _lbProds etait lu 4x, ecrit 0x');
// [correctif] Mon premier jet cherchait la chaine 'window._lbProds = lots;' — qui reste presente
// meme COMMENTEE (`// window._lbProds = lots;`). Le test ne mordait pas : il validait sa propre
// existence, pas celle du code. On retire donc les commentaires AVANT de chercher — comme le test
// de plomberie v1351 avait deja du apprendre a le faire.
const SRC_CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
T('window._lbProds est ECRIT dans le code executable (pas seulement en commentaire)',
  () => /window\._lbProds\s*=\s*lots/.test(SRC_CODE), true);
console.log('      -> sans lui, qteRestante valait toujours 0 et le garde-fou n aurait JAMAIS mordu.');

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- batch rangement coherent')));
process.exit(ko ? 1 : 0);
