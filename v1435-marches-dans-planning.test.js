/* ============================================================================
   TESTS — v1435 : LE PLANNING IGNORAIT LES MARCHÉS PROGRAMMÉS
   ----------------------------------------------------------------------------
   Ben : « le plan de travail appelé planning de production ne prend pas en
   compte les marchés programmés, pourquoi ? »
   (Vérifié avec lui : marché à moins de 14 jours, quantité ET parfums visés
   renseignés — donc toutes les conditions apparentes étaient réunies.)

   LA VRAIE CAUSE, ET ELLE EST BÊTE : `ordoBuildNeeds` — l'ordonnanceur, l'écran
   qu'il regarde — n'incluait les marchés que sous condition
   `mode === 'marches' || mode === 'auto'`. Or l'écran ne propose que DEUX
   boutons : « Commandes fermes » et « Commandes + réassort ». Le mode 'marches'
   n'existe nulle part dans l'interface, 'auto' n'est utilisé que par le
   copilote. **Aucun bouton accessible ne passait par ce code.** Il était juste,
   il n'était jamais atteint.

   LA CAUSE DE FOND : la même règle était écrite TROIS FOIS, dans trois écrans —
   `ordoBuildNeeds`, `_buildProductionPlanRaw` et `generateProductionOrder`. La
   v1431 n'en avait corrigé qu'une. Les deux autres ignoraient encore les
   parfums visés : trois écrans, trois réponses possibles à la même question.

   Le correctif crée un point de vérité unique, `besoinMarchesParParfum`, appelé
   par les trois. Et il corrige au passage un défaut présent dans les trois
   versions d'origine : aucune ne vérifiait que le marché est à VENIR, donc un
   marché passé jamais clôturé restait indéfiniment dans le plan.

   Propriétés verrouillées ici :
     1. Les parfums visés priment (acquis v1431, désormais partout).
     2. Repli par répartition apprise, puis prorata des commandes, puis ligne
        honnête « à définir ».
     3. Un marché passé, clos, ou hors horizon n'entre pas.
     4. Le prorata de repli est figé : le premier marché ne sert pas de base au
        second.
     5. Les trois écrans passent par la même fonction.
     6. L'ordonnanceur n'a plus de condition de mode.
   ============================================================================ */
'use strict';
const { extractFunction, stripComments } = require('./_extract');

function buildModule(){
  const code = `
    return ${extractFunction('besoinMarchesParParfum')};
  `;
  return { besoinMarchesParParfum: new Function(code)() };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// `daysTo` injectable : les jeux d'essai raisonnent en jours, pas en dates réelles.
const joursFixes = map => (d => (map[d]!==undefined ? map[d] : null));

function run(){
const M = buildModule();

const REP = [{parfum:'Framboise', pct:50}, {parfum:'Pistache', pct:30}, {parfum:'Café', pct:20}];
const JOURS = joursFixes({ 'J+7':7, 'J+3':3, 'J+30':30, 'J-2':-2, 'J0':0 });
const opts = (h) => ({ horizonJours: h===undefined?14:h, daysTo: JOURS });

// ── CAS 1 : LE CAS DE BEN — marché proche, parfums visés renseignés ───────
{
  const mk = { id:1, date:'J+7', statut:'ouvert', prevuQte:250,
    prevuParfums:[{parfum:'Caramel beurre salé', qte:120}, {parfum:'Citron crémeux', qte:80}, {parfum:'Café', qte:50}] };
  eq(M.besoinMarchesParParfum([mk], REP, {}, opts()),
     {'Caramel beurre salé':120, 'Citron crémeux':80, 'Café':50},
     'CAS1 · le besoin est exactement ce que Ben a saisi');
}

// ── CAS 2 : sans parfums visés → répartition apprise ─────────────────────
{
  const mk = { id:1, date:'J+7', statut:'ouvert', prevuQte:200 };
  const b = M.besoinMarchesParParfum([mk], REP, {}, opts());
  eq(b, {'Framboise':100, 'Pistache':60, 'Café':40}, 'CAS2 · ventilé selon l\'historique');
  eq(Object.values(b).reduce((s,x)=>s+x,0), 200, 'CAS2 · la somme fait la quantité visée');
}

// ── CAS 3 : sans historique → prorata des commandes en cours ─────────────
{
  const mk = { id:1, date:'J+7', statut:'ouvert', prevuQte:100 };
  eq(M.besoinMarchesParParfum([mk], [], {'Vanille':30, 'Café':10}, opts()),
     {'Vanille':75, 'Café':25}, 'CAS3 · réparti au prorata du besoin déjà connu');
}

// ── CAS 4 : rien du tout → une ligne honnête, pas un chiffre inventé ────
{
  const mk = { id:1, date:'J+7', statut:'ouvert', prevuQte:100 };
  eq(M.besoinMarchesParParfum([mk], [], {}, opts()),
     {'Marché (parfums à définir)':100}, 'CAS4 · la quantité reste visible, sans parfum inventé');
}

// ── CAS 5 : un marché PASSÉ jamais clôturé n'est plus un besoin ─────────
// Défaut présent dans les TROIS versions d'origine : aucune ne testait j>=0.
{
  const passe = { id:1, date:'J-2', statut:'ouvert', prevuQte:200 };
  eq(M.besoinMarchesParParfum([passe], REP, {}, opts()), {},
     'CAS5 · le marché d\'avant-hier ne reste pas dans le plan');
  const aujourdhui = { id:2, date:'J0', statut:'ouvert', prevuQte:100 };
  eq(Object.values(M.besoinMarchesParParfum([aujourdhui], REP, {}, opts())).reduce((s,x)=>s+x,0), 100,
     'CAS5 · celui du jour même, si — il reste à préparer');
}

// ── CAS 6 : hors horizon, clos, ou sans quantité ────────────────────────
{
  eq(M.besoinMarchesParParfum([{id:1, date:'J+30', statut:'ouvert', prevuQte:200}], REP, {}, opts(14)), {},
     'CAS6 · au-delà de l\'horizon → pas encore dans le plan');
  eq(M.besoinMarchesParParfum([{id:1, date:'J+7', statut:'clos', prevuQte:200}], REP, {}, opts()), {},
     'CAS6 · marché clos → terminé, plus rien à produire');
  eq(M.besoinMarchesParParfum([{id:1, date:'J+7', statut:'ouvert', prevuQte:0}], REP, {}, opts()), {},
     'CAS6 · sans quantité visée → rien à en tirer');
  eq(M.besoinMarchesParParfum([{id:1, date:'J+30', statut:'ouvert', prevuQte:200}], REP, {}, opts(45)),
     {'Framboise':100, 'Pistache':60, 'Café':40}, 'CAS6 · … mais un horizon plus large le fait entrer');
}

// ── CAS 7 : LE PRORATA DE REPLI EST FIGÉ ───────────────────────────────
// Sans ça, le premier marché servirait de base au second et la répartition
// dériverait à chaque marché ajouté — un bug invisible et impossible à relire.
{
  const m1 = { id:1, date:'J+3', statut:'ouvert', prevuQte:100 };
  const m2 = { id:2, date:'J+7', statut:'ouvert', prevuQte:100 };
  const b = M.besoinMarchesParParfum([m1, m2], [], {'Vanille':30, 'Café':10}, opts());
  eq(b, {'Vanille':150, 'Café':50}, 'CAS7 · les deux marchés utilisent le MÊME prorata de départ');
  eq(Object.values(b).reduce((s,x)=>s+x,0), 200, 'CAS7 · et le total reste juste');
}

// ── CAS 8 : plusieurs marchés s'additionnent par parfum ────────────────
{
  const m1 = { id:1, date:'J+3', statut:'ouvert', prevuQte:60, prevuParfums:[{parfum:'Café', qte:60}] };
  const m2 = { id:2, date:'J+7', statut:'ouvert', prevuQte:40, prevuParfums:[{parfum:'Café', qte:40}] };
  eq(M.besoinMarchesParParfum([m1, m2], REP, {}, opts()), {'Café':100},
     'CAS8 · 60 + 40 sur le même parfum');
}

// ── CAS 9 : la fonction ne modifie JAMAIS le besoin qu'on lui passe ────
// Elle renvoie un besoin séparé ; c'est l'appelant qui fusionne. Muter l'entrée
// ferait diverger les trois écrans selon l'ordre de leurs appels.
{
  const base = {'Vanille':30};
  M.besoinMarchesParParfum([{id:1, date:'J+7', statut:'ouvert', prevuQte:100}], [], base, opts());
  eq(base, {'Vanille':30}, 'CAS9 · le besoin d\'entrée est intact');
}

// ── CAS 10 : entrées dégradées ─────────────────────────────────────────
{
  eq(M.besoinMarchesParParfum(null, null, null, opts()), {}, 'CAS10 · tout vide → objet vide');
  eq(M.besoinMarchesParParfum([null, undefined], REP, {}, opts()), {}, 'CAS10 · lignes nulles ignorées');
  eq(M.besoinMarchesParParfum([{id:1, date:'inconnue', statut:'ouvert', prevuQte:100}], REP, {}, opts()), {},
     'CAS10 · date illisible → écarté, pas d\'exception');
  const zeros = { id:1, date:'J+7', statut:'ouvert', prevuQte:200, prevuParfums:[{parfum:'Café', qte:0}] };
  eq(M.besoinMarchesParParfum([zeros], REP, {}, opts()), {'Framboise':100, 'Pistache':60, 'Café':40},
     'CAS10 · une ventilation de zéros n\'est pas un choix : le repli joue');
}

// ── CAS 11 : L'ORDONNANCEUR N'A PLUS DE CONDITION DE MODE ──────────────
// C'est LA réponse à la question de Ben.
{
  const src = stripComments(extractFunction('ordoBuildNeeds'));
  eq(/mode==='marches' \|\| mode==='auto'/.test(src), false,
     'CAS11 · la condition qui rendait le code inatteignable a disparu');
  vrai(/besoinMarchesParParfum\(mks, rep, besoins, \{horizonJours:H\}\)/.test(src),
     'CAS11 · l\'ordonnanceur appelle le point de vérité, sans condition');
  vrai(/add\(nom, besoinMk\[nom\], 'marche'\)/.test(src),
     'CAS11 · … et la provenance « marché » est conservée pour l\'affichage');
}

// ── CAS 12 : les TROIS écrans passent par la même fonction ────────────
// C'est la correction de fond : une règle écrite trois fois finit par diverger,
// et c'est exactement ce qui était arrivé après la v1431.
{
  ['ordoBuildNeeds', '_buildProductionPlanRaw', 'generateProductionOrder'].forEach(fn=>{
    const src = stripComments(extractFunction(fn));
    vrai(/besoinMarchesParParfum\(/.test(src), 'CAS12 · ' + fn + ' utilise le point de vérité');
    eq(/rep\.forEach\(\(r,i\)=>\{ let part=/.test(src), false,
       'CAS12 · ' + fn + ' n\'a plus sa copie locale de la ventilation');
  });
}

// ── CAS 13 : l'agenda de production convertit sa fenêtre, sans la trahir ─
// Cet écran raisonne en intervalle de DATES et non en horizon de jours.
{
  const src = stripComments(extractFunction('generateProductionOrder'));
  vrai(/daysTo:_jDe/.test(src), 'CAS13 · il injecte son propre calcul de jours');
  vrai(/horizonJours:_H!=null\?_H:14/.test(src), 'CAS13 · … et convertit sa borne de fin');
  vrai(/_mrpMarketTotal \+= besoinMk\[nom\]/.test(src),
     'CAS13 · le total marché reste calculé pour l\'affichage');
}

// ── résultat ──
console.log('\n=== TESTS — v1435 : les marchés programmés entrent dans le planning ===\n');
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
