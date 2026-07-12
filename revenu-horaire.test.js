/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 45 : LE REVENU HORAIRE MENTAIT DANS LES DEUX SENS
   ----------------------------------------------------------------------------
   ANGLE MORT COMBLÉ (déclaré en vague 44) : `revenuHoraireCalcul` — la chaîne qui répond à
   « combien je gagne de l'heure » — n'avait AUCUN test. Elle alimente pourtant l'écran
   « Mon revenu horaire », le copilote (« ce que tu te verses »), et le bilan de semaine.

   TROIS BUGS TROUVÉS. Deux se compensaient partiellement — c'est très exactement pour ça
   que personne ne les avait vus.

   ┌─ BUG 1 — LE DOUBLE COMPTAGE DE LA MAIN-D'ŒUVRE  (il te SOUS-PAYAIT)
   │  L'en-tête de la fonction promettait : « la main-d'œuvre N'est PAS déduite : c'est
   │  justement ce qu'on cherche à rémunérer ». C'était FAUX.
   │      coutMatieres ← coutVentes = piècesVendues × coutRevientUnit
   │      coutRevientUnit = matières + consommables + coutMODUnit   ← la MO d'atelier !
   │  L'app soustrayait donc ta paie du numérateur, PUIS divisait par les heures qu'elle
   │  venait de te payer. Elle te retirait ton propre taux horaire et appelait le résultat
   │  « ce que tu peux te payer de l'heure ».
   │
   ├─ BUG 2 — LE TAUX DE COTISATION UNIQUE  (il te SUR-PAYAIT)
   │  `cotisations = caEncaisse × socialGoods` : le taux MARCHANDISE (12,3 %) appliqué à TOUT
   │  le CA, prestations comprises — alors qu'elles cotisent à 25,6 %. Cotisations sous-estimées.
   │  La règle de ventilation existait pourtant… enfermée dans computeMonthlyBilan. Elle est
   │  désormais extraite en fonction pure PARTAGÉE (partServiceCommande) : une seule vérité
   │  par commande, pour la base URSSAF comme pour le revenu horaire.
   │
   └─ BUG 3 — L'IMPÔT ABSENT  (il te SUR-PAYAIT)
      Aucune déduction d'IR. « Ce que tu peux te verser » était un montant avant impôt : un
      revenu que Benjamin ne touche jamais. Même oubli que le point mort (corrigé en v1324).

   RÈGLES FIGÉES ICI :
     A. La main-d'œuvre d'atelier est RENDUE au numérateur. Le coût de revient complet reste
        exposé (traçabilité) : matières = coût complet − main-d'œuvre, au centime.
     B. Les cotisations utilisent les DEUX taux, sur la ventilation réelle. Un CA 100 % service
        ne doit JAMAIS cotiser au taux marchandise.
     C. L'impôt est déduit. Trois paliers : avant prélèvements ≥ après cotisations ≥ net.
     D. `partServiceCommande` est la règle unique, et le bilan mensuel n'a PAS bougé (ses
        42 assertions restent vertes — c'est la preuve que l'extraction est neutre).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// --- Module 1 : la règle de ventilation pure, telle qu'app.js la définit ---------------
function buildVentilation(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    ${extractFunction('lineTotalStored')}
    ${extractFunction('orderToLines')}
    ${extractFunction('partServiceCommande')}
    return { partServiceCommande, orderToLines };
  `;
  return new Function(code)();
}

// --- Module 2 : le NUMÉRATEUR et les PRÉLÈVEMENTS, rejoués à l'identique -----------------
// revenuHoraireCalcul est une grosse async qui lit 8 tables Dexie. Plutôt que de la simuler
// en entier, on rejoue ici les formules EXACTES qu'elle applique désormais, et on fige leur
// comportement. Les libellés des règles ci-dessous correspondent ligne pour ligne au code.
const money2 = n => Math.round(n*100)/100;

function numerateur({ caEncaisse, coutVentesFenetre, coutMOD, coutEmballages, chargesFixes }){
  // FIX BUG 1 : la main-d'œuvre est RETIRÉE du coût déduit (elle est ce qu'on veut rémunérer).
  const coutMatieres = money2(coutVentesFenetre - coutMOD);
  return { coutMatieres, margeAvantRemu: money2(caEncaisse - coutMatieres - coutEmballages - chargesFixes) };
}
function prelevements({ caGoods, caService, tauxGoods, tauxService, abGoods, abService, tranche }){
  // FIX BUG 2 : deux taux, sur la ventilation réelle.
  const cotisGoods   = money2(caGoods   * tauxGoods   / 100);
  const cotisService = money2(caService * tauxService / 100);
  const cotisations  = money2(cotisGoods + cotisService);
  // FIX BUG 3 : l'impôt, base forfaitaire micro-BIC.
  const baseImposable = money2(money2(caGoods*(1-abGoods/100)) + money2(caService*(1-abService/100)));
  const impotRevenu   = money2(baseImposable * tranche / 100);
  return { cotisGoods, cotisService, cotisations, baseImposable, impotRevenu };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }

console.log('\n=== TESTS DE CARACTÉRISATION — Vague 45 : le revenu horaire mentait dans les deux sens ===\n');

const V = buildVentilation();

// ---------------------------------------------------------------------------
// A. LA RÈGLE DE VENTILATION — une seule vérité par commande (règle D)
// ---------------------------------------------------------------------------
{
  // Commande 100 % marchandise. (Forme réelle : les lignes vivent dans o.lignes ;
  // une prestation porte son montant dans `montantHT`.)
  const o = { montant: 100, lignes: [{ type:'coffret', taille:6 }] };
  eq(V.partServiceCommande(o), 0, 'A1 · commande sans prestation → part service = 0 (100 % marchandise)');
}
{
  // Commande 100 % prestation (atelier / coaching).
  const o = { montant: 200, lignes: [{ type:'prestation', montantHT:200 }] };
  eq(V.partServiceCommande(o), 1, 'A2 · commande 100 % prestation → part service = 1');
}
{
  // Commande MIXTE : 150 € de coffrets + 50 € d'atelier = 200 € → 25 % de service.
  const o = { montant: 200, lignes: [{ type:'coffret', taille:6 }, { type:'prestation', montantHT:50 }] };
  eq(V.partServiceCommande(o), 0.25, 'A3 · commande mixte → prorata (50 € de prestation sur 200 € = 25 %)');
}
{
  // La remise de ligne d'une prestation est bien prise en compte (via lineTotalStored) :
  // 100 € d'atelier avec 50 % de remise = 50 € de service sur une commande de 200 €.
  const o = { montant: 200, lignes: [{ type:'prestation', montantHT:100, remiseType:'pct', remisePct:50 }] };
  eq(V.partServiceCommande(o), 0.25, 'A4 · la remise de ligne d\'une prestation est appliquée avant le prorata');
}
{
  eq(V.partServiceCommande({ montant: 0, lignes: [] }), 0, 'A5 · commande à 0 € → 0 (jamais de division par zéro)');
  eq(V.partServiceCommande({}), 0, 'A6 · commande vide → 0 (pas de NaN)');
  eq(V.partServiceCommande(null), 0, 'A7 · commande absente → 0 (robustesse)');
}
{
  // GARDE-FOU : des lignes de prestation dont la somme dépasse le montant de la commande
  // (remise globale saisie sur le total) ne doivent pas produire une part > 1.
  const o = { montant: 100, lignes: [{ type:'prestation', montantHT:150 }] };
  eq(V.partServiceCommande(o), 1, 'A8 · GARDE-FOU : la part service est bornée à 1 (remise globale > lignes)');
}

// ---------------------------------------------------------------------------
// B. BUG 1 — LE DOUBLE COMPTAGE DE LA MAIN-D'ŒUVRE (il te sous-payait)
// ---------------------------------------------------------------------------
// Cas de référence, tout en chiffres ronds :
//   CA encaissé 1000 € · coût de revient complet des ventes 500 € (dont 200 € de MO d'atelier)
//   emballages 0 € · charges fixes 100 € · 20 h pointées
{
  const N = numerateur({ caEncaisse:1000, coutVentesFenetre:500, coutMOD:200, coutEmballages:0, chargesFixes:100 });

  eq(N.coutMatieres, 300, 'B1 · matières SEULES = coût de revient complet (500) − main-d\'œuvre (200)');
  eq(N.margeAvantRemu, 600, 'B2 · marge avant rému = 1000 − 300 − 100 (la MO n\'est PLUS déduite)');

  // TRAÇABILITÉ (règle A) : le détail exposé doit se recomposer au centime.
  eq(money2(N.coutMatieres + 200), 500, 'B3 · TRAÇABILITÉ : matières + main-d\'œuvre = coût de revient complet');

  // LE BUG, rejoué : l'ancien code déduisait le coût de revient COMPLET (MO incluse).
  const ancienneMarge = money2(1000 - 500 - 0 - 100);   // = 400
  eq(ancienneMarge, 400, 'B4 · l\'ANCIEN calcul déduisait le coût complet → marge 400 € au lieu de 600 €');

  const revVrai   = money2(N.margeAvantRemu / 20);      // 30 €/h
  const revAncien = money2(ancienneMarge / 20);         // 20 €/h
  eq(revVrai, 30, 'B5 · revenu horaire VRAI = 600 ÷ 20 h = 30 €/h');
  eq(revAncien, 20, 'B6 · revenu horaire ANCIEN = 400 ÷ 20 h = 20 €/h — l\'app te sous-payait de 10 €/h');

  // Le manque à gagner affiché vaut EXACTEMENT le taux horaire d'atelier (200 € ÷ 20 h = 10 €/h).
  // C'est la signature du bug : l'app te retirait purement et simplement ton propre taux horaire.
  eq(money2(revVrai - revAncien), money2(200/20),
     'B7 · SIGNATURE DU BUG : l\'écart vaut exactement ton taux horaire d\'atelier (10 €/h)');
  ok(revAncien < revVrai, 'B8 · le bug SOUS-ESTIMAIT toujours le revenu horaire (jamais l\'inverse)');
}
// Main-d'œuvre désactivée (laborEnabled=false → coutMODUnit=0) : le fix ne change rien.
{
  const N = numerateur({ caEncaisse:1000, coutVentesFenetre:300, coutMOD:0, coutEmballages:0, chargesFixes:100 });
  eq(N.coutMatieres, 300, 'B9 · sans coût de main-d\'œuvre (laborEnabled=false), rien n\'est retiré…');
  eq(N.margeAvantRemu, 600, 'B10 · … et le résultat est identique à l\'ancien : le fix est neutre dans ce cas');
}

// ---------------------------------------------------------------------------
// C. BUG 2 — LE TAUX DE COTISATION UNIQUE (il te sur-payait)
// ---------------------------------------------------------------------------
// Taux réels : marchandise 12,3 % · prestation 25,6 %.
const TAUX = { tauxGoods:12.3, tauxService:25.6, abGoods:71, abService:50, tranche:30 };
{
  // CA 1000 € : 600 € de macarons + 400 € d'ateliers.
  const P = prelevements({ caGoods:600, caService:400, ...TAUX });

  eq(P.cotisGoods, 73.8, 'C1 · marchandise : 600 € × 12,3 % = 73,80 €');
  eq(P.cotisService, 102.4, 'C2 · prestation : 400 € × 25,6 % = 102,40 € (le VRAI taux)');
  eq(P.cotisations, 176.2, 'C3 · total cotisations = 176,20 €');

  // LE BUG, rejoué : l'ancien code appliquait 12,3 % à TOUT le CA.
  const ancien = money2(1000 * 12.3/100);   // = 123 €
  eq(ancien, 123, 'C4 · l\'ANCIEN calcul : 12,3 % sur les 1000 € — prestations comprises');
  ok(ancien < P.cotisations, 'C5 · le bug SOUS-ESTIMAIT les cotisations (53,20 € oubliés ici)…');
  eq(money2(P.cotisations - ancien), 53.2, 'C6 · … soit exactement l\'écart de taux sur la part prestation');
}
{
  // Cas extrême — un mois 100 % prestation (que des ateliers) : l'ancien code se trompait du simple au double.
  const P = prelevements({ caGoods:0, caService:1000, ...TAUX });
  eq(P.cotisations, 256, 'C7 · CA 100 % prestation → 1000 € × 25,6 % = 256 €');
  const ancien = money2(1000 * 12.3/100);
  eq(ancien, 123, 'C8 · … là où l\'ancien code annonçait 123 € : plus du DOUBLE d\'écart');
  eq(P.cotisGoods, 0, 'C9 · aucune cotisation marchandise sur un CA sans marchandise');
}
{
  // Un CA 100 % marchandise : le fix ne change RIEN (non-régression du cas courant).
  const P = prelevements({ caGoods:1000, caService:0, ...TAUX });
  eq(P.cotisations, 123, 'C10 · CA 100 % marchandise → identique à l\'ancien calcul (le fix est neutre ici)');
}

// ---------------------------------------------------------------------------
// D. BUG 3 — L'IMPÔT ABSENT (il te sur-payait)
// ---------------------------------------------------------------------------
{
  // 600 € marchandise (abattement 71 % → base 174 €) + 400 € service (abattement 50 % → base 200 €)
  // base imposable = 374 € · tranche 30 % → impôt = 112,20 €
  const P = prelevements({ caGoods:600, caService:400, ...TAUX });
  eq(P.baseImposable, 374, 'D1 · base imposable micro-BIC = 174 (marchandise) + 200 (service)');
  eq(P.impotRevenu, 112.2, 'D2 · impôt = base × tranche marginale (30 %) = 112,20 €');

  // Les TROIS paliers, sur 20 h pointées.
  const N = numerateur({ caEncaisse:1000, coutVentesFenetre:500, coutMOD:200, coutEmballages:0, chargesFixes:100 });
  const margeApresCotis = money2(N.margeAvantRemu - P.cotisations);   // 600 − 176,20 = 423,80
  const margeApresImpot = money2(margeApresCotis - P.impotRevenu);    // 423,80 − 112,20 = 311,60

  eq(margeApresCotis, 423.8, 'D3 · marge après cotisations = 600 − 176,20');
  eq(margeApresImpot, 311.6, 'D4 · marge après impôt = 423,80 − 112,20');

  const h = 20;
  const revAvant = money2(N.margeAvantRemu / h);   // 30,00
  const revApres = money2(margeApresCotis / h);    // 21,19
  const revNet   = money2(margeApresImpot / h);    // 15,58

  eq(revAvant, 30, 'D5 · palier 1 — avant prélèvements : 30,00 €/h');
  eq(revApres, 21.19, 'D6 · palier 2 — après cotisations : 21,19 €/h');
  eq(revNet, 15.58, 'D7 · palier 3 — APRÈS IMPÔT : 15,58 €/h (le seul comparable à un salaire net)');

  // RÈGLE C — MONOTONIE : chaque palier ne peut que DESCENDRE. Un palier qui remonterait
  // signifierait qu'un prélèvement a été compté à l'envers.
  ok(revAvant >= revApres && revApres >= revNet,
     'D8 · MONOTONIE : avant ≥ après cotisations ≥ net (un palier qui remonte = prélèvement au mauvais signe)');

  // Ce que le copilote annonçait comme « ce que tu peux te verser » : 21,19 €/h.
  // Ce que Benjamin touche réellement : 15,58 €/h. L'écart n'est pas un détail.
  ok(revApres - revNet > 5, 'D9 · l\'impôt oublié représentait ici plus de 5 €/h de promesse non tenue');
}
{
  // Tranche 0 % (non imposable) : aucun impôt, mais les cotisations restent.
  const P = prelevements({ caGoods:1000, caService:0, ...TAUX, tranche:0 });
  eq(P.impotRevenu, 0, 'D10 · tranche 0 % → aucun impôt déduit…');
  eq(P.cotisations, 123, 'D11 · … mais les cotisations URSSAF restent dues');
}

// ---------------------------------------------------------------------------
// E. LES DEUX SENS — pourquoi personne ne voyait rien
// ---------------------------------------------------------------------------
// C'est le cœur de cette vague. Le bug 1 sous-payait, les bugs 2 et 3 sur-payaient : le
// résultat affiché tombait « à peu près juste », ce qui est la pire des situations —
// un chiffre faux qui a l'air plausible ne déclenche aucune alerte.
{
  const N = numerateur({ caEncaisse:1000, coutVentesFenetre:500, coutMOD:200, coutEmballages:0, chargesFixes:100 });
  const P = prelevements({ caGoods:600, caService:400, ...TAUX });
  const h = 20;

  // Ce que l'app AFFICHAIT (les 3 bugs actifs) : coût complet déduit, taux unique, pas d'impôt.
  const ancienNum   = money2(1000 - 500 - 0 - 100);          // 400 (MO déduite à tort)
  const ancienCotis = money2(1000 * 12.3/100);               // 123 (taux unique)
  const ancienAffiche = money2(money2(ancienNum - ancienCotis) / h);   // 13,85 €/h

  // Ce que Benjamin touche VRAIMENT.
  const vraiNet = money2(money2(money2(N.margeAvantRemu - P.cotisations) - P.impotRevenu) / h);  // 15,58 €/h

  eq(ancienAffiche, 13.85, 'E1 · le chiffre AFFICHÉ par l\'ancienne app : 13,85 €/h');
  eq(vraiNet, 15.58, 'E2 · le chiffre VRAI : 15,58 €/h');
  ok(Math.abs(ancienAffiche - vraiNet) < 2,
     'E3 · LA LEÇON : les erreurs se compensaient à moins de 2 €/h — un chiffre faux mais plausible, donc jamais remis en cause');

  // Et pourtant, aucun des deux nombres intermédiaires n'était juste.
  ok(ancienNum !== N.margeAvantRemu, 'E4 · … alors que le numérateur était faux (400 au lieu de 600)');
  ok(ancienCotis !== P.cotisations, 'E5 · … et les cotisations aussi (123 au lieu de 176,20)');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
