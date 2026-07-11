/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 33 : _tempsDecompoParParfum (traçabilité du temps)
   ----------------------------------------------------------------------------
   Fige le comportement de la DÉCOMPOSITION TRAÇABLE du temps par parfum, dont
   l'exigence centrale est la VÉRIFIABILITÉ : la somme du détail (phases → tâches)
   doit retomber EXACTEMENT sur le total affiché sur la carte parfum, sinon le
   chiffre serait invérifiable.

   Propriétés verrouillées ici :
     1. Temps NET : les pauses (pausedAccum) sont déduites.
     2. Tâche MUTUALISÉE : son temps est réparti entre les parfums qu'elle porte.
     3. Regroupement par PHASE puis par TÂCHE, avec le nombre de mesures (nb).
     4. Marquage PASSIF (attente chronométrée) via prodIsPassive.
     5. TEMPS COMMUN DE SÉANCE (vaisselle/pauses/mise en place) exposé explicitement
        — c'est lui qui manquait et rendait le total non vérifiable (bug corrigé v1307).
     6. COHÉRENCE : somme des phases === total, ET total === ce que renvoie
        prodSessTempsParRecette pour la même recette (le chiffre affiché sur la carte).
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

const M = 60000, H = 3600000;
const T0 = Date.parse('2026-07-07T08:00:00Z');

function buildModule(sessions, prods){
  const ymdLocal                        = extractFunction('ymdLocal');
  const prodTaskNet                     = extractFunction('prodTaskNet');
  const prodIsPassive                   = extractFunction('prodIsPassive');
  const prodSessReelMs                  = extractFunction('prodSessReelMs');
  const prodQteAffichee                 = extractFunction('prodQteAffichee');
  const poidsProductionParRecette       = extractFunction('_poidsProductionParRecette');
  const partsMutualisation              = extractFunction('_partsMutualisation');
  const prodSessTempsParRecette         = extractFunction('prodSessTempsParRecette');
  const tempsDecompoParParfum           = extractFunction('_tempsDecompoParParfum');
  const passiveDefaults                 = extractArrayLikeConst('PROD_PASSIVE_DEFAULTS');

  const code = `
    const COQUES_PAR_MACARON = 2;
    ${passiveDefaults}
    ${ymdLocal}
    ${prodTaskNet}
    ${prodIsPassive}
    ${prodSessReelMs}
    ${prodQteAffichee}
    ${poidsProductionParRecette}
    ${partsMutualisation}
    ${prodSessTempsParRecette}
    // Sessions injectées : prodSessLoad() est stubbée pour renvoyer le jeu de test.
    const __SESSIONS = ${JSON.stringify(sessions)};
    const __PRODS    = ${JSON.stringify(prods||[])};
    function prodSessLoad(){ return __SESSIONS; }
    function prodPassiveDefaultMin(){ return 10; }
    function getSettings(){ return {}; }
    ${tempsDecompoParParfum}
    return { _tempsDecompoParParfum, prodSessTempsParRecette, prodSessLoad,
             _poidsProductionParRecette, _partsMutualisation, __PRODS };
  `;
  return new Function(code)();
}

// Extrait un littéral `const NAME = { ... };` (l'extracteur partagé ne gère que les tableaux).
function extractArrayLikeConst(name){
  const fs = require('fs');
  const path = require('path');
  const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const idx = APP.indexOf('const ' + name + ' = {');
  if(idx === -1) throw new Error('Introuvable (objet): ' + name);
  const end = APP.indexOf('};', idx);
  if(end === -1) throw new Error('Fin ' + name + ' introuvable');
  return APP.slice(idx, end + 2);
}

// Fabrique une tâche chronométrée.
function tache(label, phase, startOffsetMin, durMin, parfums, pausedMin){
  return {
    id: label+'_'+startOffsetMin,
    label, phase,
    start: T0 + startOffsetMin*M,
    end:   T0 + startOffsetMin*M + durMin*M,
    pausedAccum: (pausedMin||0)*M,
    pauseAt: null,
    parfums: parfums
  };
}
// Fabrique une séance. dureeH = durée mur à mur de la séance (pour le temps commun).
function seance(tasks, dureeH){
  return { id:'s1', date:'2026-07-07', start:T0, end:T0 + (dureeH||3)*H, note:'', tasks };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, tolMs, label){
  if(Math.abs(actual-expected) <= tolMs){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ~${expected} (±${tolMs})\n      obtenu : ${actual}`); }
}

function run(){

// ── CAS 1 : tâche simple, un seul parfum ──────────────────────────────────────
{
  const s = seance([ tache('Émulsion','Préparation ganache', 0, 20, [1]) ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650);

  const ganache = d.phases.find(p=>p.phase==='Préparation ganache');
  near(ganache.ms, 20*M, 1000, 'CAS1 · phase Préparation ganache = 20 min');
  eq(ganache.taches[0].label, 'Émulsion',   'CAS1 · tâche identifiée par son label');
  eq(ganache.taches[0].nb, 1,               'CAS1 · nombre de mesures = 1 (preuve tangible)');
  eq(ganache.taches[0].passive, false,      'CAS1 · émulsion = tâche active');

  // Une seule tâche, aucun trou entre tâches → PAS de temps commun.
  // (Le « réel » d'une séance est l'enveloppe des TÂCHES — 1re → dernière — et non la durée
  //  déclarée de la séance : sans trou, il n'y a rien à répartir.)
  const commun = d.phases.find(p=>p.phase==='Commun de séance');
  eq(commun, undefined, 'CAS1 · une seule tâche, aucun trou → pas de temps commun');
  near(d.total, 20*M, 1000, 'CAS1 · total = la seule tâche (20 min)');
}

// ── CAS 1b : TROU entre deux tâches → temps commun exposé ─────────────────────
{
  // Tâche 0→20 min, puis tâche 40→60 min : 20 min de trou (vaisselle/mise en place)
  // que prodSessTempsParRecette répartit sur les parfums. Il DOIT apparaître dans le détail,
  // sinon le total affiché serait supérieur à la somme des lignes visibles (invérifiable).
  const s = seance([
    tache('Émulsion','Préparation ganache', 0, 20, [1]),
    tache('Assemblage des coques (finition macaron)','Garnissage', 40, 20, [1]),
  ], 2);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650);
  const commun = d.phases.find(p=>p.phase==='Commun de séance');
  eq(!!commun, true, 'CAS1b · le trou entre tâches est exposé en « Commun de séance »');
  near(commun.ms, 20*M, 1000, 'CAS1b · temps commun = les 20 min de trou');
  near(d.total, 60*M, 1000, 'CAS1b · total = 20 + 20 (tâches) + 20 (trou)');
}

// ── CAS 2 : PAUSES déduites (temps NET) ───────────────────────────────────────
{
  // Tâche de 30 min brutes dont 10 min de pause → 20 min nettes.
  const s = seance([ tache('Émulsion','Préparation ganache', 0, 30, [1], 10) ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650);
  const ganache = d.phases.find(p=>p.phase==='Préparation ganache');
  near(ganache.ms, 20*M, 1000, 'CAS2 · pauses déduites : 30 min brutes − 10 min pause = 20 min nettes');
}

// ── CAS 3 : tâche MUTUALISÉE répartie AU PRORATA DES QUANTITÉS ────────────────
{
  // RÈGLE MÉTIER (Benjamin) : « on ne peut pas faire 50/50 entre 300 pièces et 10 pièces sur la
  // même étape ». Ici : cuisson mutualisée de 60 min, parfum 1 = 300 macarons, parfum 2 = 100.
  // Prorata attendu : 300/400 = 75 % → 45 min pour le parfum 1, et 25 % → 15 min pour le parfum 2.
  const s = seance([ tache('Cuisson des coques','Cuisson', 0, 60, [1,2]) ], 1);
  const prods = [
    { recipeId:1, composant:'complet', qteReelle:300, prodTermineTs:'2026-07-07T10:00:00' },
    { recipeId:2, composant:'complet', qteReelle:100, prodTermineTs:'2026-07-07T10:00:00' },
  ];
  const { _tempsDecompoParParfum, _poidsProductionParRecette } = buildModule([s], prods);
  const poids = _poidsProductionParRecette(prods, '2026-07-01');

  const d1 = _tempsDecompoParParfum(new Set([1]), 3650, poids);
  const d2 = _tempsDecompoParParfum(new Set([2]), 3650, poids);
  near(d1.phases.find(p=>p.phase==='Cuisson').ms, 45*M, 1000,
    'CAS3 · PRORATA : 300/400 des pièces → 75 % du temps (45 min sur 60)');
  near(d2.phases.find(p=>p.phase==='Cuisson').ms, 15*M, 1000,
    'CAS3 · PRORATA : 100/400 des pièces → 25 % du temps (15 min sur 60)');
  eq(d1.reparti, 'prorata', 'CAS3 · mode de répartition tracé = prorata');

  // La somme des parts doit toujours faire 100 % du temps de la tâche (rien ne se perd).
  const somme = d1.phases.find(p=>p.phase==='Cuisson').ms + d2.phases.find(p=>p.phase==='Cuisson').ms;
  near(somme, 60*M, 1000, 'CAS3 · CONSERVATION : les parts somment au temps total de la tâche');
}

// ── CAS 3b : coques en macarons ÉQUIVALENTS (unités hétérogènes) ──────────────
{
  // Piège : une production 'coques' stocke ses pièces en COQUES (×2), une 'complet' en MACARONS.
  // Comparées brutalement, 600 coques écraseraient 300 macarons. Ramenées en macarons équivalents,
  // 600 coques = 300 macarons → poids ÉGAUX → 50/50 légitime (et non 67/33).
  const prods = [
    { recipeId:1, composant:'coques',  qteReelle:600, prodTermineTs:'2026-07-07T10:00:00' },
    { recipeId:2, composant:'complet', qteReelle:300, prodTermineTs:'2026-07-07T10:00:00' },
  ];
  const { _poidsProductionParRecette } = buildModule([], prods);
  const poids = _poidsProductionParRecette(prods, '2026-07-01');
  eq(poids[1], 300, 'CAS3b · 600 coques = 300 macarons équivalents (÷2)');
  eq(poids[2], 300, 'CAS3b · 300 macarons complets = 300 macarons équivalents');
}

// ── CAS 3c : aucune quantité connue → repli honnête à parts égales ────────────
{
  const s = seance([ tache('Cuisson des coques','Cuisson', 0, 60, [1,2]) ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650, {});   // poids vides
  near(d.phases.find(p=>p.phase==='Cuisson').ms, 30*M, 1000,
    'CAS3c · sans quantité connue : repli à parts égales (30 min sur 60)');
  eq(d.reparti, 'egal', 'CAS3c · le repli est TRACÉ (reparti = egal), pas masqué');
}

// ── CAS 4 : marquage PASSIF (attente chronométrée) ────────────────────────────
{
  const s = seance([
    tache('Assemblage des coques (finition macaron)','Garnissage', 0, 25, [1]),
    tache('Cuisson des coques','Cuisson', 30, 15, [1]),
  ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650);
  const cuisson = d.phases.find(p=>p.phase==='Cuisson');
  eq(cuisson.taches[0].passive, true, 'CAS4 · cuisson marquée PASSIVE (attente)');
  near(cuisson.passif, 15*M, 1000, 'CAS4 · le passif de la phase est isolé (15 min)');

  const garn = d.phases.find(p=>p.phase==='Garnissage');
  eq(garn.taches[0].passive, false, 'CAS4 · assemblage = actif');
  eq(garn.passif, 0,                'CAS4 · aucun passif sur le garnissage');
}

// ── CAS 5 : PROPRIÉTÉ CENTRALE — la somme du détail = le total ────────────────
{
  const s = seance([
    tache('Émulsion','Préparation ganache', 0, 20, [1]),
    tache('Cuisson des coques','Cuisson', 30, 15, [1]),
    tache('Assemblage des coques (finition macaron)','Garnissage', 60, 25, [1]),
    tache('Foisonnement de la meringue','Meringue', 90, 30, [1,2]),
  ], 3);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650);

  const sommePhases = d.phases.reduce((a,p)=>a+p.ms, 0);
  near(sommePhases, d.total, 1000, 'CAS5 · TRAÇABILITÉ : somme des phases === total');

  const sommeTaches = d.phases.reduce((a,p)=>a + p.taches.reduce((b,t)=>b+t.ms, 0), 0);
  near(sommeTaches, d.total, 1000, 'CAS5 · TRAÇABILITÉ : somme des tâches === total');

  near(d.actif + d.passif, d.total, 1000, 'CAS5 · actif + passif === total');
}

// ── CAS 5b : CHRONOS PARALLÈLES — le temps mural n'est compté QU'UNE FOIS ─────
{
  // LE BUG QUE MES TESTS AVAIENT LAISSÉ PASSER (mes cas n'avaient aucun chevauchement).
  // Benjamin lance plusieurs chronos EN MÊME TEMPS (la cuisson tourne pendant qu'il poche).
  // AVANT : le détail ADDITIONNAIT les tâches → 2 chronos d'1 h en parallèle = 2 h affichées,
  // alors que le total de la carte (temps mural) disait 1 h. Écart × 2 (Framboise : 10 h 24 vs 5 h 07).
  // RÈGLE MÉTIER (Benjamin) : « 2 chronos en parallèle pendant 1 h = 1 h de travail. »
  const s = seance([
    tache('Pochage','Macaronnage', 0, 60, [1]),
    tache('Cuisson des coques','Cuisson', 0, 60, [1]),   // EXACTEMENT en même temps
  ], 1);
  const { _tempsDecompoParParfum, prodSessTempsParRecette, prodSessLoad } = buildModule([s], []);

  const d = _tempsDecompoParParfum(new Set([1]), 3650, {});
  near(d.total, 60*M, 1000,
    'CAS5b · CHRONOS PARALLÈLES : 2 tâches simultanées d\'1 h = 1 h de travail (temps MURAL, pas 2 h)');

  const totalCarte = prodSessTempsParRecette(prodSessLoad()[0], {})[1] || 0;
  near(d.total, totalCarte, 1000,
    'CAS5b · COHÉRENCE : le détail somme au total MÊME avec des chronos parallèles');

  // Le temps mural est réparti entre les deux tâches concomitantes (30 min chacune).
  const poch = d.phases.find(p=>p.phase==='Macaronnage');
  const cuis = d.phases.find(p=>p.phase==='Cuisson');
  near(poch.ms, 30*M, 1000, 'CAS5b · l\'heure murale est partagée : 30 min au pochage');
  near(cuis.ms, 30*M, 1000, 'CAS5b · l\'heure murale est partagée : 30 min à la cuisson');
}

// ── CAS 5c : chevauchement PARTIEL ────────────────────────────────────────────
{
  // Tâche A 0→60 min, tâche B 30→90 min. Temps mural = 90 min (et non 120).
  const s = seance([
    tache('Pochage','Macaronnage', 0, 60, [1]),
    tache('Cuisson des coques','Cuisson', 30, 60, [1]),
  ], 2);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650, {});
  near(d.total, 90*M, 1000,
    'CAS5c · chevauchement partiel : temps mural = 90 min (et non 120 min additionnées)');
}

// ── CAS 6 : COHÉRENCE avec le chiffre affiché sur la carte ────────────────────
{
  // C'est LE test qui protège l'exigence de vérifiabilité : le total de la décompo doit
  // égaler prodSessTempsParRecette (la source du « Temps actif » affiché). Un écart ici
  // signifierait que le détail n'explique pas le chiffre montré à l'utilisateur.
  // [v1310] Les DEUX doivent recevoir les mêmes POIDS, sinon l'un répartit au prorata et
  // l'autre à parts égales → le détail ne sommerait plus au total.
  const s = seance([
    tache('Émulsion','Préparation ganache', 0, 20, [1]),
    tache('Cuisson des coques','Cuisson', 30, 15, [1,2]),      // mutualisée
    tache('Assemblage des coques (finition macaron)','Garnissage', 60, 25, [1]),
    tache('Foisonnement de la meringue','Meringue', 90, 30, [1,2]),   // mutualisée
  ], 3);
  const prods = [
    { recipeId:1, composant:'complet', qteReelle:300, prodTermineTs:'2026-07-07T10:00:00' },
    { recipeId:2, composant:'complet', qteReelle:100, prodTermineTs:'2026-07-07T10:00:00' },
  ];
  const { _tempsDecompoParParfum, prodSessTempsParRecette, prodSessLoad, _poidsProductionParRecette } = buildModule([s], prods);
  const poids = _poidsProductionParRecette(prods, '2026-07-01');

  const totalCarte  = prodSessTempsParRecette(prodSessLoad()[0], poids)[1] || 0;
  const totalDetail = _tempsDecompoParParfum(new Set([1]), 3650, poids).total;

  near(totalDetail, totalCarte, 1000,
    'CAS6 · COHÉRENCE : le total du détail === le « Temps actif » affiché sur la carte (en mode prorata)');
}

// ── CAS 7 : parfum absent de la séance → aucune part du temps commun ──────────
{
  const s = seance([ tache('Émulsion','Préparation ganache', 0, 20, [1]) ], 2);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([99]), 3650);   // parfum jamais chronométré
  eq(d.total, 0,          'CAS7 · parfum absent : total = 0');
  eq(d.phases.length, 0,  'CAS7 · parfum absent : aucune phase');
  eq(d.passif, 0,         'CAS7 · parfum absent : aucun passif');
}

// ── CAS 8 : plusieurs recettes d'un même parfum (classique + grand format) ────
{
  // Un parfum peut porter 2 recipeId. Les deux doivent être cumulés dans SA décompo.
  const s = seance([
    tache('Émulsion','Préparation ganache', 0, 20, [1]),
    tache('Émulsion','Préparation ganache', 30, 10, [7]),   // même parfum, recette GF
  ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1,7]), 3650);
  const ganache = d.phases.find(p=>p.phase==='Préparation ganache');
  near(ganache.ms, 30*M, 1000, 'CAS8 · les 2 recettes du parfum sont cumulées (20 + 10 min)');
  eq(ganache.taches[0].nb, 2,  'CAS8 · 2 mesures agrégées sous le même label');
}

// ── CAS 9 : tâche sans parfum rattaché → ignorée du détail parfum ─────────────
{
  const s = seance([
    tache('Émulsion','Préparation ganache', 0, 20, [1]),
    tache('Vaisselle','Entretien', 30, 15, []),   // aucun parfum → pas une tâche-recette
  ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 3650);
  const entretien = d.phases.find(p=>p.phase==='Entretien');
  eq(entretien, undefined, 'CAS9 · tâche sans parfum : pas de phase Entretien propre au parfum');
  // Elle n'est pas perdue pour autant : elle tombe dans le temps commun de séance.
  const commun = d.phases.find(p=>p.phase==='Commun de séance');
  eq(!!commun, true, 'CAS9 · elle est reversée au « Commun de séance » (rien ne disparaît)');
}

// ── CAS 10 : hors fenêtre temporelle → exclu ──────────────────────────────────
{
  const s = seance([ tache('Émulsion','Préparation ganache', 0, 20, [1]) ], 1);
  const { _tempsDecompoParParfum } = buildModule([s], []);
  const d = _tempsDecompoParParfum(new Set([1]), 0);   // fenêtre = 0 jour → séance de 2026-07-07 exclue
  // (selon la date courante ; on vérifie seulement qu'aucune erreur n'est levée et que
  //  la structure reste saine — le filtrage par date est déjà couvert ailleurs)
  eq(typeof d.total, 'number', 'CAS10 · fenêtre restreinte : structure saine, total numérique');
  eq(Array.isArray(d.phases), true, 'CAS10 · phases reste un tableau');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 33 : _tempsDecompoParParfum ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
