// ════════════════════════════════════════════════════════════════════════════
//  v1369 — LE DÉTECTEUR ÉTENDU AU STOCK ET AU TEMPS
//
//  Ben : « développe cet outil dans les stocks, en particulier la décrémentation des matières
//  premières […] applique-le aussi à l'atelier chrono et au calcul du temps réel par recette. »
//
//  STOCK = une CHAÎNE qui doit rester continue : chaque prélèvement correspond à une matière qui
//  existait, en quantité suffisante. TEMPS = un RATIO (min ÷ macarons) dont les deux termes doivent
//  être réels et représentatifs.
//
//  Comme en v1368 : le détecteur ne vaut que s'il ATTRAPE. On fabrique du faux, on vérifie qu'il mord.
// ════════════════════════════════════════════════════════════════════════════
const SRC = require('fs').readFileSync(__dirname + '/../app.js', 'utf8');

let ok = 0, ko = 0;
const T = async (n, fa, fb) => { let a, b;
  try { a = (typeof fa === 'function') ? await fa() : fa; b = (typeof fb === 'function') ? await fb() : fb; }
  catch (e) { ko++; console.log('  X ' + n + '  EXCEPTION ' + e.message); return; }
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) { ok++; console.log('  OK ' + n); }
  else { ko++; console.log('  X ' + n + '\n      obtenu  ' + JSON.stringify(a) + '\n      attendu ' + JSON.stringify(b)); } };

function round3(n){ return Math.round((+n||0)*1000)/1000; }
function money2(n){ return Math.round((+n||0)*100)/100; }
function qty(n){ return String(round3(n)); }
function swallow(){}
const COQUES_PAR_MACARON = 2;

// Fausse DB pilotée
let _lots=[], _conso=[], _prods=[], _mats=[], _recipes=[], _sessions=[];
const db = {
  materialLots:    { toArray: async()=>_lots },
  prodConsumption: { toArray: async()=>_conso },
  productions:     { toArray: async()=>_prods },
  materials:       { toArray: async()=>_mats },
  recipes:         { toArray: async()=>_recipes },
};
function prodSessLoad(){ return _sessions; }
function ymdLocal(d){ return d.toISOString().slice(0,10); }
function prodSessTempsParRecette(s){ return s._parRec || {}; }
async function prodTempsParParfum(){ return _tpp; }
let _tpp = {};

const grabAsync = (n) => { const i = SRC.indexOf('async function ' + n + '('); if (i<0) throw new Error('introuvable: '+n);
  let d=0; for(let k=SRC.indexOf('{',i);k<SRC.length;k++){ if(SRC[k]==='{')d++; else if(SRC[k]==='}'){d--; if(!d) return SRC.slice(i,k+1);} } };
const grab = (n) => { const i = SRC.indexOf('function ' + n + '('); if (i<0) throw new Error('introuvable: '+n);
  let d=0; for(let k=SRC.indexOf('{',i);k<SRC.length;k++){ if(SRC[k]==='{')d++; else if(SRC[k]==='}'){d--; if(!d) return SRC.slice(i,k+1);} } };
eval(grab('_auditAnomalie'));
let auditStock, auditTemps;
eval('auditStock = ' + grabAsync('auditStock').replace('async function auditStock()','async function()'));
eval('auditTemps = ' + grabAsync('auditTemps').replace('async function auditTemps(jours)','async function(jours)'));

const codesStock = async () => (await auditStock()).map(a=>a.code);
const codesTemps = async (j) => (await auditTemps(j)).map(a=>a.code);

(async()=>{
  console.log('\n-- STOCK S1 : conso sur un lot fantôme → CRITIQUE');
  _mats=[{id:1,nom:'Amande'}]; _prods=[{id:10,lotProduction:'AMD-01'}];
  _lots=[]; _conso=[{productionId:10,materialLotId:999,qteConsommee:5}];
  await T('conso pointant un lot inexistant -> CONSO_LOT_FANTOME',
    async()=>(await codesStock()).includes('CONSO_LOT_FANTOME'), true);

  console.log('\n-- STOCK S2 : lot surconsommé → CRITIQUE');
  _lots=[{id:1,materialId:1,qteInitiale:10,qteRestante:0}];
  _conso=[{productionId:10,materialLotId:1,qteConsommee:8},{productionId:11,materialLotId:1,qteConsommee:5}];
  await T('13 consommés sur un lot de 10 -> LOT_SURCONSOMME',
    async()=>(await codesStock()).includes('LOT_SURCONSOMME'), true);

  console.log('\n-- STOCK S3 : restant incohérent → ALERTE');
  _lots=[{id:1,materialId:1,qteInitiale:100,qteRestante:80}];   // 100-30=70 attendu, 80 affiché
  _conso=[{productionId:10,materialLotId:1,qteConsommee:30}];
  await T('restant affiché ≠ initiale − consommé -> RESTANT_INCOHERENT',
    async()=>(await codesStock()).includes('RESTANT_INCOHERENT'), true);

  _lots=[{id:1,materialId:1,qteInitiale:100,qteRestante:70}];   // 100-30=70 : cohérent
  _conso=[{productionId:10,materialLotId:1,qteConsommee:30}];
  await T('restant = initiale − consommé -> aucune incohérence',
    async()=>(await codesStock()).includes('RESTANT_INCOHERENT'), false);

  console.log('\n-- STOCK S4 : restant négatif → CRITIQUE');
  _lots=[{id:1,materialId:1,qteInitiale:10,qteRestante:-3}]; _conso=[];
  await T('stock restant négatif -> RESTANT_NEGATIF',
    async()=>(await codesStock()).includes('RESTANT_NEGATIF'), true);

  console.log('\n-- STOCK S5 : production faite sans conso → INFO');
  _lots=[]; _conso=[]; _mats=[];
  _prods=[{id:20,lotProduction:'PIS-01',recipeId:3,qteReelle:120,statut:'Terminée'}];
  await T('production terminée sans consommation -> PROD_SANS_CONSO',
    async()=>(await codesStock()).includes('PROD_SANS_CONSO'), true);

  console.log('\n-- UNE CHAÎNE STOCK SAINE NE DÉCLENCHE RIEN');
  _mats=[{id:1,nom:'Amande'}];
  _lots=[{id:1,materialId:1,qteInitiale:100,qteRestante:70}];
  _conso=[{productionId:30,materialLotId:1,qteConsommee:30}];
  _prods=[{id:30,lotProduction:'X',recipeId:3,qteReelle:120,statut:'Terminée'}];
  await T('chaîne complète et cohérente -> 0 anomalie',
    async()=>(await codesStock()).length, 0);

  console.log('\n-- TEMPS T1 : durée négative → CRITIQUE');
  _recipes=[{id:3,produitNom:'Pistache'}];
  _sessions=[{date:'2026-07-01',tasks:[{recipeId:3,start:'2026-07-01T10:00:00',end:'2026-07-01T09:00:00'}]}];
  _tpp={};
  await T('tâche finissant avant de commencer -> TACHE_DUREE_NEGATIVE',
    async()=>(await codesTemps(90)).includes('TACHE_DUREE_NEGATIVE'), true);

  console.log('\n-- TEMPS T2 : temps mesuré mais non fiable → INFO');
  _sessions=[]; _prods=[];
  _tpp={ 3:{ minParMac:0.5, minAtelier:10, nbMac:12, fiable:false } };
  await T('temps présenté mais non fiable -> TEMPS_NON_FIABLE',
    async()=>(await codesTemps(90)).includes('TEMPS_NON_FIABLE'), true);

  _tpp={ 3:{ minParMac:0.5, minAtelier:60, nbMac:120, fiable:true } };
  await T('temps fiable -> aucune anomalie de fiabilité',
    async()=>(await codesTemps(90)).includes('TEMPS_NON_FIABLE'), false);

  console.log('\n-- TEMPS T3 : temps d atelier sans production → ALERTE');
  const auj = new Date().toISOString().slice(0,10);
  _tpp={};
  _sessions=[{date:auj, _parRec:{ 3: 30*60000 }}];   // 30 min sur recette 3
  _prods=[];   // aucune production
  await T('30 min d atelier, 0 macaron produit -> TEMPS_SANS_PRODUCTION',
    async()=>(await codesTemps(90)).includes('TEMPS_SANS_PRODUCTION'), true);

  console.log('\n' + (ko ? ('ECHECS: ' + ko + ' -- ' + ok + ' ok') : ('OK ' + ok + '/' + ok + ' -- stock et temps : chaque rupture est detectee')));
  process.exit(ko ? 1 : 0);
})();
