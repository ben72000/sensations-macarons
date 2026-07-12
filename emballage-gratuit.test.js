/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 46 : L'EMBALLAGE ÉTAIT GRATUIT
   ----------------------------------------------------------------------------
   ANGLE MORT COMBLÉ (déclaré en vague 45). Dans `revenuHoraireCalcul`, la variable
   `coutEmballages` était initialisée à 0… et n'était JAMAIS calculée. Il n'y avait, à
   l'endroit du calcul, que ce commentaire :

       « emballages : estimés via coût d'emballage moyen par macaron vendu (table packaging)
         approche prudente : si non calculable finement, laissé à 0 (n'invente pas). »

   MAIS METTRE 0 N'EST PAS S'ABSTENIR. C'est affirmer que l'emballage ne coûte rien. Chaque
   coffret, chaque ruban, chaque sachet acheté par Benjamin sortait GRATUIT du numérateur —
   et son revenu horaire s'en trouvait SURESTIMÉ. « N'invente pas » servait de justification
   à un chiffre inventé : zéro.

   Le plus frustrant : l'app SAIT chiffrer un emballage. Elle le fait déjà par commande
   (computeOrderMargins.coutEmb — hiérarchie FIFO réelle, ratio d'estimation pour les
   reprises) et par marché (marketTotals.coutEmb — stock avant − après). Le revenu horaire
   ne le lui avait simplement jamais demandé.

   RÈGLES FIGÉES ICI :
     A. L'EMBALLAGE SUIT L'ENCAISSEMENT, comme le CA. Le revenu horaire raisonne en
        TRÉSORERIE : une commande encaissée à 50 % sur la fenêtre n'y apporte que 50 % de son
        CA — elle ne doit donc y apporter que 50 % de son carton. Compter 100 % de l'emballage
        en face de 50 % de la recette fabriquerait une FAUSSE PERTE.
     B. Un marché clos est encaissé le jour même, en totalité : AUCUN prorata.
     C. GARDE-FOU : la part encaissée est bornée à 1. Un trop-perçu ou un arrondi ne doit
        jamais faire compter 130 % d'un carton.
     D. HONNÊTETÉ DE LA SOURCE : on distingue ce qui est MESURÉ (FIFO / stock) de ce qui est
        ESTIMÉ (commandes de reprise sans détail d'emballage). mesure + estime = total, au
        centime. Un chiffre estimé qu'on présente comme mesuré est un mensonge de plus.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    ${extractFunction('coutEmballagesFenetre')}
    return coutEmballagesFenetre;
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }

console.log('\n=== TESTS DE CARACTÉRISATION — Vague 46 : l\'emballage était gratuit ===\n');

const coutEmballagesFenetre = buildModule();

// ---------------------------------------------------------------------------
// A. LE CAS SIMPLE — une commande entièrement encaissée
// ---------------------------------------------------------------------------
{
  const r = coutEmballagesFenetre(
    [{ label:'Commande #1', encaisse:100, montant:100, coutEmb:12, coutEmbEstime:0 }], []);
  eq(r.total, 12, 'A1 · commande payée en totalité → 100 % de son emballage est compté');
  eq(r.estime, 0, 'A2 · … rien d\'estimé');
  eq(r.mesure, 12, 'A3 · … tout est mesuré au réel');
  eq(r.partEstimee, 0, 'A4 · part estimée = 0 %');
  eq(r.detail.length, 1, 'A5 · le détail expose la ligne (traçabilité)');
}

// ---------------------------------------------------------------------------
// B. LA RÈGLE QUI COMPTE — l'emballage suit l'encaissement (règle A)
// ---------------------------------------------------------------------------
// C'EST LE CŒUR DE CETTE VAGUE. Le revenu horaire est un calcul de TRÉSORERIE : il ne compte
// que l'argent REÇU sur la fenêtre. Si une commande de 200 € n'est payée qu'à moitié (100 €),
// elle n'apporte que 100 € de CA. Lui opposer 100 % de son carton (20 €) créerait une perte
// qui n'existe pas : on mettrait tout le coût en face d'une moitié de recette.
{
  const r = coutEmballagesFenetre(
    [{ label:'Commande #1', encaisse:100, montant:200, coutEmb:20, coutEmbEstime:0 }], []);
  eq(r.total, 10, 'B1 · commande payée à 50 % → 50 % de son emballage (10 € sur 20 €)');

  // La preuve par l'absurde : ce que donnerait la règle naïve « tout le carton, tout de suite ».
  const naif = 20;
  ok(naif > r.total, 'B2 · la règle naïve (100 % du carton) chargerait 20 € contre 100 € de CA…');
  ok(r.total / 100 === 20 / 200, 'B3 · … alors que la règle du prorata garde le MÊME ratio emballage/CA (10 % ici)');
}
{
  // Paiement partiel plus fin : 25 % encaissé.
  const r = coutEmballagesFenetre(
    [{ label:'Commande #1', encaisse:50, montant:200, coutEmb:20, coutEmbEstime:0 }], []);
  eq(r.total, 5, 'B4 · 25 % encaissé → 25 % de l\'emballage (5 € sur 20 €)');
}
{
  // GARDE-FOU (règle C) : trop-perçu / arrondi → on ne compte JAMAIS plus de 100 % du carton.
  const r = coutEmballagesFenetre(
    [{ label:'Commande #1', encaisse:250, montant:200, coutEmb:20, coutEmbEstime:0 }], []);
  eq(r.total, 20, 'B5 · GARDE-FOU : encaissé > montant (trop-perçu) → l\'emballage reste borné à 100 %');
}

// ---------------------------------------------------------------------------
// C. LES MARCHÉS — encaissés le jour même, aucun prorata (règle B)
// ---------------------------------------------------------------------------
{
  const r = coutEmballagesFenetre([], [{ label:'Marché de Noël', coutEmb:35, coutEmbEstime:0 }]);
  eq(r.total, 35, 'C1 · marché clos → 100 % de son emballage (vente encaissée le jour même)');
  eq(r.detail[0].label, 'Marché de Noël', 'C2 · le marché est nommé dans le détail');
}
{
  // Mélange des deux canaux : commandes (au prorata) + marchés (en totalité).
  const r = coutEmballagesFenetre(
    [{ label:'Commande #1', encaisse:100, montant:200, coutEmb:20, coutEmbEstime:0 },
     { label:'Commande #2', encaisse:60,  montant:60,  coutEmb:6,  coutEmbEstime:0 }],
    [{ label:'Marché', coutEmb:35, coutEmbEstime:0 }]);
  eq(r.total, 51, 'C3 · les deux canaux s\'additionnent : 10 (prorata) + 6 (intégral) + 35 (marché)');
  eq(r.detail.length, 3, 'C4 · chaque source reste une ligne traçable');
  eq(r.detail[0].montant, 35, 'C5 · le détail est trié par montant décroissant (le plus lourd d\'abord)');

  // TRAÇABILITÉ : la somme du détail affiché = le total annoncé, au centime.
  const somme = Math.round(r.detail.reduce((s,x)=>s+x.montant,0)*100)/100;
  eq(somme, r.total, 'C6 · TRAÇABILITÉ : la somme des lignes du détail = le total (vérifiable à la main)');
}

// ---------------------------------------------------------------------------
// D. MESURÉ vs ESTIMÉ — ne jamais faire passer une estimation pour une mesure (règle D)
// ---------------------------------------------------------------------------
{
  // Une commande de reprise (migration d'historique) n'a pas de détail d'emballage :
  // son coût est ESTIMÉ via un ratio. Il faut le dire.
  const r = coutEmballagesFenetre(
    [{ label:'Reprise histo', encaisse:100, montant:100, coutEmb:9, coutEmbEstime:9 },
     { label:'Commande #2',   encaisse:100, montant:100, coutEmb:11, coutEmbEstime:0 }], []);
  eq(r.total, 20, 'D1 · total = 20 € (9 € estimés + 11 € mesurés)');
  eq(r.estime, 9, 'D2 · la part ESTIMÉE est isolée : 9 €');
  eq(r.mesure, 11, 'D3 · la part MESURÉE est isolée : 11 €');
  eq(r.partEstimee, 45, 'D4 · soit 45 % du total qui repose sur une estimation');

  // Le détail marque la ligne estimée pour qu'elle soit signalée à l'écran (≈ vs 📦).
  const ligneEst = r.detail.find(x=>x.label==='Reprise histo');
  eq(ligneEst.estime, true, 'D5 · la ligne estimée est marquée comme telle dans le détail');
  const ligneMes = r.detail.find(x=>x.label==='Commande #2');
  eq(ligneMes.estime, false, 'D6 · la ligne mesurée n\'est PAS marquée estimée');

  // TRAÇABILITÉ (règle D) : mesuré + estimé = total, au centime.
  eq(Math.round((r.mesure + r.estime)*100)/100, r.total,
     'D7 · TRAÇABILITÉ : part mesurée + part estimée = total (aucun euro perdu en route)');
}
{
  // La part estimée suit AUSSI le prorata d'encaissement : une reprise payée à moitié
  // n'apporte que la moitié de son estimation. Sinon mesure + estime ≠ total.
  const r = coutEmballagesFenetre(
    [{ label:'Reprise histo', encaisse:50, montant:100, coutEmb:10, coutEmbEstime:10 }], []);
  eq(r.total, 5, 'D8 · reprise payée à 50 % → 5 € d\'emballage…');
  eq(r.estime, 5, 'D9 · … dont 5 € estimés (l\'estimation suit le MÊME prorata)');
  eq(r.mesure, 0, 'D10 · … et 0 € mesuré');
  eq(r.partEstimee, 100, 'D11 · 100 % de ce coût repose sur une estimation');
}

// ---------------------------------------------------------------------------
// E. ROBUSTESSE — aucun chiffre inventé, aucun NaN
// ---------------------------------------------------------------------------
{
  const r = coutEmballagesFenetre([], []);
  eq(r.total, 0, 'E1 · aucune vente sur la fenêtre → 0 € (et là, c\'est légitime)');
  eq(r.partEstimee, 0, 'E2 · … pas de division par zéro sur la part estimée');
  eq(r.detail.length, 0, 'E3 · … et un détail vide');
}
{
  const r = coutEmballagesFenetre(null, undefined);
  eq(r.total, 0, 'E4 · entrées absentes → 0 sans planter');
}
{
  // Commandes sans encaissement sur la fenêtre, ou sans emballage : ignorées proprement.
  const r = coutEmballagesFenetre(
    [{ label:'Non payée', encaisse:0, montant:100, coutEmb:12 },
     { label:'Sans emballage', encaisse:100, montant:100, coutEmb:0 },
     { label:'Montant nul', encaisse:50, montant:0, coutEmb:12 }], []);
  eq(r.total, 0, 'E5 · commande non encaissée / sans emballage / à montant nul → écartées');
  eq(r.detail.length, 0, 'E6 · … et absentes du détail (pas de ligne à 0 € parasite)');
}
{
  // Valeurs négatives ou aberrantes : bornées, jamais propagées.
  const r = coutEmballagesFenetre(
    [{ label:'Bizarre', encaisse:-50, montant:100, coutEmb:12 }], []);
  eq(r.total, 0, 'E7 · encaissement négatif → borné à 0, la ligne est écartée');
}

// ---------------------------------------------------------------------------
// F. L'EFFET SUR LE REVENU HORAIRE — l'ampleur du mensonge
// ---------------------------------------------------------------------------
// Reprise du cas de référence de la vague 45 : CA 1000 €, matières 300 €, charges fixes 100 €,
// 20 h pointées. Avec, cette fois, 80 € d'emballages RÉELS (coffrets + rubans).
{
  const r = coutEmballagesFenetre(
    [{ label:'Commandes', encaisse:600, montant:600, coutEmb:45, coutEmbEstime:0 }],
    [{ label:'Marché', coutEmb:35, coutEmbEstime:0 }]);
  eq(r.total, 80, 'F1 · 80 € d\'emballages sur la période (45 € de commandes + 35 € de marché)');

  const money2 = n => Math.round(n*100)/100;
  const margeAvecEmb  = money2(1000 - 300 - r.total - 100);   // 520 €  ← la vérité
  const margeSansEmb  = money2(1000 - 300 - 0        - 100);  // 600 €  ← ce qu'affichait l'app

  eq(margeSansEmb, 600, 'F2 · l\'ANCIEN calcul (emballage gratuit) : marge de 600 €');
  eq(margeAvecEmb, 520, 'F3 · le VRAI calcul : marge de 520 € (80 € de carton en moins)');

  const revAncien = money2(margeSansEmb / 20);   // 30,00 €/h
  const revVrai   = money2(margeAvecEmb / 20);   // 26,00 €/h
  eq(revAncien, 30, 'F4 · revenu horaire annoncé : 30,00 €/h');
  eq(revVrai, 26, 'F5 · revenu horaire réel : 26,00 €/h');
  ok(revAncien > revVrai, 'F6 · l\'emballage gratuit SURESTIMAIT toujours le revenu horaire (jamais l\'inverse)');
  eq(money2(revAncien - revVrai), money2(r.total / 20),
     'F7 · SIGNATURE : l\'écart vaut exactement le coût d\'emballage rapporté aux heures (4 €/h)');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
