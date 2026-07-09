/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 13 : computeTresorerie (trésorerie prospective)
   ----------------------------------------------------------------------------
   Fige le comportement du moteur de projection J+30/60/90 : agrégation des
   créances (par dateLivraison, reprises exclues), des charges ponctuelles et
   récurrentes futures, et le calcul du solde projeté à chaque jalon.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function ymd(date){ return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'); }
function plusDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return ymd(d); }
function todayStr(){ return ymd(new Date()); }

function buildModule(){
  const money2         = extractConstLine('money2');
  const orderToLines   = extractFunction('orderToLines');
  const estReprise     = extractFunction('estReprise');
  const orderPaid      = extractFunction('orderPaid');
  const orderBalance   = extractFunction('orderBalance');
  const computeTresorerie = extractFunction('computeTresorerie');
  const code = `
    ${money2}
    // today() réimplémentée localement (extractConstLine ne gère que le mono-ligne ;
    // l'original app.js, multi-lignes, a le même corps : new Date() formaté YYYY-MM-DD).
    const today = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    ${orderToLines}
    ${estReprise}
    ${orderPaid}
    ${orderBalance}
    ${computeTresorerie}
    return { computeTresorerie };
  `;
  const factory = new Function('db', 'getSettings', 'getRecurringCharges', code);
  return factory;
}

function makeEnv({orders=[], clients=[], charges=[], settings={}, recurring=[], documents=[]}){
  const db = {
    orders: { toArray: async()=>orders.slice() },
    clients: { toArray: async()=>clients.slice() },
    charges: { toArray: async()=>charges.slice() },
    documents: { where: (field) => ({ equals: (val) => ({ toArray: async()=>documents.filter(d=>d[field]===val) }) }) }
  };
  const getSettings = () => Object.assign({ soldeBancaire:null, soldeBancaireDate:null }, settings);
  const getRecurringCharges = () => recurring.slice();
  return { db, getSettings, getRecurringCharges };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Solde non saisi : jalons présents mais solveur=null (pas de faux zéro) ──
{
  const env = makeEnv({ settings:{soldeBancaire:null} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  eq(r.solde, null, 'CAS1 · solde non saisi reste null');
  eq(r.jalons.map(j=>j.solveur), [null,null,null], 'CAS1 · solveur null à tous les jalons tant que le solde n\'est pas saisi');
}

// ── CAS 2 — Créance dans les 30j comptée, hors 90j exclue ──
{
  const orders = [
    { id:1, clientId:1, montant:100, dateLivraison: plusDays(10), paiements:[] },   // dans J+30
    { id:2, clientId:1, montant:50,  dateLivraison: plusDays(75), paiements:[] },   // dans J+90 seulement
    { id:3, clientId:1, montant:80,  dateLivraison: plusDays(200), paiements:[] }   // hors tout horizon
  ];
  const env = makeEnv({ orders, clients:[{id:1,nom:'Client A'}], settings:{soldeBancaire:500} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  const j30 = r.jalons.find(j=>j.nbJours===30);
  const j90 = r.jalons.find(j=>j.nbJours===90);
  eq(j30.totCreances, 100, 'CAS2 · J+30 ne compte que la créance à 10 jours');
  eq(j90.totCreances, 150, 'CAS2 · J+90 compte les créances à 10 et 75 jours (100+50)');
  eq(j30.solveur, 600, 'CAS2 · solveur J+30 = 500 + 100');
  eq(r.totalCreances, 230, 'CAS2 · total toutes créances = 100+50+80');
}

// ── CAS 3 — Commande soldée (payée) n'est PAS une créance ──
{
  const orders = [
    { id:1, clientId:1, montant:100, dateLivraison: plusDays(5), paiements:[{date:todayStr(),montant:100,moyen:'Carte'}] }
  ];
  const env = makeEnv({ orders, clients:[{id:1,nom:'Client A'}], settings:{soldeBancaire:0} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  eq(r.totalCreances, 0, 'CAS3 · commande intégralement payée exclue des créances');
}

// ── CAS 4 — Reprise (histo) exclue des créances même si solde dû ──
{
  const orders = [
    { id:1, clientId:1, montant:100, histo:true, dateLivraison: plusDays(5), paiements:[] }
  ];
  const env = makeEnv({ orders, clients:[{id:1,nom:'Client A'}], settings:{soldeBancaire:0} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  eq(r.totalCreances, 0, 'CAS4 · reprise exclue des créances (CA déjà déclaré dans le passé)');
}

// ── CAS 5 — Charge récurrente active projetée dans le bon jalon ──
{
  const jourDuMois = new Date(); jourDuMois.setDate(jourDuMois.getDate()+15);
  const recurring = [{ id:'rc1', libelle:'Assurance', montant:60, jourMois: jourDuMois.getDate(), actif:true }];
  const env = makeEnv({ settings:{soldeBancaire:1000}, recurring });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  const j30 = r.jalons.find(j=>j.nbJours===30);
  eq(j30.totCharges, 60, 'CAS5 · charge récurrente à J+15 comptée dans le jalon J+30');
  eq(j30.solveur, 940, 'CAS5 · solveur J+30 = 1000 - 60');
}

// ── CAS 6 — Charge récurrente en pause (actif:false) ignorée ──
{
  const jourDuMois = new Date(); jourDuMois.setDate(jourDuMois.getDate()+10);
  const recurring = [{ id:'rc1', libelle:'Abonnement suspendu', montant:60, jourMois: jourDuMois.getDate(), actif:false }];
  const env = makeEnv({ settings:{soldeBancaire:1000}, recurring });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  const j30 = r.jalons.find(j=>j.nbJours===30);
  eq(j30.totCharges, 0, 'CAS6 · charge récurrente en pause ignorée de la projection');
}

// ── CAS 7 — Charge ponctuelle future (déjà saisie dans charges) comptée ──
{
  const env = makeEnv({ charges:[{date:plusDays(20), libelle:'Achat matériel', montant:150}], settings:{soldeBancaire:200} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  const j30 = r.jalons.find(j=>j.nbJours===30);
  eq(j30.totCharges, 150, 'CAS7 · charge ponctuelle future entre dans la projection');
  eq(j30.solveur, 50, 'CAS7 · solveur J+30 = 200 - 150');
}

// ── CAS 8 — [v1283] Avoir émis sur une commande NON soldée réduit la créance projetée ──
{
  const orders = [
    { id:1, clientId:1, montant:200, dateLivraison: plusDays(10), paiements:[] }   // rien encaissé, tout dû
  ];
  const documents = [
    { type:'avoir', statut:'emis', orderId:1, montant:80 }   // remboursement partiel avant tout paiement
  ];
  const env = makeEnv({ orders, clients:[{id:1,nom:'Client A'}], documents, settings:{soldeBancaire:100} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  eq(r.totalCreances, 120, 'CAS8 · créance réduite par l\'avoir : 200 - 80 = 120 (pas 200)');
  const j30 = r.jalons.find(j=>j.nbJours===30);
  eq(j30.solveur, 220, 'CAS8 · solveur J+30 = 100 + 120');
}

// ── CAS 9 — Avoir couvrant l'intégralité du solde dû : créance nulle, pas négative ──
{
  const orders = [ { id:1, clientId:1, montant:100, dateLivraison: plusDays(5), paiements:[] } ];
  const documents = [ { type:'avoir', statut:'emis', orderId:1, montant:150 } ];   // avoir > solde dû (edge case)
  const env = makeEnv({ orders, clients:[{id:1,nom:'Client A'}], documents, settings:{soldeBancaire:0} });
  const m = buildModule()(env.db, env.getSettings, env.getRecurringCharges);
  const r = await m.computeTresorerie();
  eq(r.totalCreances, 0, 'CAS9 · créance jamais négative même si avoir > solde dû (borné à 0)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 13 : computeTresorerie ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
