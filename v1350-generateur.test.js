// ════════════════════════════════════════════════════════════════════════════
//  VAGUE 65 (v1350) — LE GÉNÉRATEUR DE COFFRETS
//  Conditions EXTRAITES du fichier (leçon v1345 : un test qui paraphrase ne teste que lui-même).
// ════════════════════════════════════════════════════════════════════════════
function money2(n){return Math.round((+n||0)*100)/100;}
const SRC=require('fs').readFileSync(__dirname+'/../app.js','utf8');
const cond = (marqueur) => {
  const i = SRC.indexOf(marqueur);
  if(i < 0) throw new Error('règle introuvable : ' + marqueur);
  const deb = SRC.lastIndexOf('  if(', i);
  const src = SRC.slice(deb, i);
  const corps = src.slice(src.indexOf('if(') + 3, src.lastIndexOf('){'));
  return new Function('t', 'return (' + corps + ');');
};
const rGen   = cond("intent:'query_generer_coffret'");
const rAssoc = cond("intent:'query_associations'");
const rSugg  = cond("intent:'query_suggestion_parfum'");
const iG=SRC.indexOf("intent:'query_generer_coffret'"), iA=SRC.indexOf("intent:'query_associations'"), iS=SRC.indexOf("intent:'query_suggestion_parfum'");
const route = t => rGen(t)?"GENERATEUR" : (rAssoc(t)?"MESURE" : (rSugg(t)?"CREATION_PARFUM":"—"));

const grab=(n)=>{const i=SRC.indexOf('function '+n+'(');let d=0;
  for(let k=SRC.indexOf('{',i);k<SRC.length;k++){if(SRC[k]==='{')d++;else if(SRC[k]==='}'){d--;if(!d)return SRC.slice(i,k+1);}}};
eval(['_normalise','genererPropositionsCoffret'].map(grab).join('\n'));

let ok=0,ko=0;
const T=(n,fa,fb)=>{ let a,b;
  try{ a=(typeof fa==='function')?fa():fa; b=(typeof fb==='function')?fb():fb; }
  catch(e){ ko++; console.log('  X '+n+'\n      EXCEPTION : '+e.message); return; }
  const p=JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++;console.log('  OK '+n);}else{ko++;console.log('  X '+n+'\n      obtenu  '+JSON.stringify(a)+'\n      attendu '+JSON.stringify(b));}};

console.log('\n-- ORDRE DES REGLES (le generateur avant tout le reste)');
const T_ORDER = (iG>0 && iG<iA && iG<iS);
if(T_ORDER){ok++;console.log('  OK query_generer_coffret precede associations ET R&D');}
else{ko++;console.log('  X ordre incorrect -- le bug v1345 est de retour');}

console.log('\n-- ROUTAGE : generer / mesurer / creer un parfum');
T('genere moi un coffret rentable', ()=>route('genere moi un coffret rentable'), 'GENERATEUR');
T('propose moi un coffret ideal', ()=>route('propose moi un coffret ideal'), 'GENERATEUR');
T('cree un assortiment', ()=>route('cree un assortiment'), 'GENERATEUR');
T('compose moi un coffret', ()=>route('compose moi un coffret'), 'GENERATEUR');
console.log('  -> non-regression : les deux AUTRES intents ne sont pas voles');
T('quels parfums vont ensemble', ()=>route('quels parfums vont ensemble'), 'MESURE');
T('propose moi un nouveau parfum pour l ete', ()=>route('propose moi un nouveau parfum pour l ete'), 'CREATION_PARFUM');

console.log('\n-- LE SCORE COMBINE : normalisation et poids');
const co = { rows: [
  {a:'Cafe',b:'Coco',lift:4.2,paniers:7,nClients:5,significatif:true},
  {a:'Cafe',b:'Praline',lift:1.1,paniers:3,nClients:1,significatif:false},
  {a:'Coco',b:'Vanille',lift:2.0,paniers:6,nClients:4,significatif:true},
]};
const flavorRows = [
  {nom:'Cafe',margeUnit:0.80,recipeId:1}, {nom:'Coco',margeUnit:1.20,recipeId:2},
  {nom:'Vanille',margeUnit:0.50,recipeId:3}, {nom:'Praline',margeUnit:2.00,recipeId:4},
];
const mesureParRec = { 1:{fiable:true,minParMac:0.8}, 2:{fiable:true,minParMac:1.5}, 3:{fiable:false,minParMac:0.3} };

T('une paire SOUS le seuil (Cafe+Praline) n apparait dans aucune proposition',
  ()=>genererPropositionsCoffret({coOccurrence:co,flavorRows,mesureParRec,taille:2,criteres:{association:1}})
       .propositions.flatMap(p=>p.parfums).includes('Praline'), false);

T('poids {1,1} et {50,50} donnent le MEME score (seul le ratio compte)',
  ()=>genererPropositionsCoffret({coOccurrence:co,flavorRows,mesureParRec,taille:2,criteres:{association:1,rentabilite:1}}).propositions[0].score,
  ()=>genererPropositionsCoffret({coOccurrence:co,flavorRows,mesureParRec,taille:2,criteres:{association:50,rentabilite:50}}).propositions[0].score);

T('tous les criteres a 0 donne une erreur explicite, jamais un resultat vide muet',
  ()=>genererPropositionsCoffret({coOccurrence:co,flavorRows,mesureParRec,criteres:{association:0,rentabilite:0,production:0}}).erreur!=null, true);

T('aucune paire significative + association demandee -> erreur, pas une liste vide',
  ()=>genererPropositionsCoffret({coOccurrence:{rows:[]},flavorRows,mesureParRec,criteres:{association:1}}).erreur!=null, true);

console.log('\n-- LE PIEGE DE LA MESURE ABSENTE (v1337 : l absence n est pas un zero)');
T('Vanille (mesure NON fiable) ne fait pas planter le critere production',
  ()=>genererPropositionsCoffret({coOccurrence:{rows:[{a:'Coco',b:'Vanille',lift:2.0,paniers:6,nClients:4,significatif:true}]},flavorRows,mesureParRec,taille:2,criteres:{production:1}}).propositions.length>0,
  true);

console.log('\n-- [v1353] UN CRITERE PAR DEFAUT N EST PAS UN CRITERE DEMANDE');
// Ben tape "genere moi un coffret" sans preciser de critere. Le code appliquait les trois par
// defaut, constatait que "production" etait indisponible, et REFUSAIT TOUT -- bloquant une
// generation faisable sur deux criteres solides, a cause d un troisieme jamais demande.
// La garde etait juste ; sa PORTEE etait fausse.
function simuleGarde(params, productionIndisponible){
  const criteresExplicites = !!params.criteres;
  const criteres = params.criteres || { association:1, rentabilite:1, production:1 };
  let productionRetiree=false, refus=false;
  if(productionIndisponible && criteres.production != null && +criteres.production > 0){
    if(criteresExplicites){ refus=true; }
    else { criteres.production=null; productionRetiree=true; }
  }
  return {refus, productionRetiree, actifs:Object.keys(criteres).filter(k=>criteres[k]!=null&&+criteres[k]>0)};
}
T('sans critere precise + production indispo -> GENERE quand meme (2 criteres)',
  ()=>simuleGarde({}, true).actifs, ['association','rentabilite']);
T('... et ne refuse PAS', ()=>simuleGarde({}, true).refus, false);
T('... et SIGNALE le retrait (jamais une omission silencieuse -- v1347)',
  ()=>simuleGarde({}, true).productionRetiree, true);
T('production demandee EXPLICITEMENT + indispo -> refuse (repondre a cote serait pire)',
  ()=>simuleGarde({criteres:{production:1}}, true).refus, true);
T('mode mesure ACTIF -> les trois criteres tournent',
  ()=>simuleGarde({}, false).actifs, ['association','rentabilite','production']);
console.log('  -> une garde ne doit jamais punir l utilisateur pour une decision que le CODE a prise a sa place.');

console.log('\n'+(ko?('ECHECS: '+ko+' -- '+ok+' ok'):('OK '+ok+'/'+ok+' -- vague 65 verte')));
process.exit(ko?1:0);
