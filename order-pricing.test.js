/* ============================================================
   TESTS DE CARACTÉRISATION — Vague 6 : prix de vente (CA commande)
   ------------------------------------------------------------
   Fige les helpers qui calculent le PRIX DE VENTE d'une ligne de
   commande — les briques qui composent le CA dans computeOrderMargins :
     - lineTotalStored  : montant net d'une ligne (toutes remises comprises),
       pour chaque type (coffret + surcharge parfums, événement, grand,
       vrac, don, prestation avec remise € ou %)
     - eventUnitPrice   : prix au macaron (événement simple vs pyramide)
     - pyraPrixUnit / pyraTotalLigne / pyraCoutLigne : pyramide louée vs vendue
     - accessoireDecoTotal : option déco (location, par pyramide)
     - bigPrice / vracPrixMacaron : tarifs grand format et vrac

   Ces helpers sont purs (constantes de prix + getSettings stubbé). On les
   extrait avec leurs VRAIES constantes de prix, pour un test fidèle.

   Note : computeOrderMargins (l'agrégation complète coût+marge) dépend de
   ~15 helpers et de caches globaux ; il reste déclaré angle mort plutôt
   que d'être simulé à moitié. On fige ici ses briques de CA, sûres.
   ============================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

// Taux/tarifs settings injectés (défauts réels de l'app).
const PRIX_MACARON_PRO_STD = 1.50;   // s.prixMacaronProStd (valeur d'exemple stable)
const PRIX_GRAND_FORMAT_PRO = 3.20;  // s.prixGrandFormatPro (= BIG_PRICE.pro par défaut)

function buildModule(){
  const money2 = extractConstLine('money2');
  const round3 = extractConstLine('round3');
  // Constantes de prix (mono-ligne) — valeurs réelles extraites d'app.js
  const BOX_PRICES       = extractConstLine('BOX_PRICES');
  const BOX_FLAVOR_LIMIT = extractConstLine('BOX_FLAVOR_LIMIT');
  const FLAVOR_SURCHARGE = extractConstLine('FLAVOR_SURCHARGE');
  const EVENT_PRICE      = extractConstLine('EVENT_PRICE');
  const EQUIP_PRICE      = extractConstLine('EQUIP_PRICE');
  const PYRA_PRICE       = extractConstLine('PYRA_PRICE');
  const ACCESS_DECO_PRICE= extractConstLine('ACCESS_DECO_PRICE');
  const BIG_PRICE        = extractConstLine('BIG_PRICE');
  // Helpers
  const eventUnitPrice    = extractFunction('eventUnitPrice');
  const pyraEstVente      = extractFunction('pyraEstVente');
  const pyraPrixUnit      = extractFunction('pyraPrixUnit');
  const pyraTotalLigne    = extractFunction('pyraTotalLigne');
  const pyraCoutLigne     = extractFunction('pyraCoutLigne');
  const accessoireDecoActif = extractFunction('accessoireDecoActif');
  const accessoireDecoTotal = extractFunction('accessoireDecoTotal');
  const bigPrice          = extractFunction('bigPrice');
  const vracPrixMacaron   = extractFunction('vracPrixMacaron');
  const lineTotalStored   = extractFunction('lineTotalStored');

  const code = `
    function getSettings(){ return { prixMacaronProStd: ${PRIX_MACARON_PRO_STD}, prixGrandFormatPro: ${PRIX_GRAND_FORMAT_PRO} }; }
    ${money2}
    ${round3}
    ${BOX_PRICES}
    ${BOX_FLAVOR_LIMIT}
    ${FLAVOR_SURCHARGE}
    ${EVENT_PRICE}
    ${EQUIP_PRICE}
    ${PYRA_PRICE}
    ${ACCESS_DECO_PRICE}
    ${BIG_PRICE}
    ${eventUnitPrice}
    ${pyraEstVente}
    ${pyraPrixUnit}
    ${pyraTotalLigne}
    ${pyraCoutLigne}
    ${accessoireDecoActif}
    ${accessoireDecoTotal}
    ${bigPrice}
    ${vracPrixMacaron}
    ${lineTotalStored}
    ({ eventUnitPrice, pyraPrixUnit, pyraTotalLigne, pyraCoutLigne,
       accessoireDecoTotal, bigPrice, vracPrixMacaron, lineTotalStored,
       BOX_PRICES, EQUIP_PRICE, EVENT_PRICE });
  `;
  return eval(code);
}
const M = buildModule();

let pass = 0, fail = 0; const failures = [];
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

// ============================================================================
// 1) lineTotalStored — COFFRET (prix de base + surcharge parfums au-delà de la limite)
// ============================================================================
// Coffret 16 : prix base 28 €, limite 4 parfums différents inclus.
// 4 parfums → pas de surcharge.
eq(M.lineTotalStored({ type:'coffret', taille:16,
    parfums:[{nom:'A',qte:4},{nom:'B',qte:4},{nom:'C',qte:4},{nom:'D',qte:4}] }),
   28, 'coffret 16, 4 parfums (= limite) → 28 € (pas de surcharge)');
// 6 parfums différents → 2 au-delà de la limite × 3 € = +6 → 34 €.
eq(M.lineTotalStored({ type:'coffret', taille:16,
    parfums:[{nom:'A',qte:3},{nom:'B',qte:3},{nom:'C',qte:3},{nom:'D',qte:3},{nom:'E',qte:2},{nom:'F',qte:2}] }),
   34, 'coffret 16, 6 parfums → 28 + 2×3 surcharge = 34 €');
// Prix unitaire appliqué explicite prime sur le tarif de base.
eq(M.lineTotalStored({ type:'coffret', taille:16, prixUnitaireApplique:25,
    parfums:[{nom:'A',qte:16}] }),
   25, 'coffret : prixUnitaireApplique (25) prime sur le tarif de base');
// Remise de ligne en % appliquée après.
eq(M.lineTotalStored({ type:'coffret', taille:6, parfums:[{nom:'A',qte:6}], remisePct:10 }),
   10.8, 'coffret 6 (12 €) − 10 % = 10,80 €');

// ============================================================================
// 2) lineTotalStored — PRESTATION (montantHT + remise € ou %)
// ============================================================================
eq(M.lineTotalStored({ type:'prestation', montantHT:300 }), 300, 'prestation : montantHT brut = 300');
eq(M.lineTotalStored({ type:'prestation', montantHT:300, remiseType:'euro', remiseEuro:50 }),
   250, 'prestation : remise 50 € → 250');
eq(M.lineTotalStored({ type:'prestation', montantHT:300, remisePct:20 }),
   240, 'prestation : remise 20 % → 240');
eq(M.lineTotalStored({ type:'prestation', montantHT:100, remiseType:'euro', remiseEuro:200 }),
   0, 'prestation : remise € plafonnée au montant (pas de négatif)');

// ============================================================================
// 3) lineTotalStored — DON (toujours gratuit)
// ============================================================================
eq(M.lineTotalStored({ type:'don', parfums:[{nom:'A',qte:10}] }), 0, 'don : toujours 0 €');

// ============================================================================
// 4) lineTotalStored — GRAND format (nb pièces × tarif)
// ============================================================================
// tarif particulier = 6,00 € ; 2 pièces → 12 €.
eq(M.lineTotalStored({ type:'grand', tarif:'particulier', items:[{nom:'Number cake',qte:2}] }),
   12, 'grand particulier : 2 × 6,00 = 12 €');
// tarif pro = 3,20 € (settings) ; 3 pièces → 9,60 €.
eq(M.lineTotalStored({ type:'grand', tarif:'pro', items:[{nom:'X',qte:3}] }),
   9.6, 'grand pro : 3 × 3,20 = 9,60 €');

// ============================================================================
// 5) lineTotalStored — VRAC (nb macarons × prix unitaire)
// ============================================================================
// proMode 'nonpro' → prix = BOX_PRICES[6]/6 = 12/6 = 2 €. 10 macarons → 20 €.
eq(M.lineTotalStored({ type:'vrac', proMode:'nonpro', parfums:[{nom:'A',qte:10}] }),
   20, 'vrac non-pro : 10 × (12/6) = 20 €');
// pro (défaut) → prixMacaronProStd = 1,50 €. 20 macarons + 5 sans parfum = 25 × 1,50 = 37,50 €.
eq(M.lineTotalStored({ type:'vrac', parfums:[{nom:'A',qte:20}], sansParfum:5 }),
   37.5, 'vrac pro : 25 × 1,50 = 37,50 €');

// ============================================================================
// 6) eventUnitPrice — événement simple vs pyramide
// ============================================================================
eq(M.eventUnitPrice({ equip:0 }), M.EVENT_PRICE, 'eventUnitPrice : sans pyramide = EVENT_PRICE (1,60)');
eq(M.eventUnitPrice({ equip:2 }), 1.60, 'eventUnitPrice : avec pyramide = PYRA_PRICE (1,60)');

// ============================================================================
// 7) Pyramide — location vs vente
// ============================================================================
// Location (défaut) : EQUIP_PRICE = 20 € / pyramide. 2 pyramides → 40 €. Coût = 0.
eq(M.pyraTotalLigne({ equip:2 }), 40, 'pyramide louée : 2 × 20 = 40 €');
eq(M.pyraCoutLigne({ equip:2 }), 0, 'pyramide louée : coût d\'achat = 0');
// Vente : prix libre pyraPrixVente = 55, coût d'achat 30. 1 pyramide.
eq(M.pyraTotalLigne({ equip:1, pyraVendue:true, pyraPrixVente:55 }), 55, 'pyramide vendue : prix libre = 55');
eq(M.pyraCoutLigne({ equip:1, pyraVendue:true, pyraPrixVente:55, pyraCoutAchat:30 }), 30, 'pyramide vendue : coût d\'achat = 30');

// ============================================================================
// 8) Accessoire décoratif — location par pyramide (17 €), 0 si pas de pyramide
// ============================================================================
eq(M.accessoireDecoTotal({ equip:2, accessoireDeco:true }), 34, 'accessoire déco : 2 pyramides × 17 = 34 €');
eq(M.accessoireDecoTotal({ equip:0, accessoireDeco:true }), 0, 'accessoire déco : sans pyramide → 0');
eq(M.accessoireDecoTotal({ equip:2, accessoireDeco:false }), 0, 'accessoire déco : option désactivée → 0');

// ============================================================================
// 9) bigPrice / vracPrixMacaron — tarifs de référence
// ============================================================================
eq(M.bigPrice('particulier'), 6.00, 'bigPrice particulier = 6,00');
eq(M.bigPrice('pro'), 3.20, 'bigPrice pro = 3,20 (settings)');
eq(M.vracPrixMacaron({ proMode:'nonpro' }), 2, 'vracPrixMacaron non-pro = 12/6 = 2');
eq(M.vracPrixMacaron({}), 1.50, 'vracPrixMacaron pro = prixMacaronProStd = 1,50');

// --- Rapport ----------------------------------------------------------------
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 6 : prix de vente (CA commande) ===\n');
if(failures.length){ console.log(failures.join('\n')); console.log(''); }
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail === 0){ console.log('✓ Comportement figé conforme. Aucune régression détectée.\n'); process.exit(0); }
else { console.log('✗ RÉGRESSION : un comportement figé a changé.\n'); process.exit(1); }
