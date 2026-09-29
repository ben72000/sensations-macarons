'use strict';
// v1507 — ÉTIQUETTES DE TRAÇABILITÉ CLIENT depuis « Tracer » d'une commande. Ben : « en cliquant sur
// tracer dans commande je dois avoir un bouton distinct dédié au client. Sur chaque étiquette […]
// numéro de lot, le nombre de pièces, la date de fabrication avec l'heure ainsi que la DLC. Chaque
// information est remplie automatiquement mais doit nécessairement pouvoir être modifiée. »
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const M = new Function(`
  ${extractConstLine('DLC_JOURS')}
  ${extractFunction('_etqCliPlusJours')}
  ${extractFunction('_etqCliDateFR')}
  ${extractFunction('_etqCliFabDepuis')}
  ${extractFunction('_etqCliAuto')}
  ${extractFunction('_etqCliTextes')}
  return { _etqCliPlusJours, _etqCliDateFR, _etqCliFabDepuis, _etqCliAuto, _etqCliTextes, DLC_JOURS };
`)();

// Horodatage LOCAL construit sans dépendre du fuseau de la machine de test.
const isoLocal = (y,mo,d,h,mi) => new Date(y, mo-1, d, h, mi).toISOString();

// ---- A. Remplissage automatique d'une étiquette depuis un lot livré ----
{
  const l = M._etqCliAuto({ prodId: 7, produit: 'Pistache', lot: '270926PIS-A', pieces: 24,
    fabIso: isoLocal(2026,9,27,14,35), dlcLot: '2026-10-03', enCongelateur: false, grandFormat: false, dateLivraison: '2026-09-29' });
  check('A. n° de lot repris du lot', l.lot === '270926PIS-A');
  check('A. nombre de pièces = pièces LIVRÉES (24), pas le stock restant du lot', l.pieces === 24);
  check('A. date de fabrication', l.fabDate === '2026-09-27');
  check('A. heure de fabrication (heure locale)', l.fabHeure === '14:35');
  check('A. DLC = la plus prudente : lot 03/10 < livraison + 6 j (05/10)', l.dlc === '2026-10-03');
  check('A. une étiquette par défaut', l.copies === 1);
}

// ---- B. DLC : chaque source peut être la plus prudente ----
{
  const l = M._etqCliAuto({ lot:'X', pieces:10, fabIso: isoLocal(2026,9,28,9,0), dlcLot:'2026-10-20', dateLivraison:'2026-09-29' });
  check('B. lot plus tardif que la règle de livraison → livraison + 6 j (05/10)', l.dlc === '2026-10-05');
  const gf = M._etqCliAuto({ lot:'X', pieces:4, fabIso: isoLocal(2026,9,28,9,0), dlcLot:'2026-10-20', grandFormat:true, dateLivraison:'2026-09-29' });
  check('B. grand format → livraison + 4 j (03/10)', gf.dlc === '2026-10-03');
  const fin = M._etqCliAuto({ lot:'X', pieces:4, dlcLot:'', dateLivraison:'2026-12-29' });
  check('B. passage de mois/année calculé sans décalage (29/12 + 6 j = 04/01)', fin.dlc === '2027-01-04');
}

// ---- C. [SÉCURITÉ] Lot encore au congélateur : sa DLC de 4 mois n'est pas celle du client ----
{
  const l = M._etqCliAuto({ lot:'X', pieces:12, fabIso: isoLocal(2026,9,1,10,0), dlcLot:'2027-01-01', enCongelateur:true, dateLivraison:'2026-09-29' });
  check('C. la DLC « congélateur » (01/01/2027) est écartée → livraison + 6 j (05/10)', l.dlc === '2026-10-05');
  // Sensibilité : prise sans cette exception, la plus prudente resterait correcte ICI, mais un lot
  // congelé SANS date de livraison imprimerait 4 mois de DLC au client.
  const sansLiv = M._etqCliAuto({ lot:'X', pieces:12, dlcLot:'2027-01-01', enCongelateur:true, dateLivraison:'' });
  check('C. congelé et sans date de livraison → DLC laissée VIDE, jamais 4 mois', sansLiv.dlc === '');
}

// ---- D. On n'invente rien ----
{
  const l = M._etqCliAuto({ lot:'X', pieces:6, fabIso:'2026-09-20', dlcLot:'2026-09-26', dateLivraison:'2026-09-21' });
  check('D. vieux lot daté sans heure → heure VIDE (pas « 00:00 »)', l.fabDate === '2026-09-20' && l.fabHeure === '');
  const vide = M._etqCliAuto({ produit:'Vanille', pieces:12 });
  check('D. sans lot ni date : lot, fabrication et DLC vides, à compléter par Ben', vide.lot === '' && vide.fabDate === '' && vide.dlc === '');
}

// ---- E. Texte imprimé ----
{
  const T = M._etqCliTextes({ produit:'Pistache', lot:'270926PIS-A', pieces:24, fabDate:'2026-09-27', fabHeure:'14:35', dlc:'2026-10-03' });
  check('E. lot', T.lot === 'Lot : 270926PIS-A');
  check('E. pièces', T.pieces === '24 pièces');
  check('E. fabrication avec l\'heure, au format JJ/MM/AAAA', T.fab === 'Fabriqué le : 27/09/2026 à 14:35');
  check('E. DLC au format JJ/MM/AAAA', T.dlc === 'DLC : 03/10/2026');
  const sansHeure = M._etqCliTextes({ produit:'P', lot:'L', pieces:1, fabDate:'2026-09-27', fabHeure:'', dlc:'' });
  check('E. sans heure : pas de « à » orphelin', sansHeure.fab === 'Fabriqué le : 27/09/2026');
  check('E. singulier pour 1 pièce', sansHeure.pieces === '1 pièce');
  check('E. champ vide affiché « — », jamais « undefined »', sansHeure.dlc === 'DLC : —' && M._etqCliTextes({}).lot === 'Lot : —');
}

// ---- F. Lignes d'une vraie commande : une étiquette PAR LOT, pièces additionnées ----
(async () => {
  const src = extractFunction('_etqCliLignesAuto');
  const build = (orders, items, prods, recipes) => new Function('db','prodNomComplet','prodDlcEffective','isFreezer','orderToLines','recipeForFlavorName','_etqCliAuto', `${src}; return _etqCliLignesAuto;`)(
    {
      orders: { get: async id => orders.find(o=>o.id===id) },
      recipes: { toArray: async () => recipes },
      orderItems: { where: () => ({ equals: id => ({ toArray: async () => items.filter(i=>i.orderId===id) }) }) },
      productions: { get: async id => prods.find(p=>p.id===id) }
    },
    (p, rs) => { const r = rs.find(x=>x.id===p.recipeId); return r ? r.produitNom : ''; },
    p => p.dlcProduit || '',
    k => k === 'congelateur',
    o => o.lignes || [],
    (nom, rs) => rs.find(r=>r.produitNom===nom) || null,
    M._etqCliAuto
  );
  const recipes = [{ id:1, produitNom:'Pistache' }, { id:2, produitNom:'Myrtille framboise', grandFormat:true }];
  const prods = [
    { id:10, recipeId:1, lotProduction:'270926PIS-A', prodTermineTs: isoLocal(2026,9,27,14,35), dlcProduit:'2026-10-03', emplacement:'frigo' },
    { id:11, recipeId:2, lotProduction:'260926MYRGF-C', prodTermineTs: isoLocal(2026,9,26,9,5), dlcProduit:'2027-01-26', emplacement:'congelateur' },
  ];
  const orders = [{ id:5, date:'2026-09-29', lignes:[{ parfums:[{nom:'Pistache', qte:24}], items:[{nom:'Myrtille framboise', qte:6}] }] }];
  const items = [ { orderId:5, productionId:10, qte:12 }, { orderId:5, productionId:10, qte:12 }, { orderId:5, productionId:11, qte:6 } ];

  const r = await build(orders, items, prods, recipes)(5);
  check('F. deux lots liés → deux étiquettes', r.lignes.length === 2 && r.depuisLots === true);
  const pis = r.lignes.find(l=>l.lot==='270926PIS-A');
  check('F. deux liens vers le même lot → pièces additionnées (12 + 12 = 24)', pis && pis.pieces === 24);
  check('F. nom du produit repris de la recette', pis && pis.produit === 'Pistache');
  const myr = r.lignes.find(l=>l.lot==='260926MYRGF-C');
  check('F. lot grand format au congélateur → livraison + 4 j (03/10), pas sa DLC de janvier', myr && myr.dlc === '2026-10-03');

  const r2 = await build([{ id:6, date:'2026-09-29', lignes:[{ parfums:[{nom:'Pistache', qte:12},{nom:'Pistache', qte:6}] }] }], [], prods, recipes)(6);
  check('F. sans lot lié : une étiquette par parfum commandé (12 + 6 = 18 pièces)', r2.lignes.length === 1 && r2.lignes[0].pieces === 18 && r2.depuisLots === false);
  check('F. …lot laissé vide plutôt qu\'inventé', r2.lignes[0].lot === '');

  // ---- G. Câblage ----
  const srcTrace = extractFunction('traceOrder');
  check('G. [LA DEMANDE] bouton distinct « Étiquettes client » dans la traçabilité de la commande', /etiqClientForm\(\$\{orderId\}\)/.test(srcTrace) && /Étiquettes client/.test(srcTrace));
  const srcRender = extractFunction('_etqCliRender');
  ['produit','lot','pieces','fabDate','fabHeure','dlc'].forEach(ch =>
    check(`G. champ « ${ch} » modifiable dans le formulaire`, new RegExp(`_etqCliSet\\(\\$\\{i\\},'${ch}'`).test(srcRender)));
  check('G. la saisie ne redessine pas le formulaire (le clavier ne se ferme pas à chaque lettre)', !/_etqCliRender\(\)/.test(extractFunction('_etqCliSet')));
  const srcCanvas = extractFunction('labelClientToCanvas');
  check('G. l\'étiquette client ne porte PAS de QR (il renvoie à l\'app de Ben, pas au client)', !/qr|QR\./.test(srcCanvas));
  check('G. …ni l\'emplacement de l\'atelier', !/empl|emplacement/i.test(srcCanvas));
  check('G. même format que les étiquettes de lot (105 × 55 mm) : même rouleau', /mm\(105\)/.test(srcCanvas) && /mm\(55\)/.test(srcCanvas));
  const srcGen = extractFunction('etiqClientGenerer');
  check('G. ce qui est imprimé est mémorisé sur la COMMANDE', /db\.orders\.update\(S\.orderId, \{ etiquettesClient:/.test(srcGen));
  check('G. …et jamais sur le lot : la traçabilité interne n\'est pas réécrite', !/db\.productions\.(update|put)/.test(srcGen));
  check('G. la réimpression repart de ce qui a été imprimé, avec retour possible aux valeurs auto', /etiquettesClient/.test(extractFunction('etiqClientForm')) && /recalculer:true/.test(srcRender));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
