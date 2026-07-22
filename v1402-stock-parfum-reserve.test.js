/* ============================================================
   TESTS — v1402 : LISTE « STOCK PAR PARFUM » SOUSTRAIT LA RÉSERVE ONLINE
   ------------------------------------------------------------
   BUG signalé par Ben : réserver du stock pour la vente en ligne n'enlevait
   PAS ce stock de la vue « Stock par parfum ». Cause : buildStockParfumsListeHtml
   calculait son propre dispo (somme de qteRestante) SANS passer par la
   soustraction de réserve → logique parallèle, réserve ignorée.

   FIX : _appliquerReserveOnlineAuxCartes applique la MÊME règle que
   parfumDispoSource (source unique) : les pièces réservées sortent du dispo
   direct, plafonnées à ce qui existe, et la part réservée est conservée.

   CE QUE CE TEST GÈLE :
     1. la réserve se soustrait du dispo affiché.
     2. on ne réserve jamais plus que le stock réel (plafond).
     3. la part réservée (reserveOnline) est exposée pour l'affichage.
     4. un parfum sans réserve est inchangé.
     5. dispoTotalAvant garde la valeur avant réservation.
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1402 : liste stock par parfum − réserve online ===\n');

const G = global;
G.stockMoveKey = n => String(n||'').toLowerCase().trim();
G.round3 = n => Math.round((+n||0)*1000)/1000;
G.subQty = (a,b) => G.round3((+a||0)-(+b||0));
new Function('G', `with(G){ ${extractFunction('_appliquerReserveOnlineAuxCartes')}\n G._appliquerReserveOnlineAuxCartes = _appliquerReserveOnlineAuxCartes; }`)(G);
const applique = G._appliquerReserveOnlineAuxCartes;

// 1. soustraction simple
{
  const byNom = { 'Vanille': {nom:'Vanille', dispo:20}, 'Chocolat': {nom:'Chocolat', dispo:8} };
  applique(byNom, { vanille: 5 });
  ok(byNom['Vanille'].dispo === 15, '1 · Vanille 20 − 5 réservés = 15 en direct');
  ok(byNom['Vanille'].reserveOnline === 5, '2 · part réservée exposée (5)');
  ok(byNom['Chocolat'].dispo === 8, '3 · Chocolat sans réserve → inchangé (8)');
}

// 2. plafond : on ne réserve jamais plus que le stock réel
{
  const byNom = { 'Citron': {nom:'Citron', dispo:3} };
  applique(byNom, { citron: 10 });   // réserve 10 mais il n'y a que 3
  ok(byNom['Citron'].dispo === 0, '4 · réserve > stock → dispo direct plancher 0');
  ok(byNom['Citron'].reserveOnline === 3, '5 · on ne réserve que ce qui existe (3, pas 10)');
}

// 3. info : dispoTotalAvant conservé
{
  const byNom = { 'Pistache': {nom:'Pistache', dispo:12} };
  applique(byNom, { pistache: 4 });
  ok(byNom['Pistache'].dispoTotalAvant === 12, '6 · dispoTotalAvant garde le stock avant réservation (12)');
  ok(byNom['Pistache'].dispo === 8, '7 · dispo direct après = 8');
}

// 4. réserve vide / absente
{
  const byNom = { 'Café': {nom:'Café', dispo:6} };
  applique(byNom, {});
  ok(byNom['Café'].dispo === 6 && byNom['Café'].reserveOnline === 0, '8 · aucune réserve → dispo inchangé, reserveOnline 0');
}

// 5. clé normalisée (casse/espaces)
{
  const byNom = { 'Fleur d\'oranger': {nom:'Fleur d\'oranger', dispo:9} };
  applique(byNom, { "fleur d'oranger": 2 });
  ok(byNom['Fleur d\'oranger'].dispo === 7, '9 · la clé est normalisée (casse) → réserve appliquée');
}

console.log(`\n=== v1402 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
