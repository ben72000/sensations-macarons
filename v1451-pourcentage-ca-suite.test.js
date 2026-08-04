'use strict';
// v1451 — POURCENTAGE DE CA, SUITE. Continuation de v1450 (« à chaque fois que c'est possible »)
// : recherche de tous les autres écrans où une liste de transactions individuelles somme à un
// total CA visible à l'écran — le même modèle que l'exemple de Ben (CA du mois → détail), pas
// juste les 3 écrans déjà couverts. Trois de plus trouvés et corrigés :
//   - comptaFluxDetail   : « CA facturé » / « CA encaissé » par période (deux sous-totaux
//     distincts — officiel et reprises d'historique, jamais mélangés)
//   - renderAvoirs       : journal des remboursements émis, total affiché en tête d'écran
//   - renderPanierMoyen  : détail des commandes derrière le panier moyen, avec un
//     « Total sur la sélection » affiché explicitement
// Volontairement écartés : les cartes de règlement par commande (pas de total DE GROUPE affiché,
// une carte = une commande) et les listes d'anomalies (le montant n'est pas censé sommer à un
// total cohérent — ce sont des écarts, pas une répartition).
const { extractFunction, extractConstLine, APP, stripComments } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Câblage réel : les 3 écrans appellent bien pctDuTotal ----
{
  const srcFlux = extractFunction('comptaFluxDetail');
  check('A. comptaFluxDetail affiche le pourcentage sur les lignes principales (contre `total`)',
    /pctDuTotal\(l\.montant,\s*total\)/.test(srcFlux));
  check('A. comptaFluxDetail affiche le pourcentage des reprises contre LEUR PROPRE sous-total (pas `total`)',
    /pctDuTotal\(l\.montant,\s*reprisesTotal\)/.test(srcFlux));

  const srcAvoirs = extractFunction('renderAvoirs');
  check('A. renderAvoirs affiche le pourcentage sur chaque avoir', /pctDuTotal\(a\.montant,\s*total\)/.test(srcAvoirs));

  const srcPanier = extractFunction('renderPanierMoyen');
  check('A. renderPanierMoyen affiche le pourcentage contre R.total (affiché comme "Total sur la sélection")',
    /pctDuTotal\(l\.montant,\s*R\.total\)/.test(srcPanier));
}

// ---- B. RÉCONCILIATION comptaFluxDetail — les DEUX sous-totaux (officiel / reprises) restent
// séparés dans les pourcentages, exactement comme ils le sont dans l'affichage (« Hors URSSAF »).
// Mélanger les deux aurait fait mentir soit les lignes officielles, soit les reprises. ----
{
  const fnSrc = extractFunction('pctDuTotal');
  const pct = new Function('privacyMasked', `${fnSrc}\nreturn pctDuTotal;`)(() => false);

  // Jeu simulé : 2 lignes officielles (100 + 50 = 150), 1 reprise (30, sous-total séparé).
  const officiel = [100, 50];
  const totalOfficiel = officiel.reduce((s,v)=>s+v,0);
  const reprises = [30];
  const totalReprises = reprises.reduce((s,v)=>s+v,0);

  check('B. ligne officielle : pourcentage calculé sur le total OFFICIEL (100/150 = 67%)',
    pct(100, totalOfficiel) === '67 %');
  check('B. ligne de reprise : pourcentage calculé sur SON PROPRE sous-total (30/30 = 100%), pas mélangé au total officiel',
    pct(30, totalReprises) === '100 %');
  check('B. la même reprise rapportée (par erreur) au total officiel donnerait un chiffre différent — preuve que les deux bases ne sont pas interchangeables',
    pct(30, totalOfficiel) !== pct(30, totalReprises));
}

// ---- C. Comportemental : rendu réel de renderAvoirs sur un jeu de données connu ----
async function testAvoirsReel(){
  const src = extractFunction('renderAvoirs');
  const fnSrc = extractFunction('pctDuTotal');
  const docs = [
    { type:'avoir', statut:'emis', numero:'AV-1', date:'2026-08-01', montant:60, clientId:1, orderId:10, motif:'Erreur' },
    { type:'avoir', statut:'emis', numero:'AV-2', date:'2026-08-02', montant:20, clientId:2, orderId:11, motif:'Casse' },
  ];
  // Total = 80 → AV-1 75 %, AV-2 25 %.
  const db = {
    documents: { where: () => ({ equals: () => ({ toArray: async () => docs }) }) },
    clients: { toArray: async () => [{id:1,nom:'Alice'},{id:2,nom:'Bob'}] },
  };
  const registry = { main: { innerHTML:'' } };
  const doc = { getElementById: id => registry[id] || null };
  const runner = new Function('document', 'db', 'privacyMasked', 'esc', 'fmtDate', 'money2', 'euro', `
    ${fnSrc}
    ${src}
    return (async () => { await renderAvoirs(); return document.getElementById('main').innerHTML; })();
  `);
  const html = await runner(doc, db, () => false, s=>s, d=>d, n=>Math.round(n*100)/100, n=>n+' €');
  check('C. rendu réel : AV-1 (60/80) affiche 75 %', /AV-1[\s\S]{0,400}75 %/.test(html));
  check('C. rendu réel : AV-2 (20/80) affiche 25 %', /AV-2[\s\S]{0,400}25 %/.test(html));
}

testAvoirsReel().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
