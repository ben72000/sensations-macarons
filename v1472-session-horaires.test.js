'use strict';
// v1472 — CORRIGER LES HORAIRES D'UNE SESSION D'ATELIER. Ben : « Je veux pouvoir modifier heure de
// début et de fin de session d'atelier (fermer une session laissée ouverte pendant un temps
// démesurément grand) ».
//
// POURQUOI C'EST PLUS QU'UN CONFORT : `prodSessionEnd` fixe toujours la fin à MAINTENANT. Une
// session oubliée toute la nuit enregistre 14 h d'atelier — et ce temps alimente le temps par
// recette, donc la rentabilité par parfum et le coût de revient. Une session fausse empoisonne
// silencieusement des chiffres que Ben utilise pour fixer ses prix.
//
// INVARIANT CENTRAL (déjà surveillé par l'audit interne, cf. INVARIANT T1) : une tâche doit tenir
// DANS sa session et sa fin doit suivre son début. Corriger les bornes sans ramener les tâches
// produirait un temps par recette SUPÉRIEUR à la session qui le contient.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const H = h => new Date(`2026-08-11T${h}:00`).getTime();

// Rejoue la vraie fonction d'enregistrement contre une session en mémoire.
function sauver(session, startStr, endStr){
  const src = extractFunction('prodSessHorairesSave');
  let sauvee = null, msg = '';
  const champs = { sh_start: startStr, sh_end: endStr };
  const fn = new Function('prodSessGet','val','toast','prodSessUpsert','prodStopTicking',
    'markUnsaved','closeModal','renderAtelier', `
    ${src}
    return prodSessHorairesSave;
  `)(
    () => JSON.parse(JSON.stringify(session)),
    id => champs[id] || '',
    m => { msg = m; },
    s => { sauvee = s; },
    ()=>{}, ()=>{}, ()=>{}, ()=>{}
  );
  fn('S1');
  return { sauvee, msg };
}

// ---- A. Le cas de Ben : clôturer une session laissée ouverte ----
{
  // Session ouverte à 9h, oubliée. Une tâche démarrée à 9h05, jamais arrêtée.
  const s = { id:'S1', date:'2026-08-11', start:H('09:00'), end:null,
    tasks:[{ id:'t1', recipeId:1, start:H('09:05'), end:null }] };
  const { sauvee } = sauver(s, '2026-08-11T09:00', '2026-08-11T11:30');
  check('A. la session est clôturée à l\'heure saisie', sauvee && sauvee.end === H('11:30'));
  check('A. le début est conservé', sauvee.start === H('09:00'));
  check('A. la tâche jamais arrêtée est clôturée avec la session',
    sauvee.tasks[0].end === H('11:30'));
  check('A. RÉCONCILIATION : la tâche tient DANS la session',
    sauvee.tasks[0].start >= sauvee.start && sauvee.tasks[0].end <= sauvee.end);
  const dureeSession = sauvee.end - sauvee.start;
  const dureeTache = sauvee.tasks[0].end - sauvee.tasks[0].start;
  check('A. le temps de la tâche ne dépasse pas celui de la session', dureeTache <= dureeSession);
}

// ---- B. Les tâches qui débordent sont ramenées aux bornes ----
{
  const s = { id:'S1', date:'2026-08-11', start:H('09:00'), end:H('18:00'),
    tasks:[
      { id:'t1', start:H('08:00'), end:H('10:00') },   // commence AVANT la session
      { id:'t2', start:H('10:00'), end:H('19:00') },   // finit APRÈS la session
      { id:'t3', start:H('10:30'), end:H('11:00') },   // déjà dans les bornes
    ] };
  const { sauvee } = sauver(s, '2026-08-11T09:00', '2026-08-11T12:00');
  check('B. une tâche commençant trop tôt est ramenée au début', sauvee.tasks[0].start === H('09:00'));
  check('B. une tâche finissant trop tard est ramenée à la fin', sauvee.tasks[1].end === H('12:00'));
  check('B. une tâche déjà dans les bornes n\'est pas touchée',
    sauvee.tasks[2].start === H('10:30') && sauvee.tasks[2].end === H('11:00'));
  check('B. RÉCONCILIATION : TOUTES les tâches tiennent dans la session',
    sauvee.tasks.every(t => t.start >= sauvee.start && t.end <= sauvee.end));
  check('B. aucune tâche à durée négative', sauvee.tasks.every(t => t.end >= t.start));
}

// ---- C. Une tâche en pause au moment de la clôture ----
{
  const s = { id:'S1', date:'2026-08-11', start:H('09:00'), end:null,
    tasks:[{ id:'t1', start:H('09:00'), end:null, pausedAccum:0, pauseAt:H('10:00') }] };
  const { sauvee } = sauver(s, '2026-08-11T09:00', '2026-08-11T11:00');
  check('C. la pause est soldée à l\'heure de fin retenue', sauvee.tasks[0].pausedAccum === (H('11:00')-H('10:00')));
  check('C. la tâche n\'est plus marquée en pause', sauvee.tasks[0].pauseAt === null);
}

// ---- D. Refus : la fin ne peut pas précéder le début ----
{
  const s = { id:'S1', date:'2026-08-11', start:H('09:00'), end:null, tasks:[] };
  const { sauvee, msg } = sauver(s, '2026-08-11T14:00', '2026-08-11T11:00');
  check('D. une fin antérieure au début est refusée', /ne peut pas précéder/.test(msg));
  check('D. refus : rien n\'est enregistré', sauvee === null);
}
{
  const s = { id:'S1', date:'2026-08-11', start:H('09:00'), end:null, tasks:[] };
  const { sauvee, msg } = sauver(s, '', '2026-08-11T11:00');
  check('D. un début vide est refusé', /obligatoire/.test(msg));
  check('D. refus : rien n\'est enregistré', sauvee === null);
}

// ---- E. Laisser la fin vide garde (ou rend) la session ouverte ----
{
  const s = { id:'S1', date:'2026-08-11', start:H('09:00'), end:H('12:00'), tasks:[{id:'t1', start:H('09:30'), end:H('10:00')}] };
  const { sauvee } = sauver(s, '2026-08-11T09:00', '');
  check('E. fin vide → la session redevient ouverte', sauvee.end === null);
  check('E. les tâches déjà terminées ne sont pas rouvertes', sauvee.tasks[0].end === H('10:00'));
}

// ---- F. Câblage : le bouton existe sur chaque session ----
{
  check('F. un bouton « Horaires » est rendu sur la carte de session',
    /prodSessHorairesForm\('\$\{s\.id\}'\)/.test(APP));
  const src = extractFunction('prodSessHorairesForm');
  check('F. le formulaire propose début ET fin', /id="sh_start"/.test(src) && /id="sh_end"/.test(src));
  check('F. il convertit en heure LOCALE (sinon Ben verrait une autre heure que la sienne)',
    /getTimezoneOffset/.test(src));
  check('F. une session ouverte est signalée comme telle', /encore ouverte/.test(src));
  check('F. il prévient que les tâches seront ramenées dans les bornes', /ramenées à l'intérieur/.test(src));
  const srcSave = extractFunction('prodSessHorairesSave');
  check('F. l\'enregistrement passe par prodSessUpsert (horodatage de fraîcheur)', /prodSessUpsert\(s\)/.test(srcSave));
  check('F. il déclenche l\'alerte de sauvegarde', /markUnsaved/.test(srcSave));
  check('F. il arrête le tic-tac quand la session est clôturée', /prodStopTicking/.test(srcSave));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
