'use strict';
// v1457 — RETOURS DE MARCHÉ : RANGER LES INVENDUS EN BOÎTES. Ben : « dans l'onglet retour marché je
// saisi les quantités retour de chaque parfums ; l'app fait le delta puis propose de ranger chaque
// quantité pour chaque parfums. Sur cet écran je choisi une répartition par boîte […] Je saisie la
// quantité par boîte ainsi que la date de fabrication si elle est connue (proposer un numéro de lot
// existant pour rattacher la quantité à un lot existant) puis l'emplacement pour les ranger
// proprement et distinctement. »
//
// AUDIT PRÉALABLE : l'écran « Retour de marché — invendus » EXISTAIT (saisie par parfum, delta
// pré-calculé, congélateur/frigo/écarté, recongélation interdite si déjà décongelé). Manquaient la
// répartition en boîtes, l'emplacement par boîte, l'étiquette retour, et le bon rattachement.
//
// 🚨 DÉFAUT TROUVÉ ET CORRIGÉ ICI : `marketLineSummary` réduit la provenance à `productionIds[0]`
// (« compat affichage »). Tout le retour était donc crédité au PREMIER lot — un lot pouvait
// récupérer PLUS de pièces qu'il n'en avait fourni, pendant que les autres restaient courts.
//
// TROIS FORKS TRANCHÉS PAR BEN (05/08) : DLC d'origine conservée · ligne « retour marché » non
// rattachée quand la provenance est inconnue · re-créditer les boîtes d'origine quand c'est possible.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const M = new Function(`
  ${extractConstLine('round3')}
  ${extractConstLine('addQty')}
  ${extractConstLine('subQty')}
  ${extractFunction('marketLotsSortisParParfum')}
  ${extractFunction('marketRepartirRetour')}
  return { marketLotsSortisParParfum, marketRepartirRetour, round3 };
`)();

// ---- A. De quels lots vient ce qui est parti (le défaut corrigé) ----
{
  // Sortie FIFO : 40 du lot 1, 60 du lot 2. Rien n'est encore revenu.
  const moves = [
    { marketId:1, productionId:1, type:'sortie', qte:40, parfum:'Pistache' },
    { marketId:1, productionId:2, type:'sortie', qte:60, parfum:'Pistache' },
  ];
  const r = M.marketLotsSortisParParfum(moves);
  check('A. les DEUX lots d\'origine sont retrouvés (pas seulement le premier)', r['Pistache'].length === 2);
  check('A. chaque lot connaît ce qu\'il a fourni', r['Pistache']?.[0]?.sorti===40 && r['Pistache']?.[1]?.sorti===60);
  check('A. « dehors » = ce que chaque lot peut encore reprendre', r['Pistache']?.[0]?.dehors===40 && r['Pistache']?.[1]?.dehors===60);

  // Un retour déjà enregistré réduit ce que le lot peut encore reprendre.
  const moves2 = moves.concat([{ marketId:1, productionId:1, type:'retour', qte:15, parfum:'Pistache' }]);
  const r2 = M.marketLotsSortisParParfum(moves2);
  check('A. un retour déjà fait diminue le « dehors » du bon lot', r2['Pistache']?.[0]?.dehors===25);
  check('A. il ne touche pas l\'autre lot', r2['Pistache']?.[1]?.dehors===60);

  // Don et perte ne reviennent pas en stock : ils ne doivent pas gonfler « dehors ».
  const moves3 = moves.concat([{ marketId:1, productionId:1, type:'don', qte:5, parfum:'Pistache' }]);
  const r3 = M.marketLotsSortisParParfum(moves3);
  check('A. un don ne modifie pas ce qu\'un lot peut reprendre', r3['Pistache']?.[0]?.dehors===40);

  // Sortie « histo » sans lot réel : ignorée (rien à recréditer).
  const r4 = M.marketLotsSortisParParfum([{ marketId:1, productionId:null, type:'sortie', qte:30, parfum:'Vanille', histo:true }]);
  check('A. une sortie historique sans lot ne crée pas de rattachement fantôme', !r4['Vanille'] || r4['Vanille'].length===0);
}

// ---- B. RÉCONCILIATION — un lot ne récupère JAMAIS plus qu'il n'a fourni ----
{
  const lots = [
    { productionId:1, sorti:40, rendu:0, dehors:40 },
    { productionId:2, sorti:60, rendu:0, dehors:60 },
  ];
  // 50 reviennent : 40 pour le lot 1 (son maximum), 10 pour le lot 2.
  const r = M.marketRepartirRetour(lots, 50);
  const total = r.parLot.reduce((s,x)=>s+x.qte,0) + r.nonRattache;
  check('B. RÉCONCILIATION : tout le retour est réparti, rien perdu ni créé', M.round3(total) === 50);
  check('B. le lot 1 ne reçoit que ce qu\'il a fourni (40, pas 50)', r.parLot?.[0]?.qte === 40);
  check('B. le surplus va au lot suivant, pas au premier', r.parLot?.[1]?.productionId===2 && r.parLot?.[1]?.qte===10);
  check('B. rien de non rattaché dans ce cas', r.nonRattache === 0);

  // LE CAS DU DÉFAUT : 50 reviennent alors qu'un seul lot de 40 est sorti.
  const r2 = M.marketRepartirRetour([{ productionId:1, sorti:40, rendu:0, dehors:40 }], 50);
  check('B. le lot plafonne à 40', r2.parLot?.[0]?.qte === 40);
  check('B. les 10 en trop deviennent une ligne « retour marché », pas un lot gonflé', r2.nonRattache === 10);
  check('B. RÉCONCILIATION même dans ce cas', M.round3((r2.parLot?.[0]?.qte||0) + r2.nonRattache) === 50);

  // Aucun lot identifiable (marché historique) : tout part en non rattaché.
  const r3 = M.marketRepartirRetour([], 25);
  check('B. aucun lot connu : tout devient « retour marché »', r3.parLot.length===0 && r3.nonRattache===25);

  // Un lot déjà entièrement rendu ne reprend rien.
  const r4 = M.marketRepartirRetour([{ productionId:1, sorti:40, rendu:40, dehors:0 }], 10);
  check('B. un lot déjà entièrement rendu ne reprend rien', r4.parLot.length===0 && r4.nonRattache===10);
}

// ---- C. DLC : la décision de Ben est bien appliquée (elle N'EST PLUS recalculée) ----
{
  const src = extractFunction('marketAddRetour');
  check('C. la DLC n\'est plus recalculée au retour (computeDlcFromHistory retiré)',
    !/computeDlcFromHistory/.test(src));
  check('C. la DLC est figée pour qu\'un déplacement ultérieur ne la prolonge pas', /dlcAuto=false/.test(src.replace(/\s/g,'')));
  check('C. la règle de sécurité recongélation est CONSERVÉE (non-régression)',
    /aDejaDecongele/.test(src) && /recongélation interdite/i.test(src));
  check('C. le stock est bien recrédité', /addQty\(p\.qteRestante, qte\)/.test(src));
}

// ---- D. La ligne « retour marché » non rattachée ----
{
  const src = extractFunction('marketAddRetourNonRattache');
  check('D. elle crée une VRAIE ligne de production (pas un simple mouvement)', /db\.productions\.add/.test(src));
  check('D. elle est marquée retourMarche pour l\'étiquette spéciale', /retourMarche:\s*true/.test(src));
  check('D. son n° de lot porte le suffixe RM', /'RM'/.test(src));
  check('D. elle exige un emplacement (on ne range pas nulle part)', /Emplacement de rangement du retour obligatoire/.test(src));
  check('D. elle enregistre aussi le mouvement de marché (le vendu reste juste)', /type:'retour'/.test(src));
  check('D. DLC = la plus courte des lots sortis (règle prudente)', /_fusionDlcPlusCourte/.test(src));
  check('D. aucune DLC connue → champ VIDE, jamais une date inventée', /dlcProduit:\s*dlc\s*\|\|\s*''/.test(src));
  check('D. la DLC est figée (dlcAuto:false)', /dlcAuto:\s*false/.test(src));
  check('D. le lot est terminé et rangé, donc immédiatement vendable', /prodStatut:\s*'termine'/.test(src));
}

// ---- E. Le flux en deux étapes et le rangement par boîte ----
{
  const srcForm = extractFunction('marketRetourForm');
  check('E. l\'étape 1 mène désormais au rangement en boîtes', /marketRetourSuivant/.test(srcForm));
  const srcNext = extractFunction('marketRetourSuivant');
  check('E. les écartés ne passent pas par le rangement (rien à ranger)', /ecarte:true/.test(srcNext));
  check('E. si tout est écarté, on exécute directement sans écran inutile', /marketRetourExecuter/.test(srcNext));
  const srcRanger = extractFunction('marketRetourRangerForm');
  check('E. la proposition par défaut impute aux lots d\'origine (FIFO)', /marketRepartirRetour/.test(srcRanger));
  check('E. le reliquat non imputable devient une boîte à part', /nonRattache>0/.test(srcRanger.replace(/\s/g,'')));
  const srcBloc = extractFunction('_retourBoiteBloc');
  check('E. chaque boîte a sa quantité, son rattachement et son emplacement',
    /retourBoiteSet/.test(srcBloc) && /_etiqOptionsEmp/.test(srcBloc));
  check('E. l\'option « provenance non identifiée » est proposée', /provenance non identifiée/.test(srcBloc));
  check('E. l\'écart entre saisi et réparti est affiché (pas d\'erreur silencieuse)',
    /il reste .* à répartir|de trop/.test(srcBloc));
  const srcExec = extractFunction('marketRetourExecuter');
  check('E. une boîte rattachée recrédite son lot d\'origine', /marketAddRetour\(marketId, \+b\.lotId/.test(srcExec));
  check('E. une boîte sans rattachement crée la ligne retour marché', /marketAddRetourNonRattache/.test(srcExec));
  check('E. un échec sur une boîte n\'interrompt pas les autres', /echecs\.push/.test(srcExec));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
