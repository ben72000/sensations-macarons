'use strict';
/* Tests du cœur logique du sas (aucun réseau). Lance : node tests/coeur.test.js */
const C = require('../src/coeur');

let nOk = 0, nKo = 0;
function ok(cond, label) {
  if (cond) { nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — sas : cœur logique ===\n');

// ── FLUX A : pousser la réserve ────────────────────────────────────────────
{
  const e = C.creerEtat();
  C.pousserReserve(e, { Vanille: 20, Chocolat: 5 });
  ok(e.reserve.vanille === 20 && e.reserve.chocolat === 5, 'A1 · réserve poussée et normalisée (clés minuscules)');
  // une nouvelle poussée REMPLACE (l'ERP est maître)
  C.pousserReserve(e, { Vanille: 12 });
  ok(e.reserve.vanille === 12 && e.reserve.chocolat === undefined, 'A2 · nouvelle poussée remplace tout (chocolat retiré)');
  // 0 admis (réassort volontaire)
  C.pousserReserve(e, { Vanille: 0 });
  ok(e.reserve.vanille === 0, 'A3 · réserve à 0 admise (en ligne mais épuisé)');
}

// ── FLUX B : enregistrer une vente + IDEMPOTENCE ───────────────────────────
{
  const e = C.creerEtat();
  C.pousserReserve(e, { Vanille: 20 });
  const r1 = C.enregistrerVente(e, { id: 'SHOP-1001', ligne: { Vanille: 3 } });
  ok(r1.ok && !r1.deja, 'B1 · 1re vente enregistrée');
  ok(e.ventes.length === 1, 'B2 · 1 entrée au journal');

  // MÊME id rejoué → ignoré (double webhook, retry réseau)
  const r2 = C.enregistrerVente(e, { id: 'SHOP-1001', ligne: { Vanille: 3 } });
  ok(r2.ok && r2.deja === true, 'B3 · rejeu du même id → deja=true');
  ok(e.ventes.length === 1, 'B4 · IDEMPOTENCE : le journal ne double pas');

  // vente sans id → refus
  ok(C.enregistrerVente(e, { ligne: { Vanille: 1 } }).ok === false, 'B5 · vente sans id refusée');
  // vente vide → refus
  ok(C.enregistrerVente(e, { id: 'X', ligne: {} }).ok === false, 'B6 · vente vide refusée');
}

// ── DISPONIBILITÉ : miroir, jamais de survente, réassort à 0 ────────────────
{
  const e = C.creerEtat();
  C.pousserReserve(e, { Vanille: 5 });
  C.enregistrerVente(e, { id: 'A', ligne: { Vanille: 2 } });
  let d = C.disponibilite(e, 0);
  ok(d.vanille.dispo === 3, 'D1 · 5 poussé − 2 vendu (curseur 0) = 3 dispo');
  ok(d.vanille.etat === 'dispo', 'D2 · reste > 0 → dispo');

  C.enregistrerVente(e, { id: 'B', ligne: { Vanille: 3 } });
  d = C.disponibilite(e, 0);
  ok(d.vanille.dispo === 0, 'D3 · 5 − (2+3) = 0');
  ok(d.vanille.etat === 'reassort', 'D4 · 0 → réassort (48h)');

  // survente tentée : on vend plus que la réserve → dispo plancher 0, jamais négatif
  C.enregistrerVente(e, { id: 'C', ligne: { Vanille: 4 } });
  d = C.disponibilite(e, 0);
  ok(d.vanille.dispo === 0, 'D5 · vendu au-delà de la réserve → dispo reste 0 (pas de survente affichée)');
}

// ── FLUX C : resynchro par curseur ─────────────────────────────────────────
{
  const e = C.creerEtat();
  C.pousserReserve(e, { Vanille: 20 });
  C.enregistrerVente(e, { id: 'V1', ligne: { Vanille: 2 } });
  C.enregistrerVente(e, { id: 'V2', ligne: { Vanille: 1 } });

  // 1re resynchro ERP : lit depuis le curseur 0
  const j1 = C.journalDepuis(e, 0);
  ok(j1.ventes.length === 2 && j1.curseur === 2, 'C1 · journal renvoie les 2 ventes + curseur=2');

  // l'ERP applique, re-pousse la réserve à jour (20 − 3 = 17), avance son curseur à 2
  C.pousserReserve(e, { Vanille: 17 });
  // affichage après resync : curseur=2 → aucune vente en attente → dispo = 17
  let d = C.disponibilite(e, 2);
  ok(d.vanille.dispo === 17, 'C2 · après resync (curseur 2, réserve re-poussée) → dispo 17');

  // nouvelle vente APRÈS la synchro
  C.enregistrerVente(e, { id: 'V3', ligne: { Vanille: 5 } });
  d = C.disponibilite(e, 2);
  ok(d.vanille.dispo === 12, 'C3 · vente V3 après curseur → 17 − 5 = 12 affiché');

  // 2e resynchro : ne renvoie QUE V3 (pas V1/V2 déjà consommées)
  const j2 = C.journalDepuis(e, 2);
  ok(j2.ventes.length === 1 && j2.ventes[0].id === 'V3', 'C4 · resync ne renvoie que les ventes après le curseur (pas de double comptage)');
}

// ── RÈGLE DE CONFLIT : ventes journalisées priment sur une modif ERP ────────
// Simule : ERP monte la réserve à 25 SANS avoir synchronisé 3 ventes déjà là.
// Le protocole ERP applique d'abord les ventes (via journalDepuis) PUIS sa
// consigne. Ici on vérifie que le journal expose bien les 3 ventes à appliquer.
{
  const e = C.creerEtat();
  C.pousserReserve(e, { Vanille: 20 });
  C.enregistrerVente(e, { id: 'W1', ligne: { Vanille: 1 } });
  C.enregistrerVente(e, { id: 'W2', ligne: { Vanille: 1 } });
  C.enregistrerVente(e, { id: 'W3', ligne: { Vanille: 1 } });
  const j = C.journalDepuis(e, 0);
  const totalVendu = j.ventes.reduce((s, v) => s + (v.ligne.vanille || 0), 0);
  ok(totalVendu === 3, 'X1 · le journal expose les 3 ventes non synchronisées (l\'ERP les applique avant sa consigne → 25−3=22)');
}

console.log(`\n=== sas cœur : ${nOk} OK, ${nKo} KO ===\n`);
if (nKo > 0) process.exit(1);
