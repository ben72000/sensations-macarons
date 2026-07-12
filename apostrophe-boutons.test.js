/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 50 : L'APOSTROPHE TUAIT LES BOUTONS
   ----------------------------------------------------------------------------
   Suite directe de la vague 49 (« les données de Benjamin ne sont pas du code », côté REGEX).
   Même faille, autre langage : ici c'est le JavaScript des attributs inline qui est cassé par
   les données. Angle mort déclaré à la fin de la vague 49, audité ici.

   LE PIÈGE :        onclick="maFonction('${nom}')"
   C'est l'APOSTROPHE qui délimite la chaîne JS. Or :
     • `esc()` échappe & < > "  … mais PAS l'apostrophe (inoffensive en HTML, fatale en JS) ;
     • `encodeURIComponent()` ne l'encode pas non plus — idée reçue tenace :
             encodeURIComponent("Fleur d'oranger")  →  "Fleur%20d'oranger"   ← elle SURVIT.
   En pâtisserie française, l'apostrophe est la NORME : « Fleur d'oranger », « Crème d'amande »,
   « L'Épi d'Or ». Ce n'est pas un cas tordu, c'est le quotidien.

   CE QUE L'AUDIT A TROUVÉ — CINQ variantes artisanales d'échappement coexistaient, dont DEUX
   étaient FAUSSES :

     1. esc(x).replace(/'/g,"\\'")      ← 17 fois. Marche, mais ignore l'antislash et le saut de ligne.
     2. String(x).replace(/'/g,"\\'")   ← correct aussi, autre écriture.
     3. wk.replace(/\\/g,'\\\\').replace(/'/g,"\\'")   ← LE SEUL complet. Un endroit sur cinq.
     4. String(x).replace(/'/g,'')      ← DESTRUCTIF : supprimait purement l'apostrophe du nom.
     5. esc(x).replace(/'/g,'&#39;')    ← FAUX. Le navigateur REDÉCODE &#39; en apostrophe AVANT
                                          de compiler le JS de l'attribut → le bouton casse quand
                                          même. Une protection qui ne protège rien est pire que
                                          pas de protection : elle rassure.

   Et à un endroit (le bouton « valider » d'un parfum), l'échappement était tout simplement
   OUBLIÉ — remplacé par un encodeURIComponent qui ne protège pas.

   RÈGLE FIGÉE : un seul helper, `escJs()`, pour toute donnée placée dans une chaîne JS d'un
   attribut HTML. L'ORDRE des échappements y est critique :
     1. antislash D'ABORD (sinon on échappe ses propres échappements),
     2. apostrophe (elle ferme la chaîne JS),
     3. sauts de ligne (ils cassent l'attribut),
     4. puis esc() pour l'attribut HTML.
   Inverser 1 et 2 produit un échappement silencieusement faux.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// escJs est une const MULTI-LIGNES : extractConstLine ne sait extraire qu'une const d'une seule
// ligne. On récupère son bloc en équilibrant les parenthèses — depuis app.js, en direct, pour que
// le test porte sur le VRAI code et non sur une copie qui pourrait diverger.
function extractConstBlock(nom){
  const i = APP.indexOf('const ' + nom + ' = ');
  if(i < 0) throw new Error('Introuvable : ' + nom);
  let d = 0, vu = false;
  for(let j = i; j < APP.length; j++){
    const c = APP[j];
    if(c === '(') { d++; vu = true; }
    else if(c === ')') { d--; if(vu && d === 0) return APP.slice(i, APP.indexOf(';', j) + 1); }
  }
  throw new Error('Parenthèses non équilibrées : ' + nom);
}

function buildModule(){
  const code = `
    ${extractConstLine('esc')}
    ${extractConstBlock('escJs')}
    return { esc, escJs };
  `;
  return new Function(code)();
}
const M = buildModule();

let pass=0, fail=0; const failures=[];
function eq(a, e, label){
  const x=JSON.stringify(a), y=JSON.stringify(e);
  if(x===y){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${y}\n      obtenu : ${x}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }

console.log('\n=== TESTS DE CARACTÉRISATION — Vague 50 : l\'apostrophe tuait les boutons ===\n');

// ---------------------------------------------------------------------------
// A. LE PROBLÈME — ce que les protections d'AVANT laissaient passer
// ---------------------------------------------------------------------------
{
  // La démonstration que encodeURIComponent NE PROTÈGE PAS. C'est l'idée reçue à tuer.
  ok(encodeURIComponent("Fleur d'oranger").includes("'"),
     'A1 · encodeURIComponent laisse l\'APOSTROPHE intacte (« Fleur%20d\'oranger ») — il ne protège PAS');
  ok(encodeURIComponent("Boulangerie (Le Mans)").includes("("),
     'A2 · … ni les parenthèses (encodeURIComponent ne touche pas à ! ~ * \' ( ) )');

  // esc() non plus : l'apostrophe est inoffensive en HTML, mais fatale dans une chaîne JS.
  ok(M.esc("L'Épi d'Or").includes("'"),
     'A3 · esc() laisse l\'apostrophe intacte — normal en HTML, FATAL dans un onclick');
}

// ---------------------------------------------------------------------------
// B. escJs — l'échappement CORRECT
// ---------------------------------------------------------------------------
{
  eq(M.escJs("Fleur d'oranger"), "Fleur d\\'oranger",
     'B1 · l\'apostrophe est échappée pour la chaîne JS');
  eq(M.escJs("L'Épi d'Or"), "L\\'Épi d\\'Or",
     'B2 · toutes les apostrophes, pas seulement la première');

  // L'ORDRE : antislash D'ABORD. Si on échappait l'apostrophe en premier, l'antislash qu'on vient
  // d'ajouter serait lui-même échappé au tour suivant → \\' au lieu de \' → chaîne JS cassée.
  eq(M.escJs("a\\b"), "a\\\\b",
     'B3 · l\'antislash est doublé (sinon \\b = un caractère de contrôle en JS)');
  eq(M.escJs("a\\'b"), "a\\\\\\'b",
     'B4 · ORDRE CRITIQUE : antislash PUIS apostrophe — inverser produit un échappement faux');

  eq(M.escJs("ligne1\nligne2"), "ligne1 ligne2",
     'B5 · les sauts de ligne sont neutralisés (ils casseraient l\'attribut HTML)');

  // Et l'échappement HTML de l'attribut reste fait (guillemet, chevrons).
  eq(M.escJs('Café "Chez <b>'), 'Café &quot;Chez &lt;b&gt;',
     'B6 · le guillemet et les chevrons sont toujours échappés pour l\'attribut HTML');

  eq(M.escJs(null), '', 'B7 · null → chaîne vide (jamais « null » affiché)');
  eq(M.escJs(undefined), '', 'B8 · undefined → chaîne vide');
  eq(M.escJs(42), '42', 'B9 · un nombre passe sans dommage');
}

// ---------------------------------------------------------------------------
// C. LE HANDLER PRODUIT EST DU JS VALIDE — la seule preuve qui compte
// ---------------------------------------------------------------------------
// On ne se contente pas de vérifier des chaînes : on RECONSTRUIT le onclick tel que le navigateur
// le verra (après décodage des entités HTML), et on l'évalue. S'il ne compile pas, le bouton est
// mort dans l'app — c'est exactement ce que subissait Benjamin.
const NOMS_REELS = [
  "Fleur d'oranger",          // le parfum qui cassait le bouton « valider »
  "Crème d'amande",
  "L'Épi d'Or",               // un client
  "Boulangerie Martin (Le Mans)",
  'Café "Le Central"',
  "Chocolat 70% & Noisette",
  "Anti\\Slash",
  "Chez <b>Léa</b>"
];

// Décodage des entités que le parseur HTML applique AVANT de compiler le JS de l'attribut.
// C'est précisément ce que l'ancienne « protection » &#39; ignorait.
const decodeHtml = s => s.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
                         .replace(/&#39;/g,"'").replace(/&amp;/g,'&');

NOMS_REELS.forEach((nom, i) => {
  const attribut = `maFonction('${M.escJs(nom)}')`;   // ce qu'on écrit dans onclick="…"
  const jsVuParLeNavigateur = decodeHtml(attribut);   // ce que le navigateur compile
  let recu = null, erreur = null;
  try{ new Function('maFonction', jsVuParLeNavigateur)(v => { recu = v; }); }
  catch(e){ erreur = e.message; }

  ok(erreur === null, `C${i+1}a · « ${nom} » → le onclick compile${erreur?' (a levé : '+erreur+')':''}`);
  eq(recu, nom, `C${i+1}b · … et la fonction reçoit le nom EXACT, non mutilé`);
});

// ---------------------------------------------------------------------------
// D. LES ANCIENNES « PROTECTIONS » ÉCHOUENT — la preuve par la démonstration
// ---------------------------------------------------------------------------
// Ce bloc ne teste pas app.js : il rejoue les variantes trouvées dans le code, pour figer
// POURQUOI elles étaient fausses. Si quelqu'un est tenté de les réintroduire, c'est écrit ici.
{
  const nom = "Fleur d'oranger";

  // Variante 5 : &#39; — le navigateur le REDÉCODE en apostrophe avant de compiler le JS.
  const faux5 = M.esc(nom).replace(/'/g,'&#39;');
  const js5 = decodeHtml(`maFonction('${faux5}')`);
  let casse5 = false;
  try{ new Function('maFonction', js5); }catch(e){ casse5 = true; }
  ok(casse5, 'D1 · la variante &#39; produit bien un JS INVALIDE (le navigateur la redécode) — elle ne protégeait rien');

  // Variante 4 : suppression pure — le JS compile… mais le nom est MUTILÉ.
  const faux4 = String(nom).replace(/'/g,'');
  let recu4 = null;
  new Function('maFonction', `maFonction('${faux4}')`)(v => { recu4 = v; });
  ok(recu4 !== nom, 'D2 · la variante « supprimer l\'apostrophe » compile, mais MUTILE la donnée…');
  eq(recu4, 'Fleur doranger', 'D3 · … le nom devient « Fleur doranger » — silencieusement faux');

  // encodeURIComponent : casse aussi.
  const jsEnc = `maFonction('${encodeURIComponent(nom)}')`;
  let casseEnc = false;
  try{ new Function('maFonction', jsEnc); }catch(e){ casseEnc = true; }
  ok(casseEnc, 'D4 · encodeURIComponent produit un JS INVALIDE — c\'était le bug du bouton « valider »');
}

// ---------------------------------------------------------------------------
// D-bis. L'ALLER-RETOUR COMPLET — transport + chaîne JS, les DEUX couches
// ---------------------------------------------------------------------------
// Ce bloc fige la leçon la plus coûteuse de cette vague. Ma PREMIÈRE correction remplaçait
// encodeURIComponent par escJs. Elle était FAUSSE : la fonction réceptrice fait un
// decodeURIComponent, et retirer l'encodage de transport casse l'aller-retour — un parfum
// « Chocolat 70% » aurait levé une URIError (« URI malformed »).
//
// Il faut LES DEUX, dans cet ordre :
//   1. encodeURIComponent  → l'encodage de TRANSPORT (ce que le récepteur attend)
//   2. escJs               → la chaîne JS de l'attribut (ce que le navigateur compile)
// Chacune seule est insuffisante. Ce test évalue le handler ET le décodage.
{
  const allerRetour = (nom) => {
    const attribut = `maFonction('${M.escJs(encodeURIComponent(nom))}')`;
    const js = decodeHtml(attribut);
    let recu = null;
    new Function('maFonction', js)(v => { recu = decodeURIComponent(v); });
    return recu;
  };

  eq(allerRetour("Fleur d'oranger"), "Fleur d'oranger",
     'Dbis1 · « Fleur d\'oranger » survit à l\'aller-retour complet (le bouton « valider »)');
  eq(allerRetour("Chocolat 70%"), "Chocolat 70%",
     'Dbis2 · « Chocolat 70% » aussi — c\'est LUI que ma première correction aurait cassé (URIError)');
  eq(allerRetour("Crème d'amande & noisette"), "Crème d'amande & noisette",
     'Dbis3 · apostrophe ET esperluette ensemble');
  eq(allerRetour("Café \"Le Central\" (Le Mans)"), "Café \"Le Central\" (Le Mans)",
     'Dbis4 · guillemets et parenthèses');

  // La preuve que CHAQUE couche seule est insuffisante.
  let casseSansEscJs = false;
  try{ new Function('f', decodeHtml(`f('${encodeURIComponent("Fleur d'oranger")}')`)); }
  catch(e){ casseSansEscJs = true; }
  ok(casseSansEscJs, 'Dbis5 · SANS escJs : le handler ne compile pas (l\'apostrophe survit à encodeURIComponent)');

  let erreurSansEncode = null;
  try{
    const js = decodeHtml(`f('${M.escJs("Chocolat 70%")}')`);
    new Function('f', js)(v => decodeURIComponent(v));
  }catch(e){ erreurSansEncode = e.constructor.name; }
  eq(erreurSansEncode, 'URIError',
     'Dbis6 · SANS encodeURIComponent : le récepteur lève une URIError sur « 70% » — ma première correction');
}

// ---------------------------------------------------------------------------
// E. LE GARDE-FOU STRUCTUREL — plus aucune variante artisanale dans app.js
// ---------------------------------------------------------------------------
// Comme en vague 49 : on n'interdit pas un cas, on interdit LE MOTIF. Toute nouvelle tentative
// d'échapper l'apostrophe à la main fera échouer ce test — y compris celles pas encore écrites.
{
  const lignes = APP.split('\n');
  const artisanales = [];
  lignes.forEach((l, i) => {
    if(!/replace\(\s*\/'\/g/.test(l)) return;
    if(/le vrai tueur/.test(l)) return;                 // la définition d'escJs elle-même
    artisanales.push(`ligne ${i+1} : ${l.trim().slice(0,90)}`);
  });
  ok(artisanales.length === 0,
     'E1 · GARDE-FOU : aucun échappement d\'apostrophe fait à la main — escJs() est le SEUL chemin');
  artisanales.forEach(a => failures.push('      ' + a));
}

// E2 — LE GARDE-FOU AVEC SUIVI DE LA DONNÉE.
// Première version de ce garde-fou : ligne par ligne. Il n'a PAS vu le bug quand je l'ai
// réintroduit — parce que la variable est affectée ligne 17433 et utilisée ligne 17436.
// C'était très exactement l'angle mort déclaré en fin de vague 49 (« une construction en
// plusieurs étapes lui échapperait »). Il a mordu dès la vague suivante.
//
// On suit donc la donnée à travers le fichier :
//   1. on relève toute variable affectée depuis escJs(...)          → SÛRE
//   2. on relève toute variable affectée depuis encodeURIComponent(...) SANS escJs → DANGEREUSE
//   3. on vérifie qu'aucune variable dangereuse n'atterrit dans un handler inline entre apostrophes
{
  const sures = new Set();
  const dangereuses = new Map();   // nom → ligne d'affectation
  APP.split('\n').forEach((l, i) => {
    let m;
    if((m = l.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*escJs\(/))) sures.add(m[1]);
    else if((m = l.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*encodeURIComponent\(/))) dangereuses.set(m[1], i + 1);
  });

  // Une variable à la fois sûre ailleurs et dangereuse ici : on tranche pour le danger (pessimiste).
  const fautes = [];
  const re = /on\w+\s*=\s*"[^"]*?'\$\{([^}]+)\}'/g;
  APP.split('\n').forEach((l, i) => {
    let m; re.lastIndex = 0;
    while((m = re.exec(l))){
      const e = m[1].trim();
      if(/^escJs\(/.test(e)) continue;                 // échappé sur place → OK
      if(dangereuses.has(e) && !sures.has(e)){
        fautes.push(`ligne ${i + 1} : « ${e} » vient d'un encodeURIComponent nu (affecté ligne ${dangereuses.get(e)}) — l'apostrophe survit`);
      }
    }
  });

  ok(fautes.length === 0,
     'E2 · GARDE-FOU (suivi de la donnée) : aucune variable encodeURIComponent nue n\'atterrit dans un handler inline');
  fautes.forEach(f => failures.push('      ' + f));
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
