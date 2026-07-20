/* ============================================================
   TESTS — v1383 · CHANTIER A : LES ÉCHECS SILENCIEUX PARLENT
   ------------------------------------------------------------
   CE QUE CETTE SUITE INTERDIT DE RÉINTRODUIRE.

   L'audit de juillet 2026 a établi le fait suivant : 347 appels à
   swallow() enregistraient fidèlement chaque erreur, dans un anneau
   EN MÉMOIRE, affiché NULLE PART. Pour lire une seule de ces erreurs
   il fallait brancher l'iPhone sur un Mac. Et l'anneau était vidé à
   chaque rechargement.

   C'est le mécanisme EXACT qui a caché la panne Dexie pendant un mois :
   chaque synchronisation kv échouait, la validation ne démarrait jamais,
   et l'écran affichait « 0 refus, 0 suspects » — ce qui RESSEMBLAIT à
   une bonne nouvelle alors que ça voulait dire « le contrôle n'a jamais
   démarré ».

   LA RÈGLE FIGÉE PAR CE CHANTIER, et que ces tests protègent :
   une protection qu'on ne peut pas VOIR marcher doit être considérée
   comme ABSENTE jusqu'à preuve du contraire.

   Ces tests ne vérifient donc pas que du code existe. Ils font ÉCHOUER
   des choses pour de vrai et exigent que l'échec devienne visible.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

// Extrait la tranche de source entre deux marqueurs LITTÉRAUX du fichier livré.
// On borne par un marqueur de fin explicite plutôt que par un comptage d'accolades :
// une extraction qui part à la dérive doit ÉCHOUER bruyamment, pas produire du code
// approximatif qui passerait au vert par accident.
// Monte swallow() et toute sa chaîne de persistance DANS LE VIDE : ni base, ni window, ni
// `view`. C'est volontaire — c'est l'environnement d'une base en panne, celui où swallow() est
// justement le plus sollicité. Le harnais doit fournir TOUT ce dont swallow() dépend, sinon
// l'appel échoue dans son propre catch et le test conclut faussement « rien n'est enfilé ».
function monteSwallow(){
  const grav  = extraitEntre('const _SM_CTX_GRAVE', 'function _smGravite(ctx){')
              + "\n  try{ return _SM_CTX_GRAVE.test(String(ctx||'')) ? 'grave' : 'normal'; }catch(_){ return 'normal'; }\n}\n";
  const file  = extraitEntre('const _SM_ERR_QUEUE = [];', 'const SM_ERR_MAX_BASE = 300;');
  const sw    = extractFunction('swallow');
  const ring  = 'const _SM_ERR_RING=[];const _SM_ERR_RING_MAX=100;function smDebugOn(){return false;}';
  return new Function(
    ring + '\n' + grav + '\n' + file + '\n' + sw +
    '\n; return {swallow:swallow, ring:_SM_ERR_RING, queue:_SM_ERR_QUEUE, gravite:_smGravite};'
  )();
}

function extraitEntre(debut, fin){
  const i = APP.indexOf(debut);
  if(i === -1) throw new Error('Marqueur de début introuvable : ' + debut);
  const j = APP.indexOf(fin, i);
  if(j === -1) throw new Error('Marqueur de fin introuvable : ' + fin);
  return stripComments(APP.slice(i, j + fin.length));
}

(async () => {
console.log('\n=== TESTS — v1383 · Chantier A : les échecs silencieux parlent ===\n');

// ---------------------------------------------------------------------------
// 1. LE FILET GLOBAL EXISTE VRAIMENT
//    Avant ce chantier : ni window.onerror, ni unhandledrejection. Une erreur
//    hors try/catch = écran figé, zéro trace. Ce sont les deux SEULS points de
//    capture possibles : s'ils disparaissent, le trou se rouvre en entier.
// ---------------------------------------------------------------------------
console.log('1. Le filet global');
{
  const src = stripComments(APP);
  ok(/addEventListener\(\s*['"]error['"]/.test(src),
     "window.addEventListener('error') est branché — une erreur hors try/catch laisse une trace");
  ok(/addEventListener\(\s*['"]unhandledrejection['"]/.test(src),
     "unhandledrejection est branché — une promesse rejetée ne disparaît plus en silence");
  ok(/GLOBAL onerror/.test(src) && /GLOBAL promesse/.test(src),
     "les deux filets journalisent via swallow() avec un contexte identifiable");
}

// ---------------------------------------------------------------------------
// 2. LA GRAVITÉ SÉPARE LE SIGNAL DU BRUIT
//    Un swallow() sur un rendu cosmétique n'a pas le poids d'un swallow() sur
//    une écriture en base. Les confondre, c'est noyer ce qui compte — et c'est
//    précisément comme ça qu'une panne survit un mois.
// ---------------------------------------------------------------------------
console.log('\n2. La gravité — un échec d\'écriture ne pèse pas comme un échec d\'affichage');
{
  const h = monteSwallow();
  const f = { _smGravite: h.gravite };

  // Les contextes réellement présents dans le code, ceux de la panne Dexie.
  ok(f._smGravite('kvFlush') === 'grave',            "'kvFlush' (la panne Dexie même) est classé IMPORTANT");
  ok(f._smGravite('kvBoot auditDiv') === 'grave',    "'kvBoot auditDiv' est classé IMPORTANT");
  ok(f._smGravite('valide rejet') === 'grave',       "'valide rejet' (validation) est classé IMPORTANT");
  ok(f._smGravite('renderBackups kv') === 'grave',   "un échec touchant les sauvegardes est IMPORTANT");
  ok(f._smGravite('snapshotBackup') === 'grave',     "un échec de sauvegarde est IMPORTANT");
  ok(f._smGravite('importData') === 'grave',         "un échec d'import est IMPORTANT");

  // Et le bruit reste du bruit : sinon la pastille crie tout le temps, donc plus jamais.
  ok(f._smGravite('renderDash') === 'normal',        "'renderDash' (affichage) reste mineur");
  ok(f._smGravite('smGlobals') === 'normal',         "un helper de debug reste mineur");
  ok(f._smGravite('') === 'normal',                  "un contexte vide ne déclenche pas de fausse alerte");
  ok(f._smGravite(null) === 'normal',                "un contexte nul ne fait pas planter le classement");
}

// ---------------------------------------------------------------------------
// 3. swallow() N'EST JAMAIS UNE SOURCE D'ERREUR
//    Un helper de log appelé DANS des catch, parfois pendant que la base casse.
//    S'il jette, il aggrave la panne qu'il devait documenter.
// ---------------------------------------------------------------------------
console.log('\n3. swallow() ne casse jamais son appelant');
{
  const f = monteSwallow();

  let aJete = false;
  try{ f.swallow(new Error('boom'), 'kvFlush'); }catch(_){ aJete = true; }
  ok(!aJete, "swallow() ne jette pas quand la base est absente (le cas d'une base en panne)");
  ok(f.ring.length === 1, "l'erreur est bien entrée dans l'anneau mémoire");

  let aJete2 = false;
  try{ f.swallow(undefined, undefined); }catch(_){ aJete2 = true; }
  ok(!aJete2, "swallow(undefined, undefined) ne jette pas non plus");

  // La file d'attente porte la signature ET la gravité : sans elles, pas de groupement possible.
  const e = f.queue[0];
  ok(e && typeof e.sig === 'string' && e.sig.length > 0, "chaque incident porte une signature de groupement");
  ok(e && e.grav === 'grave', "la gravité est calculée à l'enregistrement, pas à l'affichage");
  ok(e && typeof e.ts === 'number', "chaque incident est horodaté");
}

// ---------------------------------------------------------------------------
// 4. LA FILE EST BORNÉE
//    Une boucle d'erreurs ne doit pas faire enfler la mémoire jusqu'au crash —
//    ni saturer le stockage, ce qui déclencherait justement la purge iOS dont
//    l'app se protège.
// ---------------------------------------------------------------------------
console.log('\n4. La file d\'incidents est bornée');
{
  const f = monteSwallow();

  for(let i = 0; i < 1000; i++) f.swallow(new Error('err ' + i), 'kvFlush');
  ok(f.queue.length <= 200, "1000 erreurs d'affilée : la file reste bornée (" + f.queue.length + " ≤ 200)");
  ok(f.ring.length <= 100,  "l'anneau mémoire reste borné à 100");
}

// ---------------------------------------------------------------------------
// 5. LES INCIDENTS SONT PERSISTÉS — le cœur du chantier
//    Un anneau vidé à chaque rechargement ne prouve rien le lendemain. C'est la
//    différence entre « je vois l'erreur si je regarde à la seconde près » et
//    « je peux constater qu'elle dure depuis un mois ».
// ---------------------------------------------------------------------------
console.log('\n5. Les incidents survivent à un rechargement');
{
  const src = stripComments(APP);
  ok(/db\.version\(33\)\.stores\(\{[\s\S]{0,200}errLog/.test(src),
     "la table errLog est déclarée dans le schéma (donc en base, donc persistante)");
  ok(/errLog:\s*'\+\+id, ts, sig, grav'/.test(src),
     "errLog est indexée sur ts, sig et grav — groupement et tri sans parcours complet");
  ok(/_smErrEnfile\(/.test(src) && /async function _smErrFlush/.test(src),
     "swallow() alimente une file vidée en différé (jamais d'écriture base synchrone dans un catch)");
  ok(/SM_ERR_MAX_BASE/.test(src) && /bulkDelete/.test(src),
     "la rétention en base est bornée et purge les plus anciens");
}

// ---------------------------------------------------------------------------
// 6. LE GROUPEMENT PAR SIGNATURE
//    40 fois la même erreur est UNE information. 40 lignes identiques noient
//    tout le reste — et un écran illisible est un écran qu'on ne lit pas.
// ---------------------------------------------------------------------------
console.log('\n6. Les erreurs répétées sont regroupées, pas empilées');
{
  const f = monteSwallow();

  for(let i = 0; i < 5; i++) f.swallow(new Error('même panne'), 'kvFlush');
  f.swallow(new Error('autre panne'), 'renderDash');
  const sigs = new Set(f.queue.map(x => x.sig));
  ok(sigs.size === 2, "5 occurrences identiques + 1 différente donnent 2 signatures distinctes");

  const sigKv = f.queue.find(x => x.ctx === 'kvFlush').sig;
  const sigRd = f.queue.find(x => x.ctx === 'renderDash').sig;
  ok(sigKv !== sigRd, "deux contextes différents ne peuvent pas être confondus");
  ok(sigKv.indexOf('kvFlush') === 0, "la signature commence par le contexte — lisible et filtrable");
}

// ---------------------------------------------------------------------------
// 7. L'ÉCRAN EST ATTEIGNABLE — sinon rien de ce qui précède ne sert
//    C'était exactement le défaut d'origine : le mécanisme marchait, l'écran
//    n'existait pas. Un journal illisible est un journal absent.
// ---------------------------------------------------------------------------
console.log('\n7. L\'écran Santé est atteignable depuis l\'app');
{
  const src = stripComments(APP);
  ok(/async function renderSanteModal/.test(src),
     "renderSanteModal existe");
  ok(/onclick="renderSanteModal\(\)"/.test(APP),
     "un bouton de l'app y mène (Sauvegarde & sécurité) — pas seulement la console");
  ok(/window\.renderSanteModal\s*=/.test(src),
     "la fonction est exposée sur window (accessible depuis un onclick inline)");
  ok(/_nbIncGraves>0\?/.test(APP),
     "une pastille d'accueil s'affiche quand des incidents importants s'accumulent");
  ok(/async function smSanteNbGraves/.test(src),
     "le compteur de la pastille ne compte QUE les incidents importants");
}

// ---------------------------------------------------------------------------
// 8. LA PASTILLE NE MENT PAS DANS LES DEUX SENS
//    Elle ne doit pas crier pour du bruit d'affichage (on cesserait de la voir),
//    et elle ne doit pas se taire quand la base échoue (le défaut d'origine).
// ---------------------------------------------------------------------------
console.log('\n8. La pastille ne crie pas à tort, et ne se tait pas à tort');
{
  const f = monteSwallow().gravite;

  // Les 5 contextes de la panne Dexie doivent TOUS déclencher la pastille.
  const pannesReelles = ['kvFlush', 'kvBoot', 'valide suspect', 'valide rejet', 'auditInstalle'];
  const toutesVues = pannesReelles.every(c => f(c) === 'grave');
  ok(toutesVues, "les 5 contextes de la panne Dexie déclenchent tous la pastille");

  // Et une app qui affiche mal ne doit pas déclencher d'alarme rouge.
  const bruits = ['renderDash', 'renderMrp', 'smGlobals', 'toast', 'renderLabels'];
  const aucunBruit = bruits.every(c => f(c) === 'normal');
  ok(aucunBruit, "les erreurs d'affichage ne déclenchent pas de fausse alerte");
}

// ---------------------------------------------------------------------------
// 9. LE JOURNAL D'AUDIT N'EST PAS AFFECTÉ
//    Chantier A est purement additif. Si le journal des écritures ou la
//    validation bougent, c'est une régression, pas une amélioration.
// ---------------------------------------------------------------------------
console.log('\n9. L\'existant n\'a pas bougé');
{
  const src = stripComments(APP);
  ok(/db\.version\(32\)\.stores\(\{[\s\S]{0,200}auditLog/.test(src),
     "le schéma v32 (kv + auditLog) est intact — la table errLog s'ajoute, ne remplace rien");
  ok(/async function renderAuditModal/.test(src),
     "le journal des écritures existe toujours");
  ok(/onclick="renderAuditModal\(''\)"/.test(APP),
     "son bouton est toujours là, à côté du nouveau");
}

console.log('\n--- Résultat : ' + nOk + ' assertion(s) vraie(s), ' + nKo + ' échec(s) ---\n');
if(nKo > 0) process.exit(1);
})().catch(e => { console.error('ÉCHEC SUITE :', e); process.exit(1); });
