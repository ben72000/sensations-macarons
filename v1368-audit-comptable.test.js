// ════════════════════════════════════════════════════════════════════════════
//  v1368 — LE DÉTECTEUR D'ANOMALIES COMPTABLES
//
//  Ben : « une app qui crée des mensonges en douce […] Si les chiffres mentent c'est la fin de la
//  confiance. Construisons l'outil permettant de tracer toute déviance, tout mensonge. »
//
//  Un détecteur de mensonges ne vaut que s'il ATTRAPE les mensonges. Ces tests fabriquent des
//  données VOLONTAIREMENT fausses et vérifient que chaque invariant MORD. Un contrôle qui ne
//  déclenche jamais est un contrôle décoratif (leçon v1358).
//
//  PRINCIPE (v1368) : le détecteur ne recalcule pas la compta, il vérifie qu'elle ne se CONTREDIT
//  pas. Chaque invariant est une égalité qui doit tenir ; sa violation désigne une donnée inventée.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = async (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? await fa() : fa; b = (typeof fb === 'function') ? await fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '  EXCEPTION ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

// On reconstruit l'environnement minimal pour exécuter auditComptable sur une fausse DB.
function money2(n){ return Math.round((+n || 0) * 100) / 100; }
function euro(n){ return money2(n).toFixed(2).replace('.', ',') + ' €'; }
function swallow(){}
function orderNumber(o){ return 'CMD-' + o.id; }
function estReprise(o){ return !!o.histo; }
function paiementsDe(o){
  if(Array.isArray(o.paiements) && o.paiements.some(p=>p&&(+p.montant)))
    return o.paiements.filter(p=>p&&(+p.montant)||p.moyen||p.date).map(p=>({date:p.date||o.date||'',montant:money2(+p.montant||0),moyen:p.moyen||'—'}));
  if(o.paiement==='Payé') return [{date:o.datePaiement||o.date||'',montant:money2(o.montant),moyen:o.reglement||'—'}];
  return [];
}
function orderPaid(o){
  if((!o.paiements||!o.paiements.length)&&o.paiement==='Payé') return money2(o.montant);
  return money2((o.paiements||[]).reduce((s,p)=>s+((+p.montant)||0),0));
}
function orderBalance(o){ return money2(((+o.montant)||0)-orderPaid(o)); }

// Fausse DB pilotée par les tableaux qu'on injecte
let _orders=[], _markets=[];
const db = {
  orders:  { toArray: async()=>_orders },
  markets: { toArray: async()=>_markets },
};
// livreDesRecettes et computeAccounting : stubs cohérents pour l'invariant 7
let _stubLivre=[], _stubCA=0;
async function livreDesRecettes(){ return _stubLivre; }
async function computeAccounting(){ return { totalEncaisse:_stubCA }; }

// EXTRACTION du vrai code (pas de paraphrase — v1345)
const grab = (n) => { const i = SRC.indexOf('function ' + n + '('); if (i < 0) throw new Error('introuvable: '+n);
  let d=0; for(let k=SRC.indexOf('{',i);k<SRC.length;k++){ if(SRC[k]==='{')d++; else if(SRC[k]==='}'){d--; if(!d) return SRC.slice(i,k+1);} } };
const grabAsync = (n) => { const i = SRC.indexOf('async function ' + n + '('); if (i < 0) throw new Error('introuvable: '+n);
  let d=0; for(let k=SRC.indexOf('{',i);k<SRC.length;k++){ if(SRC[k]==='{')d++; else if(SRC[k]==='}'){d--; if(!d) return SRC.slice(i,k+1);} } };
eval(grab('_auditAnomalie'));
// auditComptable est async : on l'extrait avec son mot-cle async intact, et on l'assigne a une var.
let auditComptable;
eval('auditComptable = ' + grabAsync('auditComptable').replace('async function auditComptable(opts)', 'async function(opts)'));

const codesFor = async (orders, markets, opts) => {
  _orders=orders||[]; _markets=markets||[];
  const a = await auditComptable(opts||{});
  return a.map(x=>x.code);
};

(async ()=>{
  console.log('\n-- INVARIANT 1 : encaissé > dû → CRITIQUE');
  await T('encaissé 150 sur une commande de 100 -> ENCAISSE_SUP_DU',
    async()=>(await codesFor([{id:1,montant:100,paiements:[{date:'2026-05-01',montant:150,moyen:'Carte'}]}])).includes('ENCAISSE_SUP_DU'), true);
  await T('encaissé = dû -> aucune anomalie de dépassement',
    async()=>(await codesFor([{id:2,montant:100,paiements:[{date:'2026-05-01',montant:100,moyen:'Carte'}]}])).includes('ENCAISSE_SUP_DU'), false);

  console.log('\n-- INVARIANT 2 : « Payé » sans montant ni écriture → ALERTE');
  await T('Payé + montant 0 + aucun paiement -> PAYE_SANS_MONTANT',
    async()=>(await codesFor([{id:3,montant:0,paiement:'Payé',paiements:[]}])).includes('PAYE_SANS_MONTANT'), true);

  console.log('\n-- INVARIANT 3 : encaissement sans date / moyen = statut');
  await T('paiement sans date -> ENCAISSE_SANS_DATE',
    async()=>(await codesFor([{id:4,montant:50,date:'',paiements:[{date:'',montant:50,moyen:'Carte'}]}])).includes('ENCAISSE_SANS_DATE'), true);
  await T('moyen « Acompte » -> MOYEN_EST_STATUT',
    async()=>(await codesFor([{id:5,montant:50,date:'2026-05-01',paiements:[{date:'2026-05-01',montant:50,moyen:'Acompte'}]}])).includes('MOYEN_EST_STATUT'), true);

  console.log('\n-- INVARIANT 4 : « Payé » mais solde positif → CRITIQUE');
  await T('Payé mais reste 40 à encaisser -> PAYE_MAIS_SOLDE',
    async()=>(await codesFor([{id:6,montant:100,paiement:'Payé',paiements:[{date:'2026-05-01',montant:60,moyen:'Carte'}]}])).includes('PAYE_MAIS_SOLDE'), true);

  console.log('\n-- INVARIANT 5 : reprise sans montant/date → ALERTE');
  await T('reprise sans montant -> REPRISE_SANS_MONTANT',
    async()=>(await codesFor([{id:7,histo:true,montant:0,date:'2025-01-01'}])).includes('REPRISE_SANS_MONTANT'), true);

  console.log('\n-- INVARIANT 6 : fond de caisse > espèces → CRITIQUE');
  await T('fond 100 > espèces 50 -> FOND_SUP_ESPECES',
    async()=>(await codesFor([],[{id:1,statut:'clos',date:'2026-05-01',fondCaisse:100,ca:{especes:50,cb:0,autre:0}}])).includes('FOND_SUP_ESPECES'), true);
  await T('fond 50 <= espèces 200 -> pas d anomalie de fond',
    async()=>(await codesFor([],[{id:2,statut:'clos',date:'2026-05-01',fondCaisse:50,ca:{especes:200,cb:0,autre:0}}])).includes('FOND_SUP_ESPECES'), false);

  console.log('\n-- INVARIANT 7 : livre des recettes vs CA encaissé (le contrôle-maître)');
  _stubLivre=[{montant:300,canal:'Commande'},{montant:200,canal:'Marché'}]; _stubCA=500;
  await T('livre 500 = CA 500 -> aucune divergence',
    async()=>(await codesFor([])).includes('LIVRE_VS_CA'), false);
  _stubLivre=[{montant:300,canal:'Commande'},{montant:200,canal:'Marché'}]; _stubCA=450;
  await T('livre 500 vs CA 450 -> LIVRE_VS_CA (50 d écart)',
    async()=>(await codesFor([])).includes('LIVRE_VS_CA'), true);
  _stubLivre=[{montant:300,canal:'Commande'},{montant:999,canal:'Reprise historique'}]; _stubCA=300;
  await T('les reprises sont EXCLUES de la comparaison (même périmètre)',
    async()=>(await codesFor([])).includes('LIVRE_VS_CA'), false);

  console.log('\n-- UNE BASE SAINE NE DÉCLENCHE RIEN (pas de faux positif)');
  _stubLivre=[{montant:100,canal:'Commande'}]; _stubCA=100;
  await T('commande normale payée juste -> 0 anomalie',
    async()=>(await codesFor([{id:9,montant:100,paiement:'Payé',paiements:[{date:'2026-05-01',montant:100,moyen:'Carte'}]}])).length, 0);

  console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- le detecteur attrape chaque mensonge')));
  process.exit(ko ? 1 : 0);
})();
