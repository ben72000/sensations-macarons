/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 41 : la PRESTATION vend du TEMPS
   ----------------------------------------------------------------------------
   BIAIS DE DÉCISION CORRIGÉ (v1321) : une prestation (coaching, accompagnement) n'avait
   AUCUN coût dans le calcul de marge — ni matière, ni emballage, ni main-d'œuvre :

       if(ln.type==='prestation'){ caService += net; return; }   // aucun coût

   Elle affichait donc ~90–100 % de marge et arrivait MÉCANIQUEMENT en tête de tous les
   classements de rentabilité, quel que soit le temps qu'elle coûte. L'app poussait donc à
   faire du coaching même quand cela paie MOINS de l'heure que fabriquer des macarons.

   Or un coaching, c'est littéralement VENDRE DES HEURES. Ces heures ont un coût.

   Règles figées :
     1. Les heures d'une prestation sont chiffrées (dureeH × taux horaire) quand la
        main-d'œuvre est activée, et déduites de la marge.
     2. Le vrai indicateur d'une prestation est le REVENU HORAIRE (€/h), car le % de marge
        n'a aucun sens sans matières.
     3. Comparer « 100 % de marge » (coaching) à « 30 % » (coffret) est un faux débat :
        seule la comparaison en €/heure permet d'arbitrer.
   ============================================================================ */
'use strict';

const money2 = n => Math.round(n*100)/100;

// Reproduit le traitement d'une ligne de prestation dans computeOrderMargins.
function margePrestation(ligne, settings){
  const s = settings || {};
  const ca = +ligne.montant || 0;
  const h  = +ligne.dureeH  || 0;
  const coutTemps = (s.laborEnabled && h>0) ? money2(h * (+s.laborRate||0)) : 0;
  return {
    ca, heures:h, coutTemps,
    margeBrute: money2(ca - coutTemps),
    revenuHoraire: h>0 ? money2(ca/h) : null,
    // Le taux de marge d'une prestation SANS coût de temps est structurellement ~100 %.
    tauxSansTemps: ca>0 ? 100 : 0,
  };
}
// Revenu horaire d'une fabrication, pour la comparaison.
function revenuHoraireFabrication({ prixVente, coutMatiere, minutes }){
  const h = minutes/60;
  return h>0 ? money2((prixVente - coutMatiere)/h) : null;
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

const COACHING = { montant:200, dureeH:4 };   // 200 € pour 4 h

function run(){

// ── LE BIAIS : sans coût, une prestation affiche toujours ~100 % de marge ────
{
  const sansMO = margePrestation(COACHING, { laborEnabled:false });
  eq(sansMO.coutTemps, 0,
     'AVANT · aucun coût de temps → la prestation ne coûte RIEN');
  eq(sansMO.margeBrute, 200,
     'AVANT · marge = 200 € pour un CA de 200 € (100 %)');
  eq(sansMO.tauxSansTemps, 100,
     'BIAIS · ~100 % de marge → la prestation arrive MÉCANIQUEMENT en tête des classements');
}

// ── LE CORRECTIF : les heures vendues sont chiffrées ─────────────────────────
{
  const avecMO = margePrestation(COACHING, { laborEnabled:true, laborRate:15 });
  near(avecMO.coutTemps, 60, 0.01,
    'BIAIS CORRIGÉ · 4 h × 15 €/h = 60 € de coût de ton temps');
  near(avecMO.margeBrute, 140, 0.01,
    'BIAIS CORRIGÉ · la marge réelle tombe de 200 € à 140 €');
  eq(avecMO.margeBrute < 200, true,
    'La prestation n\'est plus « gratuite » à produire');
}

// ── LE VRAI INDICATEUR : le revenu horaire ──────────────────────────────────
{
  const p = margePrestation(COACHING, {});
  near(p.revenuHoraire, 50, 0.01,
    'INDICATEUR JUSTE · le coaching te paie 50 €/h (200 € ÷ 4 h)');
}

// ── L'ARBITRAGE : coaching OU fabrication ? ─────────────────────────────────
{
  // Le seul débat qui vaille : à l'heure, qu'est-ce qui paie le mieux ?
  const coaching = margePrestation(COACHING, {}).revenuHoraire;
  const coffret  = revenuHoraireFabrication({ prixVente:28, coutMatiere:12, minutes:35 });

  near(coaching, 50, 0.01,    'Coaching · 50 €/h');
  near(coffret, 27.43, 0.05,  'Coffret 16 · 27,43 €/h (28 € − 12 € de matières, en 35 min)');

  eq(coaching > coffret, true,
     'ARBITRAGE possible · ici le coaching paie mieux de l\'heure — décision ÉCLAIRÉE');

  // Le point clé : la comparaison en % de marge était un FAUX débat.
  // Coaching = 100 % de marge, coffret = 57 % → le coaching semblait 2× meilleur.
  const tauxCoffret = Math.round((28-12)/28*100);
  eq(tauxCoffret, 57, 'Le coffret affiche 57 % de marge (matières déduites)');
  eq(100 > tauxCoffret, true,
     'FAUX DÉBAT · en % de marge, le coaching (100 %) écrase toujours le coffret (57 %)');
}

// ── CONTRE-EXEMPLE : un coaching mal payé doit apparaître comme tel ─────────
{
  // Un accompagnement de 8 h facturé 150 € : 18,75 €/h. Sous le seuil.
  const mauvais = margePrestation({ montant:150, dureeH:8 }, { laborEnabled:true, laborRate:15 });
  near(mauvais.revenuHoraire, 18.75, 0.01,
    'Un coaching de 8 h à 150 € ne te paie que 18,75 €/h');
  near(mauvais.coutTemps, 120, 0.01, '8 h × 15 €/h = 120 € de ton temps');
  near(mauvais.margeBrute, 30, 0.01,
    'ALERTE · il ne reste que 30 € de marge réelle (et non 150 €)');

  // Avant, il aurait affiché 100 % de marge et serait passé pour excellent.
  const avant = margePrestation({ montant:150, dureeH:8 }, { laborEnabled:false });
  eq(avant.margeBrute, 150,
     'AVANT · ce coaching mal payé affichait 150 € de marge (100 %) — trompeur');
}

// ── Prestation sans durée saisie : aucun chiffre inventé ────────────────────
{
  const p = margePrestation({ montant:200, dureeH:0 }, { laborEnabled:true, laborRate:15 });
  eq(p.coutTemps, 0,        'Durée non saisie → aucun coût de temps inventé');
  eq(p.revenuHoraire, null, 'Durée non saisie → revenu horaire = null (et non 0 trompeur)');
  eq(p.margeBrute, 200,     'Durée non saisie → marge inchangée (pas de pénalité arbitraire)');
}

// ── Main-d'œuvre désactivée : comportement d'origine conservé ───────────────
{
  const p = margePrestation(COACHING, { laborEnabled:false, laborRate:15 });
  eq(p.coutTemps, 0, 'Main-d\'œuvre désactivée → aucun coût déduit (rétro-compatibilité)');
  // Mais le revenu horaire reste calculé : il ne dépend pas du réglage.
  near(p.revenuHoraire, 50, 0.01,
    'Le revenu horaire reste disponible même sans main-d\'œuvre activée');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 41 : la prestation vend du temps ===\n');
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
