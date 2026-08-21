'use strict';
// v1481 — LA VRAIE CAUSE DU CALENDRIER FIGÉ. Ben, après la v1480 : « la modification n'a rien
// apporté. La commande continue d'afficher la date d'origine sur le calendrier, peu importe les
// modifications apportées par la suite ».
//
// 🚨 MA v1480 CORRIGEAIT UN VRAI DÉFAUT, MAIS PAS LE SIEN. J'avais traité la suppression de
// l'ancien événement (`equals` sensible au type) sans tracer la chaîne jusqu'à LA DONNÉE. Or le
// formulaire contient DEUX dates :
//   · « Date » en haut                          → o.date
//   · « Date de livraison », dans le bloc 🚚 Livraison REPLIÉ PAR DÉFAUT → o.dateEvenement
// et `syncOrderEvent` pose `o.dateEvenement || o.date` : la seconde PRIME. Renseignée une fois,
// elle fige le calendrier — modifier la date du haut n'a plus aucun effet.
//
// TRANCHÉ PAR BEN : « une seule date : celle du haut décide de tout ».
//
// CHOIX D'IMPLÉMENTATION : `dateEvenement` est lu à 32 endroits (plan de production, rétroplanning,
// validité des devis). Les réécrire un par un serait risqué. On garde donc le champ en base, mais
// il est ALIMENTÉ par la date du haut — un seul champ à saisir, une seule valeur possible.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. À l'ENREGISTREMENT : la date du haut alimente les deux ----
{
  const i = APP.indexOf("dateEvenement: (val('f_date')");
  const src = APP.slice(Math.max(0, i - 200), i + 200);
  check('A. dateEvenement est alimenté par f_date', /dateEvenement: \(val\('f_date'\)/.test(src));
  check('A. f_date est prioritaire sur l\'ancien champ', /val\('f_date'\)\|\|val\('f_dateEvenement'\)/.test(src));
  check('A. le choix est signalé dans le code', /UNE SEULE DATE/.test(src));
}

// ---- B. Le champ en double a disparu du formulaire ----
{
  check('B. plus de champ de saisie « Date de livraison » séparé', !/id="f_dateEvenement" value=/.test(APP));
  check('B. une mention explique où saisir la date', /une seule date<\/b> pilote la fabrication/.test(APP));
}

// ---- C. LE RATTRAPAGE des commandes existantes ----
async function testMigration(){
  const src = extractFunction('migrerDateUnique');
  check('C. la migration n\'écrit QUE dateEvenement', /update\(o\.id, \{ dateEvenement: o\.date \}\)/.test(src));
  check('C. …jamais l\'inverse (écraser date figerait ce qu\'on corrige)', !/\{ date: o\.dateEvenement/.test(src));
  check('C. elle ne touche pas une commande déjà cohérente', /if\(dev === d\) continue;/.test(src));
  check('C. une commande sans date est ignorée (on ne devine pas)', /if\(!d\) continue;/.test(src));
  check('C. le calendrier est resynchronisé pour chaque commande corrigée', /syncOrderEvent\(o\.id\)/.test(src));
  check('C. elle est idempotente (drapeau)', /sm_dateUniqueMigree/.test(src));

  // Comportement, sur un jeu réaliste.
  const orders = [
    { id:1, date:'2026-10-15', dateEvenement:'2026-09-01' },   // LE CAS DE BEN : figée sur l'ancienne
    { id:2, date:'2026-10-20', dateEvenement:'2026-10-20' },   // déjà cohérente
    { id:3, date:'2026-11-05', dateEvenement:'' },             // jamais renseignée
    { id:4, date:'',           dateEvenement:'2026-09-09' },   // sans date de référence
  ];
  const majs = []; const syncs = [];
  const store = new Map(orders.map(o=>[o.id, Object.assign({}, o)]));
  const db = { orders:{
    toArray: async()=>Array.from(store.values()),
    update: async(id, patch)=>{ majs.push({id, patch}); store.set(id, Object.assign({}, store.get(id), patch)); }
  }};
  const localStorage = { _v:{}, getItem(k){ return this._v[k]||null; }, setItem(k,v){ this._v[k]=v; } };
  const fn = new Function('db','localStorage','syncOrderEvent','toast','swallow', `${src}\nreturn migrerDateUnique;`)
    (db, localStorage, async id=>{ syncs.push(id); }, ()=>{}, ()=>{});

  const n = await fn();
  check('C. 2 commandes réalignées (la figée et celle jamais renseignée)', n === 2);
  check('C. LE CAS DE BEN : la commande 1 prend la date du haut', store.get(1).dateEvenement === '2026-10-15');
  check('C. la commande déjà cohérente n\'est PAS réécrite', !majs.some(m=>m.id===2));
  check('C. la commande sans date n\'est PAS touchée', !majs.some(m=>m.id===4));
  check('C. le calendrier est resynchronisé pour les 2 corrigées', syncs.length === 2 && syncs.includes(1));
  check('C. sa date d\'origine n\'a pas été écrasée dans l\'autre sens', store.get(1).date === '2026-10-15');

  // Relancée : plus rien à faire.
  const n2 = await fn();
  check('C. relancée, elle ne refait rien (idempotente)', n2 === 0);
}

// ---- D. RÉCONCILIATION : la date du calendrier suit désormais la date de la commande ----
async function testSync(){
  const src = extractFunction('syncOrderEvent');
  // La règle `dateEvenement || date` est CONSERVÉE : elle reste correcte une fois les deux alignés,
  // et protège les commandes d'événement dont la livraison précède la prestation.
  check('D. syncOrderEvent garde sa règle de priorité', /o\.dateEvenement \|\| o\.date/.test(src));

  const events = [];
  const db = {
    orders:{ get: async()=>({ id:7, clientId:1, date:'2026-10-15', dateEvenement:'2026-10-15', lignes:[{}] }) },
    clients:{ get: async()=>({ id:1, nom:'Alice' }) },
    orderItems:{ where:()=>({ equals:()=>({ toArray: async()=>[] }) }) },
    events:{ toArray: async()=>events.slice(),
      delete: async(id)=>{ const i=events.findIndex(e=>e.id===id); if(i>=0) events.splice(i,1); },
      add: async(e)=>{ events.push(Object.assign({id:1}, e)); } }
  };
  const mod = new Function('db','swallow', `
    ${extractFunction('purgeEventsCommande')}
    ${extractFunction('syncOrderEvent')}
    return syncOrderEvent;
  `)(db, ()=>{});
  await mod(7);
  check('D. une fois les deux dates alignées, le calendrier affiche la bonne',
    events.length === 1 && events[0].date === '2026-10-15');
}

(async()=>{
  await testMigration();
  await testSync();
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
