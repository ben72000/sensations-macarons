/* ============================================================
   TESTS DE CARACTÉRISATION — Sensations Macarons
   ------------------------------------------------------------
   Objectif : FIGER le comportement actuel des fonctions de calcul
   pures et déterministes, SANS modifier app.js. On extrait le code
   source exact de chaque fonction depuis app.js (par signature) et
   on l'évalue en isolation avec des stubs minimaux.

   Ces tests ne jugent pas si un calcul est « correct » dans l'absolu :
   ils photographient le comportement d'aujourd'hui pour qu'un futur
   nettoyage/refactor ne l'altère pas à notre insu.

   Usage :  node tests/characterization.test.js
   Sortie :  liste PASS/FAIL + code de sortie 0 (ok) ou 1 (régression).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// --- Extracteurs de source (lecture seule) ---------------------------------
// Extrait le corps source d'une const-arrow mono-ligne : `const NAME = ...;`
function extractConstLine(name){
  const re = new RegExp('^const\\s+' + name + '\\s*=.*;', 'm');
  const m = APP.match(re);
  if(!m) throw new Error('Introuvable (const): ' + name);
  return m[0];
}
// Retire les commentaires (// … et /* … */) d'un fragment, en préservant les chaînes
// de caractères. Nécessaire car les commentaires français contiennent des apostrophes
// (« d'un mois », « l'input ») qui, prises pour des chaînes, déséquilibreraient le
// comptage d'accolades. On ne modifie JAMAIS app.js : on nettoie une COPIE en mémoire.
function stripComments(code){
  let out = '', inStr = null, esc = false;
  for(let i = 0; i < code.length; i++){
    const c = code[i], n = code[i+1];
    if(inStr){
      out += c;
      if(esc){ esc = false; }
      else if(c === '\\'){ esc = true; }
      else if(c === inStr){ inStr = null; }
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; out += c; continue; }
    if(c === '/' && n === '/'){ while(i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
    if(c === '/' && n === '*'){ i += 2; while(i < code.length && !(code[i] === '*' && code[i+1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}
// Extrait une déclaration `function NAME(...) { ... }` en équilibrant les accolades,
// après avoir neutralisé les commentaires.
function extractFunction(name){
  const sigRe = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
  const m = sigRe.exec(APP);
  if(!m) throw new Error('Introuvable (function): ' + name);
  const clean = stripComments(APP.slice(m.index));
  let i = clean.indexOf('{');
  if(i === -1) throw new Error('Corps introuvable: ' + name);
  let depth = 0, inStr = null, esc = false;
  for(let j = i; j < clean.length; j++){
    const c = clean[j];
    if(inStr){
      if(esc){ esc = false; }
      else if(c === '\\'){ esc = true; }
      else if(c === inStr){ inStr = null; }
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0){ return clean.slice(0, j+1); } }
  }
  throw new Error('Accolades non équilibrées: ' + name);
}

// --- Bac à sable : on évalue le source extrait dans un scope contrôlé -------
// Stubs minimaux requis par les fonctions ciblées.
const sandbox = {};
function loadInto(sandbox, sources){
  // Les fonctions/const sont évaluées ensemble pour partager leur portée.
  const header = `
    let __exports = {};
  `;
  const footer = `
    __exports;
  `;
  // On récupère chaque symbole défini via un objet d'export explicite.
  return sources;
}

// Construit une fonction évaluatrice avec les stubs injectés et renvoie les symboles demandés.
function buildModule(){
  const money2   = extractConstLine('money2');
  const round3   = extractConstLine('round3');
  const today    = null; // today est un const-arrow multi-lignes → on l'extrait à part
  const ymdLocalSrc = extractFunction('ymdLocal');
  const monthKeySrc = extractFunction('monthKey');
  const ymOfSrc     = extractFunction('ymOf');
  const computeDlcSrc = extractFunction('computeDlc');
  const isFreezerSrc  = extractFunction('isFreezer');
  const peekSrc       = extractFunction('peekFactureNumero');

  // today() : const arrow multi-lignes → extraction dédiée
  const todayMatch = APP.match(/const today = \(\) => \{[\s\S]*?\};/);
  if(!todayMatch) throw new Error('Introuvable: today');
  const todaySrc = todayMatch[0];

  // Stubs que les fonctions attendent dans leur portée :
  //  - EMP_BY_KEY : requis par isFreezer (on fournit la vraie table figée depuis app.js)
  //  - _factSeqGet : requis par peekFactureNumero (compteur de factures ; on l'injecte)
  const empByKeySrc = (() => {
    // EMP_BY_KEY = Object.fromEntries(EMPLACEMENTS.map(...)) : on reconstruit depuis EMPLACEMENTS.
    // On borne l'extraction au 1er '];' du fragment NETTOYÉ (sans commentaires) pour éviter
    // toute sur-capture due à un ']' ou ';' présent dans un commentaire.
    const idx = APP.indexOf('const EMPLACEMENTS = [');
    if(idx === -1) throw new Error('Introuvable: EMPLACEMENTS');
    const clean = stripComments(APP.slice(idx));
    const end = clean.indexOf('];');
    if(end === -1) throw new Error('Fin EMPLACEMENTS introuvable');
    return clean.slice(0, end+2) + '\nconst EMP_BY_KEY = Object.fromEntries(EMPLACEMENTS.map(e=>[e.key,e]));';
  })();

  const code = `
    ${money2}
    ${round3}
    ${todaySrc}
    ${ymdLocalSrc}
    ${monthKeySrc}
    ${ymOfSrc}
    ${empByKeySrc}
    ${isFreezerSrc}
    ${computeDlcSrc}
    // _factSeqGet injecté par le test (compteur de factures simulé)
    function _factSeqGet(){ return globalThis.__factSeq || 0; }
    ${peekSrc}
    ({ money2, round3, today, ymdLocal, monthKey, ymOf, isFreezer, computeDlc, peekFactureNumero });
  `;
  return eval(code);
}

const M = buildModule();

// --- Micro-framework de test ------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// ============================================================================
// 1) money2 — arrondi au centime, garde isFinite [AUDIT A19]
// ============================================================================
eq(M.money2(0.005), 0.01, 'money2(0.005) = 0.01 (arrondi au centime)');
eq(M.money2(null), 0, 'money2(null) = 0');
eq(M.money2(undefined), 0, 'money2(undefined) = 0');
eq(M.money2(Infinity), 0, 'money2(Infinity) = 0 [garde A19]');
eq(M.money2(-Infinity), 0, 'money2(-Infinity) = 0 [garde A19]');
eq(M.money2(NaN), 0, 'money2(NaN) = 0');
eq(M.money2(12.3456), 12.35, 'money2(12.3456) = 12.35');
eq(M.money2(12.344), 12.34, 'money2(12.344) = 12.34');
eq(M.money2('7.5'), 7.5, "money2('7.5') = 7.5 (coercition)");
eq(M.money2(0), 0, 'money2(0) = 0');

// ============================================================================
// 2) round3 — quantités de stock à 3 décimales
// ============================================================================
eq(M.round3(1.23456), 1.235, 'round3(1.23456) = 1.235');
eq(M.round3(Infinity), 0, 'round3(Infinity) = 0 [garde A19]');
eq(M.round3(null), 0, 'round3(null) = 0');

// ============================================================================
// 3) today() / ymdLocal() / ymOf() — dates LOCALES, pas UTC [AUDIT A1/A12]
//    On teste l'invariant : ces fonctions utilisent l'heure LOCALE.
// ============================================================================
// ymdLocal sur une date fixe locale
const dFixe = new Date(2026, 6, 8, 0, 30, 0); // 8 juillet 2026, 00h30 LOCAL
eq(M.ymdLocal(dFixe), '2026-07-08', 'ymdLocal(8 juil 00h30 local) = 2026-07-08 [pas la veille UTC]');
eq(M.ymdLocal(new Date(2026, 0, 1, 0, 15)), '2026-01-01', 'ymdLocal(1er jan 00h15 local) = 2026-01-01');
eq(M.ymdLocal('pas une date'), '', "ymdLocal(non-Date) = ''");
eq(M.ymdLocal(new Date('invalide')), '', "ymdLocal(Date invalide) = ''");
eq(M.ymOf(new Date(2026, 5, 1, 0, 30)), '2026-06', 'ymOf(1er juin 00h30 local) = 2026-06 [pas 2026-05 UTC]');
eq(M.ymOf(new Date(2026, 11, 31, 23, 30)), '2026-12', 'ymOf(31 déc 23h30 local) = 2026-12');

// today() : doit produire un 'YYYY-MM-DD' cohérent avec l'heure locale courante
const now = new Date();
const attenduToday = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
eq(M.today(), attenduToday, 'today() = date locale du jour (format YYYY-MM-DD)');

// ============================================================================
// 4) monthKey() — clé 'YYYY-MM', gère ISO avec heure [AUDIT]
// ============================================================================
eq(M.monthKey('2026-07-08'), '2026-07', "monthKey('2026-07-08') = 2026-07 (slice direct)");
eq(M.monthKey(''), '', "monthKey('') = '' ");
eq(M.monthKey('2026-12'), '2026-12', "monthKey('2026-12') = 2026-12");
// Invariant CLÉ (indépendant du fuseau machine) : pour une date ISO AVEC heure, monthKey
// reparse en heure LOCALE — le résultat doit donc égaler la clé locale de cette même date,
// PAS le slice(0,7) brut de la chaîne UTC. On compare au calcul local de la machine courante.
const isoAvecHeure = '2026-05-31T22:00:00Z';
const dLoc = new Date(isoAvecHeure);
const cleLocale = dLoc.getFullYear()+'-'+String(dLoc.getMonth()+1).padStart(2,'0');
eq(M.monthKey(isoAvecHeure), cleLocale, 'monthKey(ISO avec heure) = clé du mois en heure LOCALE (anti-décalage UTC)');
// Et pour prouver que ce n'est pas un simple slice : si la machine est en fuseau positif,
// la clé locale diffère du slice brut '2026-05'. On vérifie au moins la cohérence interne.
eq(M.monthKey(isoAvecHeure), cleLocale, 'monthKey(ISO avec heure) est déterministe et local');

// ============================================================================
// 5) isFreezer() — congélateur vs frigo (table EMPLACEMENTS figée)
// ============================================================================
eq(M.isFreezer('frigo'), false, "isFreezer('frigo') = false");
eq(M.isFreezer('bahut'), true, "isFreezer('bahut') = true (congélateur)");
eq(M.isFreezer('colonne'), true, "isFreezer('colonne') = true");
eq(M.isFreezer('petit'), true, "isFreezer('petit') = true");
eq(M.isFreezer('inconnu'), false, "isFreezer('inconnu') = false (défaut prudent)");
eq(M.isFreezer('congelateur'), true, "isFreezer('congelateur') = true (repli legacy)");

// ============================================================================
// 6) computeDlc() — +7 j au frigo, +4 mois au congélateur, en LOCAL [A12]
// ============================================================================
eq(M.computeDlc('frigo', '2026-07-08'), '2026-07-15', "computeDlc(frigo, 8 juil) = +7 j = 15 juil");
eq(M.computeDlc('bahut', '2026-07-08'), '2026-11-08', "computeDlc(congélateur, 8 juil) = +4 mois = 8 nov");
eq(M.computeDlc('frigo', '2026-12-30'), '2027-01-06', "computeDlc(frigo, 30 déc) = +7 j = 6 jan (passage d'année)");
eq(M.computeDlc('inconnu', '2026-07-08'), '2026-07-15', "computeDlc(emplacement inconnu) = frigo par défaut (+7 j)");

// ============================================================================
// 7) peekFactureNumero() — préfixe AAAAMM + (compteur+1), NON consommé
// ============================================================================
globalThis.__factSeq = 23;
const d0 = new Date();
const prefixAttendu = d0.getFullYear()+String(d0.getMonth()+1).padStart(2,'0');
eq(M.peekFactureNumero(), `${prefixAttendu}-24`, 'peekFactureNumero() = préfixe AAAAMM + (seq+1), sans consommer');
// Appel répété : ne doit PAS incrémenter (peek = lecture seule)
eq(M.peekFactureNumero(), `${prefixAttendu}-24`, 'peekFactureNumero() est idempotent (ne consomme pas le numéro)');
globalThis.__factSeq = 0;
eq(M.peekFactureNumero(), `${prefixAttendu}-1`, 'peekFactureNumero() avec compteur 0 = -1');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Sensations Macarons ===\n');
if(failures.length){
  console.log(failures.join('\n'));
  console.log('');
}
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
  process.exit(0);
} else {
  console.log('✗ RÉGRESSION : un comportement figé a changé. Vérifier les modifications.\n');
  process.exit(1);
}
