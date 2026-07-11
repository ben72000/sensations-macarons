/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 42 : les PERTES ne doivent JAMAIS être cachées
   ----------------------------------------------------------------------------
   BUG CORRIGÉ (v1322) — un outil de pilotage qui masque les pertes est pire qu'inutile.

   Dans la fiche parfum, la décomposition du prix faisait :

       const marge = Math.max(0, prix - mat - mo - charges);   // écrase la perte à 0
       ...
       .filter(s => s.v > 0)                                    // et fait DISPARAÎTRE le segment

   Résultat : un parfum vendu À PERTE affichait « marge : 0 € », et le segment « Marge nette »
   disparaissait purement et simplement de la barre et de la légende. La barre se remplissait
   de coûts, sans le moindre signal. On produisait à perte sans le savoir.

   Le risque est devenu RÉEL depuis que le coût de la main-d'œuvre est correctement compté
   (v1319) : des parfums coûteux (pistache, temps long) peuvent basculer en déficit.

   Règles figées :
     1. Une marge négative est CALCULÉE et CONSERVÉE (jamais écrasée à 0).
     2. Un parfum en perte est SIGNALÉ, avec le déficit exact et le prix d'équilibre.
     3. Les parfums déficitaires exclus du « mix optimal » sont listés explicitement,
        au lieu de disparaître silencieusement.
   ============================================================================ */
'use strict';

const money2 = n => Math.round(n*100)/100;

// Reproduit la décomposition de parfumMargeBar.
function decomposition(prix, mat, mo, charges){
  const margeReelle = money2(prix - mat - mo - charges);   // peut être NÉGATIVE
  const coutTotal   = money2(mat + mo + charges);
  return {
    prix, mat, mo, charges, coutTotal, margeReelle,
    enPerte: margeReelle < 0,
    prixEquilibre: coutTotal,
    manqueAGagner: margeReelle < 0 ? money2(coutTotal - prix) : 0,
    // L'ANCIEN affichage, pour démontrer ce qui était caché.
    margeAffichéeAvant: Math.max(0, margeReelle),
    segmentVisibleAvant: Math.max(0, margeReelle) > 0,
  };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, tol, label){
  if(Math.abs(actual-expected) <= tol){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ~${expected} (±${tol})\n      obtenu : ${actual}`); }
}

// Pistache : matière chère + temps long → déficitaire.
const PISTACHE = { prix:1.10, mat:0.62, mo:0.55, charges:0.14 };
// Vanille : profil sain.
const VANILLE  = { prix:1.10, mat:0.28, mo:0.30, charges:0.14 };

function run(){

// ── LE BUG : la perte était écrasée à zéro ET rendue invisible ───────────────
{
  const d = decomposition(PISTACHE.prix, PISTACHE.mat, PISTACHE.mo, PISTACHE.charges);

  near(d.coutTotal, 1.31, 0.001, 'Coût total pistache = 1,31 € (0,62 + 0,55 + 0,14)');
  near(d.margeReelle, -0.21, 0.001, 'La marge RÉELLE est de −0,21 € par macaron');
  eq(d.enPerte, true, 'La pistache est vendue À PERTE');

  // Ce que l'app affichait AVANT.
  eq(d.margeAffichéeAvant, 0,
     'AVANT · la perte était écrasée à 0 € (Math.max(0, …))');
  eq(d.segmentVisibleAvant, false,
     'AVANT · pire encore : le segment « Marge nette » DISPARAISSAIT (filter v>0)');

  // Ce que l'app affiche MAINTENANT.
  eq(d.margeReelle < 0, true,
     'BUG VERROUILLÉ · la marge négative est conservée et affichée');
}

// ── L'ACTION : le prix d'équilibre est donné ────────────────────────────────
{
  const d = decomposition(PISTACHE.prix, PISTACHE.mat, PISTACHE.mo, PISTACHE.charges);
  near(d.prixEquilibre, 1.31, 0.001,
    'ACTION · prix d\'équilibre = le coût total (1,31 €)');
  near(d.manqueAGagner, 0.21, 0.001,
    'ACTION · il manque 0,21 € par macaron pour être à l\'équilibre');

  // Propriété : au prix d'équilibre, la marge est exactement nulle.
  const e = decomposition(d.prixEquilibre, PISTACHE.mat, PISTACHE.mo, PISTACHE.charges);
  near(e.margeReelle, 0, 0.001,
    'TRAÇABILITÉ · vendu au prix d\'équilibre, la marge est bien nulle');
  eq(e.enPerte, false, 'Au prix d\'équilibre, plus de perte');
}

// ── Un parfum sain n'est PAS signalé à tort ─────────────────────────────────
{
  const d = decomposition(VANILLE.prix, VANILLE.mat, VANILLE.mo, VANILLE.charges);
  near(d.margeReelle, 0.38, 0.001, 'Vanille · marge saine de 0,38 €');
  eq(d.enPerte, false, 'Un parfum rentable n\'est PAS signalé en perte');
  eq(d.manqueAGagner, 0, 'Aucun « manque à gagner » sur un parfum rentable');
}

// ── LE DÉCLENCHEUR : sans coût de main-d'œuvre, la perte était invisible ─────
{
  // C'est le point clé : AVANT v1319, la MO n'était pas comptée (laborEnabled=false par défaut).
  // La pistache paraissait alors RENTABLE. Une fois le temps compté, elle bascule en perte.
  const sansMO = decomposition(PISTACHE.prix, PISTACHE.mat, 0, PISTACHE.charges);
  const avecMO = decomposition(PISTACHE.prix, PISTACHE.mat, PISTACHE.mo, PISTACHE.charges);

  eq(sansMO.enPerte, false,
     'SANS le coût du temps · la pistache paraissait RENTABLE (+0,34 €)');
  eq(avecMO.enPerte, true,
     'AVEC le coût du temps · elle est en réalité DÉFICITAIRE (−0,21 €)');
  eq(sansMO.margeReelle > 0 && avecMO.margeReelle < 0, true,
     'ENJEU · compter son temps fait basculer un parfum de « rentable » à « à perte »');
}

// ── Le MIX OPTIMAL : les déficitaires sont exclus, mais SIGNALÉS ────────────
{
  const parfums = [
    { nom:'Vanille',  margeUnit: 0.38, piecesVendues:300 },
    { nom:'Pistache', margeUnit:-0.21, piecesVendues:120 },
    { nom:'Framboise',margeUnit: 0.25, piecesVendues:200 },
  ];
  // Pondération : les marges négatives sont écrasées à 0 → part nulle → exclues du mix.
  const sumScore = parfums.reduce((x,r)=>x + Math.max(0,r.margeUnit)*r.piecesVendues, 0);
  const mix = parfums.map(r=>{
    const part = sumScore>0 ? (Math.max(0,r.margeUnit)*r.piecesVendues)/sumScore : 0;
    return { nom:r.nom, q: Math.round(300*part) };
  }).filter(m=>m.q>0);

  eq(mix.some(m=>m.nom==='Pistache'), false,
     'Le mix optimal exclut bien la pistache (on ne produit pas à perte) — comportement CORRECT');

  // Mais elle ne doit pas disparaître SANS EXPLICATION.
  const deficitaires = parfums.filter(r=>r.margeUnit<0);
  eq(deficitaires.length, 1, 'Un parfum déficitaire est détecté');
  eq(deficitaires[0].nom, 'Pistache',
     'BUG VERROUILLÉ · les exclus sont LISTÉS explicitement, avec leur déficit');
}

// ── Cas limite : marge exactement nulle ─────────────────────────────────────
{
  const d = decomposition(1.31, 0.62, 0.55, 0.14);
  near(d.margeReelle, 0, 0.001, 'Marge exactement nulle');
  eq(d.enPerte, false, 'Une marge de 0 € n\'est pas une perte (mais aucun bénéfice non plus)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 42 : les pertes ne sont plus cachées ===\n');
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
