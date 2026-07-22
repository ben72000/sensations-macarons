/* ============================================================
   TESTS — v1400 : PRÉCISION DU PRIX UNITAIRE DE LOT
   ------------------------------------------------------------
   LE BUG (vu par Ben, capture « Réception d'un lot ») : 31,92 € pour 1600 g
   affichait « 0,02 € / g ». Or 31,92/1600 = 0,01995. Le prix unitaire était
   STOCKÉ arrondi à 2 décimales (money2) → 0,02 €/g en base, réutilisé par
   lotPU dans les calculs de coût. Sur des matières chères au gramme, cet
   arrondi fausse les marges. C'est la « source dédoublée qui diverge » (un
   prixUnitaire arrondi redondant à côté de prix+qteInitiale exacts).

   CE QUE CE TEST GÈLE :
     1. saveLot ne stocke plus prixUnitaire via money2 (plus d'arrondi 2 déc.).
     2. lotPU reconstitue un prix unitaire précis depuis prix/qteInitiale.
     3. euroPrec affiche assez de décimales pour un prix au gramme (< 1 €).
   ============================================================ */
'use strict';
const { extractFunction, stripComments, extractConstLine } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1400 : précision du prix unitaire de lot ===\n');

// 1. garde statique : saveLot ne stocke plus prixUnitaire arrondi
{
  const src = stripComments(extractFunction('saveLot'));
  ok(/prixUnitaire:\s*qte>0\s*\?\s*\(prix\/qte\)/.test(src),
     '1 · saveLot stocke prixUnitaire = prix/qte SANS money2 (pleine précision)');
  ok(!/prixUnitaire:\s*qte>0\s*\?\s*money2\(prix\/qte\)/.test(src),
     '2 · l\'ancien money2(prix/qte) a bien disparu');
}

// 2. lotPU comportemental : reconstitue un prix précis
{
  const G = global;
  const src = extractFunction('lotPU');
  new Function('G', `with(G){ ${src}\n G.lotPU = lotPU; }`)(G);
  const f = G.lotPU;
  // lot avec prixUnitaire précis stocké
  ok(Math.abs(f({ prixUnitaire: 0.01995, qteInitiale:1600, prix:31.92 }) - 0.01995) < 1e-9,
     '3 · lotPU lit le prixUnitaire précis stocké (0,01995, pas 0,02)');
  // lot sans prixUnitaire → recalcul depuis prix/qteInitiale
  ok(Math.abs(f({ qteInitiale:1600, prix:31.92 }) - 0.01995) < 1e-9,
     '4 · lotPU recalcule prix/qteInitiale = 0,01995 (repli précis)');
  // lot inventaire → 0 (jamais chiffré)
  ok(f({ inventaire:true, prix:99, qteInitiale:10 }) === 0,
     '5 · lot d\'inventaire → 0 (jamais chiffré)');
}

// 3. euroPrec : assez de décimales pour un prix au gramme
{
  const G = global;
  G.privacyMasked = () => false;
  const { APP } = require('./_extract');
  // euroPrec est une arrow multi-ligne : on l'extrait par bornes explicites.
  const m = APP.match(/const euroPrec = n => \{[\s\S]*?\n\};/);
  if(!m){ ok(false, '6 · euroPrec introuvable dans le source'); }
  else {
    new Function('G', `with(G){ ${m[0]}\n G.euroPrec = euroPrec; }`)(G);
    const e = G.euroPrec;
    // 0,01995 €/g : on veut au moins 4 décimales affichées (0,0200), pas « 0,02 » sec.
    const s = e(0.01995);
    const decimales = (s.match(/,(\d+)/)||[])[1] || '';
    ok(decimales.length >= 4, '6 · euroPrec(0,01995) affiche ≥ 4 décimales (' + s + ')');
    ok(/^12,50\s€$/.test(e(12.5)), '7 · euroPrec(12,5) reste « 12,50 € » (prix normal, 2 décimales)');
    // prix moyen (0,20 €/g) → 3 décimales
    ok(/0,200/.test(e(0.2)), '8 · euroPrec(0,20) → 3 décimales (0,200)');
  }
}

console.log(`\n=== v1400 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
