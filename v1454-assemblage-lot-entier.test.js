'use strict';
// v1454 — ASSEMBLER UN LOT DE COQUES RÉPARTI EN PLUSIEURS BOÎTES. Ben : « si j'ai 200 coques
// réparties en 6 boîtes je dois faire mon assemblage à 6 reprises, alors que dans la réalité je
// sors l'ensemble des coques de leurs boites (à ce stade les boites n'existent plus que sur
// l'application et plus dans la réalité), les dispose sur mon plan de travail et les garnis
// ensuite, puis les répartis en boîte. »
//
// APPROCHE : ne PAS toucher au moteur d'assemblage (prodAssembleSave — 2e lot bicolore, chantache,
// gardes dégustation/sansMelange y sont intriqués). Étape AMONT qui regroupe les boîtes du lot en
// une seule, puis le formulaire d'assemblage normal s'ouvre dessus.
//
// LE RISQUE À COUVRIR : un regroupement qui perd ou invente des coques. C'est du stock réel — une
// erreur ici se voit en atelier et fausse la traçabilité. D'où la réconciliation ci-dessous.
//
// FORK TRANCHÉ PAR BEN : l'assemblage reste TOUJOURS à l'intérieur d'un seul lot mère.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- Module : les helpers PURS de fusion, réutilisés par le regroupement ----
const purs = new Function(`
  ${extractConstLine('round3')}
  ${extractFunction('_fusionMemeLot')}
  ${extractFunction('_fusionValide')}
  ${extractFunction('_fusionDlcPlusCourte')}
  ${extractFunction('_fusionCalcul')}
  return { _fusionValide, _fusionCalcul, _fusionDlcPlusCourte, round3 };
`)();

// ---- A. La DLC retenue est TOUJOURS la plus courte (sécurité alimentaire) ----
{
  check('A. DLC la plus courte retenue entre deux', purs._fusionDlcPlusCourte('2026-08-10','2026-08-06') === '2026-08-06');
  check('A. DLC la plus courte, ordre inverse', purs._fusionDlcPlusCourte('2026-08-06','2026-08-10') === '2026-08-06');
  check('A. une boîte sans DLC ne fait pas perdre celle de l\'autre', purs._fusionDlcPlusCourte(null,'2026-08-06') === '2026-08-06');
}

// ---- B. RÉCONCILIATION — le regroupement ne crée ni ne perd aucune coque ----
async function testRegroupement(){
  const src = extractFunction('regrouperBoitesLot');

  // 6 boîtes du même lot mère (parent id 100), 200 coques au total — le cas exact de Ben.
  const quantites = [40, 40, 40, 30, 30, 20];
  const base = quantites.map((q,i)=>({
    id: 101+i, etiquetteDe: 100, recipeId: 7, composant: 'coques',
    lotProduction: '160626-FRA-CO-B'+(i+1), qteRestante: q, qteReelle: q, qteProduite: q, qteTheorique: q,
    dlcProduit: (i===3 ? '2026-08-06' : '2026-08-12')   // la boîte B4 a la DLC la plus courte
  }));
  const parent = { id:100, recipeId:7, composant:'coques', lotProduction:'160626-FRA-CO', qteRestante:0 };

  const store = new Map();
  store.set(100, parent); base.forEach(b=>store.set(b.id, Object.assign({}, b)));
  let snapshotFait = false, auditEcrit = null;
  const db = {
    productions: {
      get: async id => store.get(+id) ? Object.assign({}, store.get(+id)) : null,
      toArray: async () => Array.from(store.values()).map(x=>Object.assign({},x)),
      update: async (id, patch) => { store.set(+id, Object.assign({}, store.get(+id), patch)); },
    },
    auditLog: { add: async e => { auditEcrit = e; } },
    transaction: async (mode, table, fn) => fn(),
  };

  const runner = new Function('db','round3','prodEstFusionnee','_fusionValide','_fusionCalcul',
    'snapshotBackup','swallow','toast','_auditResume','APP_VERSION','view', `
    ${src}
    return regrouperBoitesLot;
  `);
  const fn = runner(db, purs.round3, p=>!!(p && p.fusionneeDans!=null), purs._fusionValide, purs._fusionCalcul,
    async ()=>{ snapshotFait = true; }, ()=>{}, ()=>{}, o=>JSON.stringify(o), 'vtest', '');

  const totalAvant = Array.from(store.values()).reduce((s,x)=>s+(+x.qteRestante||0),0);
  const r = await fn(103);   // Ben clique depuis n'importe laquelle de ses boîtes

  check('B. le regroupement réussit', r.ok === true);
  check('B. 5 boîtes absorbées sur 6 (il en reste une)', r.nbFusionnees === 5);
  const garde = store.get(r.gardeId);
  check('B. la boîte gardée est B1 (numéro le plus lisible)', garde.lotProduction === '160626-FRA-CO-B1');
  check('B. RÉCONCILIATION : la boîte gardée porte les 200 coques', purs.round3(garde.qteRestante) === 200);
  const totalApres = Array.from(store.values()).reduce((s,x)=>s+(+x.qteRestante||0),0);
  check('B. RÉCONCILIATION : aucune coque créée ni perdue au total', purs.round3(totalApres) === purs.round3(totalAvant));
  check('B. la DLC retenue est la PLUS COURTE des 6 boîtes (2026-08-06), pas celle de B1',
    garde.dlcProduit === '2026-08-06');

  // Archivage : invariant v1416 — jamais supprimée, toujours retrouvable.
  const absorbees = Array.from(store.values()).filter(x => x.fusionneeDans != null);
  check('B. 5 boîtes archivées (pas supprimées) — traçabilité conservée', absorbees.length === 5);
  check('B. chaque absorbée est à zéro', absorbees.every(x => purs.round3(+x.qteRestante||0) === 0));
  check('B. chaque absorbée pointe vers la boîte gardée', absorbees.every(x => +x.fusionneeDans === +r.gardeId));
  check('B. chaque absorbée garde son numéro de lot d\'origine (consultable après coup)',
    absorbees.every(x => !!x.lotProduction));
  check('B. l\'historique de fusion liste les 5 absorbées sur la gardée',
    Array.isArray(garde.fusionHisto) && garde.fusionHisto.length === 5);
  check('B. une sauvegarde de sécurité est prise avant d\'écrire', snapshotFait === true);
  check('B. une entrée d\'audit lisible est écrite', auditEcrit && auditEcrit.op === 'regroupement-boites');
}

// ---- C. Cas limites : rien à regrouper, lot en vrac ----
async function testCasLimites(){
  const src = extractFunction('regrouperBoitesLot');
  const build = (store) => {
    const db = {
      productions: {
        get: async id => store.get(+id) ? Object.assign({}, store.get(+id)) : null,
        toArray: async () => Array.from(store.values()).map(x=>Object.assign({},x)),
        update: async (id, patch) => { store.set(+id, Object.assign({}, store.get(+id), patch)); },
      },
      auditLog: { add: async ()=>{} },
      transaction: async (m,t,fn) => fn(),
    };
    let snap = false;
    const fn = new Function('db','round3','prodEstFusionnee','_fusionValide','_fusionCalcul',
      'snapshotBackup','swallow','toast','_auditResume','APP_VERSION','view', `${src}\nreturn regrouperBoitesLot;`)(
      db, purs.round3, p=>!!(p && p.fusionneeDans!=null), purs._fusionValide, purs._fusionCalcul,
      async ()=>{ snap = true; }, ()=>{}, ()=>{}, o=>JSON.stringify(o), 'vtest', '');
    return { fn, snap:()=>snap };
  };

  // Une seule boîte : rien à faire, et surtout AUCUNE écriture.
  {
    const store = new Map();
    store.set(100, { id:100, recipeId:7, composant:'coques', lotProduction:'L', qteRestante:0 });
    store.set(101, { id:101, etiquetteDe:100, recipeId:7, composant:'coques', lotProduction:'L-B1', qteRestante:50 });
    const { fn, snap } = build(store);
    const r = await fn(101);
    check('C. une seule boîte : succès, rien à fusionner', r.ok === true && r.nbFusionnees === 0);
    check('C. une seule boîte : la boîte elle-même est renvoyée pour l\'assemblage', r.gardeId === 101);
    check('C. une seule boîte : AUCUNE sauvegarde prise (rien n\'a été écrit)', snap() === false);
  }

  // Lot encore en vrac (jamais mis en boîtes) : on passe directement, sans rien casser.
  {
    const store = new Map();
    store.set(200, { id:200, recipeId:7, composant:'coques', lotProduction:'V', qteRestante:120 });
    const { fn, snap } = build(store);
    const r = await fn(200);
    check('C. lot en vrac : succès sans regroupement', r.ok === true && r.nbFusionnees === 0);
    check('C. lot en vrac : le lot lui-même part à l\'assemblage', r.gardeId === 200);
    check('C. lot en vrac : rien écrit', snap() === false);
    check('C. lot en vrac : sa quantité est intacte', purs.round3(store.get(200).qteRestante) === 120);
  }

  // Boîte déjà fusionnée : exclue du regroupement (ne doit pas ressusciter).
  {
    const store = new Map();
    store.set(300, { id:300, recipeId:7, composant:'coques', lotProduction:'W', qteRestante:0 });
    store.set(301, { id:301, etiquetteDe:300, recipeId:7, composant:'coques', lotProduction:'W-B1', qteRestante:40, dlcProduit:'2026-08-10' });
    store.set(302, { id:302, etiquetteDe:300, recipeId:7, composant:'coques', lotProduction:'W-B2', qteRestante:0, fusionneeDans:301 });
    const { fn } = build(store);
    const r = await fn(301);
    check('C. une boîte déjà fusionnée n\'est pas re-regroupée', r.ok === true && r.nbFusionnees === 0);
  }
}

// ---- D. Câblage : le bouton de « Stock par parfum » route vers le chemin lot entier ----
{
  const i = APP.indexOf('const _ligneComposantAssemblable');
  const src = APP.slice(i, APP.indexOf('const rows = prods.map', i));
  check('D. le bouton compte les boîtes sœurs du lot', /_soeurs/.test(src) && /etiquetteDe/.test(src));
  check('D. plusieurs boîtes → prodAssembleLotEntier', /prodAssembleLotEntier\(\$\{p\.id\},\{sansMelange:true\}\)/.test(src));
  check('D. une seule boîte → prodAssembleForm, comportement v1426 inchangé',
    /prodAssembleForm\(\$\{p\.id\},\{sansMelange:true\}\)/.test(src));
  check('D. le libellé annonce le nombre de boîtes regroupées', /Assembler tout le lot \(\$\{_nbBoites\} boîtes\)/.test(src));
  check('D. le total de pièces du lot est affiché', /_totalLot/.test(src));

  const srcEntier = extractFunction('prodAssembleLotEntier');
  check('D. prodAssembleLotEntier regroupe PUIS ouvre le formulaire normal',
    /regrouperBoitesLot/.test(srcEntier) && /prodAssembleForm\(r\.gardeId/.test(srcEntier));
  check('D. le moteur d\'assemblage n\'est pas contourné (aucune écriture propre)',
    !/db\.productions\.update/.test(srcEntier));
}

// ---- E. Étiquette : la quantité imprimée est celle qui RESTE ----
{
  const i = APP.indexOf('const _nbPieces =');
  const src = APP.slice(i, i+400);
  check('E. l\'étiquette imprime la quantité restante (prodQteStock)', /prodQteStock\(p\)/.test(src));
  check('E. repli conservé pour les lots anciens sans qteRestante', /qteReelle/.test(src) && /qteTheorique/.test(src));
}

(async () => {
  await testRegroupement();
  await testCasLimites();
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
