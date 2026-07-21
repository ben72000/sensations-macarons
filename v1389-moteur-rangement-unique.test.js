/* ============================================================
   TESTS — v1389 : MOTEUR DE RANGEMENT UNIQUE (demande Ben)
   ------------------------------------------------------------
   LA DEMANDE, MOT POUR MOT : « Une seule source de vérité. Un seul
   moteur de rangement. Plusieurs points d'entrée autorisés. Tous les
   points d'entrée appellent exactement la même fonction centrale.
   Aucune divergence de comportement, aujourd'hui comme dans les
   évolutions futures. »

   LE CONSTAT (audit v1388, corrigé après relecture) : QUATRE systèmes
   écrivaient placements en parallèle —
     A  setEmplacement → applySuggestedPlacement / partFlowApply
     B  prodEtiquetteBoites → prodPreparerBoites          ← LE moteur gardé
     C  labelsBatchForm → lbExecuter
     D  renderRangementGuide → applyPlanRangement
   Chacun un doublon du même geste. Ben en veut UN.

   L'ARCHITECTURE v1389 :
     • prodPreparerBoites = LE moteur unique (scinde en lignes-filles,
       délègue le déplacement à doMoveEmplacement : froid/DLC/renommage).
     • ouvrirRangement(prodId) = LA porte UI (ouvre l'éditeur d'étiquettes).
     • rangerLot(prodId, boites, opts) = alias programmatique fin → moteur.
     • setEmplacement (système A) REDIRIGE vers ouvrirRangement.
     • lbExecuter (C) et applyPlanRangement (D) appellent rangerLot —
       ILS N'ÉCRIVENT PLUS placements eux-mêmes.

   CE QUE CE GARDE-FOU GÈLE (et qui doit virer AU ROUGE si un jour une
   2e voie réapparaît) :
     1. Le dispatcher et l'alias sont FINS (ils délèguent, zéro logique).
     2. Les points d'entrée UI vivants appellent ouvrirRangement.
     3. AUCUNE fonction VIVANTE hors du moteur n'écrit `placements:` via
        db.productions.update/add. Le seul écrivain de scission = le moteur.
     4. Le kernel de déplacement reste doMoveEmplacement (jamais un
        update({emplacement}) direct dans les fonctions de rangement).

   RÈGLE GRAVÉE : toute réintroduction d'un 2e écrivain de placements, ou
   d'un point d'entrée qui range sans passer par ouvrirRangement/rangerLot,
   est un doublon — ce test la refuse.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1389 : moteur de rangement unique ===\n');

const clean = stripComments(APP);

// ---------------------------------------------------------------------------
// 1. LE DISPATCHER ET L'ALIAS EXISTENT ET SONT FINS (délégation pure)
// ---------------------------------------------------------------------------
// « Ces boutons ne doivent contenir aucune logique propre : ils doivent
//   uniquement invoquer le moteur central. » — la porte aussi.
{
  const disp = extractFunction('ouvrirRangement');
  ok(/function\s+ouvrirRangement/.test(disp), 'ouvrirRangement est défini');
  ok(/prodEtiquetteBoites\s*\(/.test(disp), 'ouvrirRangement délègue à l\'éditeur d\'étiquettes (moteur B)');
  // Fin = pas d'écriture DB, pas de calcul de placement propre.
  ok(!/db\.productions\.(update|add)\s*\(/.test(disp), 'ouvrirRangement n\'écrit PAS en base (zéro logique propre)');
  ok(!/placements/.test(disp), 'ouvrirRangement ne manipule PAS placements');

  const alias = extractFunction('rangerLot');
  ok(/function\s+rangerLot/.test(alias), 'rangerLot est défini');
  ok(/prodPreparerBoites\s*\(/.test(alias), 'rangerLot délègue au moteur unique prodPreparerBoites');
  ok(!/db\.productions\.(update|add)\s*\(/.test(alias), 'rangerLot n\'écrit PAS en base directement');
}

// ---------------------------------------------------------------------------
// 2. LE MOTEUR UNIQUE EST prodPreparerBoites, ET IL S'APPUIE SUR LE KERNEL
// ---------------------------------------------------------------------------
{
  const moteur = extractFunction('prodPreparerBoites');
  ok(/function\s+prodPreparerBoites/.test(moteur), 'prodPreparerBoites (le moteur) existe');
  ok(/doMoveEmplacement\s*\(/.test(moteur), 'le moteur délègue le déplacement à doMoveEmplacement (froid/DLC)');
  ok(/etiquetteDe\s*:/.test(moteur), 'le moteur trace la scission (etiquetteDe = lot parent)');
}

// ---------------------------------------------------------------------------
// 3. LES POINTS D'ENTRÉE A SONT REDIRIGÉS VERS LA PORTE UNIQUE
// ---------------------------------------------------------------------------
{
  const setEmp = extractFunction('setEmplacement');
  ok(/ouvrirRangement\s*\(/.test(setEmp), 'setEmplacement (ex-système A) redirige vers ouvrirRangement');
  ok(!/db\.productions\.update[\s\S]*placements/.test(setEmp),
     'setEmplacement n\'écrit plus placements (logique parallèle A neutralisée)');

  // Les onclicks UI « ranger / déplacer » pointent la porte unique, pas setEmplacement.
  ok(/onclick="ouvrirRangement\(\$\{p\.id\}\)"/.test(clean),
     'les boutons 📍 ranger / ↔ déplacer appellent ouvrirRangement');
}

// ---------------------------------------------------------------------------
// 4. C ET D NE SONT QUE DES POINTS D'ENTRÉE : ILS APPELLENT LE MOTEUR
// ---------------------------------------------------------------------------
{
  const lb = extractFunction('lbExecuter');
  ok(/rangerLot\s*\(/.test(lb), 'lbExecuter (Étiquettes groupées) appelle le moteur via rangerLot');
  ok(!/placements\s*:/.test(lb), 'lbExecuter n\'écrit PLUS placements (système C vidé)');
  ok(!/storageBoxes\.add/.test(lb), 'lbExecuter ne crée plus de boîtes-catalogue en parallèle');

  const plan = extractFunction('applyPlanRangement');
  ok(/rangerLot\s*\(/.test(plan), 'applyPlanRangement (Rangement guidé) appelle le moteur via rangerLot');
  ok(!/placements\s*:/.test(plan), 'applyPlanRangement n\'écrit PLUS placements (système D routé)');
}

// ---------------------------------------------------------------------------
// 5. INVARIANT GLOBAL — UN SEUL ÉCRIVAIN DE placements PARMI LE CODE VIVANT
// ---------------------------------------------------------------------------
// On scanne tout app.js (commentaires retirés) pour les écritures de la forme
// `placements:` à l'intérieur d'un db.productions.update/add. La seule
// occurrence tolérée est le lot initial (placements:[] à la création d'un lot
// neuf, qui ne RANGE rien) et le moteur lui-même. Toute autre = doublon.
//
// Les fonctions PROUVÉES MORTES (suffixe LegacyMort) sont exclues : elles ne
// sont plus atteignables (aucun appelant vivant) et seront supprimées à
// l'étape code-mort. Le test vérifie le VIVANT.
{
  // Retire le corps des fonctions *LegacyMort du texte analysé.
  function stripDeadFns(src){
    let out = src;
    for(const m of [...src.matchAll(/function\s+(_?\w*LegacyMort)\s*\(/g)]){
      const start = m.index;
      // trouve l'accolade ouvrante puis la fermeture équilibrée
      let i = src.indexOf('{', start); if(i<0) continue;
      let depth=0, j=i;
      for(; j<src.length; j++){ const c=src[j]; if(c==='{')depth++; else if(c==='}'){depth--; if(depth===0){j++;break;} } }
      out = out.replace(src.slice(start, j), '/*DEAD*/');
    }
    return out;
  }
  const living = stripDeadFns(clean);

  // Écritures RÉELLES en base : `placements:` situé dans un
  // db.productions.update(...) ou .add(...). On repère chaque appel puis on
  // regarde si `placements:` figure dans ses arguments. Cela élimine les
  // faux-positifs (structures locales en mémoire, snapshots en lecture, ou le
  // simple mot « déplacements » dans une chaîne d'UI).
  const writers = [];
  for(const m of living.matchAll(/db\.productions\.(update|add)\s*\(/g)){
    // capture un fenêtrage d'arguments (jusqu'à la parenthèse équilibrée, borné)
    let i = living.indexOf('(', m.index + m[0].length - 1);
    let depth=0, j=i, end=i;
    for(; j<living.length && j<i+2000; j++){ const c=living[j]; if(c==='(')depth++; else if(c===')'){depth--; if(depth===0){end=j;break;}} }
    const args = living.slice(i, end+1);
    if(/placements\s*:/.test(args)){
      const before = living.slice(0, m.index);
      const fn = [...before.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)].pop();
      writers.push(fn ? fn[1] : '(top-level)');
    }
  }
  const uniq = [...new Set(writers)];

  // Écrivains AUTORISÉS :
  //   • créations de lot neuf (placements:[] initial — ne RANGE rien) ;
  //   • prodDeranger : EFFACE le rangement (placements:[]) au « retour en
  //     production ». C'est l'inverse d'un moteur parallèle : il vide, il ne
  //     crée pas. Légitime et unique.
  // prodPreparerBoites (le moteur) n'écrit PAS `placements:` — il SCINDE en
  // lignes-filles — donc il n'apparaît pas ici, et c'est voulu.
  const AUTORISES = new Set(['prodForm','prodDupliquer','prodCreer','_prodInsert','productionsSeed','prodDeranger']);

  const illicites = uniq.filter(fn => !AUTORISES.has(fn));
  if(illicites.length){
    console.log('    → écrivains placements vivants inattendus : ' + illicites.join(', '));
  }
  // ASSERTION CENTRALE : aucun écrivain de placements vivant hors liste blanche.
  // C'est ELLE qui gèle l'invariant « une seule source de vérité » pour l'avenir :
  // toute nouvelle fonction qui se met à écrire placements en base fait rougir ce test.
  ok(illicites.length===0, 'aucun écrivain placements illicite parmi le code vivant');

  // Et, nommément, aucun des 4 anciens moteurs ne réécrit placements.
  for(const mort of ['applySuggestedPlacement','partFlowApply','lbExecuter','applyPlanRangement']){
    ok(!uniq.includes(mort), `${mort} n'écrit plus placements (parmi le code vivant)`);
  }
}

// ---------------------------------------------------------------------------
// 6. LE DÉPLACEMENT PHYSIQUE RESTE CENTRALISÉ DANS doMoveEmplacement
// ---------------------------------------------------------------------------
// Aucune fonction de rangement vivante ne doit écrire emplacement en direct.
{
  for(const fn of ['lbExecuter','applyPlanRangement','rangerLot','ouvrirRangement']){
    const body = extractFunction(fn);
    ok(!/db\.productions\.update\s*\([^)]*emplacement\s*:/.test(body),
       `${fn} ne modifie pas emplacement en direct (passe par doMoveEmplacement)`);
  }
}

console.log(`\n=== v1389 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
