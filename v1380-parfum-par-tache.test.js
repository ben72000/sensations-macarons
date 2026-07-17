/* ============================================================
   TESTS — v1380 : réattribuer le parfum d'une tâche du journal
   ------------------------------------------------------------
   LA DEMANDE (Ben) : dans le journal de l'atelier chrono, pouvoir
   changer le parfum associé à UNE tâche — et le temps par parfum
   doit s'adapter. Et voir en en-tête de chaque session les parfums
   fabriqués.

   LA PREUVE CENTRALE (C) : on prend le VRAI moteur de temps
   (prodSessTempsParRecette), on calcule AVANT, on réattribue une
   tâche via la VRAIE fonction d'application, on recalcule APRÈS —
   le temps a changé de parfum, et le total distribué n'a pas bougé
   d'une milliseconde (on déplace, on n'invente pas — v1339).
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1380 : parfum par tâche dans le journal + en-tête parfums ===\n');

const cleanApp = stripComments(APP);
const _sessParfumsDistincts = eval('(' + extractFunction('_sessParfumsDistincts').replace(/^function _sessParfumsDistincts/, 'function') + ')');
const _prodTacheParfumsApplique = eval('(' + extractFunction('_prodTacheParfumsApplique').replace(/^function _prodTacheParfumsApplique/, 'function') + ')');
// Le VRAI moteur de temps par recette (sans poids : parts égales — le mode par défaut).
const prodSessTempsParRecette = new Function('_partsMutualisation', 'prodSessReelMs',
  'return ' + extractFunction('prodSessTempsParRecette').replace(/^function prodSessTempsParRecette/, 'function'))(
  () => { throw new Error('poids non utilisé dans ces tests'); },
  (s) => { // temps mur-à-mur : bornes extrêmes des tâches (suffisant pour la fixture)
    const ts = (s.tasks||[]).filter(t=>t.start&&t.end);
    if(!ts.length) return 0;
    return Math.max(...ts.map(t=>+t.end)) - Math.min(...ts.map(t=>+t.start));
  });

// Fixture : une session à 3 tâches, SANS chevauchement (les tranches sont limpides).
//   t1  0 → 10 min : Cannelle (7)          t2  10 → 16 min : Cannelle (7) — MAL rattachée,
//   t3  16 → 20 min : mutualisée (7 + 9)                      c'était de la Madeleine (9)
const T0 = 1700000000000, MIN = 60000;
const fixture = () => ({ id:'s1', date:'2026-07-17', start:T0, end:T0 + 20*MIN, tasks:[
  { id:'t1', label:'Coques Cannelle', start:T0,          end:T0 + 10*MIN, parfums:[7] },
  { id:'t2', label:'Ganache',         start:T0 + 10*MIN, end:T0 + 16*MIN, parfums:[7] },
  { id:'t3', label:'Meringue',        start:T0 + 16*MIN, end:T0 + 20*MIN, parfums:[7, 9] }
]});

// ---------------------------------------------------------------------------
// A. L'EN-TÊTE : les parfums distincts d'une session, dans l'ordre du travail
// ---------------------------------------------------------------------------
{
  ok(JSON.stringify(_sessParfumsDistincts(fixture())) === JSON.stringify([7, 9]),
     'A1 · parfums distincts de la session : [7, 9] — ordre de première apparition, sans doublon');
  ok(_sessParfumsDistincts({ tasks:[{ start:1, parfums:['x', null, 0, -3] }] }).length === 0,
     'A2 · les ids invalides (texte, null, 0, négatif) sont écartés — jamais affichés en en-tête');
  ok(_sessParfumsDistincts(null).length === 0 && _sessParfumsDistincts({}).length === 0,
     'A3 · session absente ou sans tâches → liste vide, pas de plantage');
}

// ---------------------------------------------------------------------------
// B. L'APPLICATION D'UNE RÉATTRIBUTION — validée, assainie, tracée
// ---------------------------------------------------------------------------
{
  const s = fixture();
  const r = _prodTacheParfumsApplique(s, 't2', [9]);
  ok(r.ok === true && JSON.stringify(s.tasks[1].parfums) === '[9]',
     'B1 · la tâche t2 passe de Cannelle (7) à Madeleine (9) — la réattribution demandée par Ben');
  ok(s.parfumsConfirmes === true && s.parfumsParTache === true,
     'B2 · la session est marquée confirmée ET « par tâche » — le drapeau qui protège du flux session');
  ok(_prodTacheParfumsApplique(s, 'inconnu', [9]).ok === false,
     'B3 · une tâche inexistante est refusée avec motif');
  const s2 = fixture();
  _prodTacheParfumsApplique(s2, 't1', [7, 7, '9', 0, null, -2]);
  ok(JSON.stringify(s2.tasks[0].parfums) === '[7,9]',
     'B4 · les ids sont assainis : dédupliqués, convertis, invalides écartés');
  const s3 = fixture();
  const rv = _prodTacheParfumsApplique(s3, 't1', []);
  ok(rv.ok === true && s3.tasks[0].parfums.length === 0,
     'B5 · une liste VIDE est permise : détacher une tâche (vaisselle…) → temps commun (choix v1310)');
}

// ---------------------------------------------------------------------------
// C. LA PREUVE CENTRALE — le temps par parfum SUIT la réattribution
// ---------------------------------------------------------------------------
{
  const s = fixture();
  const avant = prodSessTempsParRecette(s);
  // Avant : Cannelle = 10 (t1) + 6 (t2) + 2 (moitié de t3) = 18 min ; Madeleine = 2 min.
  ok(avant[7] === 18*MIN && avant[9] === 2*MIN,
     'C1 · AVANT : Cannelle 18 min, Madeleine 2 min (t3 mutualisée partagée 50/50)');
  _prodTacheParfumsApplique(s, 't2', [9]);            // la correction de Ben
  const apres = prodSessTempsParRecette(s);
  ok(apres[7] === 12*MIN && apres[9] === 8*MIN,
     'C2 · APRÈS : les 6 min de la ganache ont CHANGÉ de parfum — Cannelle 12 min, Madeleine 8 min');
  ok((avant[7] + avant[9]) === (apres[7] + apres[9]),
     'C3 · INVARIANT — le total distribué est identique à la milliseconde : on DÉPLACE du temps, on n\'en invente pas (v1339)');
  // Détachement : la tâche sort de l'attribution DIRECTE — ses minutes deviennent du temps COMMUN
  // de session, réparti à parts égales entre les parfums présents (règle gelée v1310, décidée par
  // Ben : « la vaisselle n'est pas proportionnelle au volume d'un parfum »). Rien ne disparaît.
  const s4 = fixture();
  _prodTacheParfumsApplique(s4, 't2', []);
  const detache = prodSessTempsParRecette(s4);
  ok(detache[7] === 15*MIN && detache[9] === 5*MIN,
     'C4 · une tâche DÉTACHÉE devient du temps COMMUN partagé à parts égales (12+3 / 2+3) — la règle v1310, rien ne s\'évapore');
  ok((detache[7] + detache[9]) === (avant[7] + avant[9]),
     'C4b · INVARIANT — même détachée, pas une milliseconde ne disparaît du total de la session');
  // Mutualisation : rattacher t2 aux DEUX parfums la partage 50/50.
  const s5 = fixture();
  _prodTacheParfumsApplique(s5, 't2', [7, 9]);
  const mut = prodSessTempsParRecette(s5);
  ok(mut[7] === 15*MIN && mut[9] === 5*MIN,
     'C5 · rattachée aux DEUX parfums, la ganache se partage 50/50 (12+3 / 2+3) — la mutualisation par tâche marche aussi');
}

// ---------------------------------------------------------------------------
// D. LE CÂBLAGE — journal, éditeur en place, garde anti-écrasement
// ---------------------------------------------------------------------------
{
  ok(/_sessParfumsDistincts\(s\)/.test(cleanApp) && /🎨 \$\{rids\.map\(r=>esc\(_nomRec\(r\)\)\)\.join\(' · '\)\}/.test(APP),
     'D1 · l\'en-tête de chaque carte du journal affiche les parfums fabriqués (demande n°2 de Ben)');
  ok(/parfums non rattachés — utilise 🎯 ou 🖊/.test(APP),
     'D2 · une session sans parfums le DIT (et pointe vers les deux outils) au lieu d\'un vide muet');
  ok(/onclick="prodSessTaches\('\$\{s\.id\}'\)"/.test(APP),
     'D3 · le bouton « 🖊 Par tâche » est sur chaque carte du journal');
  const iSwap = cleanApp.indexOf('function _prodModalSwap');
  ok(iSwap > -1 && /overlay && overlay\.classList\.contains\('show'\) && modal\)\{ modal\.innerHTML = html; \}/.test(cleanApp.slice(iSwap, iSwap + 400)),
     'D4 · les écrans liste ↔ éditeur transitent EN PLACE (règle v1375 : jamais fermer-puis-rouvrir)');
  ok(/if\(s\.parfumsParTache && !confirm\(/.test(cleanApp),
     'D5 · le flux SESSION (🎯) demande confirmation avant d\'écraser des corrections par tâche — jamais en silence');
  ok(/if\(s\.parfumsParTache\) s\.parfumsParTache = false;/.test(cleanApp),
     'D6 · … et s\'il écrase, le drapeau tombe : l\'état dit toujours la vérité');
  ok(/async function prodRenderJournal\(\)/.test(cleanApp),
     'D7 · le journal charge les recettes pour nommer les parfums (async, appels existants inchangés)');
  const iSave = cleanApp.indexOf('async function prodTacheParfumsSave');
  ok(iSave > -1 && /prodSessUpsert\(s\)/.test(cleanApp.slice(iSave, iSave + 800)) && /prodSessTaches\(sessId\)/.test(cleanApp.slice(iSave, iSave + 900)),
     'D8 · l\'enregistrement PERSISTE (prodSessUpsert : cache + Dexie) puis revient à la liste en place');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
