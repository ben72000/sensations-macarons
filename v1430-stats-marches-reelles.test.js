/* ============================================================================
   TESTS — v1430 : « MES STATS MARCHÉS NE REFLÈTENT PAS LA RÉALITÉ »
   ----------------------------------------------------------------------------
   Ben, capture à l'appui : « D'après tes 8 marché(s) passé(s) : ~78 macarons
   vendus en moyenne (max 404) ». Ces deux chiffres ne peuvent pas décrire la
   même réalité — et c'est en les comparant qu'il a vu que quelque chose clochait.

   UNE SEULE CAUSE, DEUX EFFETS OPPOSÉS. `marketForecast` prenait TOUS les
   marchés clos et traitait l'ABSENCE DE DONNÉE COMME UNE MESURE DE ZÉRO —
   exactement l'erreur nommée en v1337 (« zéro n'est pas une mesure, c'est une
   affirmation »), corrigée alors pour le CA mais jamais ici :
     ① un marché clôturé SANS AUCUN MOUVEMENT comptait 0 vendu et pesait autant
        qu'un vrai marché → la moyenne s'effondrait, et la quantité suggérée avec
        elle. Ben serait parti en marché avec trop peu de macarons ;
     ② un marché dont les RETOURS n'ont pas été saisis comptait tout le sorti
        comme vendu (vendu = sortie − retour − don − perte) → le max explosait.
   La clôture n'exige aucun comptage de retour : ces deux cas sont normaux, pas
   des cas limites.

   ⚠️ ON N'ÉCARTE PAS UN MARCHÉ SUR UN SOUPÇON : un retour à zéro peut être la
   vérité, Ben a pu tout vendre. D'où un DISCRIMINANT, pas une intuition — le
   prix moyen par macaron, borné par les seuils dont la clôture se sert déjà.
   Un marché n'est écarté que si aucun comptage de fin n'existe ET que le prix
   par macaron tombe sous le plancher plausible : le « vendu » est alors
   nécessairement surévalué. Et rien n'est masqué : les exclusions sont
   renvoyées, comptées et affichées.

   Propriétés verrouillées ici :
     1. Un marché sans mouvement n'entre pas dans la moyenne.
     2. Un marché aux retours non comptés ET au prix/macaron aberrant non plus.
     3. Un marché réellement soldé à prix normal reste compté (contre-épreuve).
     4. La répartition par parfum décrit les MÊMES marchés que la moyenne.
     5. Aucune suggestion inventée quand aucun marché n'est exploitable.
     6. Les seuils de plausibilité sont partagés avec la clôture.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine, stripComments } = require('./_extract');

// `db` est une globale dans app.js : on la passe en paramètre du module recomposé, ce qui laisse
// le code de marketForecast intact et permet de lui donner un jeu d'essai différent par cas.
function buildModule(db){
  const code = `
    ${extractConstLine('money2')}
    ${extractConstLine('round3')}
    ${extractConstLine('addQty')}
    ${extractConstLine('subQty')}
    ${extractConstLine('PPU_MIN_PLAUSIBLE')}
    ${extractConstLine('PPU_MAX_PLAUSIBLE')}
    ${extractFunction('caMarcheEncaisse')}
    ${extractFunction('marketLineSummary')}
    ${extractFunction('marketForecast')}
    return { marketForecast, marketLineSummary, caMarcheEncaisse, PPU_MIN_PLAUSIBLE, PPU_MAX_PLAUSIBLE };
  `;
  return new Function('db', code)(db);
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// marketForecast lit la base : on lui fournit un double qui rend nos jeux d'essai.
function faireDb(markets, marketMoves){
  return {
    markets:      { toArray: () => Promise.resolve(markets) },
    marketMoves:  { toArray: () => Promise.resolve(marketMoves) },
    recipes:      { toArray: () => Promise.resolve([{id:1, produitNom:'Vanille'}, {id:2, produitNom:'Praliné'}]) },
    productions:  { toArray: () => Promise.resolve([{id:10, recipeId:1}, {id:20, recipeId:2}]) },
  };
}
function appeler(_M, markets, moves){
  return buildModule(faireDb(markets, moves)).marketForecast();
}

// Marché clos vendable : 100 sortis, 40 retournés → 60 vendus, encaissés 120 € (2 €/macaron).
const mkNormal = (id, date, ca) => ({ id, nom:'Marché '+id, date, statut:'clos', ca: ca||{especes:120,cb:0,autre:0}, fondCaisse:0 });
const mvSortie = (id, marketId, qte, parfum) => ({ id, marketId, type:'sortie', qte, parfum, productionId:10 });
const mvRetour = (id, marketId, qte, parfum) => ({ id, marketId, type:'retour', qte, parfum, productionId:10 });

async function run(){
const M = buildModule(faireDb([], []));

// ── CAS 1 : un marché normal est compté, et bien compté ────────────────────
{
  const fc = await appeler(M, [mkNormal(1,'2026-05-10')],
    [mvSortie(1,1,100,'Vanille'), mvRetour(2,1,40,'Vanille')]);
  eq(fc.nbMarches, 1,     'CAS1 · 1 marché exploitable');
  eq(fc.moyenneVendu, 60, 'CAS1 · 60 vendus (100 − 40)');
  eq(fc.maxVendu, 60,     'CAS1 · max cohérent');
  eq(fc.nbSansDonnee, 0,  'CAS1 · rien d\'écarté');
  eq(fc.nbAVerifier, 0,   'CAS1 · … et rien à vérifier');
  eq(fc.suggestion, 70,   'CAS1 · suggestion = moyenne +10 %, arrondie à la dizaine');
}

// ── CAS 2 : ① UN MARCHÉ SANS AUCUN MOUVEMENT NE PÈSE PLUS DANS LA MOYENNE ─
// C'est l'effet qui écrasait la moyenne de Ben vers le bas.
{
  const markets = [mkNormal(1,'2026-05-10'), mkNormal(2,'2026-05-17'), mkNormal(3,'2026-05-24')];
  const moves = [mvSortie(1,1,100,'Vanille'), mvRetour(2,1,40,'Vanille')];   // seul le marché 1 a des mouvements
  const fc = await appeler(M, markets, moves);
  eq(fc.nbClos, 3,        'CAS2 · 3 marchés clos au total');
  eq(fc.nbMarches, 1,     'CAS2 · un seul est exploitable');
  eq(fc.nbSansDonnee, 2,  'CAS2 · les deux autres sont comptés comme sans donnée');
  eq(fc.moyenneVendu, 60, 'CAS2 · la moyenne vaut 60 — et non 20 (60 ÷ 3)');
}

// ── CAS 3 : ② RETOURS NON COMPTÉS + PRIX ABERRANT → écarté ────────────────
// Le marché 404 de Ben : tout le sorti compté comme vendu, alors que le CA
// encaissé donne un prix par macaron sous le plancher plausible.
{
  const suspect = { id:2, nom:'Foire', date:'2026-06-01', statut:'clos', ca:{especes:80,cb:0,autre:0}, fondCaisse:0 };
  const fc = await appeler(M, [mkNormal(1,'2026-05-10'), suspect],
    [ mvSortie(1,1,100,'Vanille'), mvRetour(2,1,40,'Vanille'),
      mvSortie(3,2,404,'Vanille') ]);   // aucun retour saisi → 404 « vendus » pour 80 €
  eq(fc.nbAVerifier, 1,   'CAS3 · le marché est signalé à vérifier');
  eq(fc.nbMarches, 1,     'CAS3 · … et ne compte pas dans la moyenne');
  eq(fc.maxVendu, 60,     'CAS3 · le max n\'est plus 404');
  eq(fc.moyenneVendu, 60, 'CAS3 · la moyenne reste celle du marché fiable');
  eq(fc.aVerifier.length, 1, 'CAS3 · l\'exclusion est renvoyée, pas avalée');
  // On lit défensivement : si l'exclusion disparaît, on veut un ÉCHEC LISIBLE, pas un plantage
  // du fichier de test — un test qui explose informe moins bien qu'un test qui accuse.
  const av0 = fc.aVerifier[0] || {};
  eq(av0.vendu, 404, 'CAS3 · avec le chiffre incriminé…');
  eq(av0.ppu, 0.2,   'CAS3 · … et le prix par macaron qui le démasque (0,20 €)');
}

// ── CAS 4 : CONTRE-ÉPREUVE — un marché VRAIMENT soldé reste compté ────────
// Aucun retour, mais un prix par macaron normal : Ben a tout vendu, point.
// Si ce cas tombait, la correction serait devenue une censure.
{
  const solde = { id:2, nom:'Soldé', date:'2026-06-01', statut:'clos', ca:{especes:200,cb:0,autre:0}, fondCaisse:0 };
  const fc = await appeler(M, [solde], [mvSortie(1,2,100,'Vanille')]);   // 100 vendus pour 200 € = 2 €
  eq(fc.nbMarches, 1,     'CAS4 · le marché soldé est compté');
  eq(fc.nbAVerifier, 0,   'CAS4 · … et n\'est PAS signalé');
  eq(fc.moyenneVendu, 100,'CAS4 · ses 100 ventes comptent en entier');
}

// ── CAS 5 : sans encaissement saisi, on ne peut pas juger → on garde ──────
// Le discriminant a besoin du CA. Sans lui, écarter serait un soupçon, pas une
// mesure : on garde le marché plutôt que d'inventer un motif.
{
  const sansCa = { id:2, nom:'Sans CA', date:'2026-06-01', statut:'clos', ca:{especes:0,cb:0,autre:0}, fondCaisse:0 };
  const fc = await appeler(M, [sansCa], [mvSortie(1,2,300,'Vanille')]);
  eq(fc.nbMarches, 1,   'CAS5 · gardé faute de discriminant');
  eq(fc.nbAVerifier, 0, 'CAS5 · … et non signalé à tort');
}

// ── CAS 6 : un prix par macaron ÉLEVÉ n'est jamais un motif d'exclusion ───
// Sous-évaluer le vendu ne gonfle pas la moyenne : ça ne fabrique pas le bug
// qu'on corrige. On n'écarte que ce qui la fausse vers le haut.
{
  const cher = { id:2, nom:'Cher', date:'2026-06-01', statut:'clos', ca:{especes:900,cb:0,autre:0}, fondCaisse:0 };
  const fc = await appeler(M, [cher], [mvSortie(1,2,50,'Vanille')]);   // 18 €/macaron
  eq(fc.nbMarches, 1,   'CAS6 · compté malgré un prix hors bornes hautes');
  eq(fc.nbAVerifier, 0, 'CAS6 · … et non signalé');
}

// ── CAS 7 : tout retourné = 0 vendu, ce n'est pas un échantillon de vente ─
{
  const fc = await appeler(M, [mkNormal(1,'2026-05-10')],
    [mvSortie(1,1,100,'Vanille'), mvRetour(2,1,100,'Vanille')]);
  eq(fc.nbMarches, 0,     'CAS7 · aucun marché exploitable');
  eq(fc.nbSansDonnee, 1,  'CAS7 · classé sans donnée de vente');
  eq(fc.suggestion, 0,    'CAS7 · aucune suggestion inventée');
}

// ── CAS 8 : le fond de caisse ne fausse pas le discriminant ──────────────
// 60 vendus, 170 € comptés dont 50 € de fond → 120 € nets → 2 €/macaron.
{
  const avecFond = { id:1, nom:'Fond', date:'2026-05-10', statut:'clos', ca:{especes:170,cb:0,autre:0}, fondCaisse:50 };
  eq(M.caMarcheEncaisse(avecFond), 120, 'CAS8 · le fond est déduit de l\'encaissement');
  const fc = await appeler(M, [avecFond], [mvSortie(1,1,60,'Vanille')]);
  eq(fc.nbMarches, 1,   'CAS8 · marché compté (2 €/macaron, plausible)');
  eq(fc.nbAVerifier, 0, 'CAS8 · … pas d\'exclusion due au fond de caisse');
}

// ── CAS 9 : la répartition décrit les MÊMES marchés que la moyenne ───────
// Une ventilation qui inclurait un marché écarté de la moyenne ferait deux
// chiffres qui parlent de deux échantillons — le défaut d'origine, déplacé.
{
  const suspect = { id:2, nom:'Foire', date:'2026-06-01', statut:'clos', ca:{especes:80,cb:0,autre:0}, fondCaisse:0 };
  const fc = await appeler(M, [mkNormal(1,'2026-05-10'), suspect],
    [ mvSortie(1,1,100,'Vanille'), mvRetour(2,1,40,'Vanille'),
      mvSortie(3,2,404,'Praliné') ]);
  eq(fc.repartition.map(r=>r.parfum), ['Vanille'],
     'CAS9 · le parfum du marché écarté n\'entre pas dans la répartition');
  eq(fc.repartition[0].vendu, 60, 'CAS9 · … et les volumes sont ceux du marché retenu');
  eq(fc.totalVendu, 60,           'CAS9 · le total suit la même assiette');
}

// ── CAS 10 : les marchés non clos restent hors du calcul ─────────────────
{
  const ouvert = { id:2, nom:'À venir', date:'2026-08-01', statut:'ouvert', ca:{especes:0,cb:0,autre:0} };
  const fc = await appeler(M, [mkNormal(1,'2026-05-10'), ouvert],
    [mvSortie(1,1,100,'Vanille'), mvRetour(2,1,40,'Vanille'), mvSortie(3,2,200,'Vanille')]);
  eq(fc.nbClos, 1,    'CAS10 · un seul marché clos');
  eq(fc.nbMarches, 1, 'CAS10 · le marché ouvert n\'est pas un historique');
}

// ── CAS 11 : les seuils de plausibilité sont partagés avec la clôture ────
// Deux seuils qui divergeraient diraient deux vérités sur la même donnée.
{
  eq(M.PPU_MIN_PLAUSIBLE, 0.80, 'CAS11 · plancher à 0,80 €');
  eq(M.PPU_MAX_PLAUSIBLE, 5.00, 'CAS11 · plafond à 5 €');
  const src = stripComments(extractFunction('marketCloseSummary'));
  vrai(/ppu<PPU_MIN_PLAUSIBLE \|\| ppu>PPU_MAX_PLAUSIBLE/.test(src),
     'CAS11 · la clôture utilise les mêmes constantes (plus de littéraux)');
  const fcSrc = stripComments(extractFunction('marketForecast'));
  vrai(/ppu < PPU_MIN_PLAUSIBLE/.test(fcSrc), 'CAS11 · … et le prévisionnel aussi');
}

// ── CAS 12 : le hint dit sur quelle assiette la moyenne est calculée ─────
// Une moyenne dont on ignore l'assiette n'est pas vérifiable : c'est en la
// comparant au max que Ben a trouvé le bug.
{
  const src = stripComments(extractFunction('marketPrevuSuggestion'));
  vrai(/marché\(s\) exploitable\(s\)/.test(src), 'CAS12 · l\'assiette est nommée');
  vrai(/nbSansDonnee/.test(src) && /nbAVerifier/.test(src), 'CAS12 · les exclusions sont affichées');
  vrai(/nbClos/.test(src),                                   'CAS12 · … rapportées au total des clos');
  vrai(/aucun exploitable/.test(src),
     'CAS12 · et si rien n\'est exploitable, aucune suggestion n\'est inventée');
}

// ── résultat ──
console.log('\n=== TESTS — v1430 : stats marchés, l\'absence de donnée n\'est pas un zéro ===\n');
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
