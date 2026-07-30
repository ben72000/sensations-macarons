/* ============================================================================
   TESTS — v1433 : LE €/MACARON DE L'ACCUEIL NE DOIT PAS BOUGER SUR UNE MIGRATION
   ----------------------------------------------------------------------------
   Ben : « j'ai un calcul sur la page d'accueil qui me donne la rentabilité par
   macaron. Je ne veux pas que ce chiffre clé évolue de manière fausse suite à la
   migration de commandes passées. Peux-tu t'assurer que ce n'est pas le cas ? »

   Vérification faite : c'était le cas, et deux autres fuites se cachaient au
   même endroit. `buildFlavorSales` parcourait `orders` SANS AUCUN FILTRE.

     ① REPRISES D'HISTORIQUE (`o.histo===true`) — des ventes d'AVANT l'app, à des
        prix d'alors, dont le coût réel de l'époque est inconnu et le restera. On
        leur appliquait les coûts d'AUJOURD'HUI. Chaque migration de commandes
        passées déplaçait donc le €/macaron. Une marge qui mélange deux époques
        ne mesure ni l'une ni l'autre.
     ② COMMANDES FILLES — leur contenu et leur montant doublonnent ceux de leur
        mère (v1421). Elles gonflaient CA et pièces des deux côtés du ratio.
     ③ COMMANDES NON PAYÉES — une commande à préparer n'est pas une vente.

   Et un quatrième défaut, introduit par la v1432 elle-même : le dénominateur
   comptait TOUTES les pièces vendues alors que le numérateur excluait les
   parfums au coût inconnu. Diviser une marge partielle par un volume complet
   tire le chiffre vers le bas — une autre façon de mentir.

   Propriétés verrouillées ici :
     1. Une reprise n'entre jamais dans l'assiette de marge.
     2. Migrer des commandes passées ne change pas le €/macaron. (Test central.)
     3. Filles et commandes non payées écartées, via le prédicat de la v1421 —
        pas un second prédicat écrit pour l'occasion.
     4. Le dénominateur ne compte que les pièces dont la marge est calculée.
     5. Le volume écarté est CHIFFRÉ et affiché — jamais escamoté.
     6. L'accueil et l'écran Rentabilité résolvent les coûts de la même façon.
   ============================================================================ */
'use strict';
const { extractFunction, stripComments, APP } = require('./_extract');

// `renderDash` sur-extrait massivement (1 010 576 caractères : l'équilibreur part très au-delà de
// sa fin). Une garde écrite dessus matcherait la moitié de l'app et serait un faux vert garanti.
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
    ${extractFunction('estVenteAgregable')}
    return { estVenteAgregable };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// La règle d'assiette, rejouée à l'identique d'analyzeFlavorProfitability.
function assiette(M, orders){
  return {
    marge:   (orders||[]).filter(o=>o && o.histo!==true && M.estVenteAgregable(o)),
    reprise: (orders||[]).filter(o=>o && o.histo===true),
  };
}
// Le €/macaron de l'accueil, rejoué : marge des lignes calculables ÷ pièces de ces mêmes lignes.
function euroParMacaron(rows){
  const calculables = rows.filter(r=>r.margeBrute!=null);
  const marge  = calculables.reduce((s,r)=>s+r.margeBrute,0);
  const pieces = calculables.reduce((s,r)=>s+r.piecesVendues,0);
  return pieces>0 ? Math.round(marge/pieces*100)/100 : null;
}

function run(){
const M = buildModule();

const VENTES = [
  { id:1, date:'2026-06-02', montant:120, paiement:'Payé' },
  { id:2, date:'2026-06-14', montant: 80, paiement:'Payé' },
];

// ── CAS 1 : une reprise n'entre pas dans l'assiette de marge ──────────────
{
  const reprise = { id:9, date:'2025-04-10', montant:300, paiement:'Payé', histo:true, histoLabel:'Reprise avril 2025' };
  const a = assiette(M, VENTES.concat([reprise]));
  eq(a.marge.map(o=>o.id), [1,2], 'CAS1 · seules les ventes de l\'app portent la marge');
  eq(a.reprise.map(o=>o.id), [9], 'CAS1 · la reprise est isolée, pas perdue');
}

// ── CAS 2 : LE TEST CENTRAL — migrer des commandes ne bouge pas le ratio ──
// C'est exactement la garantie demandée par Ben.
{
  const avant = assiette(M, VENTES);
  const apres = assiette(M, VENTES.concat([
    { id:20, date:'2025-01-05', montant:500, paiement:'Payé', histo:true },
    { id:21, date:'2025-02-11', montant:900, paiement:'Payé', histo:true },
    { id:22, date:'2025-03-03', montant:150, paiement:'Payé', histo:true },
  ]));
  eq(apres.marge.map(o=>o.id), avant.marge.map(o=>o.id),
     'CAS2 · l\'assiette de marge est IDENTIQUE avant et après migration');
  eq(apres.reprise.length, 3, 'CAS2 · les 3 reprises sont comptées à part');
  // Et le ratio lui-même, à partir des mêmes lignes de parfum :
  const rows = [{piecesVendues:100, margeBrute:120}, {piecesVendues:50, margeBrute:45}];
  eq(euroParMacaron(rows), 1.1, 'CAS2 · 165 € ÷ 150 pc = 1,10 €/macaron, quoi qu\'il arrive en amont');
}

// ── CAS 3 : filles et non-payées écartées par le prédicat de la v1421 ────
{
  const fille  = { id:30, date:'2026-06-20', montant:160, paiement:'Payé', commandeMereId:1 };
  const impaye = { id:31, date:'2026-06-21', montant:200, paiement:'En attente' };
  const a = assiette(M, VENTES.concat([fille, impaye]));
  eq(a.marge.map(o=>o.id), [1,2], 'CAS3 · ni la fille ni l\'impayée n\'entrent');
  eq(M.estVenteAgregable(fille), false,  'CAS3 · la fille doublonne sa mère');
  eq(M.estVenteAgregable(impaye), false, 'CAS3 · une commande à préparer n\'est pas une vente');
  eq(M.estVenteAgregable(VENTES[0]), true, 'CAS3 · une vente payée, elle, compte');
}

// ── CAS 4 : une reprise ne redevient jamais éligible par un autre chemin ──
// Même payée, même sans mère : `histo` prime. Sinon la migration rouvrirait la
// porte par la fenêtre.
{
  const repriseParfaite = { id:40, date:'2025-05-05', montant:400, paiement:'Payé', histo:true, commandeMereId:null };
  eq(M.estVenteAgregable(repriseParfaite), true,
     'CAS4 · le prédicat v1421 seul ne suffirait PAS à l\'écarter…');
  eq(assiette(M, [repriseParfaite]).marge.length, 0,
     'CAS4 · … c\'est le test `histo!==true` qui la retient, et il est bien là');
}

// ── CAS 5 : LE DÉNOMINATEUR ne compte que les pièces calculables ─────────
// Défaut introduit par la v1432 : une marge partielle divisée par un volume
// complet descend sans raison.
{
  const rows = [
    {piecesVendues:100, margeBrute:120},
    {piecesVendues: 50, margeBrute: 45},
    {piecesVendues:200, margeBrute:null},   // coût inconnu : hors numérateur
  ];
  eq(euroParMacaron(rows), 1.1, 'CAS5 · 1,10 € — les 200 pc sans coût ne diluent pas');
  const faux = Math.round((165/350)*100)/100;
  eq(faux, 0.47, 'CAS5 · l\'ancien calcul aurait affiché 0,47 € : deux fois trop bas');
}

// ── CAS 6 : aucune ligne calculable → pas de chiffre, plutôt qu'un zéro ──
{
  eq(euroParMacaron([{piecesVendues:200, margeBrute:null}]), null,
     'CAS6 · rien de calculable → aucun €/macaron affiché');
  eq(euroParMacaron([]), null, 'CAS6 · aucune vente → idem');
}

// ── CAS 7 : l'analyse construit bien deux assiettes distinctes ───────────
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  vrai(/const ordersReprise = \(orders\|\|\[\]\)\.filter\(o=>o && o\.histo===true\)/.test(src),
     'CAS7 · les reprises sont isolées');
  vrai(/const ordersMarge   = \(orders\|\|\[\]\)\.filter\(o=>o && o\.histo!==true && estVenteAgregable\(o\)\)/.test(src),
     'CAS7 · l\'assiette de marge exclut reprises, filles et impayées');
  vrai(/buildFlavorSales\(ordersMarge,/.test(src),
     'CAS7 · c\'est bien cette assiette qui alimente les ventes par parfum');
  eq(/buildFlavorSales\(orders,/.test(src), false,
     'CAS7 · plus aucun appel sur la liste brute des commandes');
  vrai(/estVenteAgregable\(o\)/.test(src),
     'CAS7 · on réutilise le prédicat de la v1421, on n\'en réécrit pas un second');
}

// ── CAS 8 : ce qui est écarté est chiffré, pas escamoté ─────────────────
{
  const src = stripComments(extractFunction('analyzeFlavorProfitability'));
  vrai(/piecesReprise: round3/.test(src), 'CAS8 · les pièces de reprise sont comptées');
  vrai(/caReprise: money2/.test(src),     'CAS8 · leur CA aussi');
  vrai(/nbCmdReprise: ordersReprise\.length/.test(src), 'CAS8 · et le nombre de commandes');
  vrai(/piecesAvecCout: round3\(rows\.filter\(r=>r\.margeBrute!=null\)/.test(src),
     'CAS8 · le dénominateur honnête est exposé');
}

// ── CAS 9 : l'accueil utilise ce dénominateur ───────────────────────────
{
  const z = stripComments(zoneFonction('renderDash'));
  vrai(/_An\.totals\.piecesAvecCout!=null && _An\.totals\.piecesAvecCout>0/.test(z),
     'CAS9 · l\'accueil prend les pièces calculables…');
  vrai(/margeNetteParMacaron = _piecesBase>0 \? money2\(_baseMarge \/ _piecesBase\) : null/.test(z),
     'CAS9 · … et divise par elles');
  vrai(/: _An\.totals\.pieces;/.test(z),
     'CAS9 · avec un repli pour les bases antérieures au champ');
  eq(/margeNetteParMacaron = money2\(_baseMarge \/ _An\.totals\.pieces\)/.test(z), false,
     'CAS9 · l\'ancien dénominateur a disparu');
}

// ── CAS 10 : la tuile dit que les reprises sont hors calcul ─────────────
// Un chiffre juste dont on ignore le périmètre reste invérifiable.
{
  const z = stripComments(zoneFonction('renderDash'));
  vrai(/_piecesReprise>0\?`hors \$\{qty\(_piecesReprise\)\} pc de reprise ›`/.test(z),
     'CAS10 · la tuile annonce le volume écarté quand il existe');
  vrai(/après coûts, charges & dons/.test(z),
     'CAS10 · et garde son libellé habituel sinon');
}

// ── CAS 11 : accueil et écran Rentabilité résolvent les coûts pareil ────
// Deux écrans qui affichent deux marges du même mois seraient un mensonge de plus.
{
  const z = stripComments(zoneFonction('renderDash'));
  vrai(/db\.prodConsumption\.toArray/.test(z), 'CAS11 · l\'accueil charge les consommations réelles');
  vrai(/prodConsumption:_conso/.test(z),        'CAS11 · … et les transmet à l\'analyse');
  const rp = stripComments(zoneFonction('renderParfums'));
  vrai(/prodConsumption/.test(rp),              'CAS11 · l\'écran Rentabilité aussi (v1432)');
}

// ── CAS 12 : la comptabilité reste hors de tout ça ──────────────────────
// L'assiette de marge est un périmètre de GESTION. Le CA déclarable, lui, doit
// continuer d'inclure ce qu'il doit inclure — on ne touche à rien de ce côté.
{
  const lr = stripComments(extractFunction('livreDesRecettes'));
  eq(/ordersMarge|piecesAvecCout|ordersReprise/.test(lr), false,
     'CAS12 · le livre des recettes ignore l\'assiette de marge');
  const bilan = stripComments(extractFunction('computeMonthlyBilan'));
  eq(/ordersMarge|piecesAvecCout|ordersReprise/.test(bilan), false,
     'CAS12 · le bilan URSSAF aussi');
}

// ── résultat ──
console.log('\n=== TESTS — v1433 : le €/macaron ne bouge plus sur une migration ===\n');
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
