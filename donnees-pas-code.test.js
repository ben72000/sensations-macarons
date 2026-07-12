/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 49 : UN NOM DE CLIENT TUAIT LE COPILOTE
   ----------------------------------------------------------------------------
   BUG DE PRODUCTION, remonté par Benjamin (capture d'écran) : « Une erreur est survenue :
   Invalid regular expression: unmatched parentheses » — sur TOUTES ses questions.
   Il précisait : « plus rien ne fonctionne, et ça date d'il y a un certain temps ».

   CAUSE. `aiFindClient` construisait ses expressions régulières À PARTIR DU NOM DU CLIENT,
   sans échappement :

       new RegExp('\\b' + last + '\\b')        ← `last` = un mot du nom du client

   Un client nommé « Boulangerie Martin (Le Mans) » produisait donc la regex `/\bmans)\b/` :
   parenthèse non fermée → SyntaxError.

   AMPLEUR. `aiFindClient` est appelée depuis `parseIntent`. Donc TOUTE requête plantait —
   pas seulement celles parlant d'un client. Le copilote était INTÉGRALEMENT MORT. Il suffisait
   d'UN client au nom contenant ( ) + * ? [ ] | pour tout condamner, en silence, depuis le jour
   de sa création. Et rien ne le signalait : l'erreur s'affichait comme un incident isolé
   (« réessaie ou reformule »), invitant Benjamin à croire que c'était SA phrase le problème.

   LA LEÇON. `escapeRe()` existait DÉJÀ dans app.js (ligne 14756) et était utilisée ailleurs.
   Elle avait simplement été oubliée ici. Le danger n'est pas d'ignorer la règle : c'est de la
   connaître et de l'appliquer à 90 %.

   RÈGLE FIGÉE : **LES DONNÉES DE BENJAMIN NE SONT PAS DU CODE.** Toute expression régulière
   construite à partir d'un nom de client, d'un code de lot, d'un nom d'emballage ou de quoi que
   ce soit qu'il a saisi DOIT passer par escapeRe(). Sans exception.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function bloc(nom){
  const i = APP.indexOf('const ' + nom + ' = {');
  if(i < 0) throw new Error('Introuvable : ' + nom);
  let d = 0, s = null, e = false;
  for(let j = APP.indexOf('{', i); j < APP.length; j++){
    const c = APP[j];
    if(s){ if(e) e = false; else if(c === '\\') e = true; else if(c === s) s = null; continue; }
    if(c === '"' || c === "'" || c === '`'){ s = c; continue; }
    if(c === '{') d++;
    else if(c === '}'){ d--; if(!d) return APP.slice(i, j + 1) + ';'; }
  }
  throw new Error('Accolades non équilibrées : ' + nom);
}

function buildModule(){
  const noms = ['escapeRe','_aiNormalizeRaw','aiNormalize','aiCorrigeFautes','aiLexFrag','aiLexTest',
                'aiFindFlavor','aiFindMaterial','aiFindClient','aiParseNumber','aiParseDate',
                'aiExtractName','aiParseOrderItems','_aiParsePeriode','_saisonDepuisTexte','parseIntent'];
  let src = 'var _aiNormCache;\n' + bloc('AI_LEX') + '\n' + bloc('_AI_CORRECTIONS') + '\n';
  for(const n of noms) src += extractFunction(n) + '\n';
  return new Function(`
    const console = { warn(){}, error(){}, log(){} };
    ${src}
    return { parseIntent, aiFindClient, aiNormalize, escapeRe };
  `)();
}

const M = buildModule();

let pass=0, fail=0; const failures=[];
function eq(a, e, label){
  const x=JSON.stringify(a), y=JSON.stringify(e);
  if(x===y){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${y}\n      obtenu : ${x}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }
function neJetePas(fn, label){
  try{ fn(); pass++; }
  catch(e){ fail++; failures.push(`  ✗ ${label}\n      a levé : ${e.message}`); }
}

console.log('\n=== TESTS DE CARACTÉRISATION — Vague 49 : un nom de client tuait le copilote ===\n');

// ---------------------------------------------------------------------------
// A. LE BUG EXACT, TEL QUE BENJAMIN L'A SUBI
// ---------------------------------------------------------------------------
// Un seul client au nom parenthésé suffisait à tuer TOUTES les requêtes.
const CLIENT_TUEUR = [{ id:1, nom:'Boulangerie Martin (Le Mans)' }];
const ctxTueur = { flavors:['chocolat','vanille'], clients:CLIENT_TUEUR, materials:[] };
{
  // La requête exacte de la capture d'écran.
  neJetePas(() => M.parseIntent('Quel est mon CA du mois de mai', ctxTueur),
    'A1 · « Quel est mon CA du mois de mai » ne plante plus (la requête de la capture d\'écran)');

  // Et surtout : ce n'était PAS un problème de formulation. TOUT plantait.
  neJetePas(() => M.parseIntent('mes commandes', ctxTueur),
    'A2 · « mes commandes » non plus — le bug n\'avait RIEN à voir avec la phrase tapée');
  neJetePas(() => M.parseIntent('mon stock de chocolat', ctxTueur),
    'A3 · « mon stock de chocolat » non plus — le copilote était intégralement mort');
  neJetePas(() => M.parseIntent('bonjour', ctxTueur),
    'A4 · même « bonjour » plantait : un simple salut était condamné par un nom de client');

  // Les intentions restent CORRECTES (on a corrigé, pas contourné en avalant l'erreur).
  // NB : appel protégé — un test qui PLANTE est un signal, pas un diagnostic. On veut un rapport
  // lisible même quand le bug est présent, pas une pile d'appels.
  const intentSafe = (txt, ctx) => { try{ return M.parseIntent(txt, ctx).intent; }catch(e){ return 'ERREUR:'+e.message; } };
  eq(intentSafe('mes commandes', ctxTueur), 'query_orders',
     'A5 · … et l\'intention est juste : on a réparé la cause, pas masqué le symptôme');
}

// ---------------------------------------------------------------------------
// B. TOUS LES MÉTACARACTÈRES, PAS SEULEMENT LA PARENTHÈSE
// ---------------------------------------------------------------------------
// La parenthèse est celle qui a mordu. Mais un nom de client est du TEXTE LIBRE : il peut
// contenir n'importe quoi. On les passe tous en revue — un par un, pour qu'aucun ne revienne.
const NOMS_PIEGES = [
  'Boulangerie Martin (Le Mans)',   // parenthèses  → le bug d'origine
  'Café des Sports [centre]',       // crochets     → classe de caractères
  'Chez Paul + Marie',              // plus         → quantificateur
  'Épicerie 100% Bio',              // pourcent     → inoffensif, mais on vérifie
  'Traiteur * Étoile',              // astérisque   → quantificateur
  'Question ?',                     // point d'interrogation
  'Dupont | Durand',                // barre        → alternance
  'Le Fournil {artisan}',           // accolades    → quantificateur
  'Chocolaterie ^Prime',            // circonflexe  → ancre
  'Fin$',                           // dollar       → ancre
  'Anti\\Slash',                    // antislash    → échappement
  'Point.Virgule'                   // point        → joker
];
NOMS_PIEGES.forEach((nom, i) => {
  const ctx = { flavors:['chocolat'], clients:[{id:i+1, nom}], materials:[] };
  neJetePas(() => M.parseIntent('mes commandes', ctx),
    `B${i+1} · un client nommé « ${nom} » ne fait plus planter le copilote`);
});

// ---------------------------------------------------------------------------
// C. LA RÉPARATION N'A PAS CASSÉ LA RECHERCHE DE CLIENT
// ---------------------------------------------------------------------------
// Échapper, c'est bien — mais si aiFindClient ne trouve plus personne, on a « réparé » en
// cassant la fonctionnalité. On vérifie qu'elle marche toujours.
{
  const clients = [
    { id:1, nom:'Jean Dupont' },
    { id:2, nom:'Marie Durand' },
    { id:3, nom:'Boulangerie Martin (Le Mans)' }
  ];
  // Appel protégé (cf. A5) : on veut un rapport lisible même si le bug est présent.
  const trouve = (txt) => {
    try{ const c = M.aiFindClient(M.aiNormalize(txt), clients); return c ? c.id : null; }
    catch(e){ return 'ERREUR:' + e.message; }
  };

  eq(trouve('la commande de dupont'), 1, 'C1 · recherche par nom de famille : toujours fonctionnelle');
  eq(trouve('la commande de marie'), 2, 'C2 · recherche par prénom : toujours fonctionnelle');
  eq(trouve('commande boulangerie martin (le mans)'), 3,
     'C3 · le client au nom parenthésé est bien TROUVÉ (nom complet), pas seulement « non fatal »');
  eq(trouve('la commande de personne'), null, 'C4 · un nom inconnu ne renvoie personne (pas de faux positif)');
}

// ---------------------------------------------------------------------------
// D. escapeRe FAIT BIEN SON TRAVAIL
// ---------------------------------------------------------------------------
{
  ok(/\(/.test(M.escapeRe('(')) === false || M.escapeRe('(') === '\\(',
     'D1 · escapeRe neutralise la parenthèse ouvrante');
  eq(M.escapeRe('a(b)c'), 'a\\(b\\)c', 'D2 · escapeRe échappe les deux parenthèses');
  neJetePas(() => new RegExp('\\b' + M.escapeRe('mans)') + '\\b'),
     'D3 · la regex qui plantait devient valide une fois échappée');

  // La regex échappée doit toujours MATCHER le texte littéral.
  ok(new RegExp(M.escapeRe('(le mans)')).test('boulangerie martin (le mans)'),
     'D4 · … et elle retrouve toujours le texte littéral (échapper ≠ neutraliser le sens)');
}

// ---------------------------------------------------------------------------
// E. LE GARDE-FOU STRUCTUREL — plus AUCUNE regex bâtie sur des données non échappées
// ---------------------------------------------------------------------------
// C'est l'assertion la plus importante du lot. Elle ne teste pas un cas : elle scanne app.js et
// interdit le MOTIF lui-même. Toute nouvelle `new RegExp('...'+variable+'...')` qui ne passe pas
// par escapeRe fera échouer ce test — y compris celles qu'on n'a pas encore écrites.
{
  // Les concaténations autorisées : littéraux purs, ou variables déjà échappées, ou identifiants
  // provenant de tables CODÉES EN DUR dans app.js (jours de la semaine, allergènes, corrections
  // orthographiques) — jamais de la base de Benjamin.
  const SOURCES_CODEES_EN_DUR = ['EMP_LETTERS', 'j', 'k', '_s'];

  const lignes = APP.split('\n');
  const suspectes = [];
  lignes.forEach((ligne, i) => {
    if(!/new RegExp\(/.test(ligne)) return;
    if(/escapeRe/.test(ligne)) return;                       // déjà échappée → OK
    if(/replace\(\/\[\.\*\+\?/.test(ligne)) return;          // échappement inline explicite → OK
    // Concaténation avec une variable ?
    const m = ligne.match(/new RegExp\(\s*['"][^'"]*['"]\s*\+\s*([A-Za-z_$][\w$]*)/);
    if(!m) return;                                           // littéral pur → OK
    if(SOURCES_CODEES_EN_DUR.includes(m[1])) return;         // table codée en dur → OK
    suspectes.push(`ligne ${i+1} : variable « ${m[1] }» non échappée\n        ${ligne.trim().slice(0,100)}`);
  });

  ok(suspectes.length === 0,
     'E1 · GARDE-FOU : aucune regex construite sur des données de Benjamin sans escapeRe()');
  suspectes.forEach(s => failures.push('      ' + s));
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
