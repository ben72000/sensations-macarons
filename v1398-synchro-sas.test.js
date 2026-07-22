/* ============================================================
   TESTS — v1398 : SYNCHRO SAS CÔTÉ ERP (flux C)
   ------------------------------------------------------------
   Le bouton « Synchroniser les ventes en ligne » lit le journal du sas,
   applique les ventes via enregistrerVenteOnline (chemin unique de
   décrément, déjà testé v1397), avance le curseur (idempotence : jamais
   rejouer), et re-pousse la réserve à jour. L'ERP reste SEUL MAÎTRE.

   CE QUE CE TEST GÈLE :
     1. sasUrl/sasToken/sasCurseur présents dans getSettings.
     2. sans sas configuré → refus propre (pas d'appel réseau).
     3. flux nominal : les ventes du journal décrémentent la réserve, le
        curseur avance, la réserve est re-poussée.
     4. idempotence : une 2e synchro avec le curseur avancé ne rejoue pas.
     5. panne réseau (fetch qui jette) → aucun changement, erreur remontée.
   ============================================================ */
'use strict';
const { extractFunction, stripComments, APP } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

(async () => {
console.log('\n=== TESTS — v1398 : synchro sas côté ERP ===\n');

// 1. gardes statiques
{
  const gs = stripComments(extractFunction('getSettings'));
  ok(/sasUrl\s*:/.test(gs) && /sasToken\s*:/.test(gs) && /sasCurseur\s*:/.test(gs),
     '1 · sasUrl/sasToken/sasCurseur présents dans getSettings');
  const sy = stripComments(extractFunction('synchroniserVentesEnLigne'));
  ok(/enregistrerVenteOnline\(/.test(sy),
     '2 · la synchro applique les ventes via enregistrerVenteOnline (chemin unique)');
  ok(/\/erp\/journal/.test(sy) && /\/erp\/reserve/.test(sy),
     '3 · la synchro lit le journal ET re-pousse la réserve');
}

// 2. comportemental — on exécute la vraie fonction avec fetch + settings simulés
const G = global;
G.round3 = x => Math.round((+x||0)*1000)/1000;
G.stockMoveKey = nom => String(nom||'').toLowerCase().trim();
G.markUnsaved = () => {};

// settings en mémoire
let _store = { reserveOnline: { vanille:20 }, sasUrl:'https://sas.test', sasToken:'jeton', sasCurseur:0 };
G.getSettings = () => JSON.parse(JSON.stringify(_store));
G.saveSettings = (s) => { _store = JSON.parse(JSON.stringify(s)); };

// enregistrerVenteOnline + _reserveApresVente réels (chemin unique de décrément)
new Function('G', `with(G){ ${extractFunction('_reserveApresVente')}\n G._reserveApresVente=_reserveApresVente; }`)(G);
new Function('G', `with(G){ const _reserveApresVente=G._reserveApresVente; ${extractFunction('enregistrerVenteOnline')}\n G.enregistrerVenteOnline=enregistrerVenteOnline; }`)(G);
new Function('G', `with(G){ ${extractFunction('synchroniserVentesEnLigne')}\n G.synchroniserVentesEnLigne=synchroniserVentesEnLigne; }`)(G);

// fetch simulé : /erp/journal renvoie 2 ventes, /erp/reserve accepte.
function fetchOk(url, opts){
  if(/\/erp\/journal/.test(url)){
    return Promise.resolve({ ok:true, status:200, json: async () => ({
      ok:true,
      ventes:[ {id:'V1', ligne:{vanille:2}}, {id:'V2', ligne:{vanille:3}} ],
      curseur:2
    })});
  }
  if(/\/erp\/reserve/.test(url)) return Promise.resolve({ ok:true, status:200, json: async()=>({ok:true}) });
  return Promise.reject(new Error('url inconnue'));
}

// 3. flux nominal
{
  G.fetch = fetchOk;
  const r = await G.synchroniserVentesEnLigne();
  ok(r.ok && r.nbAppliquees===2, '4 · 2 ventes appliquées');
  ok(_store.reserveOnline.vanille === 15, '5 · réserve 20 − (2+3) = 15');
  ok(_store.sasCurseur === 2, '6 · curseur avancé à 2 (idempotence mémorisée)');
  ok(r.totalPieces === 5, '7 · 5 pièces au total');
}

// 4. idempotence : 2e synchro, le journal ne renvoie plus rien après curseur 2
{
  G.fetch = function(url){
    if(/\/erp\/journal/.test(url)) return Promise.resolve({ ok:true, status:200, json: async()=>({ ok:true, ventes:[], curseur:2 }) });
    if(/\/erp\/reserve/.test(url)) return Promise.resolve({ ok:true, status:200, json: async()=>({ok:true}) });
    return Promise.reject(new Error('x'));
  };
  const r = await G.synchroniserVentesEnLigne();
  ok(r.ok && r.nbAppliquees===0, '8 · 2e synchro sans nouvelle vente → 0 appliquée');
  ok(_store.reserveOnline.vanille === 15, '9 · réserve inchangée (pas de rejeu) = 15');
}

// 5. panne réseau
{
  _store.sasCurseur = 5;
  const avant = JSON.stringify(_store);
  G.fetch = () => Promise.reject(new Error('offline'));
  const r = await G.synchroniserVentesEnLigne();
  ok(r.ok === false && /injoignable/i.test(r.raison), '10 · sas injoignable → échec propre');
  ok(JSON.stringify(_store) === avant, '11 · panne réseau → aucun changement d\'état');
}

// 6. sas non configuré
{
  _store.sasUrl = '';
  const r = await G.synchroniserVentesEnLigne();
  ok(r.ok === false && /configuré/i.test(r.raison), '12 · pas de sas configuré → refus sans appel réseau');
}

console.log(`\n=== v1398 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
})().catch(e => { console.error('ERREUR FATALE', e); process.exit(1); });
