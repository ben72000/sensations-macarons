'use strict';
// v1477 — « 242 H 09 » POUR UNE SESSION DE 8 H. Capture de Ben : session du 07/08, 21:20–05:34
// (donc 8 h 14 réelles), 119 tâches, total affiché « 242 h 09 ». Les pastilles de phases
// additionnées faisaient ~21 h. Trois chiffres incompatibles.
//
// 🚨 CAUSE, reconstituée AU CHIFFRE PRÈS : une tâche n'avait jamais été arrêtée. `prodSessReelMs`
// et `prodTaskNet` prenaient alors `Date.now()` comme fin — le chrono continuait de tourner des
// jours après la session, et le total gonflait de 24 h par jour. 242 h 09 = exactement l'écart
// entre le 07/08 21:20 et le jour de la capture.
//
// CE N'ÉTAIT PAS QU'UN AFFICHAGE : ce temps alimente le temps atelier agrégé, donc le taux horaire
// et le coût de revient — des chiffres qui servent à fixer les prix.
//
// RÈGLE POSÉE : une session CLÔTURÉE est bornée par sa fin. Le temps ne peut pas courir dans une
// journée déjà refermée. Seule une session ENCORE OUVERTE mesure jusqu'à maintenant.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const T = new Function('PROD_TASK_OPEN_MAX_MS', `
  ${extractFunction('prodTaskNet')}
  ${extractFunction('prodSessReelMs')}
  ${extractFunction('prodSessCumulMs')}
  return { prodTaskNet, prodSessReelMs, prodSessCumulMs };
`)(1000*60*60*14);

const H = h => new Date('2026-08-07T' + h + ':00').getTime();
const H8 = h => new Date('2026-08-08T' + h + ':00').getTime();

// ---- A. LE CAS EXACT DE BEN ----
{
  // Session 21:20 → 05:34 le lendemain. Une tâche jamais arrêtée.
  const s = {
    id:'S1', date:'2026-08-07', start:H('21:20'), end:H8('05:34'),
    tasks:[
      { id:'t1', phase:'Garnissage',   start:H('21:20'), end:H('23:00') },
      { id:'t2', phase:'Macaronnage',  start:H('23:00'), end:null },        // JAMAIS ARRÊTÉE
      { id:'t3', phase:'Cuisson',      start:H8('01:00'), end:H8('05:34') },
    ]
  };
  const reel = T.prodSessReelMs(s);
  const heures = reel/3600000;
  check('A. la session mesure 8 h 14, pas 242 h', Math.abs(heures - 8.2333) < 0.02);
  check('A. le total ne dépasse JAMAIS la durée de la session',
    reel <= (s.end - s.start) + 1);

  // La tâche oubliée s'arrête avec la session, elle ne court plus jusqu'à aujourd'hui.
  const net = T.prodTaskNet(s.tasks[1], s.end);
  check('A. la tâche jamais arrêtée est bornée à la fin de session (23:00 → 05:34)',
    Math.abs(net/3600000 - 6.5667) < 0.02);
  check('A. …et elle ne vaut plus des dizaines d\'heures', net/3600000 < 24);

  // RÉCONCILIATION : la somme des tâches ne peut pas dépasser la session (INVARIANT T1).
  const cumul = T.prodSessCumulMs(s);
  check('A. RÉCONCILIATION : aucune tâche ne dépasse les bornes de la session',
    s.tasks.every(t => t.start >= s.start && (T.prodTaskNet(t, s.end) <= (s.end - s.start) + 1)));
  check('A. le cumul reste plausible (chevauchements possibles, mais pas 242 h)',
    cumul/3600000 < 24);
}

// ---- B. Une session ENCORE OUVERTE mesure toujours jusqu'à maintenant (comportement voulu) ----
{
  const maintenant = Date.now();
  const s = { id:'S2', date:'2026-08-07', start:maintenant - 3600000, end:null,
    tasks:[{ id:'t1', start:maintenant - 3600000, end:null }] };
  const reel = T.prodSessReelMs(s);
  check('B. session ouverte : le chrono court bien jusqu\'à maintenant (~1 h)',
    Math.abs(reel/3600000 - 1) < 0.05);
  const net = T.prodTaskNet(s.tasks[0]);
  check('B. une tâche en cours mesure aussi jusqu\'à maintenant', Math.abs(net/3600000 - 1) < 0.05);
}

// ---- C. Les pauses restent déduites (non-régression) ----
{
  const t = { id:'t', start:H('21:00'), end:H('23:00'), pausedAccum: 30*60000 };
  check('C. une pause enregistrée est déduite (2 h − 30 min = 1 h 30)',
    Math.abs(T.prodTaskNet(t)/3600000 - 1.5) < 0.001);
  const t2 = { id:'t', start:H('21:00'), end:null, pausedAccum:0, pauseAt:H('22:00') };
  check('C. une tâche en pause ne compte pas le temps de pause en cours',
    T.prodTaskNet(t2, H('23:00'))/3600000 <= 1.01);
}

// ---- D. Les agrégats qui nourrissent le coût de revient sont bornés eux aussi ----
{
  // Sans ça, le correctif d'affichage laisserait le taux horaire et le coût de revient faux.
  const zones = [
    ['temps atelier agrégé', /psIn\.forEach\(s=>\{ const _b=\(\+s\.end\)\|\|undefined;/],
    ['temps par parfum',     /prodTaskNet\(t, \(\+s\.end\)\|\|undefined\)/],
    ['catégories MRP',       /prodTaskNet\(t, \(\+sess\.end\)\|\|undefined\)/],
  ];
  zones.forEach(([nom, re]) => check(`D. « ${nom} » est borné par la fin de session`, re.test(APP)));
  check('D. les pastilles de phases sont bornées', /prodTaskNet\(t,_borne\)/.test(APP));
}

// ---- E. L'ÉDITEUR DE TEMPS PAR TÂCHE (la demande de Ben) ----
{
  const src = extractFunction('prodTacheHorairesSave');
  check('E. début obligatoire', /Le début est obligatoire/.test(src));
  check('E. fin antérieure au début refusée', /ne peut pas précéder le début/.test(src));
  check('E. GARDE : une tâche ne peut pas commencer avant sa session', /commencerait avant la session/.test(src));
  check('E. GARDE : une tâche ne peut pas finir après sa session', /finirait après la session/.test(src));
  check('E. les pauses sont soldées (la durée saisie = temps réellement travaillé)',
    /t\.pausedAccum = 0/.test(src) && /t\.pauseAt = null/.test(src));
  check('E. l\'enregistrement passe par prodSessUpsert', /prodSessUpsert\(s\)/.test(src));
  check('E. l\'alerte de sauvegarde est déclenchée', /markUnsaved/.test(src));

  const srcForm = extractFunction('prodTacheHorairesForm');
  check('E. saisie possible en HEURES', /id="th_start"/.test(srcForm) && /id="th_end"/.test(srcForm));
  check('E. …ou directement en DURÉE (le cas courant en atelier)', /id="th_min"/.test(srcForm));
  check('E. heures affichées en LOCAL, pas en UTC', /getTimezoneOffset/.test(srcForm));
  check('E. une tâche jamais arrêtée est signalée dans le formulaire', /jamais été arrêtée/.test(srcForm));

  const srcMin = extractFunction('prodTacheHorairesDeMinutes');
  check('E. modifier la durée recale la fin depuis le début', /min\*60000/.test(srcMin));
  const srcSync = extractFunction('prodTacheHorairesSync');
  check('E. modifier les heures met à jour la durée', /th_min/.test(srcSync));

  check('E. un bouton d\'édition existe sur chaque tâche', /prodTacheHorairesForm\('\$\{escJs\(s\.id\)\}','\$\{escJs\(t\.id\)\}'\)/.test(APP));
  check('E. une tâche jamais arrêtée est signalée dans la liste', /jamais arrêtée<\/span>/.test(APP));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
