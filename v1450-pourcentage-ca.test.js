'use strict';
// v1450 — POURCENTAGE DE CA PAR LIGNE, DANS LES VUES DE DÉTAIL. Ben : « je veux qu'à chaque fois
// que c'est possible, devant chaque transaction ça indique le pourcentage de CA que ça représente
// sur la totalité du calcul réalisé. Exemple quand je clique sur CA du mois, et que je clique sur
// le détail du CA encaissé, chaque commande indique le pourcentage que ça représente sur la
// totalité du calcul. »
//
// Portée retenue : les 3 écrans de détail CA/encaissement existants — détail du mois
// (caMonthDetail), détail d'une période glissante jour/semaine/année (caPeriodeDetail, v1444),
// et détail d'une catégorie du bilan URSSAF (comptaCategorieDetail, v1412/v1419). Un seul calcul
// partagé (pctDuTotal), pas un par écran.
//
// Sur le second point de Ben (« chaque ligne indique le nom du client […] pas un montant avec un
// numéro ») : audit du code montre que les 3 écrans l'affichent déjà (caMonthDetail : esc(l.nom) ;
// caPeriodeDetail : esc(l.nom) ; comptaCategorieDetail : nom client mis en avant depuis v1419).
// Gardé sous forme de garde statique ci-dessous plutôt que re-modifié sans raison de le faire.
const { extractFunction, extractConstLine, APP, stripComments } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. pctDuTotal — fonction pure, en isolation ----
{
  const fnSrc = extractFunction('pctDuTotal');
  // privacyMasked() est un état global de l'app (mode confidentialité) ; on le stubbe à false par
  // défaut pour tester le calcul lui-même, et à true dans un test dédié.
  function build(masked){
    return new Function('privacyMasked', `${fnSrc}\nreturn pctDuTotal;`)(() => masked);
  }
  const pct = build(false);

  check('A. contribution normale : 25 sur 100 → "25 %"', pct(25, 100) === '25 %');
  check('A. contribution totale : 100 sur 100 → "100 %"', pct(100, 100) === '100 %');
  check('A. ligne NÉGATIVE (reprise/avoir) : pourcentage négatif, pas sa valeur absolue',
    pct(-25, 100) === '-25 %');
  check('A. petite contribution (<1%) : "< 1 %" plutôt que "0 %" trompeur',
    pct(0.5, 100) === '< 1 %');
  check('A. petite contribution négative : "-< 1 %"', pct(-0.5, 100) === '-< 1 %');
  check('A. total nul : chaîne vide, pas de division par zéro ni NaN%', pct(10, 0) === '');
  check('A. montant nul sur un total réel : "0 %"', pct(0, 100) === '0 %');
  check('A. arrondi à l\'entier le plus proche (33,33… → 33 %)', pct(1, 3) === '33 %');

  const pctMasque = build(true);
  check('A. mode confidentialité : pourcentage masqué comme euro() masque le montant',
    pctMasque(25, 100) === '•••');
}

// ---- B. RÉCONCILIATION — la somme des pourcentages d'une répartition complète retombe sur
// 100 % (aux arrondis près). Si ce n'était pas le cas, les pourcentages mentiraient collectivement
// même si chacun est individuellement correct. ----
{
  const fnSrc = extractFunction('pctDuTotal');
  const pct = new Function('privacyMasked', `${fnSrc}\nreturn pctDuTotal;`)(() => false);
  const lignes = [120.50, 45.00, 78.25, 12.00, 34.75];
  const total = lignes.reduce((s,v)=>s+v, 0);
  const sommePct = lignes.reduce((s,v)=>s + parseInt(pct(v, total), 10), 0);
  check('B. la somme des pourcentages arrondis reste proche de 100 (±2 points, tolérance d\'arrondi)',
    Math.abs(sommePct - 100) <= 2);
}

// ---- C. Câblage réel : les 3 écrans de détail CA appellent bien pctDuTotal ----
{
  const srcMois = extractFunction('caMonthDetail');
  check('C. caMonthDetail affiche le pourcentage sur les lignes de commande', /pctDuTotal\(l\.montant,\s*total\)/.test(srcMois));
  check('C. caMonthDetail affiche aussi le pourcentage sur les lignes de marché',
    (srcMois.match(/pctDuTotal\(l\.montant,\s*total\)/g)||[]).length >= 2);

  const srcPeriode = extractFunction('caPeriodeDetail');
  check('C. caPeriodeDetail (jour/semaine/année) affiche le pourcentage', /pctDuTotal\(l\.montant,\s*total\)/.test(srcPeriode));

  const srcCat = extractFunction('comptaCategorieDetail');
  check('C. comptaCategorieDetail (bilan URSSAF) affiche le pourcentage', /pctDuTotal\(l\.montant,\s*total\)/.test(srcCat));
}

// ---- D. Garde statique : le nom du client reste affiché en clair sur les 3 écrans (le second
// point de la demande de Ben, déjà en place — vérifié plutôt que supposé) ----
{
  const srcMois = extractFunction('caMonthDetail');
  check('D. caMonthDetail affiche le nom (esc(l.nom)), pas seulement un montant', /esc\(l\.nom\)/.test(srcMois));

  const srcPeriode = extractFunction('caPeriodeDetail');
  check('D. caPeriodeDetail affiche le nom (esc(l.nom))', /esc\(l\.nom\)/.test(srcPeriode));

  const srcCat = extractFunction('comptaCategorieDetail');
  check('D. comptaCategorieDetail met le nom du client EN AVANT (pas juste une référence numérique)',
    /const nom = l\.client \? esc\(l\.client\)/.test(srcCat));
}

// ---- E. Comportemental : le bloc HTML généré par caPeriodeDetail contient bien le bon
// pourcentage pour un jeu de lignes connu (pas seulement "la fonction est appelée quelque part") ----
async function testRenduReel(){
  const srcApercu = extractFunction('caPeriodeDetail');
  const srcDeps = [
    extractFunction('pctDuTotal'),
    extractConstLine('round3'),
  ].join('\n');
  const lignes = [
    { date:'2026-08-01', nom:'Alice', montant:150, oid:1 },
    { date:'2026-08-02', nom:'Bob', montant:50, oid:2 },
  ];
  // Total = 200 → Alice 75 %, Bob 25 %.
  const registry = { };
  const doc = { getElementById: id => registry[id] || null };
  const runner = new Function('document', 'privacyMasked', 'esc', 'fmtDate', 'money2', 'euro',
    '_caPeriodeBornes', '_caLabelLongGran', 'openModal', 'today', `
    ${srcDeps}
    ${srcApercu}
    let capture = null;
    openModal = (html) => { capture = html; };
    return (async () => {
      _caLignesCache = ${JSON.stringify(lignes)};
      await caPeriodeDetail('jour', '2026-08-01');
      return capture;
    })();
  `);
  const capturedHtml = await runner(doc, () => false, s=>s, d=>d, n=>Math.round(n*100)/100, n=>n+' €',
    () => ({debut:'2026-08-01', fin:'2026-08-02'}), () => 'test', ()=>{}, () => '2026-08-03');

  check('E. le rendu réel montre 75 % pour Alice (150/200)', capturedHtml && /Alice[\s\S]{0,220}75 %/.test(capturedHtml));
  check('E. le rendu réel montre 25 % pour Bob (50/200)', capturedHtml && /Bob[\s\S]{0,220}25 %/.test(capturedHtml));
}

testRenduReel().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
