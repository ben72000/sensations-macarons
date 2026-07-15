// ════════════════════════════════════════════════════════════════════════════
//  v1362 — « ACOMPTE » N'EST PAS UN MOYEN DE PAIEMENT
//
//  Ben : « Pourquoi certains acomptes sont notés dans le livre des recettes comme "virement" et
//  d'autres comme "acompte" ? L'un empêche pas l'autre non ? »
//
//  IL A RAISON. Le code ecrivait `moyen:'Acompte'` — un STATUT range dans le champ MOYEN.
//
//  DEUX DIMENSIONS INDEPENDANTES :
//    - le MOYEN  = COMMENT l'argent est arrive (virement, CB, especes, cheque...)
//    - le STATUT = CE QUE couvre le reglement (acompte partiel, ou solde)
//  On peut avoir un acompte PAR VIREMENT, puis un solde EN ESPECES.
//
//  CONSEQUENCE COMPTABLE : la ventilation par mode de reglement du LIVRE DES RECETTES etait FAUSSE.
//  Une colonne « Acompte » sans aucun sens comptable, et les vrais virements SOUS-COMPTES.
//  Sur un controle, c'est une ventilation qui ne tombe pas juste.
//
//  REGLE GRAVEE (v1362) : UN STATUT N'EST PAS UN MOYEN.
//  Deux dimensions independantes ne partagent JAMAIS un champ — sinon l'une ecrase l'autre,
//  et le total ment.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? fa() : fa; b = (typeof fb === 'function') ? fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '\n      EXCEPTION : ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

const CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

console.log('\n-- LE BUG : on ecrivait un STATUT dans le champ MOYEN');
T("le code n ecrit PLUS moyen:'Acompte' a la conversion devis->commande",
  () => /moyen:\s*'Acompte'/.test(CODE), false);
T('le moyen REEL de l acompte est desormais lu depuis le devis',
  () => CODE.includes('d.acompteMoyen'), true);
T('... et le statut acompte est stocke dans son PROPRE champ',
  () => /acompte:\s*true/.test(CODE), true);
console.log('      -> deux dimensions, deux champs. L une n ecrase plus l autre.');

console.log('\n-- LE MOYEN EST DESORMAIS DEMANDE A LA SAISIE');
T('un selecteur de moyen existe sur l ecran devis',
  () => CODE.includes('docSetAcompteMoyen'), true);
T('... et il propose les VRAIS moyens (PAY_METHODS), pas une liste inventee',
  () => /PAY_METHODS\.map/.test(CODE), true);

console.log('\n-- L ABSENCE DE MOYEN N EST PAS UNE VALEUR INVENTEE (v1337)');
T('si le moyen n est pas renseigne, on ecrit null — pas une categorie bidon',
  () => CODE.includes("d.acompteMoyen || null"), true);
console.log('      -> « je ne sais pas » se dit null, jamais « Acompte ».');

console.log('\n-- LE LEGACY : les acomptes DEJA saisis portent moyen:"Acompte"');
T('le livre neutralise le moyen legacy « Acompte »',
  // [v1366] la neutralisation passe desormais par _normMoyen (qui renvoie null sur « Acompte »),
  // et couvre AUSSI le repli o.reglement — le bug que Ben a re-signale apres v1362.
  () => CODE.includes('_normMoyen(p.moyen)') && CODE.includes('_normMoyen(o.reglement)'), true);
T('... mais CONSERVE le statut acompte (l information n est pas perdue)',
  () => CODE.includes("p.acompte || p.moyen === 'Acompte'") && CODE.includes("statut = 'Acompte'"), true);
console.log('      -> l info est remise dans la BONNE COLONNE, pas effacee.');
console.log('      -> le vrai moyen est INCONNU a posteriori : on affiche « Non précisé »,');
console.log('         ce qui est la VERITE, plutot que « Acompte », qui n existe pas comme reglement.');

console.log('\n-- LES DEUX DIMENSIONS SONT INDEPENDANTES (le point de Ben)');
// Un acompte par virement, puis un solde en especes : les deux doivent coexister.
const paiements = [
  { montant: 100, moyen: 'Virement', acompte: true },
  { montant: 150, moyen: 'Espèces' },
];
const statutDe = p => (p.acompte || p.moyen === 'Acompte') ? 'Acompte' : 'Encaissement';
const moyenDe  = p => (p.moyen === 'Acompte') ? 'Non précisé' : p.moyen;
T('acompte PAR VIREMENT -> statut=Acompte, moyen=Virement',
  () => [statutDe(paiements[0]), moyenDe(paiements[0])], ['Acompte', 'Virement']);
T('solde EN ESPECES -> statut=Encaissement, moyen=Espèces',
  () => [statutDe(paiements[1]), moyenDe(paiements[1])], ['Encaissement', 'Espèces']);
console.log('      -> « l un empeche pas l autre » (Ben). Exactement.');

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- acompte : statut et moyen separes')));
process.exit(ko ? 1 : 0);
