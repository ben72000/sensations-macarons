'use strict';
// v1478 — DEUX SÉANCES ENCAPSULÉES DANS UNE SEULE. Ben : « sur la session ouverte j'ai en réalité
// 2 séances sur 2 jours différents, toutes les tâches sont rattachées et encapsulées dans la
// séance du 7 août. J'aimerai que l'app puisse automatiquement associer les séances au jour où
// celle-ci démarre ».
//
// ⚠️ LE PIÈGE ÉCARTÉ, ET C'EST LE CŒUR DE CETTE VERSION : la séance de Ben va de 21:20 à 05:34 —
// elle FRANCHIT MINUIT. Une règle « un jour civil = une séance » l'aurait coupée en deux alors
// que c'est UNE SEULE nuit de travail continue. Ce qui sépare deux séances chez lui, c'est le
// TEMPS SANS RIEN FAIRE : il finit à 05:34, il dort, il reprend le lendemain soir.
//
// SEUIL TRANCHÉ PAR BEN : 4 h sans activité. Et il VALIDE le découpage — l'app propose, elle ne
// réorganise pas son journal dans son dos.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const M = new Function(`
  ${extractConstLine('PROD_SEANCE_GAP_MS')}
  ${extractFunction('prodSeancesDe')}
  ${extractFunction('prodSeancesNb')}
  return { prodSeancesDe, prodSeancesNb, PROD_SEANCE_GAP_MS };
`)();

const H = (j, h) => new Date('2026-08-' + j + 'T' + h + ':00').getTime();

// ---- A. LE CAS DE BEN : une nuit + une séance deux jours plus tard ----
{
  const s = { id:'S1', date:'2026-08-07', start:H('07','21:20'), end:H('09','23:30'), tasks:[
    { id:'a', start:H('07','21:20'), end:H('07','23:00') },
    { id:'b', start:H('07','23:00'), end:H('08','01:30') },
    { id:'c', start:H('08','01:30'), end:H('08','05:34') },   // fin de la NUIT
    { id:'d', start:H('09','20:00'), end:H('09','22:00') },   // 2e séance
    { id:'e', start:H('09','22:00'), end:H('09','23:30') },
  ]};
  const g = M.prodSeancesDe(s);
  check('A. deux séances sont détectées', g.length === 2);
  check('A. 🌙 LA NUIT RESTE ENTIÈRE : elle n\'est PAS coupée à minuit', g[0].tasks.length === 3);
  check('A. …et elle est datée du jour où elle DÉMARRE (le 07, pas le 08)', g[0].date === '2026-08-07');
  check('A. la 2e séance est datée de son propre jour de démarrage', g[1].date === '2026-08-09');
  check('A. la 2e séance a bien ses 2 tâches', g[1].tasks.length === 2);
  check('A. RÉCONCILIATION : aucune tâche perdue ni dupliquée',
    g.reduce((n,x)=>n+x.tasks.length,0) === s.tasks.length);
  check('A. les bornes de la nuit sont justes (21:20 → 05:34)',
    g[0].start === H('07','21:20') && g[0].end === H('08','05:34'));
}

// ---- B. Ce qui NE doit PAS être découpé ----
{
  // Une pause de 3 h 59 reste la même séance (sous le seuil).
  const s1 = { id:'S', start:H('07','09:00'), end:H('07','20:00'), tasks:[
    { id:'a', start:H('07','09:00'), end:H('07','10:00') },
    { id:'b', start:H('07','13:59'), end:H('07','20:00') },
  ]};
  check('B. une pause de 3 h 59 ne découpe pas', M.prodSeancesNb(s1) === 1);

  // Exactement 4 h : c'est une nouvelle séance (seuil inclusif).
  const s2 = { id:'S', start:H('07','09:00'), end:H('07','20:00'), tasks:[
    { id:'a', start:H('07','09:00'), end:H('07','10:00') },
    { id:'b', start:H('07','14:00'), end:H('07','20:00') },
  ]};
  check('B. une pause de 4 h pile découpe (seuil inclusif)', M.prodSeancesNb(s2) === 2);

  // Une nuit complète sans trou : une seule séance, malgré 2 jours civils.
  const s3 = { id:'S', start:H('07','21:00'), end:H('08','05:00'), tasks:[
    { id:'a', start:H('07','21:00'), end:H('08','01:00') },
    { id:'b', start:H('08','01:00'), end:H('08','05:00') },
  ]};
  check('B. 🌙 une nuit continue = UNE séance, même sur 2 jours civils', M.prodSeancesNb(s3) === 1);

  check('B. session sans tâche : rien à découper', M.prodSeancesNb({id:'S',tasks:[]}) === 0);
  check('B. une seule tâche : une séance', M.prodSeancesNb({id:'S',tasks:[{id:'a',start:H('07','09:00'),end:H('07','10:00')}]}) === 1);
}

// ---- C. Tâches qui se CHEVAUCHENT (le cas réel : 119 tâches en parallèle) ----
{
  // Une longue tâche couvre le trou : ce n'est PAS une coupure, Ben travaillait.
  const s = { id:'S', start:H('07','09:00'), end:H('07','20:00'), tasks:[
    { id:'longue', start:H('07','09:00'), end:H('07','19:00') },
    { id:'courte', start:H('07','09:30'), end:H('07','10:00') },
    { id:'apres',  start:H('07','19:30'), end:H('07','20:00') },
  ]};
  check('C. une tâche longue qui couvre le trou empêche la coupure', M.prodSeancesNb(s) === 1);
}

// ---- D. Tâche jamais arrêtée : bornée par la fin de session (acquis v1477) ----
{
  const s = { id:'S', start:H('07','21:00'), end:H('08','05:00'), tasks:[
    { id:'a', start:H('07','21:00'), end:null },   // jamais arrêtée
    { id:'b', start:H('08','04:00'), end:H('08','05:00') },
  ]};
  check('D. une tâche ouverte ne fabrique pas une fausse coupure', M.prodSeancesNb(s) === 1);
}

// ---- E. L'application du découpage : rien n'est perdu ----
{
  const src = extractFunction('prodSessDecouperAppliquer');
  check('E. refuse de découper s\'il n\'y a qu\'une séance', /groupes\.length <= 1/.test(src));
  check('E. la 1re séance GARDE la fiche d\'origine (id, historique)', /if\(i === 0\)/.test(src));
  check('E. chaque nouvelle séance est datée de SON jour de démarrage', /date: g\.date/.test(src));
  check('E. seule la DERNIÈRE séance peut rester ouverte', /derniere && !s\.end/.test(src));
  check('E. les séances antérieures sont clôturées à leur dernière tâche', /end: \(derniere && !s\.end\) \? null : g\.end/.test(src));
}

// ---- F. Ben valide : l'app propose, elle n'écrit pas d'elle-même ----
{
  const srcForm = extractFunction('prodSessDecouperForm');
  check('F. l\'aperçu n\'écrit RIEN', !/prodSessUpsert|db\.\w+\.(add|put|update)/.test(srcForm));
  check('F. il montre le jour, les horaires et le nombre de tâches de chaque séance',
    /fmtDate\(g\.date\)/.test(srcForm) && /g\.tasks\.length/.test(srcForm));
  check('F. il explique qu\'une nuit reste entière', /franchit minuit|une seule nuit/.test(srcForm));
  check('F. rien à découper → message clair, pas un écran vide', /Rien à découper|aucune coupure/.test(srcForm));
  check('F. le bouton n\'apparaît QUE si plusieurs séances sont détectées', /prodSeancesNb\(s\)>1/.test(APP));
}

// ---- G. L'automatisme : empêcher que ça se reproduise ----
{
  const src = extractFunction('prodSessionStart');
  check('G. une session inactive depuis 4 h n\'est plus réutilisée', /PROD_SEANCE_GAP_MS/.test(src));
  check('G. elle est clôturée à sa DERNIÈRE ACTIVITÉ, pas à maintenant',
    /s\.end = derniere/.test(src));
  // ⚠️ Vérifier un COMPORTEMENT, pas un commentaire : `extractFunction` retire les commentaires,
  //    une assertion portant sur eux serait rouge à tort (constaté).
  check('G. …et JAMAIS à Date.now() (sinon la séance absorberait les heures d\'inactivité)',
    !/s\.end = Date\.now\(\)/.test(src));
  check('G. les tâches encore ouvertes sont fermées à cette même heure', /t\.end = derniere/.test(src));
  check('G. le seuil est PARTAGÉ avec le découpage (une seule définition de « séance »)',
    (APP.match(/PROD_SEANCE_GAP_MS/g)||[]).length >= 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
