/* ============================================================
   TESTS — v1394 : RÉSERVE DE STOCK POUR LA VENTE EN LIGNE
   ------------------------------------------------------------
   LE BESOIN DE BEN : vendre en ligne (Shopify, click & collect) de façon
   ULTRA-SÉCURISÉE, en réservant une partie du stock au canal online SANS
   jamais autoriser de décrément non planifié. Réserve pilotée À LA MAIN,
   par parfum.

   L'INVARIANT DE SÉCURITÉ (le cœur de ce socle) : une pièce réservée à la
   vente en ligne N'EST PLUS mobilisable en direct. Sinon on vendrait deux
   fois la même pièce (une fois au marché/commande, une fois en ligne). La
   soustraction se fait à la SOURCE UNIQUE de disponibilité,
   parfumDispoSource → tous les appelants (coffrets, marché, commandes) en
   héritent, aucune logique parallèle.

   CE QUE CE TEST GÈLE :
     1. reserveOnline existe dans les réglages (map parfum→quantité), vide
        par défaut, robuste aux valeurs absurdes.
     2. parfumDispoSource retire la réserve du mobilisable direct.
     3. On ne peut pas réserver plus que le stock (réserve bornée au
        mobilisable — pas de mobilisable négatif).
     4. mobilisableTotal (avant réserve) reste exposé pour l'écran.
     5. Réserve à 0 ou parfum absent → mobilisable inchangé (non-régression).

   RÈGLE GRAVÉE : la réserve online se soustrait à la source unique de
   disponibilité ; aucun canal ne peut vendre une pièce déjà réservée.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

(async () => {
console.log('\n=== TESTS — v1394 : réserve de stock vente en ligne ===\n');

// ---------------------------------------------------------------------------
// 1. GARDES STATIQUES — le champ existe, l'invariant est câblé à la source
// ---------------------------------------------------------------------------
{
  const gs = stripComments(extractFunction('getSettings'));
  ok(/reserveOnline\s*:/.test(gs), '1 · reserveOnline présent dans getSettings');

  const src = stripComments(extractFunction('parfumDispoSource'));
  ok(/reserveOnline/.test(src) && /mobilisable\s*=.*subQty/.test(src),
     '2 · parfumDispoSource soustrait la réserve online du mobilisable (invariant à la source)');
  ok(/Math\.min\(r, b\.mobilisable\)/.test(src),
     '3 · la réserve effective est bornée au mobilisable (pas de réserve fantôme)');
}

// ---------------------------------------------------------------------------
// 2. COMPORTEMENTAL — on exécute la vraie fonction sur un stock simulé
// ---------------------------------------------------------------------------
// On fournit un db minimal + les helpers globaux dont parfumDispoSource dépend,
// puis on fait varier getSettings().reserveOnline pour observer le mobilisable.
const G = global;
G.round3   = x => Math.round((+x||0)*1000)/1000;
G.addQty   = (...xs) => G.round3(xs.reduce((s,x)=>s+((+x)||0),0));
G.subQty   = (a,b) => G.round3(((+a)||0)-((+b)||0));
G.swallow  = () => {};
G.COQUES_PAR_MACARON = 2;
G.stockMoveKey = nom => String(nom||'').toLowerCase().trim();
G.prodNomComplet = (p) => p._nom;
G.prodComposant  = (p) => p._comp || 'macaron';
G.prodVendable   = (p) => p._vendable !== false && (p._comp||'macaron')==='macaron';
G.prodStatut     = (p) => p._statut || 'termine';

// db factice : juste ce que parfumDispoSource lit (productions + recipes).
let _prods = [];
G.db = {
  productions: { toArray: async () => _prods },
  recipes:     { toArray: async () => [] }
};

// getSettings pilotable pour le test.
let _reserve = {};
G.getSettings = () => ({ reserveOnline: _reserve });

// Charge la VRAIE fonction extraite.
const src = extractFunction('parfumDispoSource');
new Function('G', `with(G){ ${src}\n G.parfumDispoSource = parfumDispoSource; }`)(G);

// Stock : 30 vanille finies vendables.
_prods = [ { _nom:'Vanille', _comp:'macaron', _vendable:true, _statut:'termine', qteRestante:30 } ];

// 2a) sans réserve → 30 mobilisables en direct.
_reserve = {};
let out = await G.parfumDispoSource();
ok(out['vanille'] && out['vanille'].mobilisable === 30,
   '4 · sans réserve : 30 vanille mobilisables en direct');

// 2b) réserve 20 → 10 mobilisables en direct, 20 réservés online.
_reserve = { vanille: 20 };
out = await G.parfumDispoSource();
ok(out['vanille'].mobilisable === 10,
   '5 · réserve 20 → 10 mobilisables en direct (les 20 réservés sont retirés)');
ok(out['vanille'].reserveOnline === 20, '6 · reserveOnline = 20 exposé');
ok(out['vanille'].mobilisableTotal === 30, '7 · mobilisableTotal = 30 (avant réserve, pour l\'écran)');

// 2c) réserve ABUSIVE (50 alors que 30 en stock) → mobilisable 0, jamais négatif.
_reserve = { vanille: 50 };
out = await G.parfumDispoSource();
ok(out['vanille'].mobilisable === 0,
   '8 · réserve abusive (50 > 30) → mobilisable direct = 0, jamais négatif');
ok(out['vanille'].reserveOnline === 30,
   '9 · la réserve effective est plafonnée au stock réel (30, pas 50)');

// 2d) réserve sur un parfum ABSENT du stock → aucun effet de bord.
_reserve = { chocolat: 10 };
out = await G.parfumDispoSource();
ok(out['vanille'].mobilisable === 30,
   '10 · réserver un parfum absent n\'affecte pas les autres');

// 2e) valeur absurde (négative) → traitée comme 0.
_reserve = { vanille: -5 };
out = await G.parfumDispoSource();
ok(out['vanille'].mobilisable === 30,
   '11 · réserve négative traitée comme 0 (robustesse)');

console.log(`\n=== v1394-reserve : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
})().catch(e => { console.error('ERREUR FATALE', e); process.exit(1); });
