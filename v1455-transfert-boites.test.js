'use strict';
// v1455 — TRANSFÉRER DES PIÈCES D'UNE BOÎTE À UNE AUTRE. Ben : « lorsque je les répartis en boites
// une fois garnis je dois pouvoir facilement transférer manuellement un ou plusieurs macarons
// d'une boîte à une autre (pour gérer les erreurs de saisies) ».
//
// AUDIT PRÉALABLE : la répartition en boîtes (prodPreparerBoites) et la casse (declareLossForm,
// 4 stades, bouton « ⚠ Perte » déjà par boîte) existaient DÉJÀ. Le seul morceau manquant était le
// transfert PARTIEL — la fusion, elle, vide toujours entièrement une boîte.
//
// LE RISQUE : c'est du stock réel. Un transfert qui crée ou perd une pièce fausse l'inventaire ET
// la traçabilité. D'où la réconciliation systématique ci-dessous.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const purs = new Function(`
  ${extractConstLine('round3')}
  ${extractFunction('_fusionMemeLot')}
  ${extractFunction('_fusionValide')}
  ${extractFunction('_fusionDlcPlusCourte')}
  return { _fusionValide, _fusionDlcPlusCourte, round3 };
`)();

// Bac à sable : deux boîtes du même lot mère, quantités et DLC paramétrables.
function bac(qA, qB, opts){
  opts = opts || {};
  const store = new Map();
  store.set(100, { id:100, recipeId:7, composant:'coques', lotProduction:'L', qteRestante:0 });
  store.set(101, { id:101, etiquetteDe:100, recipeId:7, composant:'coques', lotProduction:'L-B1',
    qteRestante:qA, dlcProduit: opts.dlcA || '2026-08-12' });
  store.set(102, { id:102, etiquetteDe:100, recipeId:7, composant:'coques', lotProduction:'L-B2',
    qteRestante:qB, dlcProduit: opts.dlcB || '2026-08-12' });
  if(opts.extra) opts.extra.forEach(x=>store.set(x.id, x));
  let snapshotFait = false, audit = null;
  const db = {
    productions: {
      get: async id => store.get(+id) ? Object.assign({}, store.get(+id)) : null,
      toArray: async () => Array.from(store.values()).map(x=>Object.assign({},x)),
      update: async (id, patch) => { store.set(+id, Object.assign({}, store.get(+id), patch)); },
    },
    auditLog: { add: async e => { audit = e; } },
    transaction: async (m,t,fn) => fn(),
  };
  const fn = new Function('db','round3','qty','_fusionValide','_fusionDlcPlusCourte',
    'snapshotBackup','swallow','toast','_auditResume','APP_VERSION','view', `
    ${extractFunction('transfererEntreBoites')}
    return transfererEntreBoites;
  `)(db, purs.round3, n=>String(n), purs._fusionValide, purs._fusionDlcPlusCourte,
     async ()=>{ snapshotFait=true; }, ()=>{}, ()=>{}, o=>JSON.stringify(o), 'vtest', '');
  return { fn, store, snap:()=>snapshotFait, audit:()=>audit };
}
const total = store => Array.from(store.values()).reduce((s,x)=>s+(+x.qteRestante||0),0);

async function run(){
  // ---- A. Transfert PARTIEL : les deux boîtes survivent ----
  {
    const { fn, store, snap, audit } = bac(30, 10);
    const avant = total(store);
    const r = await fn(101, 102, 7);
    check('A. le transfert réussit', r.ok === true);
    check('A. la source n\'est PAS vidée (30 − 7 = 23)', r.sourceVidee === false && purs.round3(store.get(101).qteRestante) === 23);
    check('A. la destination a reçu les 7 pièces (10 + 7 = 17)', purs.round3(store.get(102).qteRestante) === 17);
    check('A. RÉCONCILIATION : aucune pièce créée ni perdue', purs.round3(total(store)) === purs.round3(avant));
    check('A. la source reste vivante (pas archivée)', store.get(101).fusionneeDans == null);
    check('A. une sauvegarde est prise avant d\'écrire', snap() === true);
    check('A. une entrée d\'audit lisible est écrite', audit() && audit().op === 'transfert-boite');
    check('A. historique posé sur la source (sens sortant)',
      (store.get(101).transfertHisto||[]).some(t=>t.sens==='sortant' && t.qte===7));
    check('A. historique posé sur la destination (sens entrant)',
      (store.get(102).transfertHisto||[]).some(t=>t.sens==='entrant' && t.qte===7));
  }

  // ---- B. Transfert TOTAL : la source est ARCHIVÉE, pas laissée vide ----
  {
    const { fn, store } = bac(12, 5);
    const avant = total(store);
    const r = await fn(101, 102, 12);
    check('B. la source est signalée vidée', r.sourceVidee === true);
    check('B. la source est archivée (fusionneeDans posé)', +store.get(101).fusionneeDans === 102);
    check('B. la source est à zéro', purs.round3(store.get(101).qteRestante) === 0);
    check('B. la source garde son numéro de lot (historique consultable)', store.get(101).lotProduction === 'L-B1');
    check('B. la destination a tout reçu (5 + 12 = 17)', purs.round3(store.get(102).qteRestante) === 17);
    check('B. RÉCONCILIATION : aucune pièce créée ni perdue', purs.round3(total(store)) === purs.round3(avant));
  }

  // ---- C. DLC : la destination prend TOUJOURS la plus courte (sécurité alimentaire) ----
  {
    const { fn, store } = bac(20, 20, { dlcA:'2026-08-06', dlcB:'2026-08-20' });
    await fn(101, 102, 5);
    check('C. la destination hérite de la DLC la plus courte des deux', store.get(102).dlcProduit === '2026-08-06');
  }
  {
    const { fn, store } = bac(20, 20, { dlcA:'2026-08-20', dlcB:'2026-08-06' });
    await fn(101, 102, 5);
    check('C. la DLC courte de la destination n\'est pas rallongée par une source plus longue',
      store.get(102).dlcProduit === '2026-08-06');
  }

  // ---- D. Refus : les cas où le transfert ne doit PAS avoir lieu ----
  {
    const { fn, store, snap } = bac(10, 10);
    const avant = total(store);
    const r = await fn(101, 102, 25);
    check('D. quantité supérieure au stock : refusé', r.ok === false && /Maximum/.test(r.raison||''));
    check('D. refus : rien écrit', purs.round3(total(store)) === purs.round3(avant));
    check('D. refus : aucune sauvegarde inutile prise', snap() === false);
  }
  {
    const { fn } = bac(10, 10);
    const r = await fn(101, 101, 3);
    check('D. même boîte en source et destination : refusé', r.ok === false);
  }
  {
    const { fn } = bac(10, 10);
    const r = await fn(101, 102, 0);
    check('D. quantité nulle : refusé', r.ok === false);
  }
  {
    // Boîte d'un AUTRE lot mère : mélangerait deux fabrications sous une même étiquette.
    const { fn } = bac(10, 10, { extra:[{ id:201, etiquetteDe:200, recipeId:7, composant:'coques',
      lotProduction:'AUTRE-B1', qteRestante:10, dlcProduit:'2026-08-12' }] });
    const r = await fn(101, 201, 3);
    check('D. transfert vers un AUTRE lot : refusé (traçabilité)', r.ok === false);
  }

  // ---- E. Le fil de traçabilité rend les transferts, dans les deux sens ----
  {
    const src = extractFunction('construireFilTracabilite');
    const M = new Function('round3','qty','fmtDate','fmtDateTime','empNom','empIcon', `
      ${src}
      return construireFilTracabilite;
    `)(purs.round3, n=>String(n), d=>String(d), d=>String(d), ()=>'', ()=>'');
    const recu = M({ id:102, lotProduction:'L-B2', qteRestante:17,
      transfertHisto:[{ sens:'entrant', deId:101, deLot:'L-B1', versId:102, versLot:'L-B2', qte:7, ts:1754300000000 }] }, [], [], []);
    check('E. une étape « transfert » apparaît côté boîte qui REÇOIT', recu.some(e=>e.type==='transfert'));
    check('E. côté réception, le texte dit « reçue(s) de »', recu.some(e=>e.type==='transfert' && /reçue\(s\) de/.test(e.texte)));
    check('E. côté réception, un lien pointe vers l\'autre boîte', recu.some(e=>e.type==='transfert' && (e.liens||[]).some(l=>l.id===101)));
    const donne = M({ id:101, lotProduction:'L-B1', qteRestante:23,
      transfertHisto:[{ sens:'sortant', deId:101, deLot:'L-B1', versId:102, versLot:'L-B2', qte:7, ts:1754300000000 }] }, [], [], []);
    check('E. une étape « transfert » apparaît AUSSI côté boîte qui DONNE', donne.some(e=>e.type==='transfert'));
    check('E. côté départ, le texte dit « déplacée(s) vers »', donne.some(e=>e.type==='transfert' && /déplacée\(s\) vers/.test(e.texte)));
    // Sans transfert, aucune étape parasite.
    const vide = M({ id:103, lotProduction:'L-B3', qteRestante:5 }, [], [], []);
    check('E. aucune étape transfert inventée quand il n\'y en a pas', !vide.some(e=>e.type==='transfert'));
  }

  // ---- F. Câblage : bouton dans la vue des boîtes + icône propre dans le fil ----
  {
    const i = APP.indexOf('const peutFusionner');
    const src = APP.slice(i, i+1800);
    check('F. le bouton ⇄ Transférer est rendu dans la vue des boîtes', /boiteTransfererForm\(\$\{x\.id\},\$\{prodId\}\)/.test(src));
    check('F. il apparaît sous la même condition que Fusionner (une sœur existe)',
      (src.match(/peutFusionner\?/g)||[]).length >= 2);
    const srcForm = extractFunction('boiteTransfererForm');
    check('F. le formulaire borne la quantité au stock disponible', /max="\$\{dispo\}"/.test(srcForm));
    check('F. le formulaire prévient que tout transférer archive la boîte de départ', /archiv/i.test(srcForm));
    const srcIco = APP.slice(APP.indexOf("const ico = e.type==='prelevement'"), APP.indexOf("const ico = e.type==='prelevement'")+400);
    check('F. le transfert a son icône propre, distincte de la fusion', /e\.type==='transfert' \? '⇄'/.test(srcIco));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}
run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
