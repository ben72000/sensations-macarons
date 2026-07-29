/* ============================================================================
   TESTS — v1424 : LE RESTE À ENCAISSER S'AFFICHE MÊME SANS ACOMPTE
   ----------------------------------------------------------------------------
   Ben : « une commande à venir qui n'a aucun acompte doit afficher la somme
   totale comme elle le fait déjà et juste à droite en rouge le montant restant
   à encaisser. Une commande unique sur une semaine qui doit encaisser 100 € et
   qui n'a encore rien encaissé doit afficher 1 • 100 € • reste 100 € »

   CE QU'IL Y AVAIT AVANT (v1340) : l'en-tête de semaine n'affichait le reste
   QUE si un acompte avait été encaissé — le reste étant jugé redondant avec le
   total. Il ne l'est pas : « 100 € » dit ce que VAUT la semaine, « reste 100 € »
   dit ce qui n'est PAS ENCORE RENTRÉ. C'est le second chiffre qui pilote la
   trésorerie, et c'était précisément celui qui disparaissait quand rien n'avait
   été encaissé — c'est-à-dire dans le cas le plus courant.

   Propriétés verrouillées ici :
     1. cmdTotauxLot calcule le reste sans acompte (reste = total).
     2. Un acompte partiel réduit le reste, jamais le total.
     3. Un trop-perçu ne vient JAMAIS effacer le reste d'une autre commande.
     4. Une commande fille (payée sur sa mère) ne gonfle pas le reste.
     5. L'en-tête de semaine ET l'en-tête du bloc « À venir » affichent le reste
        dès qu'il est dû, sans condition d'acompte.
     6. Une semaine entièrement réglée d'avance dit « soldé » en vert, et non
        « reste 0,00 € » en rouge — une alerte pour rien est une alerte de moins
        qu'on lira le jour où elle compte.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// L'en-tête de semaine « À venir » est peint par `cmdFilter` (pas par renderCmd, qui ne fait que
// préparer le cache et déléguer). Vérifié : l'extraction de cmdFilter est COMPLÈTE (elle contient
// bien la fin de la fonction), donc les gardes statiques ci-dessous voient réellement le code visé
// — c'est le faux vert de la v1419, où l'on assertait sur une extraction tronquée.

function buildModule(){
  const code = `
    ${extractConstLine('money2')}
    ${extractFunction('paiementsDe')}
    ${extractFunction('orderPaid')}
    ${extractFunction('cmdTotauxLot')}
    return { cmdTotauxLot, orderPaid, paiementsDe };
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

// ── CAS 1 : L'EXEMPLE DE BEN — une commande, 100 €, rien encaissé ────────────
{
  const T = M.cmdTotauxLot([{ o:{ id:1, date:'2026-08-12', montant:100, paiements:[] } }]);
  eq(T.nb, 1,             'CAS1 · 1 commande sur la semaine');
  eq(T.total, 100,        'CAS1 · total 100 €');
  eq(T.encaisse, 0,       'CAS1 · rien encaissé');
  eq(T.reste, 100,        'CAS1 · reste 100 € — le chiffre que Ben veut voir');
  eq(T.nbAvecAcompte, 0,  'CAS1 · aucun acompte');
  vrai(T.reste > 0.01,    'CAS1 · la condition d\'affichage du reste est remplie');
}

// ── CAS 2 : un acompte partiel réduit le reste, jamais le total ──────────────
{
  const T = M.cmdTotauxLot([{ o:{ id:2, date:'2026-08-12', montant:100,
    paiements:[{date:'2026-07-01', montant:30, moyen:'Virement'}] } }]);
  eq(T.total, 100,       'CAS2 · le total reste 100 €');
  eq(T.encaisse, 30,     'CAS2 · 30 € encaissés');
  eq(T.reste, 70,        'CAS2 · reste 70 €');
  eq(T.nbAvecAcompte, 1, 'CAS2 · un acompte compté');
}

// ── CAS 3 : semaine entièrement réglée d'avance → plus rien à encaisser ──────
// C'est le seul cas où le rouge n'a rien à dire.
{
  const T = M.cmdTotauxLot([{ o:{ id:3, date:'2026-08-12', montant:100,
    paiements:[{date:'2026-07-01', montant:100, moyen:'Virement'}] } }]);
  eq(T.reste, 0,      'CAS3 · reste 0 €');
  eq(T.encaisse, 100, 'CAS3 · tout est encaissé');
  eq(T.reste > 0.01, false, 'CAS3 · aucune alerte rouge à afficher');
}

// ── CAS 4 : plusieurs commandes dans la semaine, dont certaines sans acompte ─
{
  const T = M.cmdTotauxLot([
    { o:{ id:4, date:'2026-08-10', montant:100, paiements:[] } },
    { o:{ id:5, date:'2026-08-12', montant:250, paiements:[{date:'2026-07-02', montant:50, moyen:'CB'}] } },
    { o:{ id:6, date:'2026-08-14', montant:60,  paiements:[] } },
  ]);
  eq(T.nb, 3,        'CAS4 · 3 commandes');
  eq(T.total, 410,   'CAS4 · total 410 €');
  eq(T.encaisse, 50, 'CAS4 · 50 € d\'acompte au total');
  eq(T.reste, 360,   'CAS4 · reste 360 €');
}

// ── CAS 5 : un trop-perçu ne paie pas la commande d'à côté ───────────────────
// Invariant hérité de la v1340 : le reste dû ne doit jamais être « absorbé » par
// un excédent encaissé ailleurs — sinon la semaine annoncerait moins à encaisser
// qu'il n'y en a réellement.
{
  const T = M.cmdTotauxLot([
    { o:{ id:7, date:'2026-08-10', montant:100, paiements:[{date:'2026-07-01', montant:130, moyen:'CB'}] } },
    { o:{ id:8, date:'2026-08-12', montant:100, paiements:[] } },
  ]);
  eq(T.total, 200,     'CAS5 · total 200 €');
  eq(T.encaisse, 100,  'CAS5 · seuls 100 € s\'appliquent réellement (jamais plus que le montant)');
  eq(T.tropPercu, 30,  'CAS5 · 30 € de trop-perçu, isolés');
  eq(T.reste, 100,     'CAS5 · reste 100 € — le trop-perçu ne l\'efface pas');
}

// ── CAS 6 : une commande FILLE ne gonfle pas le reste ────────────────────────
// Son argent a été encaissé sur la mère (v1421) : l'annoncer « à encaisser »
// ferait attendre à Ben de l'argent déjà rentré.
{
  const T = M.cmdTotauxLot([{ o:{ id:9, date:'2026-08-12', montant:160,
    commandeMereId:1, paiement:'Payé', paiements:[] } }]);
  eq(T.total, 160,   'CAS6 · la fille a bien un montant');
  eq(T.encaisse, 160,'CAS6 · … réputé encaissé (via la mère)');
  eq(T.reste, 0,     'CAS6 · rien à encaisser dessus');
}

// ── CAS 7 : entrées dégradées — pas d'exception, pas de chiffre inventé ──────
{
  eq(M.cmdTotauxLot([]).reste, 0,      'CAS7 · lot vide → reste 0');
  eq(M.cmdTotauxLot(null).total, 0,    'CAS7 · lot absent → total 0');
  const vide = M.cmdTotauxLot([{o:null}]);
  eq([vide.total, vide.reste, vide.encaisse], [0,0,0], 'CAS7 · ligne vide : aucun chiffre inventé');
  const neg = M.cmdTotauxLot([{ o:{ id:10, montant:-50, paiements:[] } }]);
  eq(neg.total, 0, 'CAS7 · un montant négatif ne crée pas de reste négatif');
}

// ── CAS 8 : l'en-tête de SEMAINE affiche le reste sans condition d'acompte ───
{
  const src = extractFunction('cmdFilter');
  const i = src.indexOf('_resteSem');
  vrai(i > -1, 'CAS8 · l\'en-tête de semaine calcule toujours son reste');
  const bloc = src.slice(i, i + 400);
  vrai(/T\.reste\s*>\s*0\.01/.test(bloc),
     'CAS8 · la condition porte sur le RESTE DÛ, plus sur l\'existence d\'un acompte');
  eq(/_resteSem\s*=\s*T\.encaisse\s*>\s*0\s*\?/.test(src), false,
     'CAS8 · l\'ancienne condition « seulement s\'il y a eu un acompte » a disparu');
  vrai(/reste \$\{euro\(T\.reste\)\}/.test(bloc), 'CAS8 · le libellé annonce « reste <montant> »');
  vrai(/#b3261e/.test(bloc),                      'CAS8 · … en rouge, comme demandé');
}

// ── CAS 9 : l'en-tête affiche aussi le nombre et le total (format de Ben) ────
// « 1 • 100 € • reste 100 € » : les trois informations, dans cet ordre.
{
  const src = extractFunction('cmdFilter');
  const i = src.indexOf('${lot.length} · ${euro(T.total)}');
  vrai(i > -1, 'CAS9 · nombre puis total, séparés par « · »');
  vrai(src.slice(i, i+80).includes('${_resteSem}'), 'CAS9 · … et le reste juste à droite');
}

// ── CAS 10 : une semaine soldée dit « soldé », elle ne crie pas en rouge ─────
{
  const src = extractFunction('cmdFilter');
  const i = src.indexOf('_resteSem');
  const bloc = src.slice(i, i + 400);
  vrai(/soldé/.test(bloc),   'CAS10 · le cas « plus rien à encaisser » est nommé');
  vrai(/#3f7d52/.test(bloc), 'CAS10 · … en vert, pas en rouge');
  vrai(/T\.encaisse\s*>\s*0/.test(bloc),
     'CAS10 · « soldé » suppose qu\'on a bien encaissé quelque chose (pas une semaine à 0 €)');
}

// ── CAS 11 : l'en-tête du bloc « À venir » suit la même règle ────────────────
// Deux lignes du même panneau ne doivent pas répondre à deux questions
// différentes : le demi-correctif est un correctif qui ment à moitié.
{
  const src = extractFunction('cmdFilter');
  const i = src.indexOf('_resteAVenir');
  vrai(i > -1, 'CAS11 · le bloc « À venir » a son propre calcul de reste');
  const bloc = src.slice(i, i + 400);
  vrai(/AV\.reste\s*>\s*0\.01/.test(bloc), 'CAS11 · même condition : le reste dû');
  eq(/AV\.encaisse>0\?` · <b style="color:#b3261e">reste/.test(src), false,
     'CAS11 · l\'ancienne condition a disparu là aussi');
}

// ── CAS 12 : le bandeau détaillé reste réservé aux acomptes ──────────────────
// « Total − déjà encaissé = reste » n'a de sens que s'il y a eu un encaissement ;
// l'afficher avec « − 0 € » ajouterait une ligne qui n'apprend rien.
{
  const src = extractFunction('cmdFilter');
  vrai(/_bandeau\s*=\s*AV\.encaisse\s*>\s*0/.test(src),
     'CAS12 · le bandeau détaillé reste conditionné à un acompte réel');
}

// ── résultat ──
console.log('\n=== TESTS — v1424 : reste à encaisser visible même sans acompte ===\n');
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
