/* ============================================================================
   TESTS — v1432 : UN COÛT PAR PARFUM DÉDUIT DES DONNÉES RÉELLES
   ----------------------------------------------------------------------------
   Ben : « lorsque je fais des reprises de migration et que j'ajoute des macarons
   en stock qui sont vendus mais qui ne consomment pas de matières premières, je
   me retrouve à avoir des écarts de rentabilité […] est-il possible de générer
   un coût par parfum basé sur ce que les données réelles disent déjà ? Ainsi on
   empêcherait les calculs de mentir. »

   LE MENSONGE EXACT : un lot de reprise n'a aucune ligne dans `prodConsumption`
   — c'est voulu, les matières ont été achetées avant l'app. Mais si la recette
   du parfum n'a pas non plus d'ingrédients renseignés, `coutRevientRecette`
   renvoie 0. Et un coût de 0 ne produit pas une marge inconnue : il produit une
   marge de 100 %. Le parfum remonte alors EN TÊTE du classement de rentabilité
   — le pire endroit possible pour une erreur, puisque c'est celui qui oriente
   les décisions de prix et d'offre.

   LA MESURE QUI EXISTAIT DÉJÀ : `prodConsumption` relie chaque batch réel aux
   lots matière consommés, et chaque lot porte son prix. On peut donc calculer,
   sans rien saisir de plus, ce qu'a coûté EN VRAI un macaron de ce parfum.

   L'ÉCHELLE DE REPLI : mesuré > recette > médiane de l'atelier > INCONNU.
   Et `inconnu` renvoie null, jamais 0. C'est tout l'objet de la demande :
   un chiffre manquant se voit, un chiffre faux se croit.

   Propriétés verrouillées ici :
     1. Le coût mesuré vient des vrais batchs, et les lots de reprise en sont
        exclus (ils ne mesurent rien).
     2. Une seule fournée ne fait pas une mesure (seuil de fiabilité).
     3. La médiane, pas la moyenne — un parfum cher ne tire pas les autres.
     4. La part non-matière (consommables + main-d'œuvre) est reprise de la
        recette : un seul point de vérité pour la main-d'œuvre.
     5. Coût inconnu ⇒ marges null, jamais 0 ⇒ jamais 100 % de marge.
     6. Les totaux excluent ces lignes ET chiffrent ce qu'ils excluent.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine, stripComments, APP } = require('./_extract');

// `renderParfums` n'est pas extractible en entier (4 933 caractères sur ~14 000) : l'équilibreur
// d'accolades cale sur les gabarits HTML imbriqués. Une garde écrite sur l'extraction tronquée ne
// verrait ni les marqueurs de ligne ni la colonne Coût/pc, et passerait au vert pour rien.
function zoneFonction(nom){
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(APP);
  if(!m) throw new Error('Introuvable (zone): ' + nom);
  const debut = m.index;
  const suiv = /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(APP.slice(debut + m[0].length));
  return APP.slice(debut, suiv ? debut + m[0].length + suiv.index : APP.length);
}

function buildModule(){
  const code = `
    ${extractConstLine('money2')}
    ${extractConstLine('round3')}
    const lotPU = l => +((l||{}).prixUnitaire)||0;
    const prodQteAffichee = p => +((p||{}).qteReelle) || +((p||{}).qteProduite) || +((p||{}).qteTheorique) || 0;
    ${extractFunction('coutMatiereMesureParRecette')}
    ${extractFunction('resoudreCoutParfum')}
    ${extractFunction('medianeCoutMatiereAtelier')}
    return { coutMatiereMesureParRecette, resoudreCoutParfum, medianeCoutMatiereAtelier };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

function run(){
const M = buildModule();

// Deux batchs réels de vanille (recette 1) : 60 pièces à 30 €, 60 pièces à 36 €
// → 96 € pour 120 pièces = 0,80 €/pièce de matière.
// Un lot de REPRISE de framboise (recette 2) : aucune consommation.
function jeu(){
  const lots = [
    { id:100, materialId:1, prixUnitaire:0.50 },
    { id:101, materialId:2, prixUnitaire:0.30 },
    { id:102, materialId:3, prixUnitaire:0 },     // lot sans prix
  ];
  const productions = [
    { id:10, recipeId:1, qteReelle:60 },
    { id:11, recipeId:1, qteReelle:60 },
    { id:12, recipeId:2, qteReelle:200, histo:true },   // REPRISE : rien consommé
  ];
  const conso = [
    { id:1, productionId:10, materialLotId:100, qte:40 },   // 20 €
    { id:2, productionId:10, materialLotId:101, qte:  0 },  // 0
    { id:3, productionId:10, materialLotId:101, qte:33.333333 }, // ~10 €
    { id:4, productionId:11, materialLotId:100, qte:72 },   // 36 €
  ];
  return { lots, productions, conso };
}

// ── CAS 1 : le coût mesuré sort des vrais batchs ──────────────────────────
{
  const j = jeu();
  const m = M.coutMatiereMesureParRecette(j.productions, j.conso, j.lots);
  vrai(m[1], 'CAS1 · la vanille a une mesure');
  eq(m[1].nbBatchs, 2,   'CAS1 · deux batchs réels');
  eq(m[1].pieces, 120,   'CAS1 · 120 pièces produites');
  eq(m[1].coutMatUnit, 0.55, 'CAS1 · 66 € ÷ 120 = 0,55 €/pièce de matière');
  eq(m[1].fiable, true,  'CAS1 · mesure jugée fiable');
}

// ── CAS 2 : UN LOT DE REPRISE NE MESURE RIEN ─────────────────────────────
// C'est le cœur du problème de Ben : ce lot existe, il se vend, mais il n'a
// consommé aucune matière. L'inclure ferait tomber le coût moyen vers zéro.
{
  const j = jeu();
  const m = M.coutMatiereMesureParRecette(j.productions, j.conso, j.lots);
  eq(m[2], undefined, 'CAS2 · la framboise reprise n\'a aucune mesure');
  // Et même AVEC des consos rattachées par erreur, un lot histo reste exclu.
  const consoParasite = j.conso.concat([{id:9, productionId:12, materialLotId:100, qte:10}]);
  const m2 = M.coutMatiereMesureParRecette(j.productions, consoParasite, j.lots);
  eq(m2[2], undefined, 'CAS2 · le drapeau histo prime sur une conso parasite');
}

// ── CAS 3 : une seule fournée n'est pas une mesure ───────────────────────
// Première fois, ratage, matière de dépannage : un cas n'est pas une moyenne.
{
  const prods = [{ id:20, recipeId:5, qteReelle:60 }];
  const conso = [{ id:1, productionId:20, materialLotId:100, qte:60 }];
  const m = M.coutMatiereMesureParRecette(prods, conso, [{id:100, materialId:1, prixUnitaire:0.5}]);
  eq(m[5].nbBatchs, 1,   'CAS3 · le batch est bien compté');
  eq(m[5].fiable, false, 'CAS3 · … mais la mesure n\'est pas jugée fiable');
}

// ── CAS 4 : volume insuffisant → non fiable, même avec deux batchs ───────
{
  const prods = [{id:30, recipeId:6, qteReelle:10}, {id:31, recipeId:6, qteReelle:10}];
  const conso = [{id:1, productionId:30, materialLotId:100, qte:10}, {id:2, productionId:31, materialLotId:100, qte:10}];
  const m = M.coutMatiereMesureParRecette(prods, conso, [{id:100, materialId:1, prixUnitaire:0.5}]);
  eq(m[6].fiable, false, 'CAS4 · 20 pièces ne suffisent pas à une moyenne');
}

// ── CAS 5 : un lot matière sans prix ne fabrique pas un coût nul ─────────
// On ne devine pas : la ligne est ignorée, elle ne tire pas la moyenne vers 0.
{
  const prods = [{id:40, recipeId:7, qteReelle:100}, {id:41, recipeId:7, qteReelle:100}];
  const conso = [
    {id:1, productionId:40, materialLotId:100, qte:100},  // 50 €
    {id:2, productionId:40, materialLotId:102, qte:999},  // lot sans prix → ignoré
    {id:3, productionId:41, materialLotId:100, qte:100},  // 50 €
  ];
  const m = M.coutMatiereMesureParRecette(prods, conso, jeu().lots);
  eq(m[7].coutMatUnit, 0.5, 'CAS5 · 100 € ÷ 200 pièces, la ligne sans prix écartée');
}

// ── CAS 6 : une conso neutralisée à l'inventaire ne compte pas ───────────
{
  const prods = [{id:50, recipeId:8, qteReelle:100}, {id:51, recipeId:8, qteReelle:100}];
  const conso = [
    {id:1, productionId:50, materialLotId:100, qte:100},
    {id:2, productionId:50, materialLotId:100, qte:100, annuleeInventaire:true},   // rendue
    {id:3, productionId:51, materialLotId:100, qte:100},
  ];
  const m = M.coutMatiereMesureParRecette(prods, conso, jeu().lots);
  eq(m[8].coutMatUnit, 0.5, 'CAS6 · la conso rendue est exclue du coût');
}

// ── CAS 7 : L'ÉCHELLE DE REPLI, barreau par barreau ──────────────────────
{
  const mesure = { 1:{coutMatUnit:0.55, fiable:true, nbBatchs:2},
                   3:{coutMatUnit:0.90, fiable:false, nbBatchs:1} };
  const recCplt = { coutRevientUnit:1.20, coutMatUnit:0.70 };   // dont 0,50 hors matière
  const recVide = { coutRevientUnit:0,    coutMatUnit:0 };

  const a = M.resoudreCoutParfum(1, mesure, recCplt, 0.60);
  eq(a.source, 'mesure', 'CAS7 · mesure fiable → elle gagne');
  eq(a.unit, 1.05,       'CAS7 · 0,55 mesuré + 0,50 hors matière repris de la recette');

  const b = M.resoudreCoutParfum(2, mesure, recCplt, 0.60);
  eq(b.source, 'recette', 'CAS7 · aucune mesure → la recette');
  eq(b.unit, 1.20,        'CAS7 · le coût de revient complet, inchangé');

  const c = M.resoudreCoutParfum(3, mesure, recVide, 0.60);
  eq(c.source, 'atelier', 'CAS7 · mesure non fiable ET recette vide → médiane atelier');
  eq(c.unit, 0.60,        'CAS7 · pas de part hors matière connue → la matière seule');

  const d = M.resoudreCoutParfum(4, {}, recVide, 0);
  eq(d.source, 'inconnu', 'CAS7 · plus rien → inconnu');
  eq(d.unit, null,        'CAS7 · ET LE COÛT VAUT null, PAS 0 — tout l\'objet de la demande');
  eq(d.fiable, false,     'CAS7 · … et il ne se prétend pas fiable');
}

// ── CAS 8 : la part hors matière vient toujours de la recette ────────────
// Un seul point de vérité pour la main-d'œuvre : la recalculer ici ferait
// diverger deux chiffres qui doivent rester le même.
{
  const mesure = { 1:{coutMatUnit:0.40, fiable:true, nbBatchs:3} };
  const rec = { coutRevientUnit:2.00, coutMatUnit:0.80 };   // 1,20 hors matière
  const r = M.resoudreCoutParfum(1, mesure, rec, 0.60);
  eq(r.unit, 1.60, 'CAS8 · 0,40 mesuré + 1,20 de MO et consommables');
  eq(r.coutMatUnit, 0.40, 'CAS8 · la matière retenue est bien la mesurée');
}

// ── CAS 9 : MÉDIANE, pas moyenne ─────────────────────────────────────────
// Un parfum aux ingrédients très chers ne doit pas tirer l'estimation de tous
// les autres — c'est exactement ce que ferait une moyenne.
{
  const m = { 1:{coutMatUnit:0.50, fiable:true}, 2:{coutMatUnit:0.60, fiable:true},
              3:{coutMatUnit:5.00, fiable:true} };
  eq(M.medianeCoutMatiereAtelier(m), 0.60, 'CAS9 · médiane 0,60 (la moyenne dirait 2,03)');
  const pair = { 1:{coutMatUnit:0.40, fiable:true}, 2:{coutMatUnit:0.60, fiable:true} };
  eq(M.medianeCoutMatiereAtelier(pair), 0.50, 'CAS9 · nombre pair → moyenne des deux centrales');
  const nonFiables = { 1:{coutMatUnit:0.50, fiable:false} };
  eq(M.medianeCoutMatiereAtelier(nonFiables), 0, 'CAS9 · les mesures non fiables ne nourrissent pas la médiane');
  eq(M.medianeCoutMatiereAtelier({}), 0, 'CAS9 · rien à mesurer → 0, et le barreau suivant jouera');
}

// ── CAS 10 : entrées dégradées ──────────────────────────────────────────
{
  eq(M.coutMatiereMesureParRecette(null, null, null), {}, 'CAS10 · tout vide → objet vide');
  eq(M.coutMatiereMesureParRecette([{id:1}], [], []), {}, 'CAS10 · production sans recipeId ignorée');
  const r = M.resoudreCoutParfum(1, null, null, 0);
  eq(r.source, 'inconnu', 'CAS10 · aucune source → inconnu, pas d\'exception');
}

// ── CAS 11 : L'ANALYSE NE FABRIQUE PLUS 100 % DE MARGE ──────────────────
// La garde qui répond directement à Ben : coût inconnu ⇒ marges absentes.
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  vrai(/const coutConnu = \(coutUnitRetenu!=null && coutUnitRetenu>0\)/.test(src),
     'CAS11 · l\'analyse sait si le coût est connu');
  vrai(/const margeBrute = coutConnu \? money2\(ca - coutVentes\) : null/.test(src),
     'CAS11 · marge brute null quand il ne l\'est pas');
  vrai(/const coutVentes = coutConnu \? money2\(piecesVendues \* coutUnitRetenu\) : null/.test(src),
     'CAS11 · … et le coût des ventes aussi');
  eq(/piecesVendues \* c\.coutRevientUnit/.test(src), false,
     'CAS11 · le coût théorique n\'est plus appliqué en aveugle');
  vrai(/coutResolu\[r\.id\] = resoudreCoutParfum/.test(src),
     'CAS11 · chaque parfum passe par l\'échelle de repli');
}

// ── CAS 12 : les totaux excluent l'inconnu ET disent ce qu'ils excluent ──
// Sommer des marges nulles à 0 gonflerait le total exactement comme avant.
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  vrai(/margeBrute: money2\(rows\.reduce\(\(s2,r\)=>s2\+\(r\.margeBrute\|\|0\),0\)\)/.test(src),
     'CAS12 · les null ne cassent pas le total');
  vrai(/caSansCout: money2\(rows\.filter\(r=>r\.margeBrute==null\)/.test(src),
     'CAS12 · le CA exclu est chiffré');
  vrai(/nbCoutInconnu:/.test(src) && /nbCoutMesure:/.test(src),
     'CAS12 · les sources sont comptées');
}

// ── CAS 13 : l'écran dit d'où vient chaque coût ─────────────────────────
// Un coût estimé qui ressemble à un coût mesuré est ce qui faisait mentir
// l'écran. Le marqueur est sur chaque ligne, pas seulement en en-tête.
{
  const src = stripComments(zoneFonction('renderParfums'));
  vrai(/D'où vient le coût de chaque parfum/.test(src), 'CAS13 · un bandeau nomme les sources');
  vrai(/exclu<\/b> des marges/.test(src),                'CAS13 · … et annonce le CA mis de côté');
  vrai(/mesuré/.test(src) && /≈ estimé/.test(src) && /coût inconnu/.test(src),
     'CAS13 · trois marqueurs distincts par ligne');
  vrai(/r\.coutUnitRetenu!=null\?euro\(r\.coutUnitRetenu\):'—'/.test(src),
     'CAS13 · la colonne Coût/pc affiche le coût RETENU, ou un tiret');
  vrai(/r\.margeBrute!=null\?euro\(r\.margeBrute\):'—'/.test(src),
     'CAS13 · … et la marge affiche un tiret plutôt qu\'un zéro trompeur');
  vrai(/prodConsumption/.test(src), 'CAS13 · l\'écran charge bien les consommations réelles');
}

// ── CAS 14 : rien de tout cela n'entre dans la comptabilité ─────────────
// Un coût imputé est un chiffre de GESTION. L'inscrire comme une charge
// fabriquerait une dépense qui n'a jamais eu lieu — c'est une ligne à ne
// jamais franchir.
{
  const lr = stripComments(extractFunction('livreDesRecettes'));
  eq(/resoudreCoutParfum|coutUnitRetenu|coutMatiereMesureParRecette/.test(lr), false,
     'CAS14 · le livre des recettes ignore le coût imputé');
  const bilan = stripComments(extractFunction('computeMonthlyBilan'));
  eq(/resoudreCoutParfum|coutUnitRetenu|coutMatiereMesureParRecette/.test(bilan), false,
     'CAS14 · le bilan URSSAF aussi');
}

// ── résultat ──
console.log('\n=== TESTS — v1432 : coût par parfum déduit des données réelles ===\n');
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
