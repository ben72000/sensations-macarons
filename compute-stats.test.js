/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 26 : computeStats (agrégation ventes globale/client)
   ----------------------------------------------------------------------------
   Fonction pure (orders/clients/toLines injectés par l'appelant, aucune dépendance
   Dexie/async) — la plus utilisée des compute* restantes (11 appels). Fige
   l'agrégation par parfum/produit/mois, la ventilation standard vs grand format
   (coques-équivalent), et le filtre strict "commandes payées uniquement".
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const GF_COQUE_RATIO = extractConstLine('GF_COQUE_RATIO');
  const computeStats = extractFunction('computeStats');
  const code = `
    ${GF_COQUE_RATIO}
    ${computeStats}
    return computeStats;
  `;
  return new Function(code)();
}

// toLines simplifié : lit directement o.lignes (comme orderToLines pour le cas standard).
function toLines(o){ return o.lignes || []; }

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

function run(){
const computeStats = buildModule();

// ── CAS 1 — Filtre strict : seules les commandes PAYÉES entrent dans les stats ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, paiement:'Payé', lignes:[{type:'coffret', taille:16, parfums:[{nom:'Chocolat',qte:16}]}] },
    { id:2, clientId:1, date:'2026-05-02', montant:999, paiement:'En attente', lignes:[{type:'coffret', taille:16, parfums:[{nom:'Vanille',qte:16}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'}], toLines);
  eq(r.nbValides, 1, 'CAS1 · une seule commande payée comptée');
  eq(r.global.caTotal, 20, 'CAS1 · CA total = seule la commande payée (20), pas 999');
  eq(r.global.parfums.Vanille, undefined, 'CAS1 · le parfum de la commande NON payée n\'apparaît pas du tout');
}

// ── CAS 2 — Agrégation parfum : coffret standard, macaronsStd et coquesEquiv incrémentés à 1:1 ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, paiement:'Payé', lignes:[{type:'coffret', taille:16, parfums:[{nom:'Chocolat',qte:10},{nom:'Citron',qte:6}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'}], toLines);
  eq(r.global.parfums.Chocolat, 10, 'CAS2 · 10 macarons Chocolat agrégés');
  eq(r.global.parfums.Citron, 6, 'CAS2 · 6 macarons Citron agrégés');
  eq(r.global.nbMacarons, 16, 'CAS2 · total macarons = 10+6 = 16');
  eq(r.global.macaronsStd, 16, 'CAS2 · tous comptés en standard (coffret classique)');
  eq(r.global.coquesEquiv, 16, 'CAS2 · coques-équivalent = 1:1 pour du standard');
  eq(r.global.coffretsTaille[16], 1, 'CAS2 · un coffret de taille 16 comptabilisé');
}

// ── CAS 3 — Grand format : ratio coques-équivalent = GF_COQUE_RATIO (3.5), pas 1:1 ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:60, paiement:'Payé', lignes:[{type:'grand', items:[{nom:'Entremets Chocolat',qte:2}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'}], toLines);
  eq(r.global.nbGrandsFormats, 2, 'CAS3 · 2 pièces grand format comptées');
  eq(r.global.macaronsStd, 0, 'CAS3 · aucun standard (uniquement du grand format)');
  eq(r.global.coquesEquiv, 7, 'CAS3 · coques-équivalent = 2 × 3.5 = 7 (volume de production réel)');
}

// ── CAS 4 — Reprise (histo) : alimente parfums/macarons mais AUCUN produit/coffret fictif ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:30, paiement:'Payé', lignes:[{type:'histo', parfums:[{nom:'Pistache',qte:12}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'}], toLines);
  eq(r.global.parfums.Pistache, 12, 'CAS4 · reprise : parfum bien agrégé pour les tendances');
  eq(Object.keys(r.global.produits).length, 0, 'CAS4 · AUCUN produit fictif créé pour une reprise (pas de faux "Coffret X")');
  eq(r.global.macaronsStd, 12, 'CAS4 · reprise comptée en standard (la migration ne distingue pas le grand format)');
}

// ── CAS 5 — Don : 0€ de CA mais consommation de stock réelle comptée (parfums) ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:0, paiement:'Payé', lignes:[{type:'don', parfums:[{nom:'Café',qte:4}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'}], toLines);
  eq(r.global.caTotal, 0, 'CAS5 · un don ne génère aucun CA');
  eq(r.global.parfums.Café, 4, 'CAS5 · mais la consommation de stock (4 macarons) est bien tracée');
}

// ── CAS 6 — Agrégation PAR CLIENT : chaque client a ses propres compteurs, indépendants du global ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-05-01', montant:20, paiement:'Payé', lignes:[{type:'coffret', taille:16, parfums:[{nom:'Chocolat',qte:16}]}] },
    { id:2, clientId:2, date:'2026-05-02', montant:25, paiement:'Payé', lignes:[{type:'coffret', taille:16, parfums:[{nom:'Vanille',qte:16}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'},{id:2,nom:'Client B'}], toLines);
  eq(r.parClient[1].ca, 20, 'CAS6 · client 1 : CA propre (20), pas le total global (45)');
  eq(r.parClient[2].ca, 25, 'CAS6 · client 2 : CA propre (25)');
  eq(r.parClient[1].parfums.Vanille, undefined, 'CAS6 · le parfum du client 2 n\'apparaît pas dans les stats du client 1');
  eq(r.global.caTotal, 45, 'CAS6 · le global cumule bien les deux (20+25=45)');
}

// ── CAS 7 — Agrégation par mois : ventilation correcte sur plusieurs mois ──
{
  const orders = [
    { id:1, clientId:1, date:'2026-04-15', montant:20, paiement:'Payé', lignes:[{type:'coffret', taille:8, parfums:[{nom:'A',qte:8}]}] },
    { id:2, clientId:1, date:'2026-05-15', montant:30, paiement:'Payé', lignes:[{type:'coffret', taille:8, parfums:[{nom:'A',qte:8}]}] }
  ];
  const r = computeStats(orders, [{id:1,nom:'Client A'}], toLines);
  eq(r.global.parMois['2026-04'].ca, 20, 'CAS7 · CA avril isolé (20)');
  eq(r.global.parMois['2026-05'].ca, 30, 'CAS7 · CA mai isolé (30), pas mélangé avec avril');
}

// ── CAS 8 — Client anonyme (clientId absent) : regroupé sous la clé 0, pas de crash ──
{
  const orders = [
    { id:1, date:'2026-05-01', montant:15, paiement:'Payé', lignes:[{type:'coffret', taille:6, parfums:[{nom:'A',qte:6}]}] }
  ];
  const r = computeStats(orders, [], toLines);
  eq(r.parClient[0].ca, 15, 'CAS8 · commande sans clientId regroupée sous la clé 0, pas de crash');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 26 : computeStats ===\n');
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
