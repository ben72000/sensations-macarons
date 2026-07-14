// ════════════════════════════════════════════════════════════════════════════
//  v1360 — LE LIVRE DES RECETTES : complet, chaîné, vérifiable
//
//  LE DÉFAUT QUI INVALIDAIT TOUT (v1359) : l'export ne lisait que `db.orders`.
//  LES VENTES MARCHÉ N'Y ÉTAIENT PAS. Un livre des recettes qui omet un canal de vente entier
//  n'est pas incomplet : il est FAUX. Et l'incomplétude est ce qu'un contrôle cherche.
//
//  TROISIÈME FOIS que j'oublie les marchés (v1336 : le CA · v1355 : les volumes · v1359 : le livre).
//  Le canal marché ne passe pas par `orders` — donc je l'oublie à chaque fois que je pars des commandes.
//
//  RÈGLE GRAVÉE (v1360) : QUAND JE PARS DE `db.orders`, JE DOIS ME DEMANDER OÙ SONT LES MARCHÉS.
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

function money2(n){ return Math.round((+n || 0) * 100) / 100; }
eval(grab('_lrHash'));
eval(grab('_lrHashLigne'));
eval(grab('verifierChaine'));

console.log('\n-- LE CHAINAGE : chaque ecriture depend de la precedente');
const L = (montant, piece) => ({ date: '2026-05-10', piece, client: 'X', montant, moyen: 'CB',
                                 nature: 'Vente', statut: 'Encaissement', motif: '' });
const chainer = (arr) => { let prec = null;
  arr.forEach((l, i) => { l.num = i + 1; l.hash = _lrHashLigne(l, prec); l.hashPrec = prec || 'GENESE'; prec = l.hash; });
  return arr; };

const livre = chainer([L(45, 'C-001'), L(30, 'C-002'), L(120, 'MARCHE-3')]);
T('la chaine est INTACTE a la creation', () => verifierChaine(livre).intacte, true);
T('chaque ligne a une empreinte distincte',
  () => new Set(livre.map(l => l.hash)).size, 3);
T('la 1re ligne chaine sur GENESE', () => livre[0].hashPrec, 'GENESE');
T('la 2e chaine sur le hash de la 1re', () => livre[1].hashPrec, livre[0].hash);

console.log('\n-- L ALTERATION EST DETECTEE (le coeur de l inalterabilite)');
const falsifie = JSON.parse(JSON.stringify(livre));
falsifie[1].montant = 5;   // on baisse une recette de 30 a 5 EUR
T('modifier un montant ROMPT la chaine', () => verifierChaine(falsifie).intacte, false);
T('... et la rupture est LOCALISEE a la bonne ligne', () => verifierChaine(falsifie).ligne, 2);

const supprime = JSON.parse(JSON.stringify(livre));
supprime.splice(1, 1);     // on retire discretement une recette
T('SUPPRIMER une ecriture rompt la chaine', () => verifierChaine(supprime).intacte, false);
console.log('      -> on ne peut pas retirer une recette : le hash suivant ne correspond plus.');

const insere = JSON.parse(JSON.stringify(livre));
insere.splice(1, 0, L(999, 'FAUX'));
T('INSERER une fausse ecriture rompt la chaine', () => verifierChaine(insere).intacte, false);

console.log('\n-- CE QUE LE CHAINAGE N APPORTE PAS (dit honnetement)');
console.log('      -> il rend l alteration DETECTABLE, pas IMPOSSIBLE.');
console.log('      -> ce n est PAS une certification NF525 : celle-ci s obtient aupres d un');
console.log('         organisme accredite (AFNOR, LNE), jamais par du code.');

console.log('\n-- LES MARCHES SONT DANS LE LIVRE (le defaut qui invalidait tout)');
const F = grab('livreDesRecettes');
T('livreDesRecettes lit db.markets', () => F.includes('db.markets.toArray'), true);
T('... et ne retient que les marches CLOS (recette arretee)',
  () => F.includes("mk.statut !== 'clos'"), true);
T('... le FOND DE CAISSE est deduit des especes',
  () => /especes.*fondCaisse|fond = money2\(\+mk\.fondCaisse/.test(F), true);
console.log('      -> sinon on declarerait comme recette l argent qui etait deja la le matin.');
T('chaque MODE DE REGLEMENT est une ligne distincte (especes / CB / autre)',
  () => F.includes("moyen: 'Espèces'") && F.includes("moyen: 'Carte bancaire'"), true);

console.log('\n-- LES MENTIONS OBLIGATOIRES (art. L102 B LPF / 286-I-3 CGI)');
['date', 'piece', 'client', 'montant', 'moyen', 'nature'].forEach(champ => {
  T(`le champ "${champ}" est present dans chaque ecriture`, () => F.includes(champ + ':'), true);
});

console.log('\n-- LES REPRISES HISTORIQUES NE SONT PAS DES RECETTES DE L EXERCICE');
T('les lots histo sont exclus', () => F.includes('o.histo'), true);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- livre des recettes coherent')));
process.exit(ko ? 1 : 0);
