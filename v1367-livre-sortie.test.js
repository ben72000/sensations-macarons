// ════════════════════════════════════════════════════════════════════════════
//  v1367 — LA PAGE D'IMPRESSION DU LIVRE DOIT AVOIR UNE SORTIE
//
//  Ben : « quand je clique sur impression livre de recette je n'ai aucun moyen de ressortir de
//  cette page, je suis contraint de fermer complètement l'application pour ressortir. »
//
//  CAUSE : imprimerLivreRecettes ouvrait une page HTML SANS bouton de fermeture et SANS fermeture
//  après impression. Sur iPhone en PWA, window.open('_blank') ne donne pas de barre de navigateur :
//  aucune sortie => Ben piégé.
//
//  REGLE (v1357, re-appliquee) : une page sans issue est un cul-de-sac. Toute vue plein ecran
//  ouverte par l'app doit offrir une sortie visible.
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

const F = grab('imprimerLivreRecettes');

console.log('\n-- LA PAGE A UNE BARRE DE SORTIE');
T('la page contient une barre d actions (.lr-bar)', () => F.includes('lr-bar'), true);
T('un bouton « Fermer » est présent', () => F.includes('✕ Fermer'), true);
T('le bouton Fermer tente window.close() ET history.back() en repli',
  () => F.includes('window.close()') && F.includes('history.back()'), true);
console.log('      -> window.close() marche pour une vraie popup ; history.back() pour la fenêtre courante.');

console.log('\n-- LA BARRE EST MASQUÉE À L IMPRESSION (elle ne doit pas salir le PDF)');
T('@media print masque la barre', () => /@media print\s*\{[^}]*lr-bar[^}]*display:\s*none/.test(F), true);

console.log('\n-- FERMETURE APRÈS IMPRESSION');
T('window.onafterprint ferme la page', () => F.includes('window.onafterprint'), true);

console.log('\n-- ON NE FORCE PLUS print() AUTOMATIQUEMENT (re-piège iPhone)');
T('plus d appel automatique à w.print() au chargement',
  () => /setTimeout\(\(\)\s*=>\s*\{\s*try\{\s*w\.print\(\)/.test(F), false);
console.log('      -> Ben déclenche l impression via le bouton, ou ferme. Il garde la main.');

console.log('\n-- L AUTRE IMPRESSION (bilan) AVAIT DÉJÀ CE PATTERN — cohérence');
T('le bilan mensuel se ferme aussi après impression (référence)',
  () => SRC.includes('window.onafterprint=function(){window.close();}'), true);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- le livre imprimé a une sortie')));
process.exit(ko ? 1 : 0);
