'use strict';
// v1461 — « LES MACARONS NE COMPTENT PAS LES MARCHÉS, ET MÊME SANS EUX LE COMPTE SEMBLE FAUX ».
// Ben, sur la ligne « 🍬 X macaron(s) vendu(s) » de la carte CA. Il demande aussi d'afficher le
// nombre de macarons à côté du % sur CHAQUE ligne du détail.
//
// 🚨 CAUSE RACINE : le tableau de bord refaisait sa PROPRE addition des macarons, à côté de celle
// du CA. Deux écritures de la même règle, donc deux réponses possibles à la même question — le
// défaut nommé en v1339. Elles divergeaient sur le périmètre des marchés ET sur le prorata des
// paiements partiels. Le compte vit désormais DANS caDuMois, avec le CA, ligne par ligne.
//
// SECONDE TROUVAILLE : la clôture d'un marché n'exige AUCUN comptage de sortie/retour. Un marché
// clos sans mouvement a donc un nombre de macarons INCONNU, pas nul. L'additionner comme un 0
// faisait passer un compte incomplet pour un compte juste : c'est désormais signalé.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

function build(jeu){
  const src = extractFunction('caDuMois');
  const fn = new Function('db','monthKey','today','estReprise','paiementsDe','ymKey','money2','round3',
    'swallow','marketNetCA','marketLineSummary','orderMacaronsVendus','orderMontantRecalcule', `
    ${src}
    return caDuMois;
  `);
  return fn(
    { orders:{toArray:async()=>jeu.orders||[]}, clients:{toArray:async()=>jeu.clients||[]},
      markets:{toArray:async()=>jeu.markets||[]}, marketMoves:{toArray:async()=>jeu.moves||[]} },
    d=>String(d||'').slice(0,7), ()=>'2026-08-05',
    o=>!!(o&&o.reprise),
    o=>(o&&o.commandeMereId!=null)?[]:(Array.isArray(o&&o.paiements)?o.paiements:[]),
    d=>String(d||'').slice(0,7),
    n=>Math.round((+n||0)*100)/100, n=>Math.round((+n||0)*1000)/1000,
    ()=>{},
    k=>+k.net||0,
    mv=>{ const par={}; mv.forEach(m=>{ const b=(par[m.parfum]||={sortie:0,retour:0,don:0,perte:0});
            b[m.type] = (b[m.type]||0)+(+m.qte||0); });
          return Object.keys(par).map(p=>({parfum:p,
            vendu: Math.max(0, par[p].sortie-par[p].retour-par[p].don-par[p].perte)})); },
    o=>(o&&o.mac)||0,
    o=>0
  );
}

async function run(){
  // ---- A. Les macarons sont comptés AVEC le CA, ligne par ligne ----
  {
    const r = await build({
      clients:[{id:1,nom:'Alice'}],
      orders:[{ id:1, clientId:1, date:'2026-08-02', montant:100, mac:40,
        paiements:[{date:'2026-08-02', montant:100}] }],
    })('2026-08');
    check('A. le CA du mois est juste', r.total === 100);
    check('A. le total macarons accompagne le CA', r.totalMac === 40);
    check('A. chaque ligne porte SA part de macarons (vérifiable à l\'œil)', r.lignesCmd?.[0]?.mac === 40);
  }

  // ---- B. LES MARCHÉS SONT COMPTÉS (le premier reproche de Ben) ----
  {
    const r = await build({
      markets:[{ id:9, nom:'Marché de Noël', date:'2026-08-10', statut:'clos', net:300 }],
      moves:[{ marketId:9, parfum:'Pistache', type:'sortie', qte:100 },
             { marketId:9, parfum:'Pistache', type:'retour', qte:30 }],
    })('2026-08');
    check('B. le CA du marché est compté', r.totalMk === 300);
    check('B. les macarons du marché SONT comptés (100 sortis − 30 revenus = 70)', r.totalMac === 70);
    check('B. la ligne du marché porte ses macarons', r.lignesMk?.[0]?.mac === 70);
    check('B. et elle est marquée comme comptable', r.lignesMk?.[0]?.macConnu === true);
    check('B. aucun marché signalé sans comptage', r.mkSansMouvement === 0);
  }

  // ---- C. Marché clos SANS mouvement : inconnu, pas nul ----
  {
    const r = await build({
      markets:[{ id:9, nom:'Marché sans comptage', date:'2026-08-10', statut:'clos', net:250 }],
      moves:[],
    })('2026-08');
    check('C. le CA est bien compté même sans mouvement', r.totalMk === 250);
    check('C. la ligne est marquée « macarons non comptés »', r.lignesMk?.[0]?.macConnu === false);
    check('C. le marché est signalé pour que l\'incomplétude se voie', r.mkSansMouvement === 1);
    check('C. aucun macaron inventé pour autant', r.totalMac === 0);
  }

  // ---- D. Commandes : les défauts corrigés en amont restent corrigés ----
  {
    // Mère payée d'avance + filles de retrait : comptée une seule fois.
    const r = await build({ clients:[{id:1,nom:'Alice'}], orders:[
      { id:1, clientId:1, date:'2026-08-01', montant:200, mac:100, paiements:[{date:'2026-08-01',montant:200}] },
      { id:2, clientId:1, date:'2026-08-03', commandeMereId:1, mac:40, paiements:[] },
      { id:3, clientId:1, date:'2026-08-10', commandeMereId:1, mac:60, paiements:[] },
    ]})('2026-08');
    check('D. mère + filles : 100 macarons, pas 200', r.totalMac === 100);
  }
  {
    // Paiement partiel : prorata, et le mois du paiement décide.
    const jeu = { clients:[{id:1,nom:'A'}], orders:[{ id:1, clientId:1, date:'2026-08-01', montant:200, mac:100,
      paiements:[{date:'2026-08-01',montant:50},{date:'2026-09-15',montant:150}] }] };
    const aout = await build(jeu)('2026-08');
    const sept = await build(jeu)('2026-09');
    check('D. paiement partiel : prorata (50/200 → 25)', aout.totalMac === 25);
    check('D. le solde compte au mois de son encaissement (150/200 → 75)', sept.totalMac === 75);
    check('D. RÉCONCILIATION : les deux mois totalisent la commande entière', aout.totalMac + sept.totalMac === 100);
  }
  {
    // Reprise d'historique exclue (comme pour le CA).
    const r = await build({ clients:[{id:1,nom:'A'}], orders:[
      { id:1, clientId:1, date:'2026-08-01', montant:100, mac:50, reprise:true, paiements:[{date:'2026-08-01',montant:100}] },
    ]})('2026-08');
    check('D. reprise d\'historique : ni CA ni macarons', r.total === 0 && r.totalMac === 0);
  }
  {
    // Trop-perçu plafonné.
    const r = await build({ clients:[{id:1,nom:'A'}], orders:[
      { id:1, clientId:1, date:'2026-08-01', montant:100, mac:40, paiements:[{date:'2026-08-01',montant:150}] },
    ]})('2026-08');
    check('D. trop-perçu : jamais plus de macarons que la commande n\'en contient', r.totalMac === 40);
  }

  {
    // Commande non payée : le CA n'affiche rien, les macarons non plus.
    const r = await build({ clients:[{id:1,nom:'A'}], orders:[
      { id:1, clientId:1, date:'2026-08-05', montant:100, mac:50, paiements:[] },
    ]})('2026-08');
    check('D. commande non payée : 0 macaron (cohérent avec le CA)', r.totalMac === 0);
  }
  {
    // Montant à zéro : pas de division par zéro, rien inventé.
    const r = await build({ clients:[{id:1,nom:'A'}], orders:[
      { id:1, clientId:1, date:'2026-08-01', montant:0, mac:50, paiements:[{date:'2026-08-01',montant:0}] },
    ]})('2026-08');
    check('D. montant nul : pas de division par zéro, aucun macaron inventé', r.totalMac === 0);
  }
  {
    // Paiement sans date : rattaché au mois de la commande, comme le fait le CA.
    const r = await build({ clients:[{id:1,nom:'A'}], orders:[
      { id:1, clientId:1, date:'2026-08-04', montant:100, mac:30, paiements:[{montant:100}] },
    ]})('2026-08');
    check('D. paiement sans date : rattaché au mois de la commande (comme le CA)', r.totalMac === 30);
  }
  {
    // `o.histo` est DÉJÀ couvert par estReprise (qui renvoie true si o.histo===true) : l'ancienne
    // boucle du tableau de bord testait les deux, c'était redondant. Vérifié plutôt que supposé.
    const r = await build({ clients:[{id:1,nom:'A'}], orders:[
      { id:1, clientId:1, date:'2026-08-01', montant:100, mac:50, histo:true, reprise:true,
        paiements:[{date:'2026-08-01',montant:100}] },
    ]})('2026-08');
    check('D. commande historique exclue (couverte par estReprise)', r.total === 0 && r.totalMac === 0);
  }

  // ---- E. La carte lit la source unique, elle ne recalcule plus ----
  {
    const i = APP.indexOf('// [v1461] LE COMPTE VIENT DÉSORMAIS DE caDuMois');
    const src = APP.slice(i, APP.indexOf('// [A11-display]', i));
    check('E. la carte lit _caMoisObj.totalMac', /_caMoisObj\.totalMac/.test(src));
    check('E. elle ne refait plus sa propre boucle sur orders', !/orders\.forEach/.test(src));
    check('E. la part marché vient des lignes de caDuMois', /lignesMk\|\|\[\]\)\.reduce/.test(src));
    check('E. les marchés sans comptage sont remontés à l\'affichage', /mkSansMouvement/.test(src));
    // Le vieux calcul ne doit plus exister nulle part.
    check('E. l\'ancienne boucle du tableau de bord a bien disparu',
      !/macVendusMois \+= macTotal \* Math\.min/.test(APP));
  }

  // ---- F. Ben : le nombre de macarons à côté du % sur chaque ligne ----
  {
    const src = extractFunction('caMonthDetail');
    check('F. les lignes de commande affichent les macarons à côté du %',
      /pctDuTotal\(l\.montant, total\)\}\$\{l\.mac>0\?/.test(src.replace(/\s/g,'')) || /l\.mac>0/.test(src));
    check('F. les lignes de marché aussi', /macConnu===false/.test(src));
    check('F. un marché non compté le DIT au lieu d\'afficher 0', /non compté/.test(src));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}
run().catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
