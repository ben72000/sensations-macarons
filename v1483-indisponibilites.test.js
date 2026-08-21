'use strict';
// v1483 — INDISPONIBILITÉS AU CALENDRIER. Ben : « je veux pouvoir être capable de faire des croix
// sur le calendrier pour indiquer mon indisponibilité. Ainsi en un coup d'œil je vois si je peux
// prendre des commandes sur une période précise ou non ».
//
// STOCKAGE : table `events` avec `type:'indispo'`. Aucun changement de schéma — et surtout, cette
// table est DÉJÀ dans le périmètre de sauvegarde (v1473). Une table neuve aurait dû y être ajoutée
// à la main : un oubli facile, et des indisponibilités perdues à la première restauration.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

function bac(initial){
  const evs = (initial||[]).slice();
  let seq = 100;
  const db = { events:{
    toArray: async()=>evs.slice(),
    add: async(e)=>{ evs.push(Object.assign({id:seq++}, e)); },
    delete: async(id)=>{ const i=evs.findIndex(x=>x.id===id); if(i>=0) evs.splice(i,1); }
  }};
  const M = new Function('db','swallow', `
    ${extractConstLine('INDISPO_TYPE')}
    ${extractFunction('indispoSetDepuis')}
    ${extractFunction('estIndispo')}
    ${extractFunction('indispoToggle')}
    ${extractFunction('indispoPeriode')}
    return { indispoSetDepuis, estIndispo, indispoToggle, indispoPeriode };
  `)(db, ()=>{});
  return { M, evs };
}

// ---- A. Poser et retirer une croix ----
async function testToggle(){
  const { M, evs } = bac();
  check('A. une journée neuve n\'est pas indisponible', (await M.estIndispo('2026-08-21')) === false);
  check('A. la marquer renvoie true', (await M.indispoToggle('2026-08-21')) === true);
  check('A. …et elle est bien indisponible', (await M.estIndispo('2026-08-21')) === true);
  check('A. l\'entrée porte le bon type', evs.some(e=>e.type==='indispo' && e.date==='2026-08-21'));
  check('A. retoucher la libère', (await M.indispoToggle('2026-08-21')) === false);
  check('A. …et plus rien ne reste en base', evs.length === 0);
  check('A. une date vide ne crée rien', (await M.indispoToggle('')) === false && evs.length === 0);
}

// ---- B. Doublons : une croix doit TOUJOURS partir au premier clic ----
async function testDoublons(){
  const { M, evs } = bac([
    { id:1, date:'2026-08-21', type:'indispo', titre:'Indisponible' },
    { id:2, date:'2026-08-21', type:'indispo', titre:'Indisponible' },   // doublon accidentel
  ]);
  check('B. le jour est vu comme indisponible', (await M.estIndispo('2026-08-21')) === true);
  await M.indispoToggle('2026-08-21');
  check('B. TOUTES les entrées du jour sont retirées d\'un coup', evs.length === 0);
}

// ---- C. Marquer une PÉRIODE (le cas « je pars une semaine ») ----
async function testPeriode(){
  const { M, evs } = bac();
  const n = await M.indispoPeriode('2026-09-01', '2026-09-05', false);
  check('C. 5 journées marquées, bornes incluses', n === 5);
  check('C. la borne de début est marquée', evs.some(e=>e.date==='2026-09-01'));
  check('C. la borne de fin est marquée', evs.some(e=>e.date==='2026-09-05'));
  check('C. le lendemain ne l\'est PAS', !evs.some(e=>e.date==='2026-09-06'));

  // Relancer ne doit pas créer de doublons.
  const n2 = await M.indispoPeriode('2026-09-01', '2026-09-05', false);
  check('C. relancée, elle ne recrée rien (idempotente)', n2 === 0 && evs.length === 5);

  // Bornes inversées : on ne refuse pas, on remet dans l'ordre.
  const { M: M2, evs: evs2 } = bac();
  const n3 = await M2.indispoPeriode('2026-09-05', '2026-09-01', false);
  check('C. bornes INVERSÉES : marque quand même les 5 journées', n3 === 5 && evs2.length === 5);

  // Libération partielle.
  const n4 = await M.indispoPeriode('2026-09-02', '2026-09-04', true);
  check('C. libérer 3 journées au milieu', n4 === 3);
  const restants = evs.map(e=>e.date).sort();
  check('C. RÉCONCILIATION : seules les bornes restent', restants.join(',') === '2026-09-01,2026-09-05');

  check('C. dates vides : aucun effet', (await M.indispoPeriode('', '2026-09-01', false)) === 0);
}

// ---- D. Un mois entier reste raisonnable, et une saisie aberrante ne boucle pas ----
async function testGarde(){
  const { M } = bac();
  const n = await M.indispoPeriode('2026-09-01', '2026-09-30', false);
  check('D. un mois entier = 30 journées', n === 30);
  const src = extractFunction('indispoPeriode');
  check('D. un garde-fou borne la boucle', /MAX = 400/.test(src) && /tours\+\+ < MAX/.test(src));
  check('D. les dates sont construites à midi (à l\'abri de l\'heure d\'été)', /T12:00:00/.test(src));
}

// ---- E. Ce que les indisponibilités NE doivent PAS polluer ----
{
  const srcDash = extractFunction('renderDash');
  check('E. le tableau de bord exclut les indispos des « prochains événements »',
    /e\.type!=='indispo'/.test(srcDash));
  const srcCal = extractFunction('renderCal');
  check('E. le calendrier ne les affiche pas comme pastilles à lire',
    /events\.filter\(e=>e\.type!==INDISPO_TYPE\)/.test(srcCal));
  check('E. …mais barre bien la journée', /_off\?' indispo':''/.test(srcCal));
  check('E. la croix est visible dans le numéro du jour', /✕<\/span>/.test(srcCal));
}

// ---- F. Le clic ne bascule QUE dans le mode dédié (pas de croix par accident) ----
{
  const srcCal = extractFunction('renderCal');
  check('F. le clic n\'est posé qu\'en mode indisponibilité', /_calIndispoMode \? ` onclick="calIndispoJour/.test(srcCal));
  const srcMode = extractFunction('calIndispoModeToggle');
  check('F. le mode se bascule et redessine', /_calIndispoMode = !_calIndispoMode/.test(srcMode) && /renderCal\(\)/.test(srcMode));
}

// ---- G. L'alerte à la prise de commande (ce qui rend la fonction utile) ----
{
  const src = extractFunction('cmdIndispoAlerte');
  check('G. elle consulte la date saisie', /val\('f_date'\)/.test(src));
  check('G. elle interroge l\'état d\'indisponibilité', /estIndispo\(d\)/.test(src));
  check('G. elle NE BLOQUE PAS l\'enregistrement', /pas un blocage/.test(src));
  check('G. sans date, elle n\'affiche rien', /if\(!d\)\{ zone\.innerHTML = ''; return; \}/.test(src));
  check('G. elle est déclenchée au changement de date', /cmdIndispoAlerte\(\)/.test(APP));
  check('G. sa zone d\'affichage existe dans le formulaire', /id="cmdIndispoAlerte"/.test(APP));
}

// ---- H. Les indisponibilités sont sauvegardées (grâce au choix de la table events) ----
{
  const m = APP.match(/const TABLES = \[([\s\S]*?)\];/);
  const tables = [...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
  check('H. la table « events » est dans le périmètre de sauvegarde', tables.includes('events'));
}

(async()=>{
  await testToggle();
  await testDoublons();
  await testPeriode();
  await testGarde();
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
