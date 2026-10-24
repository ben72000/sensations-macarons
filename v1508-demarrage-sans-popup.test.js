'use strict';
// v1508 — ZÉRO POPUP AU DÉMARRAGE. Ben : « enlève tous les popup qui se déclenchent au démarrage de
// l'application — rappel de contrôle de température, rappel de sauvegarde, prochains macarons à faire
// selon les commandes enregistrées, etc. Fais le tour de tous ceux qui se déclenchent automatiquement. »
//
// INVENTAIRE (lu dans le boot réel, pas deviné) — ce qui s'ouvrait / s'affichait tout seul :
//   MODALES  1. exportReminder()            « 💾 Sauvegarde recommandée »        (setTimeout 1200 ms au boot)
//            2. showForecastPopup(daily)     « ⚠ Risque de rupture » (commandes à venir vs stock)  (600 ms)
//            3. runConsistencyCheck(false)   « ⚠ Anomalies détectées dans les données »
//            4. pmsEndOfDayCheck()           « 🧼 Nettoyages de fin de journée » (après 18 h)
//   BANNIÈRES D'ACCUEIL  5. « 🌡 Relevé de température non fait aujourd'hui »
//                        6. « ⚠ N modification(s) non sauvegardée(s) sur iCloud »
//
// DÉCISIONS DE FOND (ce qui ne change PAS) :
//   · on retire le DÉCLENCHEMENT, pas les fonctions : rien n'est supprimé, tout reste appelable à la main ;
//   · pmsEndOfDayCheck garde sa logique de DONNÉES (auto-validation des nettoyages quand l'app n'a pas
//     servi) — seule la modale tombe ;
//   · runConsistencyCheck tourne toujours au boot ; au démarrage il consigne dans le registre de
//     diagnostic (Sauvegarde & sécurité) au lieu d'ouvrir une fenêtre. Appelé à la main (manual=true) il
//     ouvre toujours la modale : « une protection qu'on ne peut pas voir marcher est une protection absente » ;
//   · la sauvegarde automatique quotidienne (autoDailyBackup) continue, en silence.
//
// RÈGLE GELÉE : le boot n'ouvre AUCUNE modale. Garde par PATTERN (pas par cas) : toute fonction appelée par
// le boot dont le corps ouvre une modale fait rougir la suite — sauf runConsistencyCheck, protégé par `manual`.
const { stripComments, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---------- utilitaires ----------
// Découpe le texte brut de app.js entre deux repères (évite l'impasse d'extraction des templates imbriqués).
function slice(from, to){
  const i = APP.indexOf(from); if(i < 0) return '';
  const j = to ? APP.indexOf(to, i + from.length) : -1;
  return APP.slice(i, j < 0 ? i + 6000 : j);
}
// Le bloc de boot = la DERNIÈRE IIFE async du fichier.
const iBoot = APP.lastIndexOf('(async()=>{');
const BOOT_RAW = iBoot >= 0 ? APP.slice(iBoot) : '';
const BOOT = stripComments(BOOT_RAW);

// ---- A. Le boot n'ouvre rien et ne programme plus aucun rappel ----
{
  check('A. le bloc de boot a été retrouvé (garde du garde)', BOOT_RAW.length > 500 && /valideInstalle\(\)/.test(BOOT_RAW));
  check('A. aucun openModal( dans le boot', !/openModal\(/.test(BOOT));
  check('A. exportReminder n\'est plus appelé au boot', !/exportReminder/.test(BOOT));
  check('A. showForecastPopup n\'est plus appelé au boot', !/showForecastPopup/.test(BOOT));
  check('A. aucun setTimeout ne programme un popup/rappel au boot', !/setTimeout\([^)]*(Popup|Reminder|Modal|openModal)/i.test(BOOT));
  const strip = stripComments(APP);
  const nbForecast = (strip.match(/showForecastPopup\(/g) || []).length;
  const nbExport = (strip.match(/exportReminder\(/g) || []).length;
  check('A. showForecastPopup : une seule occurrence = sa définition (aucun appelant nulle part)', nbForecast === 1);
  check('A. exportReminder : une seule occurrence = sa définition (aucun appelant nulle part)', nbExport === 1);
}

// ---- B. GARDE PAR PATTERN : aucune fonction du boot ne peut ouvrir une modale (sauf la cohérence, gardée) ----
{
  const noms = new Set();
  for(const m of BOOT.matchAll(/\b([A-Za-z_]\w*)\(/g)) noms.add(m[1]);
  const IGNORE = new Set(['try','catch','if','for','while','function','async','swallow','setTimeout','setInterval','typeof','await','Promise','parseInt','Date','Math','Object','Array','Set','Map','JSON','String','Number','Boolean','Error','Symbol']);
  const AUTORISES = new Set(['runConsistencyCheck']);   // son openModal est derrière `if(!manual){…return;}` (voir D)
  const fautifs = [];
  let nbAnalyses = 0;
  for(const n of noms){
    if(IGNORE.has(n)) continue;
    const re = new RegExp('^(?:async )?function ' + n + '\\s*\\(', 'm');
    const m = re.exec(APP);
    if(!m) continue;
    const apres = APP.slice(m.index + m[0].length);
    const fin = apres.search(/^(?:async )?function \w+/m);
    const corps = stripComments(APP.slice(m.index, m.index + m[0].length + (fin < 0 ? 4000 : fin)));
    nbAnalyses++;
    if(/openModal\(/.test(corps) && !AUTORISES.has(n)) fautifs.push(n);
  }
  check('B. la garde a réellement analysé les fonctions du boot (' + nbAnalyses + ')', nbAnalyses >= 30);
  check('B. aucune fonction appelée au boot n\'ouvre de modale' + (fautifs.length ? ' — FAUTIFS : ' + fautifs.join(', ') : ''), fautifs.length === 0);
}

// ---- C. Accueil : les deux bannières de rappel ont disparu ; les ALERTES MÉTIER restent ----
{
  check('C. plus de bannière « Relevé de température non fait »', !/Relevé de température non fait/.test(APP));
  check('C. plus de variable releveFait / tLogsToday (calcul devenu inutile retiré)', !/releveFait|tLogsToday/.test(APP));
  check('C. plus de bannière « modification(s) non sauvegardée(s) sur iCloud » à l\'accueil',
    !/modification\(s\) non sauvegardée\(s\) sur iCloud/.test(slice('async function renderDash', 'function buildDashProductionHTML')));
  // Non-régression : on n'a pas rasé le reste de l'accueil.
  check('C. la bannière DLC matières reste', /DLC matières proche/.test(APP));
  check('C. la bannière DLC produits finis reste', /DLC produits finis/.test(APP));
  check('C. la bannière incidents importants reste', /incident\(s\) important\(s\) enregistré\(s\)/.test(APP));
  check('C. la bannière productions en retard reste', /production\(s\) ouverte\(s\)[^`]*&gt; \$\{PROD_OPEN_MAX_DAYS\} jours/.test(APP));
  check('C. la carte « À produire » reste', /🍩 À produire/.test(APP) && /function buildDashProductionHTML/.test(APP));
  check('C. le relevé de température reste saisissable (onglet PMS → Températures)', /pmsSetTab\('temp'\)/.test(APP));
}

// ---- D. runConsistencyCheck : silencieux au démarrage, intact à la main (preuve COMPORTEMENTALE sur le vrai code) ----
{
  const src = slice('async function runConsistencyCheck(manual){', '\n\nfunction csvDownload');
  check('D. le code de runConsistencyCheck a été retrouvé', src.length > 300 && /checkDbConsistency/.test(src));
  const iGarde = src.indexOf('if(!manual){');
  const iModale = src.indexOf('openModal(');
  check('D. la garde `if(!manual)` PRÉCÈDE le premier openModal', iGarde > 0 && iModale > iGarde);

  function build(issues, backups){
    const calls = { modal: 0, toast: [], diag: [], warn: 0 };
    const M = new Function('checkDbConsistency','db','verifyBackup','openModal','toast','esc','swallow','diagPublish','console',
      src + '\nreturn runConsistencyCheck;')(
      async () => issues,
      { backups: { orderBy: () => ({ reverse: () => ({ toArray: async () => backups || [] }) }) } },
      () => ({ ok: true }),
      () => { calls.modal++; },
      (t) => { calls.toast.push(t); },
      (x) => String(x),
      () => {},
      (k, l, d) => { calls.diag.push({ k, l, d }); },
      { warn: () => { calls.warn++; }, error: () => {}, log: () => {} });
    return { M, calls };
  }
  const anomalies = ['Commande liée à un client supprimé', 'Lot sans matière'];
  const bk = [{ id: 3, date: '2026-09-28T08:00:00Z', payload: '{}' }];

  { const { M, calls } = build(anomalies, bk);
    M(false).then(() => {
      check('D. DÉMARRAGE avec anomalies : AUCUNE modale', calls.modal === 0);
      check('D. DÉMARRAGE avec anomalies : consigné au diagnostic (2 anomalies, détail conservé)',
        calls.diag.length === 1 && calls.diag[0].d.anomalies === 2 && calls.diag[0].d.detail.length === 2);
      check('D. DÉMARRAGE avec anomalies : trace console (rien n\'est avalé en silence)', calls.warn === 1);
      check('D. DÉMARRAGE avec anomalies : aucun toast non plus', calls.toast.length === 0);
    }).catch(e => check('D. démarrage avec anomalies a levé : ' + e.message, false)); }

  { const { M, calls } = build([], []);
    M(false).then(() => {
      check('D. DÉMARRAGE base saine : aucune modale, aucun toast', calls.modal === 0 && calls.toast.length === 0);
      check('D. DÉMARRAGE base saine : le contrôle a bien tourné (0 anomalie publié)', calls.diag.length === 1 && calls.diag[0].d.anomalies === 0);
    }).catch(e => check('D. démarrage base saine a levé : ' + e.message, false)); }

  { const { M, calls } = build(anomalies, bk);
    M(true).then(() => {
      check('D. MANUEL avec anomalies : la modale S\'OUVRE toujours (protection visible à la demande)', calls.modal === 1);
      check('D. MANUEL avec anomalies : pas de publication de diagnostic de démarrage', calls.diag.length === 0);
    }).catch(e => check('D. manuel avec anomalies a levé : ' + e.message, false)); }

  { const { M, calls } = build([], []);
    M(true).then(() => {
      check('D. MANUEL base saine : toast « Base cohérente »', calls.toast.length === 1 && /cohérente/.test(calls.toast[0]) && calls.modal === 0);
    }).catch(e => check('D. manuel base saine a levé : ' + e.message, false)); }
}

// ---- E. pmsEndOfDayCheck : plus de modale, MAIS la logique de données est intacte (vrai code) ----
{
  const src = slice('async function pmsEndOfDayCheck(){', 'async function pmsValidateDailyCleaning');
  check('E. le code de pmsEndOfDayCheck a été retrouvé', src.length > 300 && /pmsAppServedToday/.test(src));
  check('E. plus d\'openModal dans pmsEndOfDayCheck', !/openModal\(/.test(stripComments(src)));

  function build(servi, restantsIds, heure){
    const calls = { modal: 0, adds: [], ls: {} };
    class FakeDate extends Date { getHours(){ return heure; } }
    const tasks = restantsIds.map(id => ({ id, nom: 'T' + id, frequence: 'Quotidien' })).concat([{ id: 99, nom: 'Hebdo', frequence: 'Hebdomadaire' }]);
    const db = {
      pmsTasks: { toArray: async () => tasks },
      cleaningLogs: { toArray: async () => [], add: async (r) => { calls.adds.push(r); } }
    };
    const localStorage = { getItem: k => (k in calls.ls ? calls.ls[k] : null), setItem: (k, v) => { calls.ls[k] = String(v); } };
    const M = new Function('db','today','localStorage','pmsAppServedToday','openModal','esc','Date',
      src + '\nreturn pmsEndOfDayCheck;')(db, () => '2026-09-29', localStorage, async () => servi, () => { calls.modal++; }, x => x, FakeDate);
    return { M, calls };
  }
  { const { M, calls } = build(true, [1, 2, 3], 20);
    M().then(() => {
      check('E. APP UTILISÉE ce soir : aucune modale', calls.modal === 0);
      check('E. APP UTILISÉE ce soir : rien n\'est validé à la place de Ben', calls.adds.length === 0);
      check('E. APP UTILISÉE ce soir : la journée est marquée traitée (pas de rejeu)', calls.ls.sm_pmsEod === '2026-09-29');
    }).catch(e => check('E. app utilisée a levé : ' + e.message, false)); }
  { const { M, calls } = build(false, [1, 2], 20);
    M().then(() => {
      check('E. APP NON UTILISÉE : l\'auto-validation des nettoyages quotidiens CONTINUE (non-régression des données)',
        calls.adds.length === 2 && calls.adds.every(a => a.date === '2026-09-29'));
      check('E. APP NON UTILISÉE : les tâches non quotidiennes ne sont pas touchées', !calls.adds.some(a => a.taskId === 99));
      check('E. APP NON UTILISÉE : aucune modale', calls.modal === 0);
    }).catch(e => check('E. app non utilisée a levé : ' + e.message, false)); }
  { const { M, calls } = build(true, [1], 10);
    M().then(() => check('E. avant 18 h : rien du tout (comportement d\'origine conservé)', calls.modal === 0 && calls.adds.length === 0 && !calls.ls.sm_pmsEod))
      .catch(e => check('E. avant 18 h a levé : ' + e.message, false)); }
}

// ---- F. Rien n'a été supprimé : les fonctions existent toujours, le boot continue de tourner en silence ----
{
  check('F. exportReminder existe toujours (appelable à la main)', /^async function exportReminder\(/m.test(APP));
  check('F. showForecastPopup existe toujours (appelable à la main)', /^async function showForecastPopup\(/m.test(APP));
  check('F. pmsValidateDailyCleaning existe toujours', /^async function pmsValidateDailyCleaning\(/m.test(APP));
  check('F. le boot appelle TOUJOURS runConsistencyCheck(false) (le contrôle tourne, en silence)', /runConsistencyCheck\(false\)/.test(BOOT));
  check('F. le boot appelle TOUJOURS autoDailyBackup (la sauvegarde auto quotidienne continue)', /autoDailyBackup\(\)/.test(BOOT));
  check('F. le boot appelle TOUJOURS pmsEndOfDayCheck (auto-validation HACCP conservée)', /pmsEndOfDayCheck\(\)/.test(BOOT));
  check('F. le boot appelle TOUJOURS requestPersistentStorage', /requestPersistentStorage\(\)/.test(BOOT));
  const sauv = stripComments(slice('async function autoDailyBackup(){', 'async function runIntegrityCheck'));
  check('F. autoDailyBackup n\'ouvre aucune fenêtre et ne toast pas', !/openModal\(|toast\(/.test(sauv));
}

// ---- G. Libellés devenus faux : le réglage ne promet plus une fenêtre qui n'existe plus ----
{
  check('G. l\'ancienne promesse « À l\'ouverture… l\'app te proposera » a disparu', !/À l'ouverture, si la dernière sauvegarde dépasse ce délai/.test(APP));
  check('G. le réglage est renommé en indicateur de retard', /Considérer la sauvegarde en retard après/.test(APP));
  check('G. le réglage garde sa fonction (sortieEtat lit toujours la fréquence)', /sortieEtat\(exportReminderDays\(\)\)/.test(APP));
}

// ---- H. Les éléments NON popup, laissés volontairement, sont bien toujours là ----
{
  check('H. la bannière « Une nouvelle version est disponible » (mise à jour du SW) reste', /Une nouvelle version est disponible\./.test(APP));
  check('H. la mascotte reste (bulle cliquable, jamais ouverte toute seule)', /function mascotInit\(/.test(APP) && !/mascotToggleBubble\(\)/.test(BOOT));
}

// Les checks D/E sont asynchrones : on attend la fin de la file avant de conclure.
setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}, 400);
