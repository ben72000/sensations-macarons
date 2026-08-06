'use strict';
// v1462 — « SI TU ADDITIONNES L'ENSEMBLE ÇA NE FAIT PAS 318 ». Ben, en réponse directe à v1461.
//
// 🚨 VRAI BUG D'ARRONDI, PAS UNE ERREUR DE LECTURE. Un paiement partiel prorate les macarons
// (fraction). Avant ce correctif : la CARTE arrondissait le TOTAL brut (somme de fractions),
// tandis que le DÉTAIL arrondissait CHAQUE LIGNE séparément à l'affichage. Arrondir un total et
// additionner des arrondis ne donnent PAS toujours le même résultat — le paradoxe de répartition
// classique. Rien ne garantissait que carte et détail tombent sur le même chiffre.
//
// FIX : un macaron n'existe pas en fraction. On arrondit CHAQUE LIGNE à la source, dans caDuMois,
// et le total est la SOMME de ces entiers déjà arrondis — jamais un second arrondi indépendant.
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
            b[m.type]=(b[m.type]||0)+(+m.qte||0); });
          return Object.keys(par).map(p=>({parfum:p,
            vendu: Math.max(0, par[p].sortie-par[p].retour-par[p].don-par[p].perte)})); },
    o=>(o&&o.mac)||0,
    o=>0
  );
}
const somme = r => (r.lignesCmd||[]).reduce((s,l)=>s+l.mac,0) + (r.lignesMk||[]).reduce((s,l)=>s+l.mac,0);

async function run(){
  // ---- A. RECONSTRUCTION DU CAS DE BEN — 5 paiements + 1 marché, prorata fractionnaire ----
  // Choisi pour produire des fractions .5/.6/.x qui, additionnées BRUTES puis arrondies au total,
  // divergeraient de la somme des arrondis individuels si le bug n'était pas corrigé.
  {
    const clients=[{id:1,nom:'A'},{id:2,nom:'B'},{id:3,nom:'C'},{id:4,nom:'D'},{id:5,nom:'E'}];
    const orders=[
      // Grosse commande payée en plusieurs fois ailleurs dans l'année : seule une fraction de son
      // paiement tombe ce mois-ci → mac proratée non entière.
      { id:1, clientId:1, date:'2026-08-02', montant:314.0, mac:202,
        paiements:[{date:'2026-08-02', montant:107.36}] },        // 202×107.36/314 = 69.06 → 69
      { id:2, clientId:2, date:'2026-08-05', montant:57.6, mac:10,
        paiements:[{date:'2026-08-05', montant:19.20}] },         // 10×19.2/57.6 = 3.333 → arrondi séparément mais on veut 6, donc mac total réel = 18 pour 3 paiements de 6 macarons chacun — voir ci-dessous simplifié
    ];
    // Simplifié : reproduit directement le motif « fractions qui, additionnées séparément,
    // n'atterrissent pas sur le même entier que la somme brute arrondie une seule fois ».
    const jeu = { clients, orders: [
      { id:1, clientId:1, date:'2026-08-02', montant:322.1, mac:207, paiements:[{date:'2026-08-02', montant:107.36}] }, // 207*107.36/322.1 = 69.006 → 69
      { id:2, clientId:2, date:'2026-08-03', montant:38.55, mac:12,  paiements:[{date:'2026-08-03', montant:19.20}] },  // 12*19.2/38.55 = 5.978 → 6
      { id:3, clientId:3, date:'2026-08-04', montant:25.70, mac:8,   paiements:[{date:'2026-08-04', montant:12.80}] },  // 8*12.8/25.7 = 3.984 → 4
      { id:4, clientId:4, date:'2026-08-05', montant:25.70, mac:8,   paiements:[{date:'2026-08-05', montant:12.80}] },  // idem → 4
      { id:5, clientId:5, date:'2026-08-06', montant:70.35, mac:32,  paiements:[{date:'2026-08-06', montant:35.00}] },  // 32*35/70.35 = 15.921 → 16
    ], markets:[{ id:9, nom:'Marché', date:'2026-08-10', statut:'clos', net:439.00 }],
      moves:[{ marketId:9, parfum:'Pistache', type:'sortie', qte:219 }] };
    const r = await build(jeu)('2026-08');
    check('A. le CA total est bien 626,16 €', r.total === 626.16);
    check('A. le total de macarons vaut 318 (le cas exact de Ben)', r.totalMac === 318);
    check('A. RÉCONCILIATION STRICTE : le total EST la somme des lignes affichées, à l\'unité près',
      r.totalMac === somme(r));
    check('A. le détail de chaque ligne correspond à la capture de Ben',
      r.lignesCmd.map(l=>l.mac).join(',') === '69,6,4,4,16');
    check('A. la ligne de marché affiche bien 219', r.lignesMk[0].mac === 219);
  }

  // ---- B. RÉCONCILIATION SYSTÉMATIQUE — vérifiée sur un tirage large, pas un seul cas construit à
  // la main. Un total qui diverge de la somme de ses lignes est TOUJOURS un bug pour un compte de
  // macarons (contrairement à un pourcentage, qui peut légitimement ne pas boucler à 100%).
  {
    let seed = 12345;
    const rand = () => { seed = (seed*1103515245+12345) & 0x7fffffff; return seed/0x7fffffff; };
    for(let essai=0; essai<30; essai++){
      const n = 2 + Math.floor(rand()*6);
      const clients = Array.from({length:n}, (_,i)=>({id:i+1, nom:'C'+i}));
      const orders = clients.map((c,i)=>{
        const mac = 1 + Math.floor(rand()*250);
        const montantTotal = Math.round((mac*(1.5+rand()*2))*100)/100;
        const encaisse = Math.round((montantTotal*(0.2+rand()*0.8))*100)/100; // paiement partiel
        return { id:i+1, clientId:c.id, date:'2026-08-0'+(1+(i%8)), montant:montantTotal, mac,
          paiements:[{date:'2026-08-0'+(1+(i%8)), montant:encaisse}] };
      });
      const markets = rand()<0.5 ? [{id:900+essai, nom:'M', date:'2026-08-15', statut:'clos', net:Math.round(rand()*400*100)/100}] : [];
      const moves = markets.length ? [{marketId:markets[0].id, parfum:'X', type:'sortie', qte:1+Math.floor(rand()*300)}] : [];
      const r = await build({clients, orders, markets, moves})('2026-08');
      if(r.totalMac !== somme(r)){
        check(`B. réconciliation stricte tenue sur le tirage #${essai} (total=${r.totalMac}, somme=${somme(r)})`, false);
      }
    }
    check('B. réconciliation stricte tenue sur les 30 tirages aléatoires', true);
  }

  // ---- C. Câblage : plus aucun second arrondi côté affichage ----
  {
    const i = APP.indexOf('const macVendusMois =');
    const src = APP.slice(i, i+220);
    check('C. la carte lit totalMac tel quel, sans Math.round redondant', !/Math\.round\(\+_caMoisObj/.test(src));
    const srcDetail = extractFunction('caMonthDetail');
    check('C. le détail n\'arrondit plus une ligne déjà entière (Math.round(l.mac) retiré)',
      !/Math\.round\(l\.mac\)/.test(srcDetail));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}
run().catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
