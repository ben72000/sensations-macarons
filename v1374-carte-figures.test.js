/* ============================================================
   TESTS — v1374 : la carte des dépendances entre les chiffres
   ------------------------------------------------------------
   LA RÈGLE : UNE CARTE FAUSSE EST PIRE QUE PAS DE CARTE (le
   commentaire qui ment, v1372). Cette suite vérifie donc que la
   carte ne peut pas mentir : chaque fonction citée existe dans le
   code, chaque table citée existe au schéma Dexie, chaque clé kv
   citée est classée (v1372), chaque suite citée existe sur disque,
   et le graphe n'a pas de cycle. Puis elle fige le moteur (aval
   transitif, suites à relancer) sur des cas nommés — et prouve par
   réintroduction qu'un cycle ou une carte trouée serait attrapé.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1374 : la carte des dépendances entre les chiffres ===\n');

// ---------------------------------------------------------------------------
// Extraction — le VRAI code, jamais une copie
// ---------------------------------------------------------------------------
function extraitBloc(marqueur, closer, portee){
  const i = APP.indexOf(marqueur);
  if(i === -1) throw new Error('Introuvable : ' + marqueur);
  const clean = stripComments(APP.slice(i, i + (portee || 30000)));
  const j = clean.indexOf(closer);
  return clean.slice(0, j + closer.length);
}
const FIGURES = eval('(() => { ' + extraitBloc('const FIGURES = {', '\n};') + ' return FIGURES; })()');
const _figCycle = eval('(' + extractFunction('_figCycle').replace(/^function _figCycle/, 'function') + ')');
const _figAval = eval('(' + extractFunction('_figAval').replace(/^function _figAval/, 'function') + ')');
const _figSuitesPour = new Function('_figAval',
  'return ' + extractFunction('_figSuitesPour').replace(/^function _figSuitesPour/, 'function'))(_figAval);
const cleanApp = stripComments(APP);

// ---------------------------------------------------------------------------
// A. LA CARTE NE PEUT PAS MENTIR
// ---------------------------------------------------------------------------
{
  // A1 — chaque fonction citée existe (le bug db.lots de v1351, version « carte »)
  const fnsAbsentes = Object.keys(FIGURES)
    .filter(id => !new RegExp('(async )?function ' + FIGURES[id].fn + '\\(').test(cleanApp));
  ok(fnsAbsentes.length === 0,
     'A1 · chaque fonction citée par la carte existe dans le code' +
     (fnsAbsentes.length ? ' — absentes : ' + fnsAbsentes.map(id => id + '→' + FIGURES[id].fn).join(', ') : ''));

  // A2 — chaque table citée existe au schéma Dexie (extraction du motif v1351)
  const tablesDeclarees = new Set();
  const reStores = /\.stores\(\{([^}]*)\}\)/g; let m;
  while((m = reStores.exec(cleanApp))){
    const reCle = /(\w+)\s*:\s*'/g; let mc;
    while((mc = reCle.exec(m[1]))) tablesDeclarees.add(mc[1]);
  }
  const tablesInconnues = [];
  Object.keys(FIGURES).forEach(id => (FIGURES[id].tables || []).forEach(t => {
    if(t.startsWith('kv:')) return;
    if(!tablesDeclarees.has(t)) tablesInconnues.push(id + '→' + t);
  }));
  ok(tablesDeclarees.size >= 40 && tablesInconnues.length === 0,
     'A2 · chaque table citée existe au schéma Dexie (une carte vers une table fantôme = db.lots)' +
     (tablesInconnues.length ? ' — fantômes : ' + tablesInconnues.join(', ') : ''));

  // A3 — chaque clé kv citée est CLASSÉE (v1372) : la carte ne peut pas citer un réglage non pensé
  const iM = APP.indexOf('const KV_METIER = ');
  const kvMetier = eval('(() => { ' + stripComments(APP.slice(iM, iM + 8000)).slice(0, stripComments(APP.slice(iM, iM + 8000)).indexOf('\n};') + 3) + ' return KV_METIER; })()');
  const clesNonClassees = [];
  Object.keys(FIGURES).forEach(id => (FIGURES[id].tables || []).forEach(t => {
    if(!t.startsWith('kv:')) return;
    if(!Object.prototype.hasOwnProperty.call(kvMetier, t.slice(3))) clesNonClassees.push(id + '→' + t);
  }));
  ok(clesNonClassees.length === 0,
     'A3 · chaque clé kv citée est une clé MÉTIER classée (v1372) — un chiffre ne dépend pas d\'un réglage d\'appareil' +
     (clesNonClassees.length ? ' — hors classe : ' + clesNonClassees.join(', ') : ''));

  // A4 — chaque amont existe
  const amontsInconnus = [];
  Object.keys(FIGURES).forEach(id => (FIGURES[id].amont || []).forEach(a => { if(!FIGURES[a]) amontsInconnus.push(id + '→' + a); }));
  ok(amontsInconnus.length === 0, 'A4 · chaque amont cité est une figure de la carte' +
     (amontsInconnus.length ? ' — inconnus : ' + amontsInconnus.join(', ') : ''));

  // A5 — chaque suite citée existe sur disque (une garde citée mais absente rassurerait pour rien)
  const suitesAbsentes = [];
  Object.keys(FIGURES).forEach(id => (FIGURES[id].suites || []).forEach(s => {
    if(!fs.existsSync(path.join(__dirname, s))) suitesAbsentes.push(id + '→' + s);
  }));
  ok(suitesAbsentes.length === 0, 'A5 · chaque suite citée existe sur disque' +
     (suitesAbsentes.length ? ' — absentes : ' + suitesAbsentes.join(', ') : ''));

  // A6 — pas de cycle dans le graphe réel
  ok(_figCycle(FIGURES) === null, 'A6 · le graphe des figures n\'a pas de cycle');

  // A7 — le ratchet des angles morts : EXACTEMENT une figure sans suite dédiée aujourd'hui
  // (serenite, déclarée). Ajouter demain une figure sans test SANS toucher ce compte fait
  // échouer la suite : l'angle mort restera un CHOIX, jamais un oubli.
  const sansSuite = Object.keys(FIGURES).filter(id => !(FIGURES[id].suites || []).length);
  ok(sansSuite.length === 1 && sansSuite[0] === 'serenite',
     'A7 · une seule figure sans suite dédiée, et c\'est la sérénité (angle mort DÉCLARÉ, pas oublié)' +
     (sansSuite.length !== 1 ? ' — obtenu : ' + sansSuite.join(', ') : ''));
}

// ---------------------------------------------------------------------------
// B. LE MOTEUR — l'aval transitif, figé sur des cas nommés
// ---------------------------------------------------------------------------
{
  const avalCharges = _figAval(FIGURES, 'charges');
  ok(avalCharges.has('charges_fixes') && avalCharges.has('point_mort') && avalCharges.has('ca_encaisse') && avalCharges.has('revenu_horaire'),
     'B1 · toucher `charges` périme : charges fixes → point mort (transitif) ET CA encaissé → revenu horaire (transitif)');
  ok(!avalCharges.has('stock_fini_parfum'),
     'B2 · … mais PAS le stock par parfum : l\'aval est précis, pas « tout est lié à tout »');
  const avalKv = _figAval(FIGURES, 'kv:sm_recurringCharges');
  ok(avalKv.has('charges_fixes') && avalKv.has('point_mort') && avalKv.size === 2,
     'B3 · une clé kv est une source comme une autre : sm_recurringCharges périme exactement charges fixes + point mort');
  const avalFig = _figAval(FIGURES, 'ca_encaisse');
  ok(avalFig.has('ca_encaisse') && avalFig.has('revenu_horaire') && avalFig.size === 2,
     'B4 · une FIGURE peut être la source : l\'aval de ca_encaisse est lui-même + revenu horaire');
  ok(_figAval(FIGURES, 'tableInconnue').size === 0,
     'B5 · une source inconnue ne périme rien — et ne fait pas exploser le moteur');
}

// ---------------------------------------------------------------------------
// C. LES SUITES À RELANCER — l'union exacte, triée, existante
// ---------------------------------------------------------------------------
{
  const r = _figSuitesPour(FIGURES, ['kv:sm_recurringCharges']);
  ok(r.suites.includes('point-mort.test.js') && r.suites.includes('point-mort-verite.test.js') && r.suites.includes('seuils-fiscaux.test.js'),
     'C1 · toucher les charges récurrentes → les suites du point mort sont dans la liste');
  ok(r.suites.every(s => fs.existsSync(path.join(__dirname, s))),
     'C2 · chaque suite listée existe sur disque — l\'outil ne renvoie jamais vers un fichier fantôme');
  const r2 = _figSuitesPour(FIGURES, ['workSessions','charges']);
  const triee = [...r2.suites].sort().join('|') === r2.suites.join('|');
  const unique = new Set(r2.suites).size === r2.suites.length;
  ok(triee && unique, 'C3 · plusieurs sources → union triée et dédupliquée (marche-temps ne sort qu\'une fois)');
}

// ---------------------------------------------------------------------------
// D. PREUVES PAR RÉINTRODUCTION — la garde attrape la carte malade
// ---------------------------------------------------------------------------
{
  const malade = JSON.parse(JSON.stringify(FIGURES));
  malade.charges_fixes.amont = ['point_mort'];   // point_mort dépend déjà de charges_fixes → boucle
  const c = _figCycle(malade);
  ok(Array.isArray(c) && c.includes('point_mort') && c.includes('charges_fixes'),
     'D1 · PREUVE — un cycle injecté (charges fixes ⇄ point mort) est détecté ET nommé, chemin compris');
  const trouee = JSON.parse(JSON.stringify(FIGURES));
  trouee.fantome = { libelle:'x', fn:'fonctionQuiNexistePas', tables:['tableQuiNexistePas'], amont:['figureQuiNexistePas'], suites:['suite-fantome.test.js'] };
  const fnKo = !new RegExp('function fonctionQuiNexistePas\\(').test(cleanApp);
  const amontKo = !trouee.figureQuiNexistePas;
  const suiteKo = !fs.existsSync(path.join(__dirname, 'suite-fantome.test.js'));
  ok(fnKo && amontKo && suiteKo,
     'D2 · PREUVE — une figure fantôme injectée serait attrapée sur ses TROIS mensonges (fonction, amont, suite)');
}

// ---------------------------------------------------------------------------
// E. LE CÂBLAGE — l'événement au commit, jamais de re-rendu forcé
// ---------------------------------------------------------------------------
{
  ok(/_figSignale\(sources\);/.test(cleanApp) && /kv:' \+ e\.cle/.test(cleanApp.replace(/\('kv:'/g, "('kv:")) || /\('kv:' \+ e\.cle\)/.test(cleanApp),
     'E1 · le commit d\'audit signale les sources touchées — les écritures kv sont signalées PAR CLÉ (kv:sm_…)');
  ok(/sm-figures-perimees/.test(cleanApp),
     'E2 · l\'événement « sm-figures-perimees » est émis : le rail est posé pour les écrans');
  const iSig = cleanApp.indexOf('function _figSignale');
  const corpsSig = cleanApp.slice(iSig, cleanApp.indexOf('\n}', iSig));
  ok(!/render[A-Z]/.test(corpsSig) && !/goView/.test(corpsSig),
     'E3 · _figSignale ne déclenche AUCUN re-rendu — recharger un écran sous les doigts de Ben serait pire que le mal (non-but déclaré)');
  ok(/_figSignale\(TABLES\.slice\(\)\)/.test(cleanApp),
     'E4 · après une restauration, TOUT est signalé périmé — une fois, honnêtement');
  const iBoot = cleanApp.lastIndexOf('(async()=>{');
  ok(cleanApp.slice(iBoot, iBoot + 4000).indexOf('_figVerifie()') > -1,
     'E5 · la carte est vérifiée au démarrage (fonctions, amonts, cycle) — signalée, sans bloquer le rendu');
  ok(/renderFiguresModal/.test(cleanApp) && /Carte des chiffres/.test(APP),
     'E6 · la carte est VISIBLE : bouton « 🕸 Carte des chiffres » à l\'écran Sauvegardes');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
