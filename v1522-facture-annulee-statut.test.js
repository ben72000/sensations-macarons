'use strict';
// v1522 — FACTURE ANNULÉE PUIS RECRÉÉE : « enregistrée comme payée alors que le statut devrait être annulée ».
// Ben : « une facture qui a été annulée puis recréée a été enregistrée comme payée alors que le statut devrait être annulée. Il ne semble pas que
// cette erreur ait provoqué un double comptage de chiffre d'affaires mais cela mériterait d'être contrôlé et d'être sécurisé pour les prochaines fois ».
//
// CAUSES (lues dans le code, reproduites ici) : ① aucun état « annulée » : une facture annulée par avoir restait « Validée » / « Validée · payée » ;
// ② le suivi de règlement se resynchronise sur les paiements de la COMMANDE : dès que la facture recréée est réglée, la facture ANNULÉE (même commande)
// devient « payée » à son tour ; ③ les avoirs étaient rattachés par la COMMANDE, donc à toutes ses factures ; ④ « Annuler » / « Facturer » retrouvaient la
// PREMIÈRE facture de la commande (l'annulée) au lieu de la vivante.
// CA : calculé sur les COMMANDES et leurs paiements, jamais sur le statut des factures → pas de double comptage par cette voie ; le contrôle ajouté le vérifie.
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){ const i = APP.indexOf(marker); if(i < 0) return ''; const j = APP.indexOf('\n}\n', i); return APP.slice(i, j < 0 ? i + 5000 : j + 3); }
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
const srcs = ['function docEstDefinitif(d){', 'function docOrderIdsDe(f){', 'function docAvoirsDeFacture(f, avoirs){', 'function docFactureAnnulee(f, avoirs){', 'function docFactureVivante(factures, avoirs, oid){',
  'function docPatchFactureAnnulee(f, avoirs){', 'function docControleAnnulations(factures, avoirs, orders){', 'function docStatutLabel(d){', 'function docStatutColor(d){'];
const code = srcs.map(m => (m.startsWith('function docEstDefinitif') || m.startsWith('function docOrderIdsDe')) ? APP.slice(APP.indexOf(m), APP.indexOf('\n', APP.indexOf(m))) : fn(m)).join('\n');
check('A. les 9 fonctions sont retrouvées', code.length > 2500 && (code.match(/^function /gm) || []).length === 9);
const api = new Function('money2', '_factPatchRegl', code + '\nreturn { docEstDefinitif, docAvoirsDeFacture, docFactureAnnulee, docFactureVivante, docPatchFactureAnnulee, docControleAnnulations, docStatutLabel, docStatutColor };')
  (money2, (html, total, paye) => html.replace(/réglé \d+/, 'réglé ' + paye));

const F = (id, o) => Object.assign({ id, type: 'facture', statut: 'emise', montant: 100, totalPaye: 0, orderIds: [10], numero: '2026-F-' + id, html: 'réglé ' + ((o && o.totalPaye) || 0) }, o);
const AV = (id, o) => Object.assign({ id, type: 'avoir', statut: 'emis', montant: 100, orderId: 10, factureId: 1, nature: 'annulation' }, o);

// ---------- A. LE SCÉNARIO DE BEN ----------
{
  const vieille = F(1, { statut: 'payee', totalPaye: 100 });   // annulée puis polluée « payée » par les paiements de la commande
  const neuve = F(2, { statut: 'payee', totalPaye: 100 });
  const avoirs = [AV(5)];
  check('A. la facture ANNULÉE par son avoir est reconnue comme annulée', api.docFactureAnnulee(vieille, avoirs) === true);
  check('A. la facture RECRÉÉE (même commande) n\'est PAS annulée : l\'avoir ne vise que la facture 1', api.docFactureAnnulee(neuve, avoirs) === false);
  check('A. ancien comportement (rattachement par commande) aurait annulé les deux : l\'avoir ne compte plus que pour SA facture', api.docAvoirsDeFacture(neuve, avoirs).length === 0 && api.docAvoirsDeFacture(vieille, avoirs).length === 1);
  check('A. avoir ANCIEN sans identifiant de facture : rattaché par la commande comme avant (rien ne bouge rétroactivement)', api.docFactureAnnulee(F(3, {}), [AV(6, { factureId: null })]) === true);
  check('A. avoir partiel : la facture n\'est pas annulée', api.docFactureAnnulee(F(1, {}), [AV(7, { montant: 40 })]) === false);
  check('A. avoir non émis (brouillon/autre statut) : ignoré', api.docFactureAnnulee(F(1, {}), [AV(8, { statut: 'brouillon' })]) === false);
  check('A. un brouillon de facture n\'est jamais « annulée »', api.docFactureAnnulee(F(4, { statut: 'brouillon' }), [AV(9, { factureId: 4 })]) === false);
  // remise en état
  const pt = api.docPatchFactureAnnulee(vieille, avoirs);
  check('A. facture annulée marquée payée : remise en état → statut « emise », réglé 0 €, HTML recalculé', !!pt && pt.statut === 'emise' && pt.totalPaye === 0 && /réglé 0/.test(pt.html));
  check('A. facture annulée déjà saine : rien à réparer', api.docPatchFactureAnnulee(F(1, {}), avoirs) === null);
  check('A. annulation PAR REMBOURSEMENT (argent réellement encaissé) : JAMAIS retouchée', api.docPatchFactureAnnulee(F(1, { statut: 'payee', totalPaye: 100 }), [AV(5, { nature: 'remboursement' })]) === null);
  check('A. avoir ancien sans « nature » (tous des remboursements) : jamais retouchée', api.docPatchFactureAnnulee(F(1, { statut: 'payee', totalPaye: 100 }), [AV(5, { nature: undefined })]) === null);
}

// ---------- B. LA FACTURE VIVANTE D'UNE COMMANDE ----------
{
  const f1 = F(1, {}), f2 = F(2, {}), avoirs = [AV(5)];
  check('B. annulée (1) puis recréée (2) : la vivante est la 2, pas la première trouvée', api.docFactureVivante([f1, f2], avoirs, 10).id === 2);
  check('B. même ordre inversé dans la base : même résultat', api.docFactureVivante([f2, f1], avoirs, 10).id === 2);
  check('B. seule l\'annulée existe : on la retrouve (pour l\'afficher), jamais undefined', api.docFactureVivante([f1], avoirs, 10).id === 1);
  check('B. commande sans facture : null', api.docFactureVivante([f1], avoirs, 99) === null);
  check('B. brouillon de recréation après annulée : le brouillon est la vivante', api.docFactureVivante([f1, F(3, { statut: 'brouillon' })], avoirs, 10).id === 3);
}

// ---------- C. AFFICHAGE DU STATUT ----------
{
  check('C. facture annulée : libellé « Annulée par avoir » (et non « Validée · payée »)', api.docStatutLabel({ type: 'facture', statut: 'payee', _annulee: true }) === '↩︎ Annulée par avoir');
  check('C. facture annulée : couleur violette dédiée', api.docStatutColor({ type: 'facture', statut: 'payee', _annulee: true }) === '#7a4a88');
  check('C. facture normale payée : libellé inchangé', api.docStatutLabel({ type: 'facture', statut: 'payee' }) === '🔒 Validée · payée');
  check('C. devis : libellés inchangés', api.docStatutLabel({ type: 'devis', statut: 'accepte' }) === '✓ Accepté');
}

// ---------- D. LE CONTRÔLE (annulations + CA) ----------
{
  const orders = [{ id: 10, montant: 100 }, { id: 11, montant: 50 }];
  const sain = api.docControleAnnulations([F(1, {}), F(2, {})], [AV(5)], orders);
  check('D. scénario sain (annulée + recréée) : aucune anomalie', !sain.payeesAnnulees.length && !sain.doubleFacturation.length && !sain.avoirsOrphelins.length && !sain.caDouble.length);
  check('D. CA facturé = commandes (150) ; factures vivantes = 100 (la recréée seule), l\'annulée ne compte pas', sain.caFactureCommandes === 150 && sain.caFacturesVivantes === 100);
  const pollue = api.docControleAnnulations([F(1, { statut: 'payee', totalPaye: 100 }), F(2, {})], [AV(5)], orders);
  check('D. facture annulée marquée payée : détectée ET réparable', pollue.payeesAnnulees.length === 1 && pollue.payeesAnnulees[0].reparable === true);
  const dbl = api.docControleAnnulations([F(1, {}), F(2, {})], [], orders);
  check('D. DEUX factures vivantes sur la même commande : double facturation signalée', dbl.doubleFacturation.length === 1 && dbl.doubleFacturation[0].orderId === 10);
  check('D. … et le double comptage de CA potentiel (200 facturés pour 100 de commande) est signalé', dbl.caDouble.length >= 1 && dbl.caDouble.some(x => x.facture === 200 && x.commande === 100));
  const orph = api.docControleAnnulations([F(1, {})], [AV(5, { factureId: 999 })], orders);
  check('D. avoir dont la facture n\'existe pas : signalé', orph.avoirsOrphelins.length === 1);
  const gros = api.docControleAnnulations([F(1, { montant: 130 })], [], orders);
  check('D. une facture vivante supérieure à sa commande : signalée', gros.caDouble.length === 1);
}

// ---------- E. CÂBLAGE DANS L'APP ----------
{
  check('E. la liste exclut les annulées de la resynchronisation des règlements', /if\(f\.type==='facture' && !f\._annulee && \(f\.statut==='emise' \|\| f\.statut==='payee'\)\)/.test(APP));
  check('E. la fiche d\'une facture exclut l\'annulée de la resynchronisation', /if\(d\.type==='facture' && !d\._annulee && \(d\.statut==='emise'\|\|d\.statut==='payee'\)\)/.test(APP));
  check('E. la liste remet en état une annulation polluée (docPatchFactureAnnulee appelée au rendu)', /const pt = docPatchFactureAnnulee\(f, _avoirsRD\)/.test(APP));
  check('E. « Marquer payée » est refusé sur une facture annulée (fiche ET confirmation) et masqué dans la liste', (APP.match(/docFactureAnnulee\(d, await db\.documents\.where\('type'\)\.equals\('avoir'\)/g) || []).length === 2 && /d\.statut==='emise' && !d\._annulee/.test(APP));
  check('E. l\'avoir se rattache à SA facture : docAvoirsDeFacture utilisée sur la fiche', /docAvoirsDeFacture\(d, allDocs\)/.test(APP));
  check('E. « Annuler / Créer un avoir » cible la facture vivante (docFactureAnnulee dans avoirForm)', /_vivantesAF = _defs\.filter\(x=>!docFactureAnnulee\(x, _avoirsAF\)\)/.test(APP));
  check('E. « Facturer » retrouve la facture vivante du lot, plus la première (docFactureAnnulee dans genererFactureMultiple)', /_vivLot = _lot\.filter\(f=>!docFactureAnnulee\(f, _avG\)\)/.test(APP) && /existingAnnulee = existing \? docFactureAnnulee\(existing/.test(APP));
  check('E. avoirForm : la facture retenue est la DERNIÈRE vivante (pas _defs[0])', /const facture = _vivantesAF\.length \? _vivantesAF\[_vivantesAF\.length-1\] :/.test(APP));
  check('E. Facturer : la facture retenue du lot est la DERNIÈRE vivante (pas _lot[0])', /existing = \(_vivLot\.length \? _vivLot\[_vivLot\.length-1\] : \(_lot\.length \? _lot\[_lot\.length-1\] : null\)\) \|\| null;/.test(APP));
  check('E. liens commande/devis → facture : la vivante', /_factOrig = docFactureVivante\(/.test(APP) && /const fact=docFactureVivante\(/.test(APP));
  check('E. bouton « Contrôle annulations » sur l\'écran Devis & Factures', /docAuditAnnulationsUI\(\)" title="Contrôle les factures annulées/.test(APP));
  check('E. la liste n\'est pas masquée par une facture annulée (factParOrder)', /if\(!f\._annulee \|\| !factParOrder\[oid\]\) factParOrder\[oid\]=f/.test(APP));
}

console.log(`v1522 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
