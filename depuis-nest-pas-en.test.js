/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 56 : « DEPUIS » N'EST PAS « EN »
   ----------------------------------------------------------------------------
   Suite de la vague 55. Il restait cinq compétences qui AVOUAIENT ne pas savoir filtrer par mois.
   Deux le méritaient : le top parfum et le panier moyen. Trois ne le méritaient pas — et c'est
   dit franchement plus bas.

   ┌─ LE BUG DE FOND : le parseur de période ne savait dire que « DEPUIS ».
   │  `_aiParsePeriode` renvoyait `{depuis, label}` — un intervalle OUVERT. Il pouvait exprimer
   │  « depuis 3 mois », jamais « EN mai ». Or « en mai » N'EST PAS « depuis mai ».
   │  Sans borne HAUTE, « mon meilleur parfum en mai » aurait renvoyé mai + juin + juillet : un
   │  chiffre parfaitement juste… pour une période que Benjamin n'a jamais demandée. C'est
   │  exactement le mal de la v1330 (bon routage, mauvais paramètre), à un cran plus subtil.
   │
   ├─ LA COLLISION DE TYPES, désamorcée. `params.periode` était une CHAÎNE ('AAAA-MM') pour les
   │  compétences câblées en v1333/34, mais un OBJET `{depuis, label}` pour le top parfum. Deux
   │  types pour un même champ : une mine. On corrige à la RACINE — le mois nommé est désormais
   │  compris par `_aiParsePeriode` lui-même, qui renvoie un intervalle BORNÉ.
   │
   └─ LA BONNE BASE TEMPORELLE. Un panier moyen et un classement de parfums décrivent un
      COMPORTEMENT D'ACHAT : la date de COMMANDE est la bonne règle. La date d'encaissement (celle
      du CA, v1331) serait ici FAUSSE : elle rangerait une commande de mai dans le mois où le
      chèque a été déposé. Deux questions différentes, deux bases différentes — et c'est ÉCRIT.

   RÈGLE FIGÉE : trois compétences avouent encore, et ce n'est PAS de la paresse.
     • rentabilité : croise commandes ET marchés ET mouvements sur une base de coûts FIFO
       elle-même temporelle. Ne filtrer que les commandes produirait un chiffre PLAUSIBLE ET FAUX.
     • seuil de rentabilité et revenu horaire : calculs sur FENÊTRE GLISSANTE. Les « filtrer par
       mois » n'a pas de sens tel quel — il faudrait d'abord repenser leur période de référence.
   Livrer un chiffre faux vaut moins qu'avouer. C'est tout l'objet de cette série.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');
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
  const code = `
    ${extractFunction('ymdLocal')}
    ${extractFunction('monthLabel')}
    ${extractFunction('escapeRe')}
    ${bloc('AI_MOIS')}
    ${extractFunction('_aiMoisNomme')}
    ${extractFunction('_aiParsePeriode')}
    return { _aiParsePeriode };
  `;
  return new Function(code)();
}
const M = buildModule();

// « Aujourd'hui » est FIGÉ. Sans cela, ce fichier passerait aujourd'hui et casserait en janvier :
// un test qui dépend du calendrier est un piège à retardement.
const JUILLET_2026 = '2026-07-12T12:00:00';
const P_ = (txt, ref) => M._aiParsePeriode(txt, ref || JUILLET_2026);

let pass=0, fail=0; const failures=[];
function eq(a, e, label){
  const x=JSON.stringify(a), y=JSON.stringify(e);
  if(x===y){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${y}\n      obtenu : ${x}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }

console.log('\n=== TESTS — Vague 56 : « depuis » n\'est pas « en » ===\n');

// ---------------------------------------------------------------------------
// A. LA BORNE HAUTE — le cœur de la vague
// ---------------------------------------------------------------------------
// Un mois est un intervalle FERMÉ. Sans `jusqu`, « en mai » signifierait « depuis le 1er mai »,
// c'est-à-dire mai + juin + juillet. Juste, et complètement à côté de la question.
{
  const P = P_('mon meilleur parfum en mai');
  eq(P.depuis, '2026-05-01', 'A1 · « en mai » commence le 1er mai…');
  ok(/^2026-05-3[01]$/.test(P.jusqu), 'A2 · … ET SE TERMINE le 31 mai — la BORNE HAUTE, qui n\'existait pas');
  eq(P.ym, '2026-05', 'A3 · la clé du mois est exposée (traçabilité)');
  ok(/mai/.test(P.label), 'A4 · le libellé dit « en mai », pas « depuis mai »');

  // La preuve par l'absurde : sans borne haute, l'intervalle serait ouvert.
  ok(P.jusqu != null, 'A5 · sans `jusqu`, « en mai » aurait renvoyé mai + juin + juillet');

  // La date de référence est-elle RÉELLEMENT honorée ? Sans cette assertion, le garde-fou
  // anti-calendrier serait décoratif : il passerait aujourd'hui par pure coïncidence.
  const enMars = P_('mon meilleur parfum en mai', '2026-03-15T12:00:00');
  eq(enMars.ym, '2025-05',
     'A5b · en MARS 2026, « mai » → mai 2025 (mai 2026 n\'est pas encore arrivé) — la date de référence est bien prise en compte');
  eq(enMars.jusqu, '2025-05-31', 'A5c · … avec la borne haute du BON mois');
}

// Les mois courts, longs et février : le dernier jour doit être EXACT (pas un 31 aveugle).
{
  eq(P_('en avril').jusqu, '2026-04-30', 'A6 · avril se termine le 30 (pas le 31)');
  eq(P_('en janvier').jusqu, '2026-01-31', 'A7 · janvier se termine le 31');
  eq(P_('en fevrier').jusqu, '2026-02-28', 'A8 · février 2026 se termine le 28 (année non bissextile)');
  // 2024 était bissextile — l'année explicite le prouve.
  eq(P_('en fevrier 2024').jusqu, '2024-02-29',
     'A9 · février 2024 se termine le 29 — le dernier jour est CALCULÉ, pas supposé');
}

// ---------------------------------------------------------------------------
// B. NON-RÉGRESSION — les périodes existantes n'ont pas bougé
// ---------------------------------------------------------------------------
// Les appelants qui n'utilisent que `depuis` doivent se comporter EXACTEMENT comme avant.
{
  const P = P_('mon meilleur parfum depuis 3 mois');
  ok(P.depuis != null, 'B1 · « depuis 3 mois » reste un intervalle ouvert…');
  eq(P.jusqu, null, 'B2 · … avec une borne haute NULLE (comportement d\'origine intact)');
  ok(/3 mois/.test(P.label), 'B3 · … et son libellé d\'origine');

  const T = P_('mon meilleur parfum');
  eq(T.depuis, null, 'B4 · aucune période → tout l\'historique');
  eq(T.jusqu, null, 'B5 · … sans borne haute non plus');
  ok(/historique/.test(T.label), 'B6 · … et le libellé le dit');
}

// ---------------------------------------------------------------------------
// C. LES FAUX POSITIFS — hérités de la v1330, mais il faut les RE-prouver ici
// ---------------------------------------------------------------------------
// `_aiParsePeriode` appelle désormais `_aiMoisNomme`. Si celui-ci se déclenchait à tort, TOUTES
// les compétences à période partiraient sur un mois fantaisiste. On revérifie sur ce chemin.
{
  eq(P_('je n ai jamais vendu autant').ym, undefined,
     'C1 · « jaMAIs » ne déclenche aucun mois par ce chemin non plus');
  eq(P_('le stock de la maison').ym, undefined,
     'C2 · « MAIson » non plus');
  eq(P_('mon meilleur parfum').ym, undefined,
     'C3 · une requête sans mois reste sans mois');
}

// ---------------------------------------------------------------------------
// D. LA PRIORITÉ — « du mois de mai » contient « du mois »
// ---------------------------------------------------------------------------
// Le même piège qu'en v1330, sur un autre parseur. Si la règle générique passait en premier,
// « du mois de mai » deviendrait « ce mois-ci » : réponse juste, mauvaise question.
{
  const P = P_('mon meilleur parfum du mois de mai');
  eq(P.ym, '2026-05', 'D1 · « du mois de MAI » → mai, et non « ce mois-ci » (le mois nommé passe EN PREMIER)');

  const C = P_('mon meilleur parfum du mois');
  eq(C.ym, undefined, 'D2 · … mais « du mois » SEUL reste « ce mois-ci » (aucune régression)');
  ok(/mois/.test(C.label), 'D3 · … avec son libellé d\'origine');
}

// ---------------------------------------------------------------------------
// E. LA BONNE BASE TEMPORELLE — et elle est ÉCRITE
// ---------------------------------------------------------------------------
// Un panier moyen décrit un COMPORTEMENT D'ACHAT (quand le client a commandé), pas une trésorerie.
// La date d'encaissement — la bonne règle pour le CA depuis la v1331 — serait ici FAUSSE.
// Deux questions différentes, deux bases différentes : encore faut-il le DIRE, sinon le prochain
// lecteur « corrigera » l'un vers l'autre en croyant bien faire.
{
  const panier = APP.slice(APP.indexOf('async function aiQueryPanierMoyen'),
                           APP.indexOf('async function aiQueryPanierMoyen') + 2200);
  ok(/COMPORTEMENT D'ACHAT/.test(panier),
     'E1 · le code JUSTIFIE la base retenue (date de commande) pour le panier moyen…');
  ok(/encaissement serait ici la mauvaise/.test(panier),
     'E2 · … et dit explicitement pourquoi la date d\'encaissement serait FAUSSE ici');
  ok(/params\.periode/.test(panier),
     'E3 · … et le panier moyen filtre enfin par mois');
}

// ---------------------------------------------------------------------------
// F. LE TOP PARFUM APPLIQUE BIEN LES DEUX BORNES
// ---------------------------------------------------------------------------
{
  const top = APP.slice(APP.indexOf('async function aiQueryTopParfum'),
                        APP.indexOf('async function aiQueryTopParfum') + 1600);
  ok(/periode\.depuis/.test(top), 'F1 · le top parfum filtre sur la borne basse…');
  ok(/periode\.jusqu/.test(top),  'F2 · … ET sur la borne haute (elle était IGNORÉE : « en mai » aurait rendu mai+juin+juillet)');
}

// ---------------------------------------------------------------------------
// G. CE QUI AVOUE ENCORE — et pourquoi ce n'est PAS de la paresse
// ---------------------------------------------------------------------------
// Livrer un chiffre faux vaut moins qu'avouer. Trois compétences restent hors de portée, et le
// code doit DIRE pourquoi — sinon le prochain lecteur croira à un oubli et « corrigera » en
// fabriquant précisément le chiffre plausible et faux que cette série traque.
{
  const i = APP.indexOf('const AI_INTENTS_MOIS_ATTENDU');
  // [v1372] La fenêtre était FIXE (1200 caractères avant la const). Une vague ultérieure a
  // inséré _aiRaisonAveu (la fonction qui PORTE désormais les aveux) entre la justification
  // et la liste : le vocabulaire a glissé hors fenêtre, et G1/G2 ont crié au loup sur du code
  // sain. Une garde ancrée sur une DISTANCE EN OCTETS teste la mise en page, pas la règle.
  // On ancre désormais sur le DOSSIER de justification lui-même (« LES TROIS QUI RESTENT »),
  // et G0 vérifie qu'il reste ATTACHÉ à la liste (< 8000 caractères) : la justification peut
  // grossir, pas déménager.
  const j = APP.lastIndexOf('LES TROIS QUI RESTENT', i);
  ok(j !== -1 && i - j < 8000,
     'G0 · le dossier de justification reste ATTACHÉ à la liste des aveux (pas ailleurs dans le fichier)');
  const zone = APP.slice(Math.max(0, j), i + 300);

  ok(/PLAUSIBLE ET FAUX/.test(zone),
     'G1 · la rentabilité est justifiée : filtrer ses seules commandes donnerait un chiffre PLAUSIBLE ET FAUX');
  ok(/FIFO/.test(zone),
     'G2 · … parce que sa base de coûts (FIFO) est elle-même temporelle');
  ok(/FEN[EÊ]TRE GLISSANTE/i.test(zone),
     'G3 · le seuil et le revenu horaire sont justifiés : ce sont des calculs sur FENÊTRE GLISSANTE');
  ok(/placage|repenser/.test(zone),
     'G4 · … et ajouter un filtre par-dessus serait un placage, pas un correctif');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
