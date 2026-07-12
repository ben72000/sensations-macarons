/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 44 : LE POINT MORT DISAIT LA MOITIÉ DE LA VÉRITÉ
   ----------------------------------------------------------------------------
   BUG CORRIGÉ (v1324). Le point mort de v1323 divisait les charges fixes par `margeUnit`.
   Or, dans analyzeFlavorProfitability :
         margeUnit = prixVenteMoyen − coutRevientUnit
   et coutRevientUnit = matières + consommables + main-d'œuvre D'ATELIER. Point final.
   Le texte de traçabilité affirmait pourtant que les charges sociales étaient déduites :
   elles ne l'étaient PAS. Le chiffre était donc SOUS-ESTIMÉ **et** sa justification était
   fausse — le pire des deux mondes pour un nombre qu'on doit pouvoir refaire à la main.

   TROIS COÛTS BIEN RÉELS manquaient, tous payés par Benjamin, aucun compté :
     1. CHARGES SOCIALES  — prélevées sur chaque euro encaissé → coût VARIABLE.
     2. IMPÔT SUR LE REVENU — base micro-BIC = CA × (1 − abattement), × tranche marginale.
        Proportionnel au CA → coût VARIABLE lui aussi.
     3. HEURES HORS-ATELIER — admin, courses, déplacements, prospection. Mesurées par la
        pointeuse, payées NULLE PART (ni coût de revient, ni charges fixes) : du bénévolat.

   RÈGLES FIGÉES ICI :
     A. `computePointMort` (v1323) n'est PAS modifiée — elle reste le moteur. On ne change
        que ce qu'on lui donne à manger. (Ses 25 assertions doivent rester vertes.)
     B. La marge de contribution déduit les TROIS coûts variables, dans cet ordre, et le
        détail affiché doit SOMMER au total (traçabilité : vérifiable à la main).
     C. La cascade a 4 marches monotones : le point mort ne peut que MONTER quand on ajoute
        un oubli. Un oubli qui ferait BAISSER le point mort serait un bug de signe.
     D. GARDE-FOU CRITIQUE ÉTENDU : une marge brute POSITIVE peut devenir une marge de
        contribution NÉGATIVE une fois l'URSSAF et l'impôt payés. Dans ce cas l'app doit
        refuser d'afficher un volume — c'est précisément le piège que v1323 masquait en
        affichant un chiffre rassurant et faux.
     E. Le temps hors-atelier N'EST JAMAIS INVENTÉ : sans pointage, on renvoie `fiable:false`
        (et surtout PAS 0 €, qui serait un mensonge : ces heures existent, elles ne sont
        simplement pas mesurées).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    const round3 = n => Math.round(n*1000)/1000;
    ${extractConstLine('SEUIL_HEURES_HORS_ATELIER')}
    ${extractFunction('computePointMort')}
    ${extractFunction('margeContributionUnitaire')}
    ${extractFunction('coutTempsHorsProdMensuel')}
    ${extractFunction('computePointMortVerite')}
    return { computePointMort, margeContributionUnitaire, coutTempsHorsProdMensuel, computePointMortVerite };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, tol, label){
  if(typeof actual==='number' && Math.abs(actual-expected) <= tol){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ~${expected} (±${tol})\n      obtenu : ${actual}`); }
}
function ok(cond, label){
  if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); }
}

console.log('\n=== TESTS DE CARACTÉRISATION — Vague 44 : le point mort disait la moitié de la vérité ===\n');

const M = buildModule();

// ---------------------------------------------------------------------------
// A. LA MARGE DE CONTRIBUTION — les trois déductions, et leur somme vérifiable
// ---------------------------------------------------------------------------
// Cas de référence, chiffres ronds pour que TOUT soit refaisable de tête :
//   prix 2,00 € · coût de revient 1,00 € · URSSAF 12,3 % · abattement 71 % · tranche 30 %
//   charges sociales = 2,00 × 12,3 %          = 0,246 → 0,25 €
//   base IR          = 2,00 × (1 − 0,71)      = 0,58 €
//   impôt            = 0,58 × 30 %            = 0,174 → 0,17 €
//   marge brute      = 2,00 − 1,00            = 1,00 €
//   marge contrib.   = 1,00 − 0,25 − 0,17     = 0,58 €
{
  const m = M.margeContributionUnitaire(2.00, 1.00, 12.3, 71, 30);
  eq(m.margeBrute, 1.00, 'A1 · marge brute = prix − coût de revient (ce que v1323 utilisait, seul)');
  eq(m.coutSocialUnit, 0.25, 'A2 · charges sociales = 12,3 % du PRIX (oubli n°1 : prélevé sur chaque euro encaissé)');
  eq(m.baseIrUnit, 0.58, 'A3 · base imposable micro-BIC = prix × (1 − abattement 71 %)');
  eq(m.coutIrUnit, 0.17, 'A4 · impôt = base × tranche marginale (oubli n°2 : proportionnel au CA)');
  eq(m.margeContribution, 0.58, 'A5 · marge de contribution = brute − social − impôt');

  // TRAÇABILITÉ (règle B) : le détail affiché doit sommer au total, au centime près.
  const somme = Math.round((m.coutRevientUnit + m.coutSocialUnit + m.coutIrUnit + m.margeContribution)*100)/100;
  eq(somme, m.prixVenteMoyen, 'A6 · TRAÇABILITÉ : coût + social + impôt + marge = prix (le détail somme au total)');

  // La marge de contribution est nécessairement PLUS BASSE que la marge brute.
  ok(m.margeContribution < m.margeBrute, 'A7 · la marge de contribution est plus basse que la marge brute (sinon un oubli n\'a pas été déduit)');
}

// Tranche marginale à 0 % (non imposable) : l'impôt disparaît, mais PAS l'URSSAF.
{
  const m = M.margeContributionUnitaire(2.00, 1.00, 12.3, 71, 0);
  eq(m.coutIrUnit, 0, 'A8 · tranche 0 % (non imposable) → aucun impôt déduit');
  eq(m.margeContribution, 0.75, 'A9 · … mais l\'URSSAF reste déduite (1,00 − 0,25)');
}

// Robustesse : entrées absentes/négatives ne doivent pas produire de NaN.
{
  const m = M.margeContributionUnitaire(null, undefined, -5, 999, NaN);
  eq(m.prixVenteMoyen, 0, 'A10 · prix absent → 0 (pas de NaN)');
  eq(m.tauxSocialPct, 0, 'A11 · taux social négatif → borné à 0');
  eq(m.abattementIrPct, 100, 'A12 · abattement > 100 % → borné à 100');
  eq(m.margeContribution, 0, 'A13 · marge de contribution reste un nombre (jamais NaN)');
}

// ---------------------------------------------------------------------------
// B. LE TEMPS HORS-ATELIER — mesuré, jamais inventé
// ---------------------------------------------------------------------------
// Règle E : sans pointage, on N'INVENTE PAS 0 €. On dit qu'on ne sait pas.
{
  const t = M.coutTempsHorsProdMensuel([], 12);
  eq(t.fiable, false, 'B1 · aucune session pointée → fiable:false (on ne prétend PAS que le coût est nul)');
  ok(/pas encore chiffrer|nulle part/.test(t.raison||''), 'B2 · … et on explique pourquoi le point mort réel est plus haut qu\'affiché');
  eq(t.coutParMois, 0, 'B3 · le coût renvoyé est 0, mais accompagné de fiable:false (l\'appelant doit trancher)');
}

// Deux mois observés (01/03 → 30/04 = 61 j ≈ 2,03 mois), 20 h au total à 12 €/h = 240 €.
{
  const sessions = [
    { date:'2026-03-01', dureeHeures:6, activite:'Administratif' },              // taux → défaut 12
    { date:'2026-03-15', dureeMin:240,  activite:'Courses' },                    // 4 h, taux défaut
    { date:'2026-04-30', dureeHeures:10, activite:'Déplacements / livraisons' }  // 10 h, taux défaut
  ];
  const t = M.coutTempsHorsProdMensuel(sessions, 12);
  eq(t.fiable, true, 'B4 · sessions pointées → calcul fiable');
  eq(t.heuresTotal, 20, 'B5 · heures totales = 6 + 4 (240 min) + 10 (dureeMin accepté en repli de dureeHeures)');
  eq(t.coutTotal, 240, 'B6 · coût total = 20 h × 12 €/h (taux des réglages en repli)');
  near(t.moisObserves, 2.03, 0.02, 'B7 · fenêtre observée = du 1er au dernier jour pointé (61 j ≈ 2,03 mois)');
  near(t.coutParMois, 118.23, 0.5, 'B8 · coût MENSUEL = coût total ÷ mois observés (pas le total brut !)');

  // Ventilation : triée par coût décroissant, et la somme des activités = le total.
  eq(t.parActivite[0].activite, 'Déplacements / livraisons', 'B9 · ventilation triée par coût décroissant');
  const sommeAct = Math.round(t.parActivite.reduce((s,a)=>s+a.cout,0)*100)/100;
  eq(sommeAct, t.coutTotal, 'B10 · TRAÇABILITÉ : la somme des activités = le coût total');
}

// Le taux SAISI sur la session prime sur le taux par défaut.
{
  const t = M.coutTempsHorsProdMensuel([{ date:'2026-03-01', dureeHeures:10, tauxHoraire:20, activite:'Administratif' }], 12);
  eq(t.coutTotal, 200, 'B11 · le taux horaire saisi sur la session (20 €) prime sur le taux des réglages (12 €)');
}

// GARDE-FOU D'EXTRAPOLATION : 3 jours de pointage ne doivent pas produire un coût mensuel délirant.
// La fenêtre observée est plancher à 1 mois — sinon 10 h sur 2 jours = 150 h/mois extrapolées.
{
  const t = M.coutTempsHorsProdMensuel([
    { date:'2026-03-01', dureeHeures:5, activite:'Courses' },
    { date:'2026-03-02', dureeHeures:5, activite:'Courses' }
  ], 12);
  eq(t.moisObserves, 1, 'B12 · GARDE-FOU : fenêtre plancher à 1 mois (2 jours de pointage ne s\'extrapolent pas en 150 h/mois)');
  eq(t.coutParMois, 120, 'B13 · … donc 10 h × 12 € = 120 €/mois, et non un chiffre extrapolé absurde');
}

// Sessions vides / durées nulles : ignorées sans casser.
{
  const t = M.coutTempsHorsProdMensuel([null, { date:'2026-03-01', dureeHeures:0 }, undefined], 12);
  eq(t.fiable, false, 'B14 · sessions à durée nulle → traitées comme aucun pointage (pas de division par zéro)');
}

// ---------------------------------------------------------------------------
// C. LA CASCADE — 4 marches, monotones, entièrement attribuables
// ---------------------------------------------------------------------------
// Charges fixes 300 €/mois · temps hors-atelier 120 €/mois
// prix 2,00 € · coût de revient 1,00 € · URSSAF 12,3 % · abattement 71 % · tranche 30 %
//   marche 1 : 300 ÷ 1,00 = 300 macarons        (ce que v1323 affichait)
//   marche 2 : 300 ÷ 0,75 = 400 macarons        (+100 — l'URSSAF)
//   marche 3 : 300 ÷ 0,58 = 518 macarons        (+118 — l'impôt)
//   marche 4 : 420 ÷ 0,58 = 725 macarons        (+207 — tes heures hors-atelier)
{
  const V = M.computePointMortVerite({
    chargesFixesMensuelles: 300,
    coutTempsHorsProdMensuel: 120,
    prixVenteMoyen: 2.00,
    coutRevientUnit: 1.00,
    tauxSocialPct: 12.3,
    abattementIrPct: 71,
    trancheIrPct: 30
  });

  eq(V.cascade.length, 4, 'C1 · la cascade a exactement 4 marches');
  eq(V.cascade[0].pm.macaronsParMois, 300, 'C2 · marche 1 = le chiffre RASSURANT de v1323 (300 ÷ 1,00)');
  eq(V.cascade[1].pm.macaronsParMois, 400, 'C3 · marche 2 : + charges sociales → 300 ÷ 0,75 = 400');
  eq(V.cascade[2].pm.macaronsParMois, 518, 'C4 · marche 3 : + impôt sur le revenu → 300 ÷ 0,58 = 518 (arrondi supérieur)');
  eq(V.cascade[3].pm.macaronsParMois, 725, 'C5 · marche 4 : + heures hors-atelier → 420 ÷ 0,58 = 725');

  eq(V.reel.macaronsParMois, 725, 'C6 · le point mort RÉEL est la dernière marche');
  eq(V.ancien.macaronsParMois, 300, 'C7 · l\'ANCIEN chiffre reste exposé (on ne le remplace pas en silence)');
  eq(V.ecartMacarons, 425, 'C8 · l\'écart est chiffré : 425 macarons/mois que l\'app oubliait de demander');

  // RÈGLE C — MONOTONIE : ajouter un oubli ne peut que faire MONTER le point mort.
  const suite = V.cascade.map(m=>m.pm.macaronsParMois);
  ok(suite.every((n,i)=> i===0 || n >= suite[i-1]),
     'C9 · MONOTONIE : chaque marche est ≥ la précédente (un oubli qui ferait BAISSER le point mort serait un bug de signe)');

  // Le coût de structure est la somme explicite de ses deux composants.
  eq(V.coutStructureMensuel, 420, 'C10 · coût de structure = charges fixes (300) + temps hors-atelier (120)');
  eq(V.chargesFixesMensuelles, 300, 'C11 · … et chaque composant reste lisible séparément (traçabilité)');
  eq(V.coutTempsHorsProdMensuel, 120, 'C12 · … idem pour le temps hors-atelier');

  // Le rythme quotidien et le CA minimum suivent le chiffre RÉEL, pas l'ancien.
  eq(V.reel.macaronsParJour, 25, 'C13 · rythme quotidien = ceil(725 ÷ 30), calé sur le point mort réel');
  eq(V.reel.caMinimum, 1450, 'C14 · CA minimum = 725 × 2,00 € (calé sur le réel, pas sur l\'ancien)');
}

// ---------------------------------------------------------------------------
// D. LE GARDE-FOU CRITIQUE ÉTENDU — la marge brute ment, la contribution ne ment pas
// ---------------------------------------------------------------------------
// LE PIÈGE QUE v1323 MASQUAIT. Prix 1,50 € · coût de revient 1,20 €.
//   marge brute = 0,30 € → v1323 affichait un point mort confortable et RASSURANT.
//   Mais : URSSAF = 1,50 × 12,3 % = 0,18 € ; impôt = (1,50 × 0,29) × 30 % = 0,13 €
//   marge de contribution = 0,30 − 0,18 − 0,13 = −0,01 € → NÉGATIVE.
// Chaque macaron vendu fait perdre de l'argent. AUCUN volume ne sauve l'affaire.
{
  const V = M.computePointMortVerite({
    chargesFixesMensuelles: 300,
    coutTempsHorsProdMensuel: 0,
    prixVenteMoyen: 1.50,
    coutRevientUnit: 1.20,
    tauxSocialPct: 12.3,
    abattementIrPct: 71,
    trancheIrPct: 30
  });

  eq(V.marge.margeBrute, 0.30, 'D1 · la marge BRUTE est positive (0,30 €) — c\'est ce qui rassurait à tort');
  ok(V.marge.margeContribution < 0, 'D2 · … mais la marge de CONTRIBUTION est NÉGATIVE une fois l\'URSSAF et l\'impôt payés');

  eq(V.cascade[0].pm.atteignable, true, 'D3 · marche 1 (v1323) : « atteignable » — le chiffre rassurant et FAUX');
  ok(V.cascade[0].pm.macaronsParMois > 0, 'D4 · … v1323 affichait bel et bien un volume, sans le moindre avertissement');

  eq(V.reel.atteignable, false, 'D5 · GARDE-FOU : le point mort réel refuse d\'afficher un volume');
  eq(V.reel.macaronsParMois, null, 'D6 · … aucun nombre de macarons n\'est inventé');
  ok(/PERDRE|perdre/.test(V.reel.raison||''), 'D7 · … et la raison est explicite : chaque macaron vendu fait PERDRE de l\'argent');
  eq(V.ecartMacarons, null, 'D8 · l\'écart n\'a pas de sens quand le réel est inatteignable → null (pas 0, qui mentirait)');
  eq(V.atteignable, false, 'D9 · le verdict global suit le point mort réel, pas la marche rassurante');
}

// Cas limite : marge de contribution EXACTEMENT nulle → toujours inatteignable.
{
  // prix 1,00 · coût 0,60 · social 20 % (0,20) · abattement 50 % → base 0,50 · tranche 40 % (0,20)
  // contribution = 0,40 − 0,20 − 0,20 = 0,00
  const V = M.computePointMortVerite({
    chargesFixesMensuelles: 100, coutTempsHorsProdMensuel: 0,
    prixVenteMoyen: 1.00, coutRevientUnit: 0.60,
    tauxSocialPct: 20, abattementIrPct: 50, trancheIrPct: 40
  });
  eq(V.marge.margeContribution, 0, 'D10 · marge de contribution exactement nulle');
  eq(V.reel.atteignable, false, 'D11 · … marge nulle = inatteignable (vendre à l\'infini ne couvre pas 1 € de charge fixe)');
}

// ---------------------------------------------------------------------------
// E. NON-RÉGRESSION : le moteur v1323 n'a PAS bougé (règle A)
// ---------------------------------------------------------------------------
// computePointMortVerite ne fait que MIEUX NOURRIR computePointMort. Si le moteur avait été
// modifié, ces égalités casseraient — et les 25 assertions de la vague 43 avec elles.
{
  eq(M.computePointMort(300, 1.00, 2.00).macaronsParMois, 300, 'E1 · computePointMort(300 ; 1,00 €) = 300 — moteur v1323 intact');
  eq(M.computePointMort(300, -0.5, 2.00).atteignable, false, 'E2 · garde-fou marge négative de v1323 toujours en place');
  eq(M.computePointMort(0, 1.00, 2.00).macaronsParMois, 0, 'E3 · aucune charge fixe → point mort 0, comportement v1323 inchangé');

  // La marche 1 de la cascade DOIT être identique à un appel direct au moteur v1323 :
  // c'est la preuve qu'on n'a pas silencieusement changé l'ancien chiffre.
  const V = M.computePointMortVerite({
    chargesFixesMensuelles: 300, coutTempsHorsProdMensuel: 120,
    prixVenteMoyen: 2.00, coutRevientUnit: 1.00,
    tauxSocialPct: 12.3, abattementIrPct: 71, trancheIrPct: 30
  });
  eq(V.cascade[0].pm, M.computePointMort(300, 1.00, 2.00),
     'E4 · la marche 1 est EXACTEMENT l\'ancien calcul (v1323 reste vérifiable, il n\'est pas réécrit)');
}

// Aucune charge fixe ET aucun temps pointé : le point mort est 0, sans planter.
{
  const V = M.computePointMortVerite({
    chargesFixesMensuelles: 0, coutTempsHorsProdMensuel: 0,
    prixVenteMoyen: 2.00, coutRevientUnit: 1.00,
    tauxSocialPct: 12.3, abattementIrPct: 71, trancheIrPct: 30
  });
  eq(V.reel.macaronsParMois, 0, 'E5 · aucune charge de structure → point mort 0 (et non une division par zéro)');
  eq(V.coutStructureMensuel, 0, 'E6 · coût de structure nul');
}

// ---------------------------------------------------------------------------
// F. [v1332] « PRÉSENT » N'EST PAS « PLAUSIBLE »
// ---------------------------------------------------------------------------
// BUG SIGNALÉ PAR BENJAMIN. Son point mort affichait 78 macarons, avec 40,60 €/mois de temps
// hors-atelier — soit ~3 h 20 par mois. Pour TOUT l'administratif, les courses, les déplacements,
// la prospection et la prépa marché réunis, c'est moins de 50 minutes par semaine : manifestement
// sous-pointé. Or l'app déclarait ce calcul « fiable » dès qu'UNE SEULE session existait.
//
// Un chiffre bâti sur une mesure dérisoire n'est pas FIABLE — il est juste PRÉSENT. Confondre les
// deux, c'est fabriquer précisément la fausse confiance que toute cette série traque.
{
  // 40 h pointées sur 2 mois → 20 h/mois : plausible.
  const bon = M.coutTempsHorsProdMensuel([
    { date:'2026-03-01', dureeHeures:20, activite:'Administratif' },
    { date:'2026-04-30', dureeHeures:20, activite:'Courses' }
  ], 12);
  eq(bon.fiable, true, 'F1 · 20 h/mois pointées → fiable…');
  eq(bon.plausible, true, 'F2 · … ET plausible (au-dessus du plancher de 8 h/mois)');
  eq(bon.alerte, null, 'F3 · … donc aucune alerte');

  // LE CAS DE BENJAMIN : ~3,4 h/mois. Présent, mais pas crédible.
  const maigre = M.coutTempsHorsProdMensuel([
    { date:'2026-03-01', dureeHeures:3.5, activite:'Administratif' },
    { date:'2026-04-30', dureeHeures:3.3, activite:'Courses' }
  ], 12);
  eq(maigre.fiable, true, 'F4 · des heures SONT pointées → le calcul reste « fiable » au sens strict…');
  eq(maigre.plausible, false, 'F5 · … mais il n\'est PAS PLAUSIBLE : ~3,4 h/mois pour tout le hors-atelier');
  ok(/PLUS HAUT/.test(maigre.alerte||''),
     'F6 · … et l\'app le DIT : « ton point mort réel est PLUS HAUT que celui affiché »');

  // Le seuil est une frontière nette, pas un dégradé : on le fige.
  const pile = M.coutTempsHorsProdMensuel([{ date:'2026-03-01', dureeHeures:8, activite:'Admin' }], 12);
  eq(pile.plausible, true, 'F7 · exactement 8 h/mois → plausible (le seuil est inclusif)');
  const sous = M.coutTempsHorsProdMensuel([{ date:'2026-03-01', dureeHeures:7.9, activite:'Admin' }], 12);
  eq(sous.plausible, false, 'F8 · 7,9 h/mois → sous le seuil, on avertit');

  // Aucun pointage : le cas était DÉJÀ traité (v1324) — on ne le régresse pas.
  const rien = M.coutTempsHorsProdMensuel([], 12);
  eq(rien.fiable, false, 'F9 · aucun pointage → toujours `fiable:false` (comportement v1324 intact)');
}

// ---------------------------------------------------------------------------
// G. [v1332] LE TAUX DE SENSIBILITÉ — l'inconnue devient exploitable
// ---------------------------------------------------------------------------
// Plutôt que de subir l'incertitude sur le temps non pointé, on la CHIFFRE : combien de macarons
// chaque heure NON POINTÉE escamote-t-elle du point mort ? Réponse : taux horaire ÷ marge de
// contribution. C'est le contraire d'un chiffre inventé : c'est un TAUX exact, que Benjamin
// applique à SA propre estimation de ses heures. L'app donne le taux ; l'estimation lui appartient.
{
  // Marge de contribution = 0,58 € (cas de référence du bloc C). Taux horaire 12 €/h.
  // 12 ÷ 0,58 = 20,7 → 21 macarons par heure non pointée.
  const V = M.computePointMortVerite({
    chargesFixesMensuelles: 300, coutTempsHorsProdMensuel: 120,
    prixVenteMoyen: 2.00, coutRevientUnit: 1.00,
    tauxSocialPct: 12.3, abattementIrPct: 71, trancheIrPct: 30,
    tauxHoraire: 12
  });
  eq(V.marge.margeContribution, 0.58, 'G1 · marge de contribution de référence : 0,58 €');
  eq(V.macaronsParHeureHorsAtelier, 21,
     'G2 · chaque heure hors-atelier NON pointée escamote 21 macarons (12 € ÷ 0,58 €, arrondi au supérieur)');
  eq(V.tauxHoraire, 12, 'G3 · le taux horaire est exposé (traçabilité : on peut refaire le calcul)');

  // Sans taux horaire, on n'invente pas.
  const sansTaux = M.computePointMortVerite({
    chargesFixesMensuelles: 300, coutTempsHorsProdMensuel: 0,
    prixVenteMoyen: 2.00, coutRevientUnit: 1.00,
    tauxSocialPct: 12.3, abattementIrPct: 71, trancheIrPct: 30
  });
  eq(sansTaux.macaronsParHeureHorsAtelier, null,
     'G4 · aucun taux horaire → aucun taux de sensibilité (on n\'invente pas)');

  // Marge de contribution NÉGATIVE : le taux n'a plus de sens (aucun volume ne sauve).
  const perte = M.computePointMortVerite({
    chargesFixesMensuelles: 300, coutTempsHorsProdMensuel: 0,
    prixVenteMoyen: 1.50, coutRevientUnit: 1.20,
    tauxSocialPct: 12.3, abattementIrPct: 71, trancheIrPct: 30,
    tauxHoraire: 12
  });
  eq(perte.macaronsParHeureHorsAtelier, null,
     'G5 · marge de contribution négative → pas de taux (une division par un nombre négatif n\'a aucun sens ici)');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
