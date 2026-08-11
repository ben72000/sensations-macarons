'use strict';
// v1471 — PICKING GROUPÉ ET SCAN. Ben : « Le picking groupé n'est pas optimisé. Cette fonction doit
// permettre d'agréger les commandes par dates exactes notamment. Ainsi je ne me retrouve pas avec
// l'ensemble des commandes à venir précoché car actuellement c'est ce qui se passe ! » et « le
// picking par scan ne fonctionne pas […] le qr code est bien lu et j'ai bien un écran qui s'affiche
// mais à aucun endroit il est possible de sélectionner la boîte pour consommer une partie de son
// contenu ou pour l'emporter intégralement dans le cadre d'un marché ».
//
// 🚨 CAUSE DU SCAN : `scanAffectResolve` ouvrait `traceProd` — la fiche de TRAÇABILITÉ, un écran de
// CONSULTATION. `scanAffectChooseOrder` faisait exactement ce qu'il fallait mais n'était atteignable
// que depuis un bouton interne d'une fiche production, JAMAIS depuis un scan. On scanne pour AGIR.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Picking groupé : regroupement par date, une seule date pré-cochée ----
{
  const src = extractFunction('pickGroupOpen');
  check('A. les commandes sont regroupées par date de livraison', /parDate/.test(src));
  check('A. les dates sont triées (la plus proche d\'abord)', /dates\s*=\s*Object\.keys\(parDate\)\.sort/.test(src));
  check('A. SEULE la date la plus proche est pré-cochée', /const cochee = \(d === datePremiere\)/.test(src));
  check('A. plus aucune case cochée en dur', !/id="pg_\$\{o\.id\}" checked/.test(src));
  check('A. un bouton coche/décoche toute une date', /pickGroupToggleDate/.test(src));
  check('A. une commande sans macaron est signalée, pas silencieusement absente',
    /aucun macaron à sortir/.test(src));
  check('A. …et n\'est pas pré-cochée (elle n\'apparaîtrait pas à l\'étape suivante)',
    /cochee&&!vide\?'checked':''/.test(src));

  const srcT = extractFunction('pickGroupToggleDate');
  check('A. la bascule inverse l\'état commun (tout coché → tout décoché)',
    /toutCoche = boites\.every/.test(srcT) && /b\.checked = !toutCoche/.test(srcT));
  check('A. elle ne plante pas si la section est vide', /if\(!boites\.length\) return;/.test(srcT));
}

// ---- B. Le scan aboutit sur des ACTIONS, plus sur une fiche de consultation ----
{
  const src = extractFunction('scanAffectResolve');
  check('B. un lot unique ouvre l\'écran d\'actions', /return scanBoiteActions\(matches\[0\]\.id\)/.test(src));
  check('B. il n\'ouvre plus directement la traçabilité', !/return traceProd\(matches\[0\]\.id\)/.test(src));

  const srcA = extractFunction('scanBoiteActions');
  check('B. servir une commande est proposé', /scanAffectChooseOrder\(/.test(srcA));
  check('B. emporter en marché est proposé', /scanBoiteVersMarche\(/.test(srcA));
  check('B. retirer une quantité (casse/don/dégustation) est proposé', /stockAdjChoose\(/.test(srcA));
  check('B. la traçabilité reste accessible, mais comme une option', /traceProd\(/.test(srcA));
  check('B. une boîte vide le dit au lieu d\'offrir des actions impossibles',
    /reste<=0/.test(srcA) && /Cette boîte est vide/.test(srcA));
  check('B. un composant non vendable est refusé explicitement', /prodVendable/.test(srcA));
}

// ---- C. RÉCONCILIATION — la sortie marché porte sur LE LOT SCANNÉ, et le stock reste juste ----
async function testSortieMarche(){
  const src = extractFunction('marketAddSortieDuLot');
  check('C. le lot n\'est PAS choisi en FIFO : c\'est celui qu\'on a scanné', !/sort\(\(a,b\)=>\(a\.date/.test(src));

  const build = (stock, histo) => {
    const store = new Map([[7, { id:7, recipeId:1, lotProduction:'L-B1', qteRestante:stock }]]);
    const moves = []; const journal = [];
    const db = {
      productions:{ get: async id=> store.get(+id) ? Object.assign({},store.get(+id)) : null,
                    update: async (id,patch)=>{ store.set(+id, Object.assign({},store.get(+id),patch)); } },
      recipes:{ toArray: async ()=>[{id:1, produitNom:'Pistache'}] },
      marketMoves:{ add: async m=>{ moves.push(m); } },
      transaction: async (m,a,b,fn)=> (typeof a==='function'?a():(typeof b==='function'?b():fn())),
    };
    const fn = new Function('db','round3','subQty','qty','today','marketIsHisto','logStockMove', `
      ${src}
      return marketAddSortieDuLot;
    `)(db, n=>Math.round((+n||0)*1000)/1000, (a,b)=>Math.round(((+a||0)-(+b||0))*1000)/1000,
       n=>String(n), ()=>'2026-08-11', async()=>!!histo, async m=>{ journal.push(m); });
    return { fn, store, moves, journal };
  };

  // Sortie PARTIELLE : la boîte survit avec le reste.
  {
    const { fn, store, moves, journal } = build(40, false);
    await fn(9, 7, 15);
    check('C. le stock de la boîte scannée est décrémenté (40 − 15 = 25)', store.get(7).qteRestante === 25);
    check('C. un mouvement de marché est enregistré sur CE lot', moves.length===1 && moves[0].productionId===7);
    check('C. le mouvement porte stockAvant/stockApres (traçabilité du marché)',
      moves[0].stockAvant===40 && moves[0].stockApres===25);
    check('C. le parfum est résolu depuis la recette', moves[0].parfum==='Pistache');
    check('C. le journal de stock reçoit une sortie', journal.length===1 && journal[0].sens===-1 && journal[0].qte===15);
    check('C. RÉCONCILIATION : ce qui sort du stock est exactement ce qui part au marché',
      (40 - store.get(7).qteRestante) === moves[0].qte);
  }

  // Boîte entière : le cas « je l'emporte intégralement » de Ben.
  {
    const { fn, store, moves } = build(30, false);
    await fn(9, 7, 30);
    check('C. emporter la boîte entière la vide (30 → 0)', store.get(7).qteRestante === 0);
    check('C. …et enregistre bien 30 en sortie', moves[0].qte === 30);
  }

  // Refus : plus que le contenu, ou quantité nulle. Le stock ne doit pas bouger.
  {
    const { fn, store, moves } = build(10, false);
    let msg='';
    try{ await fn(9, 7, 25); }catch(e){ msg=e.message; }
    check('C. emporter plus que le contenu est refusé', /ne contient que/.test(msg));
    check('C. refus : le stock est intact', store.get(7).qteRestante === 10);
    check('C. refus : aucun mouvement écrit', moves.length === 0);
  }
  {
    const { fn, store } = build(10, false);
    let msg='';
    try{ await fn(9, 7, 0); }catch(e){ msg=e.message; }
    check('C. quantité nulle refusée', /invalide/i.test(msg));
    check('C. …stock intact', store.get(7).qteRestante === 10);
  }

  // Marché historique : on enregistre la donnée SANS toucher au stock (règle existante).
  {
    const { fn, store, moves, journal } = build(20, true);
    await fn(9, 7, 5);
    check('C. marché historique : le stock n\'est PAS décrémenté', store.get(7).qteRestante === 20);
    check('C. marché historique : le mouvement est marqué histo, sans lot', moves[0].histo===true && moves[0].productionId===null);
    check('C. marché historique : rien au journal de stock', journal.length === 0);
  }
}

// ---- D. L'écran « emporter en marché » ----
{
  const src = extractFunction('scanBoiteVersMarche');
  check('D. seuls les marchés NON clos sont proposés', /statut!=='clos'/.test(src));
  check('D. aucun marché ouvert → message utile, pas un écran vide', /Aucun marché ouvert/.test(src));
  check('D. la quantité est bornée au contenu de la boîte', /max="\$\{reste\}"/.test(src));
  check('D. la boîte entière est proposée par défaut', /value="\$\{reste\}"/.test(src));
}

testSortieMarche().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
