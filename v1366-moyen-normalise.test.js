// ════════════════════════════════════════════════════════════════════════════
//  v1366 — UN MÊME MOYEN DE PAIEMENT N'A QU'UN LIBELLÉ
//
//  Ben, dans son livre des recettes :
//   1. « J'ai deux transactions qui devraient être ensemble : "carte" et "carte bancaire". »
//   2. « Il y a encore des lignes qui affichent "acompte" alors qu'elles devraient afficher le
//      moyen de paiement. »
//
//  MÊME NATURE : un moyen écrit sous plusieurs formes est ventilé en plusieurs colonnes.
//   - « Carte bancaire » (ma faute v1360, marchés) vs « Carte » (PAY_METHODS partout ailleurs)
//   - « Acompte » qui revient dans la colonne MOYEN via le repli `o.reglement` (v1362 ne
//     neutralisait que `p.moyen`, pas `o.reglement`)
//
//  REGLE (v1366) : un meme moyen n'a qu'UN libelle. Normalisation A LA LECTURE — sinon
//  l'historique deja enregistre reste scinde meme apres correction de l'ecriture.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? fa() : fa; b = (typeof fb === 'function') ? fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '  EXCEPTION ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

// On EXTRAIT le vrai normaliseur du code (pas une paraphrase — lecon v1345).
const i = SRC.indexOf('const _normMoyen = (m) =>');
const j = SRC.indexOf('};', i) + 2;
// On transforme le `const _normMoyen = ...` en expression evaluable (un const dans eval ne fuit pas
// dans le scope). On extrait le corps de la fleche et on rebatit la fonction.
const code = SRC.slice(i, j).replace('const _normMoyen = ', '');
const _normMoyen = eval('(' + code.replace(/;\s*$/, '') + ')');

console.log('\n-- 1. « CARTE » ET « CARTE BANCAIRE » FUSIONNENT');
T('"Carte bancaire" -> "Carte"', () => _normMoyen('Carte bancaire'), 'Carte');
T('"Carte" -> "Carte" (inchange)', () => _normMoyen('Carte'), 'Carte');
T('"CB" -> "Carte"', () => _normMoyen('CB'), 'Carte');
T('"carte bancaire" (minuscules) -> "Carte"', () => _normMoyen('carte bancaire'), 'Carte');
console.log('      -> une seule colonne Carte dans la ventilation, tous canaux confondus.');

console.log('\n-- 2. « ACOMPTE » NE PEUPLE JAMAIS LA COLONNE MOYEN');
T('"Acompte" -> null (ce n est pas un moyen)', () => _normMoyen('Acompte'), null);
T('"acompte" (minuscules) -> null', () => _normMoyen('acompte'), null);
console.log('      -> null bascule vers le repli, puis « Non précisé » — jamais « Acompte ».');

console.log('\n-- LE REPLI o.reglement EST NORMALISE AUSSI (le bug qui restait)');
T('le livre normalise le repli o.reglement, pas seulement p.moyen',
  () => /_moyenReel \|\| _normMoyen\(o\.reglement\)/.test(SRC), true);
console.log('      -> v1362 ne neutralisait que p.moyen : « Acompte » revenait par o.reglement.');

console.log('\n-- LES MOYENS LEGITIMES SONT INTACTS');
T('"Virement" inchange', () => _normMoyen('Virement'), 'Virement');
T('"Espèces" inchange', () => _normMoyen('Espèces'), 'Espèces');
T('"Chèque" inchange', () => _normMoyen('Chèque'), 'Chèque');
T('vide -> null (pas de faux moyen)', () => _normMoyen(''), null);

console.log('\n-- PLUS DE « Carte bancaire » EN DUR DANS LE LIVRE');
const CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
T('aucune ligne du livre ne pousse moyen:"Carte bancaire"',
  () => /moyen:\s*'Carte bancaire'/.test(CODE), false);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- moyen de paiement normalise')));
process.exit(ko ? 1 : 0);
