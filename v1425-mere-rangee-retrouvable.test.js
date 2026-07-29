/* ============================================================================
   TESTS — v1425 : UNE COMMANDE MÈRE RANGÉE RESTE RETROUVABLE
   ----------------------------------------------------------------------------
   Ben : « Elle semble masquée complètement avec impossibilité de la retrouver
   facilement. Hormis via une commande fille en cliquant sur le raccourci au sein
   de la commande. […] la commande mère doit être archivée sans nécessiter aucun
   rattachement de batchs au départ tout en restant accessible à tout moment ! »

   MA RÉGRESSION, ET ELLE ÉTAIT NETTE : en v1421 j'ai exclu les mères rangées
   dans `renderCmd`, À LA SOURCE — juste avant la construction de `_cmdCache`.
   Or ce cache alimente TOUT le reste de l'écran : la recherche texte, les tags,
   le filtre jour, le compteur. En les retirant du fil j'ai donc aussi retiré la
   possibilité de les chercher. « Ranger » était devenu « effacer ».

   La correction déplace le tri de la SOURCE vers l'AFFICHAGE : la mère est dans
   le cache (donc trouvable), mais hors des trois groupes opérationnels, dans un
   repli « 🧺 Commandes mères rangées » qui s'ouvre dès qu'un filtre est actif.

   Propriétés verrouillées ici :
     1. `estMereRangee` — un seul point de vérité pour la question.
     2. Le cache n'exclut plus que les reprises d'historique.
     3. Une mère rangée ne tombe dans AUCUN des trois groupes opérationnels
        (en cours / à encaisser / terminées) — surtout pas « terminées ».
     4. Elle a son repli, et ce repli s'ouvre quand une recherche est active.
     5. Le chiffre affiché est le reste À RETIRER, pas un solde monétaire dû.
     6. Elle n'exige toujours aucune traçabilité (l'acquis de la v1421 tient).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const code = `
    ${extractConstLine('money2')}
    ${extractFunction('estMereRangee')}
    ${extractFunction('commandesFillesDe')}
    ${extractFunction('reliquatCommandeMere')}
    ${extractFunction('commandesMeresEnAttente')}
    return { estMereRangee, commandesFillesDe, reliquatCommandeMere, commandesMeresEnAttente };
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

// Une mère de 480 € rangée, deux retraits faits sur trois, plus une mère
// entièrement servie (le cas qui disparaissait même de « Paiements en avance »).
function jeu(){
  const mere      = { id:1, date:'2026-01-10', montant:480, mereEnAttente:true, clientId:7,
                      paiements:[{date:'2026-01-10', montant:480, moyen:'Virement'}] };
  const f1        = { id:2, date:'2026-03-04', montant:160, commandeMereId:1, statut:'Livrée', paiement:'Payé' };
  const f2        = { id:3, date:'2026-05-12', montant:160, commandeMereId:1, statut:'Livrée', paiement:'Payé' };
  const mereFinie = { id:4, date:'2025-11-02', montant:200, mereEnAttente:true, clientId:8,
                      paiements:[{date:'2025-11-02', montant:200, moyen:'Espèces'}] };
  const f3        = { id:5, date:'2025-12-01', montant:200, commandeMereId:4, statut:'Livrée', paiement:'Payé' };
  const normale   = { id:6, date:'2026-07-20', montant:90, statut:'Terminée', paiements:[] };
  return { mere, f1, f2, mereFinie, f3, normale,
           tous:[mere, f1, f2, mereFinie, f3, normale] };
}

// ── CAS 1 : un seul point de vérité pour « est-ce une mère rangée ? » ────────
{
  const j = jeu();
  eq(M.estMereRangee(j.mere), true,      'CAS1 · la mère rangée est reconnue');
  eq(M.estMereRangee(j.mereFinie), true, 'CAS1 · … même entièrement servie');
  eq(M.estMereRangee(j.f1), false,       'CAS1 · une fille n\'est pas une mère rangée');
  eq(M.estMereRangee(j.normale), false,  'CAS1 · une commande ordinaire non plus');
  eq(M.estMereRangee(null), false,       'CAS1 · entrée vide → false, pas d\'exception');
  eq(M.estMereRangee({mereEnAttente:'oui'}), false,
     'CAS1 · comparaison STRICTE : une valeur non booléenne ne range rien');
  eq(M.estMereRangee({mereEnAttente:false}), false, 'CAS1 · rangement levé → false');
}

// ── CAS 2 : le cache de l'écran commandes n'exclut plus que les reprises ─────
// C'est LA ligne qui rendait la mère introuvable. Elle est extraite en entier
// (le début de renderCmd tient dans l'extraction), donc la garde voit le code.
{
  const src = extractFunction('renderCmd');
  vrai(/db\.orders\.toArray\(\)\)\.filter\(o=>!o\.histo\)/.test(src),
     'CAS2 · le cache ne filtre plus que sur histo');
  eq(/filter\(o=>!o\.histo && o\.mereEnAttente!==true\)/.test(src), false,
     'CAS2 · l\'exclusion à la source (v1421) a disparu');
  vrai(/_cmdCache\s*=\s*orders\.map/.test(src),
     'CAS2 · … et c\'est bien ce jeu qui alimente le cache (donc la recherche)');
}

// ── CAS 3 : elle ne tombe dans AUCUN groupe opérationnel ────────────────────
// La ranger dans « Terminées » aurait été le mensonge le plus commode : il reste
// peut-être des macarons à retirer.
{
  const src = extractFunction('cmdFilter');
  vrai(/const enCours=\[\], aEncaisser=\[\], terminees=\[\], meresRangees=\[\]/.test(src),
     'CAS3 · un quatrième groupe existe, distinct des trois autres');
  const i = src.indexOf('estMereRangee(o)');
  vrai(i > -1, 'CAS3 · le tri utilise le prédicat partagé');
  vrai(/estMereRangee\(o\)\)\{\s*meresRangees\.push\(r\);\s*return;\s*\}/.test(src),
     'CAS3 · … et sort la commande AVANT tout autre classement');
  const iLivree = src.indexOf("normStatus(o.statut)==='Livrée'");
  vrai(i < iLivree, 'CAS3 · le tri précède le test de livraison (pas de reclassement possible)');
}

// ── CAS 4 : le repli existe, et il s'ouvre dès qu'un filtre est actif ───────
// Sans cela, Ben taperait un nom de client et le résultat resterait caché
// derrière un triangle fermé — introuvable, à nouveau.
{
  const src = extractFunction('cmdFilter');
  vrai(/Commandes mères rangées/.test(src), 'CAS4 · le repli est nommé explicitement');
  vrai(/<details \$\{grouper\?'':'open'\}/.test(src),
     'CAS4 · ouvert quand une recherche ou un tag est actif (grouper vaut faux)');
  vrai(/meresRangees\.length\)\s*\{/.test(src), 'CAS4 · … et masqué s\'il n\'y a aucune mère rangée');
}

// ── CAS 5 : le chiffre montré est le reste À RETIRER, pas un solde dû ────────
// Son argent est encaissé depuis des mois : afficher un « reste à encaisser »
// ici ferait attendre à Ben de l'argent déjà rentré (le bug de la v1421).
{
  const src = extractFunction('cmdFilter');
  vrai(/reliquatCommandeMere\(o, _tousOrders\)/.test(src), 'CAS5 · le repli calcule le reliquat');
  vrai(/à retirer/.test(src),        'CAS5 · le libellé dit « à retirer »');
  vrai(/tout retiré/.test(src),      'CAS5 · une mère entièrement servie est nommée comme telle');
  const i = src.indexOf('Commandes mères rangées');
  eq(/reste \$\{euro\(rel\.reste\)\} à encaisser/.test(src), false,
     'CAS5 · jamais « à encaisser » sur une mère');
  vrai(i > -1, 'CAS5 · le repli est bien celui qu\'on inspecte');
}

// ── CAS 6 : le reliquat, en vrai, sur les deux mères du jeu ─────────────────
{
  const j = jeu();
  const r1 = M.reliquatCommandeMere(j.mere, j.tous);
  eq(r1.nbFilles, 2,              'CAS6 · 2 retraits faits sur la mère de 480 €');
  eq(r1.reste, 160,               'CAS6 · reste 160 € à retirer');
  eq(r1.entierementRetiree, false,'CAS6 · … donc pas terminée');
  const r2 = M.reliquatCommandeMere(j.mereFinie, j.tous);
  eq(r2.reste, 0,                 'CAS6 · la mère de 200 € est entièrement servie');
  eq(r2.entierementRetiree, true, 'CAS6 · … et signalée comme telle');
}

// ── CAS 7 : « Paiements en avance » ne montre que celles qui attendent ──────
// C'est son rôle. Une mère entièrement servie en sort — d'où la nécessité du
// repli du CAS 4, qui lui les montre TOUTES.
{
  const j = jeu();
  const attente = M.commandesMeresEnAttente(j.tous).map(o=>+o.id);
  eq(attente, [1],  'CAS7 · seule la mère avec du reste y figure');
  eq(attente.includes(4), false, 'CAS7 · la mère servie n\'y est plus (rôle de l\'écran)');
}

// ── CAS 8 : l'acquis de la v1421 tient — aucune traçabilité exigée ─────────
{
  const ens = extractFunction('ensureOrderDecremented');
  vrai(/mereEnAttente\s*===\s*true\s*\)\s*return\s+true/.test(ens),
     'CAS8 · une mère rangée n\'exige aucun rattachement de lots');
  const save = extractFunction('saveCmd');
  const iw = save.indexOf('_wantLivree');
  vrai(/mereEnAttente\s*!==\s*true/.test(save.slice(iw, iw+300)),
     'CAS8 · … et ne déclenche pas « Lier des batchs » à l\'enregistrement');
}

// ── CAS 9 : elle reste joignable depuis une de ses filles (chemin existant) ──
{
  // ⚠️ Le raccourci vit dans `cmdRenderInfoMere` — PAS dans `cmdForm`, dont l'extraction est
  // tronquée (7 420 caractères) : une garde écrite sur cmdForm serait un faux vert.
  const src = extractFunction('cmdRenderInfoMere');
  vrai(/Ouvrir la commande mère/.test(src), 'CAS9 · le raccourci depuis une fille est toujours là');
  vrai(/cmdForm\(\$\{mere\.id\}\)/.test(src), 'CAS9 · … et il ouvre bien la mère');
}

// ── CAS 10 : deux boutons d'action sur chaque ligne du repli ────────────────
{
  const src = extractFunction('cmdFilter');
  const i = src.indexOf('Commandes mères rangées');
  const bloc = src.slice(Math.max(0, i-2600), i+200);
  vrai(/cmdView\(\$\{o\.id\}\)/.test(bloc),  'CAS10 · voir le détail');
  vrai(/cmdForm\(\$\{o\.id\}\)/.test(bloc),  'CAS10 · modifier (fonction réellement existante)');
  eq(/cmdEdit\(/.test(bloc), false,          'CAS10 · aucun appel vers une fonction inexistante');
}

// ── résultat ──
console.log('\n=== TESTS — v1425 : la commande mère rangée reste retrouvable ===\n');
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
