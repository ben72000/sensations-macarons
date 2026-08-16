'use strict';
// v1476 — « LE MONTANT AFFICHÉ N'EST TOUJOURS PAS CORRECT ». Ben, après la v1475.
//
// CE QUI A ÉTÉ ÉCARTÉ D'ABORD, par réconciliation sur données identiques : la carte du tableau de
// bord, le graphique mensuel et le graphique annuel donnent EXACTEMENT les mêmes chiffres, et la
// somme des mois égale l'année. Les trois surfaces sont cohérentes ENTRE ELLES — l'écart est donc
// entre l'app et la RÉALITÉ de Ben, pas une divergence interne. Corriger un calcul juste n'aurait
// rien donné.
//
// 🚨 CE QUE LE SONDAGE A RÉVÉLÉ : `paiementsDe` ne compte une commande que si elle a un registre de
// paiements non vide, OU le statut exactement « Payé ». Trois formes d'argent réel y échappent :
//   ① statut « Partiel » sans registre — un acompte encaissé, jamais compté
//   ② commande soldée dont le statut est resté « En attente »
//   ③ registre présent mais dont tous les montants valent 0
//
// CHOIX ASSUMÉ : ne PAS « réparer » automatiquement. Compter une commande « En attente » comme
// encaissée serait inventer une recette — et fausserait une déclaration URSSAF. On DIAGNOSTIQUE :
// l'app liste les commandes concernées avec le montant en jeu, Ben saisit l'encaissement réel.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const P = new Function('money2', `${extractFunction('paiementsDe')}\nreturn paiementsDe;`)(n=>Math.round(n*100)/100);
const orig = console.warn; console.warn = ()=>{};   // le repli legacy journalise, c'est voulu

// ---- A. Les formes qui échappent au CA (le diagnostic doit les voir) ----
{
  const zero = o => P(o).reduce((s,p)=>s+(+p.montant||0),0) === 0;
  check('A. ① « Partiel » sans registre → aucun encaissement compté',
    zero({id:1,date:'2026-05-02',montant:100,paiement:'Partiel'}));
  check('A. ② « En attente » → aucun encaissement compté',
    zero({id:2,date:'2026-05-02',montant:100,paiement:'En attente'}));
  check('A. ③ registre à montants nuls → aucun encaissement compté',
    zero({id:3,date:'2026-05-02',montant:100,paiements:[{date:'2026-05-02',montant:0}],paiement:'Payé'}));
}

// ---- B. NON-RÉGRESSION : ce qui était compté l'est toujours ----
{
  const tot = o => P(o).reduce((s,p)=>s+(+p.montant||0),0);
  check('B. commande avec registre : comptée', tot({id:4,date:'2026-05-02',montant:100,paiements:[{date:'2026-05-02',montant:100}]}) === 100);
  check('B. legacy « Payé » sans registre : repli conservé', tot({id:5,date:'2026-05-02',montant:100,paiement:'Payé'}) === 100);
  check('B. commande fille : toujours 0 (son argent vit sur la mère)',
    tot({id:6,date:'2026-05-02',montant:100,commandeMereId:1,paiement:'Payé'}) === 0);
  check('B. paiement sans date : rattaché à la date de commande',
    P({id:7,date:'2026-05-02',montant:60,paiements:[{montant:60}]})[0].date === '2026-05-02');
}

// ---- C. Le diagnostic : il TROUVE, et il n'écrit RIEN ----
async function testAudit(){
  const src = extractFunction('auditCaManquant');
  check('C. le diagnostic n\'écrit rien en base',
    !/db\.\w+\.(?:add|put|update|delete|bulkPut|clear)\(/.test(src));

  const orders = [
    { id:1, clientId:1, date:'2026-05-02', montant:100, paiements:[{date:'2026-05-02',montant:100}] }, // OK
    { id:2, clientId:1, date:'2026-05-03', montant:250, paiement:'Partiel' },                          // ①
    { id:3, clientId:1, date:'2026-05-04', montant:80,  paiement:'En attente' },                       // ②
    { id:4, clientId:1, date:'2026-05-05', montant:60,  paiements:[{date:'2026-05-05',montant:0}] },   // ③
    { id:5, clientId:1, date:'2026-05-06', montant:40,  commandeMereId:1 },                            // fille : normal
    { id:6, clientId:1, date:'2026-05-07', montant:0 },                                                // sans montant
    { id:7, clientId:1, date:'2026-05-08', montant:30, reprise:true, paiement:'En attente' },          // historique
  ];
  const db = { orders:{toArray:async()=>orders}, clients:{toArray:async()=>[{id:1,nom:'Alice'}]} };
  const fn = new Function('db','money2','paiementsDe','estReprise', `${src}\nreturn auditCaManquant;`)
    (db, n=>Math.round(n*100)/100, P, o=>!!(o&&o.reprise));
  const r = await fn();

  check('C. les 3 formes problématiques sont détectées', r.cas.length === 3);
  check('C. RÉCONCILIATION : le total en jeu est exact (250+80+60 = 390)', r.totalManquant === 390);
  check('C. une commande fille n\'est PAS signalée (son argent est sur la mère)', !r.cas.some(c=>c.id===5));
  check('C. une commande sans montant n\'est pas signalée', !r.cas.some(c=>c.id===6));
  check('C. une reprise d\'historique n\'est pas signalée (hors CA par construction)', !r.cas.some(c=>c.id===7));
  check('C. une commande correctement encaissée n\'est pas signalée', !r.cas.some(c=>c.id===1));
  check('C. le plus gros montant est présenté en premier', r.cas[0].montant === 250);
  check('C. chaque cas porte un motif lisible', r.cas.every(c=>c.motif && c.motif.length > 10));
  check('C. le motif distingue « Partiel » de « En attente »',
    r.cas.find(c=>c.id===2).motif !== r.cas.find(c=>c.id===3).motif);
  check('C. le nom du client accompagne chaque ligne', r.cas.every(c=>c.client === 'Alice'));
}

// ---- D. L'écran est atteignable depuis les DEUX détails de CA ----
{
  check('D. lien depuis le détail d\'une période du graphique',
    (APP.match(/auditCaManquantUI\(\)/g)||[]).length >= 2);
  const srcUI = extractFunction('auditCaManquantUI');
  check('D. l\'écran n\'écrit rien non plus',
    !/db\.\w+\.(?:add|put|update|delete)\(/.test(srcUI));
  check('D. aucune anomalie → message rassurant, pas un écran vide', /Aucune commande n'échappe/.test(srcUI));
  check('D. chaque ligne ouvre la commande concernée', /cmdView\(\$\{c\.id\}\)/.test(srcUI));
  check('D. l\'écran dit quoi faire', /saisir son encaissement/.test(srcUI));
}

testAudit().then(()=>{
  console.warn = orig;
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e=>{ console.warn = orig; console.error('ERREUR SUITE', e); process.exitCode = 1; });
