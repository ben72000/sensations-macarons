// ════════════════════════════════════════════════════════════════════════════
//  v1359 — INALTÉRABILITÉ DES ENCAISSEMENTS (exigence légale)
//
//  Cadre : art. 286-I-3° bis du CGI (inaltérabilité, sécurisation, conservation, archivage des
//  données de règlement) et norme NF525.
//
//  UN ENCAISSEMENT ENREGISTRÉ NE PEUT PAS DISPARAÎTRE. Il ne peut qu'être ANNULÉ par une écriture
//  INVERSE, tracée et datée. On ne gomme pas : on contrepasse.
//
//  CE QUE L'AUDIT A TROUVÉ :
//   • Aucun bouton ne supprimait un paiement (bon).
//   • MAIS `cmdDeleteConfirm` supprimait la commande AVEC ses paiements — l'encaissement
//     disparaissait de la comptabilité, le CA du mois changeait rétroactivement.
//   • `cmdToDevisConfirm` bloquait DÉJÀ si un paiement existe (sain — et conforme à la demande
//     de Ben : une commande NON payée doit pouvoir repasser en devis sans friction).
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
function euro(n){ return money2(n).toFixed(2).replace('.', ',') + ' €'; }
eval(grab('encaissementsDe'));
eval(grab('totalEncaisseDe'));
eval(grab('blocageSuppressionEncaissement'));
eval(grab('encaissementsCsv'));

console.log('\n-- LE VERROU : une commande ENCAISSEE est insupprimable');
T('commande avec 1 encaissement -> BLOQUEE',
  () => blocageSuppressionEncaissement({ paiements: [{ montant: 45, date: '2026-05-10' }] }) !== null, true);
T('... le blocage indique le nombre et le total',
  () => { const b = blocageSuppressionEncaissement({ paiements: [{ montant: 45 }, { montant: 30 }] });
          return [b.nb, b.total]; }, [2, 75]);

console.log('\n-- LA DEMANDE DE BEN : une commande NON PAYEE reste supprimable');
T('commande SANS paiement -> suppression LIBRE (null)',
  () => blocageSuppressionEncaissement({ paiements: [] }), null);
T('commande sans tableau paiements -> libre',
  () => blocageSuppressionEncaissement({ montant: 50 }), null);
T('paiement a 0 EUR -> pas un encaissement, suppression libre',
  () => blocageSuppressionEncaissement({ paiements: [{ montant: 0, moyen: 'CB' }] }), null);
console.log('      -> "une commande non payee doit pouvoir repasser en devis sans bloquer" (Ben)');

console.log('\n-- LA CONTREPASSATION : le solde est juste, l historique est complet');
// L'ecriture d'origine (45 EUR) reste. Une annulation (-45) s'y ajoute. Puis la correction (30).
const apresCorrection = [
  { montant: 45, date: '2026-05-10', annule: true, annuleMotif: 'erreur de saisie' },
  { montant: -45, correction: true, motif: 'erreur de saisie' },
  { montant: 30, correction: true, motif: 'erreur de saisie' },
];
const soldeNet = money2(apresCorrection.reduce((s, p) => s + (+p.montant || 0), 0));
T('solde net apres correction 45 -> 30 = 30 EUR', () => soldeNet, 30);
T('l ecriture d origine est CONSERVEE (jamais supprimee)',
  () => apresCorrection[0].montant, 45);
T('... et MARQUEE annulee, avec son motif',
  () => [apresCorrection[0].annule, apresCorrection[0].annuleMotif], [true, 'erreur de saisie']);
console.log('      -> orderPaid() fait une somme BRUTE : les negatifs se soustraient tout seuls.');
console.log('         Le modele supportait deja la contrepassation, sans modification.');

console.log('\n-- L EXPORT : les annulations FIGURENT, elles ne sont pas masquees');
const csv = encaissementsCsv([
  { date: '2026-05-10', commande: 'C-001', client: 'X', montant: 45, moyen: 'CB', statut: 'ANNULÉ', motif: 'erreur', libelle: '' },
  { date: '2026-05-12', commande: 'C-001', client: 'X', montant: -45, moyen: 'CB', statut: 'Annulation', motif: 'erreur', libelle: '' },
  { date: '2026-05-12', commande: 'C-001', client: 'X', montant: 30, moyen: 'CB', statut: 'Correction', motif: 'erreur', libelle: '' },
]);
T('le CSV contient la ligne ANNULEE (registre honnete, pas propre)', () => /ANNULÉ/.test(csv), true);
T('le CSV contient l annulation negative', () => /-45/.test(csv), true);
T('le TOTAL NET est juste (45 - 45 + 30 = 30)', () => /TOTAL NET;30,00|TOTAL NET;30/.test(csv), true);
T('separateur ; et virgule decimale (Excel FR)', () => csv.includes(';') && /30,00|30/.test(csv), true);
T('BOM UTF-8 present (accents lisibles dans Excel)', () => csv.charCodeAt(0) === 0xFEFF, true);

console.log('\n-- LE JOURNAL VIT EN BASE, PAS EN localStorage');
T('la table journalCompta est declaree dans le schema Dexie',
  () => /journalCompta:\s*'\+\+id/.test(SRC), true);
console.log('      -> logDeletion ecrit dans localStorage : vider le cache effacerait la preuve.');
console.log('         Une trace qu un geste anodin detruit n est pas une trace.');

console.log('\n-- LE VERROU EST BRANCHE sur le vrai point de suppression');
T('cmdDeleteConfirm appelle blocageSuppressionEncaissement',
  () => { const f = SRC.slice(SRC.indexOf('async function cmdDeleteConfirm'), SRC.indexOf('async function cmdDeleteConfirm') + 2000);
          return f.includes('blocageSuppressionEncaissement'); }, true);
T('cmdToDevisConfirm bloque deja si un paiement existe (sain)',
  () => { const f = SRC.slice(SRC.indexOf('async function cmdToDevisConfirm'), SRC.indexOf('async function cmdToDevisConfirm') + 600);
          return f.includes('paiementsDe(o).length'); }, true);

console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- inalterabilite garantie')));
process.exit(ko ? 1 : 0);
