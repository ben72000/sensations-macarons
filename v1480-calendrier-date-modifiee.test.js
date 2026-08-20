'use strict';
// v1480 — LE CALENDRIER GARDE LA DATE INITIALE. Ben : « Une commande initialement prévue à une date
// qui s'intègre au calendrier ne se met pas à jour lorsque la date est modifiée ultérieurement.
// Ainsi le calendrier affiche toujours la date initialement enregistrée. »
//
// 🚨 CAUSE, VÉRIFIÉE DANS LE MOTEUR (dexie.min.js) : `equals(v)` est implémenté par
//    `x => x[index] === v` — une égalité STRICTE, donc SENSIBLE AU TYPE. Un `refId` enregistré en
//    NOMBRE n'est jamais retrouvé par une recherche avec une CHAÎNE, et inversement. L'ancien
//    événement survivait donc à la mise à jour, pendant que le nouveau s'ajoutait à côté : la date
//    initiale restait affichée, doublée par la nouvelle.
//
// Le même `equals(id)` servait sur DEUX autres chemins (suppression de commande, conversion en
// devis) — un seul avait été corrigé, la faille aurait persisté ailleurs. D'où une purge UNIQUE.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// Bac à sable : une base d'événements où l'on peut choisir le TYPE du refId stocké.
function bac(refIdStocke){
  const events = [{ id:1, date:'2026-09-01', type:'cmd', titre:'Cmd Alice (1 produit)', refId:refIdStocke }];
  const db = {
    orders:{ get: async()=>({ id:7, clientId:1, date:'2026-10-15', lignes:[{}] }) },
    clients:{ get: async()=>({ id:1, nom:'Alice' }) },
    orderItems:{ where:()=>({ equals:()=>({ toArray: async()=>[] }) }) },
    events:{
      toArray: async()=>events.slice(),
      delete: async(id)=>{ const i=events.findIndex(e=>e.id===id); if(i>=0) events.splice(i,1); },
      add: async(e)=>{ events.push(Object.assign({id:100+events.length}, e)); },
      // ⚠️ Reproduit fidèlement le `equals` de dexie.min.js : `x => x[index] === v`, comparaison
      // STRICTE. Fourni pour que la mutation (retour à l'ancien code) soit MESURABLE au lieu de
      // planter — une suite qui plante ne prouve pas que le défaut est détecté.
      where:(idx)=>({ equals:(v)=>({ delete: async()=>{
        for(let i=events.length-1;i>=0;i--) if(events[i][idx]===v) events.splice(i,1);
      }})})
    }
  };
  const mod = new Function('db','swallow', `
    ${extractFunction('purgeEventsCommande')}
    ${extractFunction('syncOrderEvent')}
    return { purgeEventsCommande, syncOrderEvent };
  `)(db, ()=>{});
  return { mod, events };
}

// ---- A. LE CAS DE BEN : la date change, le calendrier suit ----
async function testCas(){
  for(const [stocke, oid, label] of [
    [7,   7,   'refId nombre · appel nombre'],
    [7,   '7', 'refId NOMBRE · appel CHAÎNE'],
    ['7', 7,   'refId CHAÎNE · appel nombre'],
    ['7', '7', 'refId chaîne · appel chaîne'],
  ]){
    const { mod, events } = bac(stocke);
    await mod.syncOrderEvent(oid);
    const cmd = events.filter(e => e.type === 'cmd');
    check(`A. ${label} → UN seul événement`, cmd.length === 1);
    check(`A. ${label} → à la NOUVELLE date (15/10)`, cmd.length === 1 && cmd[0].date === '2026-10-15');
    check(`A. ${label} → l'ancienne date (01/09) a disparu`, !cmd.some(e => e.date === '2026-09-01'));
  }
}

// ---- B. Rattrapage : les doublons DÉJÀ créés par le défaut sont nettoyés ----
async function testRattrapage(){
  const events = [
    { id:1, date:'2026-09-01', type:'cmd', refId:7 },     // ancien, laissé par le bug
    { id:2, date:'2026-09-20', type:'cmd', refId:'7' },   // autre résidu, type différent
    { id:3, date:'2026-09-05', type:'marche', refId:7 },  // AUTRE type : ne doit PAS être touché
    { id:4, date:'2026-09-06', type:'cmd', refId:9 },     // AUTRE commande : ne doit PAS être touchée
  ];
  const db = {
    orders:{ get: async()=>({ id:7, clientId:1, date:'2026-10-15', lignes:[{}] }) },
    clients:{ get: async()=>({ id:1, nom:'Alice' }) },
    orderItems:{ where:()=>({ equals:()=>({ toArray: async()=>[] }) }) },
    events:{
      toArray: async()=>events.slice(),
      delete: async(id)=>{ const i=events.findIndex(e=>e.id===id); if(i>=0) events.splice(i,1); },
      add: async(e)=>{ events.push(Object.assign({id:100}, e)); },
      where:(idx)=>({ equals:(v)=>({ delete: async()=>{      // stub fidèle (comparaison stricte)
        for(let i=events.length-1;i>=0;i--) if(events[i][idx]===v) events.splice(i,1);
      }})})
    }
  };
  const mod = new Function('db','swallow', `
    ${extractFunction('purgeEventsCommande')}
    ${extractFunction('syncOrderEvent')}
    return { purgeEventsCommande, syncOrderEvent };
  `)(db, ()=>{});

  await mod.syncOrderEvent(7);
  const pour7 = events.filter(e => e.type === 'cmd' && +e.refId === 7);
  check('B. les DEUX résidus de la commande 7 sont nettoyés, quel que soit leur type', pour7.length === 1);
  check('B. il ne reste que la nouvelle date', pour7[0].date === '2026-10-15');
  check('B. un événement d\'un AUTRE type (marché) est préservé', events.some(e => e.type === 'marche'));
  check('B. l\'événement d\'une AUTRE commande est préservé', events.some(e => e.type === 'cmd' && +e.refId === 9));
}

// ---- C. La purge seule : ce qu'elle touche et ce qu'elle épargne ----
async function testPurge(){
  const events = [
    { id:1, type:'cmd', refId:7, date:'a' },
    { id:2, type:'cmd', refId:'7', date:'b' },
    { id:3, type:'cmd', refId:null, date:'c' },   // sans référence : ne doit pas être visé
    { id:4, type:'cmd', refId:70, date:'d' },     // 70 ≠ 7 : pas de correspondance partielle
  ];
  const db = { events:{
    toArray: async()=>events.slice(),
    delete: async(id)=>{ const i=events.findIndex(e=>e.id===id); if(i>=0) events.splice(i,1); }
  }};
  const purge = new Function('db','swallow', `${extractFunction('purgeEventsCommande')}\nreturn purgeEventsCommande;`)(db, ()=>{});
  const n = await purge(7);
  check('C. la purge supprime les 2 formes de la commande 7', n === 2);
  check('C. un refId null est épargné', events.some(e => e.id === 3));
  check('C. la commande 70 n\'est PAS confondue avec la 7', events.some(e => e.id === 4));
  check('C. un identifiant inexistant ne supprime rien', (await purge(999)) === 0);
}

// ---- D. LA MÊME PURGE PARTOUT : les trois chemins où une commande change ou disparaît ----
{
  check('D. la synchronisation utilise la purge unique', /await purgeEventsCommande\(oid\)/.test(APP));
  check('D. la suppression de commande aussi', /await purgeEventsCommande\(id\);   \/\/ \[v1480\] insensible au type/.test(APP));
  check('D. la conversion en devis aussi (la commande disparaît, son événement doit suivre)',
    /await purgeEventsCommande\(id\);   \/\/ \[v1480\] la commande redevient un devis/.test(APP));
  // GARDE DE MOTIF : plus aucun equals(id) sur les événements — c'était la faille.
  let code = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  // Les MARCHÉS utilisent des refId 'mk'+id — chaînes des deux côtés, donc leur `equals` est sain
  // et doit rester autorisé : une garde trop large condamnerait du code correct (leçon des faux
  // positifs de portée transactionnelle). On liste donc explicitement les arguments tolérés.
  const TOLERES = ["'mk'+id", "evRef"];   // evRef vaut 'mk'+id (l.39805), vérifié à la main
  const equalsCmd = [...code.matchAll(/db\.events\.where\('refId'\)\.equals\(([^)]*)\)/g)]
    .map(m => m[1].trim())
    .filter(arg => !TOLERES.includes(arg));
  check(`D. plus aucun equals(refId) sur un identifiant de commande (${equalsCmd.join(', ') || 'aucun'})`,
    equalsCmd.length === 0);
}

// ---- E. Non-régression : la synchronisation garde son comportement d'origine ----
{
  const src = extractFunction('syncOrderEvent');
  check('E. la date d\'événement prime sur la date de commande', /o\.dateEvenement \|\| o\.date/.test(src));
  check('E. sans date, rien n\'est posé au calendrier', /if\(!dateEv\) return;/.test(src));
  check('E. le titre porte le nom du client et le nombre de produits', /cl\?cl\.nom:''/.test(src) && /nbLignes/.test(src));
  check('E. l\'événement reste de type « cmd » avec son refId', /type: 'cmd', refId: oid/.test(src));
}

(async()=>{
  await testCas();
  await testRattrapage();
  await testPurge();
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
