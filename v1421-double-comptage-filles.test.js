/* ============================================================================
   TESTS — v1421 : LE DOUBLE COMPTAGE DES COMMANDES FILLES
   ----------------------------------------------------------------------------
   Ben, en comptabilité : « les commandes filles sont présentes avec un montant
   associé […] jamais comptabiliser deux fois le montant déjà encaissé des mois
   plus tôt ! »

   LA CHAÎNE DU BUG (cascade née de mes propres correctifs v1407) :
     1. orderPayStatus renvoie 'Payé' pour une fille (elle EST réglée, via la mère) ;
     2. syncPaymentFields PERSISTE donc `paiement:'Payé'` sur la fille ;
     3. la fille n'a AUCUN registre paiements[] (son argent vit sur la mère) ;
     4. → paiementsDe tombait dans son repli « commande legacy payée » et
        FABRIQUAIT un paiement fantôme du montant total, daté au jour du retrait.

   DEUXIÈME FAUTE, plus grave, trouvée en remontant les consommateurs : `histo`
   était SURCHARGÉ. La v1411 rangeait une commande mère avec `histo:true`, or
   `histo` veut dire « reprise d'historique » — une trentaine de lecteurs s'en
   servent pour EXCLURE du chiffre d'affaires. Ranger une mère faisait donc
   disparaître son encaissement RÉEL de la base URSSAF pendant que ses filles en
   fabriquaient un faux. L'argent était au mauvais endroit des deux côtés.

   Propriétés verrouillées ici :
     1. Une fille ne porte JAMAIS d'encaissement imputable au CA — même avec un
        registre parasite (garde placée AVANT la branche registre).
     2. Une fille reste SOLDÉE du point de vue commande (orderPaid/orderBalance) :
        deux questions distinctes, deux fonctions distinctes.
     3. Le CA tombe au mois de l'encaissement RÉEL, jamais au mois du retrait.
     4. CONTRE-ÉPREUVE : sans rattachement, le repli legacy s'applique toujours.
     5. `estVenteAgregable` exclut les filles des agrégats (CA, pièces, marges).
     6. Gardes statiques : ordre de la garde dans paiementsDe, `histo` plus jamais
        écrit au rangement d'une mère, exemptions de traçabilité, migration câblée.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine, APP } = require('./_extract');

// ── module sous test : les VRAIES fonctions d'app.js, évaluées en isolation ──
function buildModule(){
  const code = `
    ${extractConstLine('money2')}
    ${extractConstLine('marcheDate')}
    ${extractFunction('monthKey')}
    const ymKey = d => monthKey(d);
    const round3 = n => Math.round((+n||0)*1000)/1000;
    ${extractFunction('paiementsDe')}
    ${extractFunction('orderPaid')}
    ${extractFunction('orderBalance')}
    ${extractFunction('orderPayStatus')}
    ${extractFunction('syncPaymentFields')}
    ${extractFunction('estVenteAgregable')}
    ${extractFunction('commandesFillesDe')}
    ${extractFunction('reliquatCommandeMere')}
    ${extractFunction('caMarcheEncaisse')}
    ${extractFunction('caEncaisseParMois')}
    return { paiementsDe, orderPaid, orderBalance, orderPayStatus, syncPaymentFields,
             estVenteAgregable, commandesFillesDe, reliquatCommandeMere, caEncaisseParMois };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

function run(){
const M = buildModule();

// Le scénario de Ben : 480 € encaissés EN UNE FOIS en janvier sur la commande
// mère, puis TROIS retraits à des dates inconnues d'avance (mars, mai, juillet).
function scenario(){
  const mere = M.syncPaymentFields({ id:1, date:'2026-01-10', montant:480, mereEnAttente:true,
    paiements:[{date:'2026-01-10', montant:480, moyen:'Virement'}] });
  const fille = (id,d,m) => M.syncPaymentFields({ id, date:d, montant:m, commandeMereId:1, paiements:[] });
  const filles = [ fille(2,'2026-03-04',160), fille(3,'2026-05-12',160), fille(4,'2026-07-02',160) ];
  return { mere, filles, orders:[mere, ...filles] };
}

// ── CAS 1 : le déclencheur historique est bien toujours là ────────────────────
// On ne corrige PAS le symptôme (le statut « Payé » d'une fille est voulu : elle
// est réellement réglée). On corrige la conséquence comptable. Si ce cas passait
// au rouge, c'est que quelqu'un a « réparé » le mauvais bout de la chaîne.
{
  const { filles } = scenario();
  eq(filles[0].paiement, 'Payé',          'CAS1 · syncPaymentFields persiste bien « Payé » sur la fille');
  eq(filles[0].paiements.length, 0,       'CAS1 · … et elle n\'a aucun registre de paiement');
  eq(M.orderPayStatus(filles[0]), 'Payé', 'CAS1 · statut affiché : Payé (via la mère)');
}

// ── CAS 2 : aucune fille ne porte d'encaissement imputable au CA ──────────────
{
  const { mere, filles } = scenario();
  eq(M.paiementsDe(filles[0]), [], 'CAS2 · paiementsDe(fille) = aucun encaissement');
  eq(M.paiementsDe(filles[1]), [], 'CAS2 · idem 2e fille');
  eq(M.paiementsDe(filles[2]), [], 'CAS2 · idem 3e fille');
  eq(M.paiementsDe(mere).map(p=>[p.date, p.montant]), [['2026-01-10', 480]],
     'CAS2 · la mère porte l\'encaissement réel, entier, à sa date');
}

// ── CAS 3 : deux questions distinctes — imputation ≠ solde ────────────────────
// Si orderPaid renvoyait 0 pour une fille, l'app la relancerait comme impayée et
// l'invariant « Payé ⇒ solde nul » crierait à l'anomalie. La fille EST soldée.
{
  const { filles } = scenario();
  eq(M.orderPaid(filles[0]), 160,    'CAS3 · orderPaid(fille) = son montant (elle est soldée)');
  eq(M.orderBalance(filles[0]), 0,   'CAS3 · orderBalance(fille) = 0 (aucune relance)');
  eq(M.paiementsDe(filles[0]).length, 0, 'CAS3 · … et pourtant zéro encaissement imputé au CA');
}

// ── CAS 4 : le CA tombe au mois de l'encaissement, jamais au mois du retrait ──
{
  const { orders } = scenario();
  const R = M.caEncaisseParMois(orders, []);
  eq(R.parMois['2026-01'], 480,       'CAS4 · janvier = 480 € (l\'encaissement réel)');
  eq(R.parMois['2026-03'], undefined, 'CAS4 · mars (retrait) = rien');
  eq(R.parMois['2026-05'], undefined, 'CAS4 · mai (retrait) = rien');
  eq(R.parMois['2026-07'], undefined, 'CAS4 · juillet (retrait) = rien');
  eq(Object.values(R.parMois).reduce((a,b)=>a+b,0), 480,
     'CAS4 · total annuel = 480 € — encaissé UNE fois, pas 960 €');
  eq(R.enAttente, 0, 'CAS4 · rien « en attente » (la fille n\'est pas une créance)');
}

// ── CAS 5 : la mère NON rangée (le cas réel de Ben, case jamais cochée) ───────
// C'est la configuration qui produisait le double comptage : la mère restait
// dans le fil, comptée normalement, ET ses filles fabriquaient leur fantôme.
{
  const { mere, filles } = scenario();
  const mereNonRangee = Object.assign({}, mere); delete mereNonRangee.mereEnAttente;
  const R = M.caEncaisseParMois([mereNonRangee, ...filles], []);
  eq(Object.values(R.parMois).reduce((a,b)=>a+b,0), 480,
     'CAS5 · mère non rangée : toujours 480 € au total, pas 960 €');
  eq(R.parMois['2026-01'], 480, 'CAS5 · … et toujours en janvier');
}

// ── CAS 6 : registre PARASITE sur une fille (import, saisie antérieure) ───────
// La garde est placée AVANT la branche registre, exprès : un registre traînant
// sur une fille ne doit pas pouvoir la faire réapparaître dans le CA.
{
  const { mere } = scenario();
  const parasite = { id:5, date:'2026-06-01', montant:160, commandeMereId:1,
                     paiements:[{date:'2026-06-01', montant:160, moyen:'CB'}] };
  eq(M.paiementsDe(parasite), [], 'CAS6 · registre parasite sur une fille : ignoré');
  const R = M.caEncaisseParMois([mere, parasite], []);
  eq(R.parMois['2026-06'], undefined,  'CAS6 · juin ne reçoit rien');
  eq(Object.values(R.parMois).reduce((a,b)=>a+b,0), 480, 'CAS6 · total inchangé');
}

// ── CAS 7 : CONTRE-ÉPREUVE — le repli legacy doit rester INTACT ───────────────
// Preuve par réintroduction : si la garde était trop large (toute commande sans
// registre), les vraies commandes legacy « Payé » disparaîtraient du CA.
{
  const _warn = console.warn; console.warn = ()=>{};   // l'avertissement legacy est attendu ici
  const seule = { id:9, date:'2026-03-04', montant:160, paiement:'Payé', paiements:[] };
  eq(M.paiementsDe(seule).map(p=>p.montant), [160],
     'CAS7 · commande legacy « Payé » SANS rattachement : repli toujours actif');
  const R = M.caEncaisseParMois([seule], []);
  eq(R.parMois['2026-03'], 160, 'CAS7 · … et elle compte bien à sa date');
  console.warn = _warn;
}

// ── CAS 8 : agrégats (CA, pièces, marges, panier) — la fille n'est pas une vente
{
  const { mere, filles } = scenario();
  eq(M.estVenteAgregable(mere), true,       'CAS8 · la mère est la vente');
  eq(M.estVenteAgregable(filles[0]), false, 'CAS8 · la fille est un retrait, pas une vente');
  eq([mere, ...filles].filter(M.estVenteAgregable).reduce((s,o)=>s+o.montant,0), 480,
     'CAS8 · CA agrégé = 480 € (et non 960 € : contenu compté une seule fois)');
  const enAttente = { id:7, date:'2026-02-01', montant:50, paiement:'En attente' };
  eq(M.estVenteAgregable(enAttente), false, 'CAS8 · une commande non payée reste hors agrégat');
}

// ── CAS 9 : le reliquat de la mère n'est pas affecté par la correction ────────
{
  const { mere, orders } = scenario();
  const r = M.reliquatCommandeMere(mere, orders);
  eq(r.nbFilles, 3,             'CAS9 · 3 retraits rattachés');
  eq(r.montantCouvertParFilles, 480, 'CAS9 · couverture = 480 €');
  eq(r.reste, 0,                'CAS9 · reste à retirer = 0');
  eq(r.entierementRetiree, true,'CAS9 · commande entièrement retirée');
  eq(M.commandesFillesDe(1, orders).map(o=>o.id), [2,3,4], 'CAS9 · les filles sont bien rattachées');
}

// ── CAS 10 : GARDES STATIQUES — la garde est en TÊTE de paiementsDe ──────────
// L'ordre n'est pas cosmétique : placée après la branche registre, la garde
// laisserait passer le cas 6. On le gèle.
{
  const src = extractFunction('paiementsDe');
  const iGarde = src.indexOf('commandeMereId');
  const iRegistre = src.indexOf('o.paiements');
  vrai(iGarde > -1,               'CAS10 · paiementsDe connaît commandeMereId');
  vrai(iRegistre > -1,            'CAS10 · … et a bien une branche registre');
  vrai(iGarde < iRegistre,        'CAS10 · la garde des filles précède la branche registre');
  vrai(/commandeMereId\s*!=\s*null\s*\)\s*return\s*\[\]/.test(src),
                                  'CAS10 · elle renvoie un tableau VIDE (pas un montant à zéro)');
}

// ── CAS 11 : `histo` n'est plus écrit au rangement d'une commande mère ───────
// C'était la seconde faute : ranger ≠ reprise d'historique. Un `histo:true` posé
// sur une mère la sortait de la base URSSAF.
{
  const src = extractFunction('saveCmd');
  const i = src.indexOf('f_mereEnAttente');
  vrai(i > -1, 'CAS11 · saveCmd gère toujours la case « commande mère »');
  const bloc = src.slice(i, i + 600);
  vrai(/mereEnAttente\s*:\s*true/.test(bloc),  'CAS11 · cocher la case pose mereEnAttente:true');
  eq(/mereEnAttente\s*:\s*true\s*,\s*histo\s*:\s*true/.test(bloc), false,
     'CAS11 · … et n\'écrit PLUS histo:true avec (v1411 corrigé)');
  vrai(/histo\s*:\s*false/.test(bloc),
     'CAS11 · décocher lève l\'ancien histo:true posé par la v1411');
}

// ── CAS 12 : une mère rangée ne réclame JAMAIS de traçabilité ────────────────
{
  const ens = extractFunction('ensureOrderDecremented');
  vrai(/mereEnAttente\s*===\s*true\s*\)\s*return\s+true/.test(ens),
     'CAS12 · ensureOrderDecremented exempte une mère rangée');
  const save = extractFunction('saveCmd');
  const iw = save.indexOf('_wantLivree');
  vrai(iw > -1, 'CAS12 · saveCmd calcule toujours _wantLivree');
  vrai(/_wantLivree\s*=[^;]*mereEnAttente\s*!==\s*true/.test(save.slice(iw, iw+300)),
     'CAS12 · … et une mère rangée ne déclenche pas « Lier des batchs »');
}

// ── CAS 13 : la mère sort du fil des commandes, sans quitter la comptabilité ──
// ⚠️ CETTE ASSERTION A ÉTÉ RÉÉCRITE EN v1425, et il faut dire pourquoi : elle gelait
// l'exclusion À LA SOURCE, dans renderCmd, juste avant la construction de `_cmdCache`.
// Or ce cache alimente la recherche, les tags et le filtre jour — la mère devenait
// introuvable (retour de Ben). Le test figeait donc un bug. Le masquage se fait
// désormais à l'AFFICHAGE : hors des groupes opérationnels de cmdFilter, mais dans le
// cache et dans un repli dédié. Un test qui verrouille le mauvais comportement est pire
// qu'une absence de test : il donne l'assurance de ne pas régresser vers le correct.
{
  const rc = extractFunction('renderCmd');
  eq(/filter\(o=>!o\.histo && o\.mereEnAttente!==true\)/.test(rc), false,
     'CAS13 · plus d\'exclusion à la source (elle rendait la mère introuvable)');
  const cf = extractFunction('cmdFilter');
  vrai(/estMereRangee\(o\)\)\{\s*meresRangees\.push\(r\);\s*return;\s*\}/.test(cf),
     'CAS13 · le fil opérationnel écarte les mères rangées à l\'affichage');
  vrai(/Commandes mères rangées/.test(cf),
     'CAS13 · … et les regroupe dans un repli qui reste atteignable');
}

// ── CAS 14 : la migration existe ET est câblée au démarrage ──────────────────
// Une migration écrite mais jamais appelée, c'est la v1342 : deux vagues de
// silence. On vérifie les DEUX bouts.
{
  const mig = extractFunction('migrateMereHistoV1421');
  vrai(/mereEnAttente\s*===\s*true/.test(mig) && /histo\s*===\s*true/.test(mig),
     'CAS14 · la migration ne vise QUE les mères rangées portant histo');
  vrai(/histo\s*:\s*false/.test(mig),   'CAS14 · … et lève le drapeau');
  vrai(/auditLog\.add/.test(mig),       'CAS14 · chaque correction est journalisée (auditable)');
  vrai(APP.includes('await migrateMereHistoV1421()'),
     'CAS14 · … et la migration est bien appelée au démarrage');
}

// ── CAS 15 : le livre des recettes n'inscrit pas la recette deux fois ────────
{
  const src = extractFunction('livreDesRecettes');
  vrai(/commandeMereId\s*!=\s*null\s*\)\s*return;/.test(src),
     'CAS15 · une commande fille n\'ajoute pas de ligne au livre des recettes');
}

// ── CAS 16 : repasser une fille en devis est refusé, et pour la bonne raison ──
// Avant, elle était bloquée par un paiement FANTÔME. Le fantôme disparu, il
// fallait un refus explicite : sinon la conversion cassait le reliquat de la mère.
{
  const src = extractFunction('cmdToDevis');
  const i = src.indexOf('commandeMereId');
  vrai(i > -1, 'CAS16 · cmdToDevis teste le rattachement à une mère');
  vrai(i < src.indexOf('paiementsDe'), 'CAS16 · … avant même le garde-fou des paiements');
  vrai(/commandeMereId\s*!=\s*null/.test(extractFunction('cmdToDevisConfirm')),
     'CAS16 · le refus est doublé à la confirmation (pas seulement à l\'affichage)');
}

// ── résultat ──
console.log('\n=== TESTS — v1421 : double comptage des commandes filles ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
