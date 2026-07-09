/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 24 : computeOrderMargins (marge par commande)
   ----------------------------------------------------------------------------
   Fige le calcul de marge d'une commande : ventilation CA marchandise/service
   par type de ligne (coffret, prestation, don, histo), réconciliation entre le
   montant réellement assumé (o.montant) et les lignes reconstruites, charges
   sociales, marge nette. buildCoutRevientResolver, realPackagingCostMap,
   coffretEmbInfo, embMatUnitCost et computeDeliveryCost sont STUBBÉES (calcul de
   coût matière/emballage/livraison, hors périmètre de cette fonction — déjà
   couvertes ou trop coûteuses à reconstruire fidèlement ici) pour isoler
   strictement la logique de ventilation et de marge propre à computeOrderMargins.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(opts){
  opts = opts || {};
  const avgUnit = opts.avgUnit!=null ? opts.avgUnit : 1;        // coût moyen matière/pièce (stub simple)
  const coutEmbCoffret = opts.coutEmbCoffret!=null ? opts.coutEmbCoffret : 0.5;   // coût emballage par coffret (stub)
  const livraison = opts.livraison || { actif:false, total:0 };

  const money2 = extractConstLine('money2');
  const orderToLines = extractFunction('orderToLines');
  const lineTotalStored = extractFunction('lineTotalStored');
  const eventUnitPrice = extractFunction('eventUnitPrice');
  const pyraEstVente = extractFunction('pyraEstVente');
  const pyraCoutLigne = extractFunction('pyraCoutLigne');
  const pyraTotalLigne = extractFunction('pyraTotalLigne');
  const pyraPrixUnit = extractFunction('pyraPrixUnit');
  const accessoireDecoActif = extractFunction('accessoireDecoActif');
  const accessoireDecoTotal = extractFunction('accessoireDecoTotal');
  const computeOrderMargins = extractFunction('computeOrderMargins');
  const code = `
    const window = {};
    const EVENT_PRICE = 1.60, PYRA_PRICE = 1.60, ACCESS_DECO_PRICE = 17;
    const BOX_PRICES = { 6: 12, 8: 16, 16: 28, 25: 42 };
    const BOX_FLAVOR_LIMIT = { 6: 3, 8: 4, 16: 4, 25: 5 };
    const FLAVOR_SURCHARGE = 3;
    ${money2}
    ${orderToLines}
    ${lineTotalStored}
    ${eventUnitPrice}
    ${pyraEstVente}
    ${pyraCoutLigne}
    ${pyraPrixUnit}
    ${pyraTotalLigne}
    ${accessoireDecoActif}
    ${accessoireDecoTotal}
    function getSettings(){ return { socialGoods:12.3, socialService:25.6 }; }
    // Stubs : coût matière/emballage/livraison hors périmètre de cette vague.
    function buildCoutRevientResolver(){
      return {
        avgUnit: ${avgUnit}, avgMOD: 0,
        unitPourParfum: (nom) => ({ resolved:false })   // tous parfums "non résolus" par défaut
                                                          // → coût moyen assumé, comportement simple et stable
      };
    }
    function realPackagingCostMap(){ return {}; }
    function coffretEmbInfo(){ return { cout: ${coutEmbCoffret} }; }
    function embMatUnitCost(){ return 0; }
    function consoGrandFormatSupplement(){ return 0; }
    function computeDeliveryCost(o){ return ${JSON.stringify(livraison)}; }
    ${computeOrderMargins}
    return computeOrderMargins;
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, label, tol=0.02){
  if(Math.abs(actual-expected)<=tol){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu ≈ ${expected}\n      obtenu   : ${actual}`); }
}

function run(){

// ── CAS 1 — Commande PRESTATION pure : tout en caService, rien en coûts matière/emballage ──
{
  const cm = buildModule({});
  const o = { montant:150, lignes:[{type:'prestation', montantHT:150}] };
  const r = cm(o, [], [], []);
  eq(r.caService, 150, 'CAS1 · prestation pure : CA entièrement en service');
  eq(r.caGoods, 0, 'CAS1 · aucune part marchandise');
  eq(r.coutMat, 0, 'CAS1 · aucun coût matière (prestation = pas de macaron)');
}

// ── CAS 2 — Commande COFFRET simple : CA en marchandise ; parfum NON résolu (mode vente, pas don)
//    → compté dans piecesNonResolues, coutMat réel reste à 0 (rien à valoriser sans recette rattachée),
//    coutMatMoyenne (comparatif) suit quand même le coût moyen théorique.
{
  const cm = buildModule({ avgUnit:0.30, coutEmbCoffret:0.5 });
  const o = { montant:20, lignes:[{type:'coffret', taille:16, parfums:[{nom:'Chocolat',qte:16}]}] };
  const r = cm(o, [], [], []);
  eq(r.caGoods, 20, 'CAS2 · coffret : CA entièrement en marchandise');
  eq(r.coutMat, 0, 'CAS2 · coutMat RÉEL = 0 (parfum non résolu en mode vente → pas valorisé, signalé à part)');
  near(r.coutMatMoyenne, 4.8, 'CAS2 · coutMatMoyenne (comparatif) = 16 × 0.30 = 4.8, suit quand même la moyenne');
  eq(r.coutEmb, 0.5, 'CAS2 · coût emballage = coût coffret stubbé (0.5)');
  eq(r.piecesNonResolues, 16, 'CAS2 · les 16 pièces sont comptées "non résolues" (aucune recette rattachée dans ce stub)');
}

// ── CAS 3 — Charges sociales : taux DISTINCTS marchandise (12.3%) vs service (25.6%) ──
{
  const cm = buildModule({ avgUnit:0 });
  const o = { montant:1000, lignes:[
    {type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]},   // 1000€... on simplifie : une seule ligne testée à la fois
  ]};
  // Test isolé marchandise pure
  const oGoods = { montant:100, lignes:[{type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]}] };
  const rGoods = cm(oGoods, [], [], []);
  near(rGoods.chargesSociales, 100*0.123, 'CAS3a · charges sociales sur marchandise pure = CA × 12.3%');
  // Test isolé service pur
  const oSvc = { montant:100, lignes:[{type:'prestation', montantHT:100}] };
  const rSvc = cm(oSvc, [], [], []);
  near(rSvc.chargesSociales, 100*0.256, 'CAS3b · charges sociales sur service pur = CA × 25.6%');
}

// ── CAS 4 — DON : coût matière valorisé à la moyenne (parfum non résolu → mode don), CA = 0 (offert) ──
{
  const cm = buildModule({ avgUnit:0.40 });
  const o = { montant:0, lignes:[{type:'don', parfums:[{nom:'Vanille',qte:10}]}] };
  const r = cm(o, [], [], []);
  eq(r.caGoods, 0, 'CAS4 · un don n\'a pas de CA (offert)');
  near(r.coutMat, 4, 'CAS4 · coût matière du don = 10 × 0.40 (valorisé à la moyenne, mode don)');
  eq(r.piecesNonResolues, 0, 'CAS4 · en mode don, un parfum non résolu n\'est PAS compté à part (valorisé quand même)');
}

// ── CAS 5 — HISTO (reprise) : CA = o.montant intégral, coût matière estimé (pieces × moyenne) ──
{
  const cm = buildModule({ avgUnit:0.35 });
  const o = { montant:50, lignes:[{type:'histo', parfums:[{nom:'?',qte:20}]}] };
  const r = cm(o, [], [], []);
  eq(r.caGoods, 50, 'CAS5 · reprise : CA = montant intégral de la commande');
  near(r.coutMat, 7, 'CAS5 · coût matière estimé = 20 pièces × 0.35 (moyenne assumée)');
}

// ── CAS 6 — Réconciliation : montant réel > lignes reconstruites → écart affecté en marchandise ──
{
  const cm = buildModule({ avgUnit:0 });
  // Ligne coffret valant normalement moins que le montant réellement assumé (prix ajusté à la main).
  const o = { montant:30, lignes:[{type:'coffret', taille:16, parfums:[{nom:'A',qte:16}], prixUnitaireApplique:20}] };
  const r = cm(o, [], [], []);
  eq(r.ca, 30, 'CAS6 · le CA de référence est TOUJOURS o.montant (réel assumé), pas la reconstruction des lignes');
}

// ── CAS 7 — Marge nette : marge brute − charges sociales, cohérente algébriquement ──
{
  const cm = buildModule({ avgUnit:0.2, coutEmbCoffret:1 });
  const o = { montant:50, lignes:[{type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]}] };
  const r = cm(o, [], [], []);
  near(r.margeBrute, r.ca - r.coutMat - r.coutEmb, 'CAS7 · margeBrute = CA - coutMat - coutEmb (cohérence algébrique)');
  near(r.margeNette, r.margeBrute - r.chargesSociales, 'CAS7 · margeNette = margeBrute - chargesSociales');
}

// ── CAS 8 — Livraison : bénéfice net = frais facturés − coût réel de la tournée ──
{
  const cm = buildModule({ avgUnit:0, livraison:{ actif:true, total:8 } });
  const o = { montant:50, fraisLivraison:15, lignes:[{type:'coffret', taille:16, parfums:[{nom:'A',qte:16}]}] };
  const r = cm(o, [], [], []);
  eq(r.livBenefice, 7, 'CAS8 · bénéfice livraison = 15 facturés - 8 de coût réel = 7 (positif, la livraison rapporte)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 24 : computeOrderMargins ===\n');
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
