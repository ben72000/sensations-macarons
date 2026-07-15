// ════════════════════════════════════════════════════════════════════════════
//  v1364 — ATELIER CHRONO : arrêt direct + minuteur supprimé
//
//  Ben, depuis la fenêtre raccourci (fenêtre flottante) :
//   1. « toutes les difficultés à arrêter des étapes en cours » — le bouton ⏹ ne réagissait pas.
//   2. « je voudrais supprimer l'option qui lance un chronomètre » (le minuteur des passives).
//   3. « les étapes semi-actives doivent pouvoir se cumuler » — NE PAS TOUCHER (marche déjà).
//
//  CAUSE DU 1 : ⏹ appelait `prodTaskStopGuard`, qui pour une meringue partagée ouvrait un
//  `openModal`. La fenêtre flottante vit dans sa PROPRE couche (`#chronoFloatHost`) : le modal
//  s'ouvrait DERRIÈRE elle, invisible et incliquable. Même défaut que le crash étiquettes (v1363).
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? fa() : fa; b = (typeof fb === 'function') ? fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '  EXCEPTION ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

const grab = (n) => { const i = SRC.indexOf('function ' + n + '('); if (i < 0) return '';
  let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); } } };

console.log('\n-- 1. LE BOUTON ⏹ ARRÊTE DIRECTEMENT (plus de modal perdu derrière la fenêtre flottante)');
T('le bouton ⏹ de la fenêtre flottante appelle prodTaskStopDirect',
  () => /onclick="prodTaskStopDirect\('\$\{t\.id\}'\)"/.test(SRC), true);
T('prodTaskStopDirect existe',
  () => grab('prodTaskStopDirect').length > 0, true);

const direct = grab('prodTaskStopDirect');
T('prodTaskStopDirect n OUVRE AUCUN modal (c était la cause du bug)',
  () => direct.includes('openModal'), false);
T('... il appelle prodTaskStop (l arrêt réel)',
  () => direct.includes('prodTaskStop('), true);
T('... et rafraîchit la fenêtre flottante sur place',
  () => direct.includes('chronoFloatRenderBody'), true);
console.log('      -> une couche flottante ne déclenche pas de modal par-dessus elle (règle v1363).');

console.log('\n-- 2. LE MINUTEUR EST SUPPRIMÉ : une passive démarre comme un chrono normal');
// Corps SANS commentaires : un commentaire qui CITE atShowDurPrompt (pour expliquer sa suppression)
// ne doit pas compter comme un appel. Piège déjà rencontré en v1358 (test décoratif).
const launch = grab('atLaunch').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
T('atLaunch n appelle PLUS atShowDurPrompt (le pop-up de durée)',
  () => launch.includes('atShowDurPrompt'), false);
T('atLaunch démarre directement le chrono (prodTaskStartSmart)',
  () => launch.includes('prodTaskStartSmart'), true);
console.log('      -> on MESURE le temps réel, on ne PRÉDIT plus une durée à l avance.');

console.log('\n-- 3. LES LIBELLÉS "minuteur" ne trompent plus l utilisateur');
// Ils annonçaient un minuteur qui ne se lance plus. Retirés du rendu.
const CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
T('plus aucun libellé "minuteur" affiché à côté des étapes passives',
  () => /class="at-(next-mini|pp)">minuteur</.test(CODE), false);

console.log('\n-- LE CUMUL DES SEMI-ACTIVES N EST PAS TOUCHÉ (Ben : "marche déjà")');
// prodTaskStartSmart, qui porte le cumul, est toujours le point de démarrage — inchangé.
T('atLaunch démarre toujours via prodTaskStartSmart (cumul préservé)',
  () => launch.includes('prodTaskStartSmart'), true);
T('les étapes passives passent toujours par le même démarrage que les actives',
  () => !launch.includes('atShowDurPrompt') && launch.includes('prodTaskStartSmart'), true);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- atelier chrono : arrêt direct + sans minuteur')));
process.exit(ko ? 1 : 0);
