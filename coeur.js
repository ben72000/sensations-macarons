'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   SAS SHOPIFY ↔ ERP — CŒUR LOGIQUE PUR (sans réseau, sans serveur)
   ────────────────────────────────────────────────────────────────────────────
   Conception : CONCEPTION-SAS-shopify.md. Rappel des invariants que CE fichier
   garantit (le reste n'est que du transport HTTP autour) :

   • L'ERP est le SEUL MAÎTRE. Le sas est un miroir qui JOURNALISE. Il ne décide
     jamais la vérité du stock — il reflète l'enveloppe poussée par l'ERP et
     enregistre les ventes.
   • IDEMPOTENCE : une vente porte un id unique (Shopify order id). La rejouer
     ne la compte pas deux fois.
   • PAS DE SURVENTE : le sas ne laisse pas descendre l'affichage sous 0, et
     bascule en « réassort 48h » à 0.
   • SENS UNIQUE : ce module ne connaît que l'enveloppe + le journal. Aucune
     notion de stock réel, recette, coût, client. Le pire dégât possible = une
     enveloppe fausse, jamais une donnée ERP touchée.
   • Le journal est la SOURCE que l'ERP lira pour se resynchroniser. On ne
     supprime jamais une entrée ; on marque jusqu'où l'ERP a consommé (curseur).

   État détenu (tout est sérialisable en JSON, pour persistance simple) :
     {
       reserve:   { [cléParfum]: nombre },     // poussé par l'ERP (flux A)
       ventes:    [ {id, ligne:{[parfum]:qte}, ts} ],  // journal append-only (flux B)
       applique:  { [venteId]: true }           // ids déjà intégrés au compteur d'affichage
     }
   ════════════════════════════════════════════════════════════════════════════ */

function creerEtat(init) {
  return {
    reserve: Object.assign({}, (init && init.reserve) || {}),
    ventes: Array.isArray(init && init.ventes) ? init.ventes.slice() : [],
    applique: Object.assign({}, (init && init.applique) || {}),
  };
}

// Normalisation de clé parfum — DOIT rester identique à stockMoveKey de l'ERP
// (minuscules + trim). Si l'ERP change sa normalisation, changer ici aussi.
function cleParfum(nom) {
  return String(nom == null ? '' : nom).toLowerCase().trim();
}

function round3(x) { return Math.round(((+x) || 0) * 1000) / 1000; }

/* ── FLUX A — l'ERP pousse l'enveloppe de réserve ───────────────────────────
   Remplace intégralement la réserve par ce que l'ERP envoie : l'ERP est maître,
   sa consigne fait foi. On repart d'une enveloppe propre (les clés absentes de
   la consigne disparaissent). Les ventes déjà journalisées ne sont PAS effacées
   (elles restent pour la resynchro), mais le compteur d'affichage est recalé
   sur la consigne : voir `disponibilite`. */
function pousserReserve(etat, reserveErp) {
  const propre = {};
  Object.keys(reserveErp || {}).forEach((nom) => {
    const k = cleParfum(nom);
    const q = round3(reserveErp[nom]);
    if (q >= 0) propre[k] = q; // 0 admis = « en ligne mais épuisé » (réassort)
  });
  etat.reserve = propre;
  return etat;
}

/* ── FLUX B — une vente Shopify arrive ──────────────────────────────────────
   `vente` = { id, ligne:{ [nomParfum]: qte } }. IDEMPOTENT : si l'id est déjà
   au journal, on ne fait RIEN (rejeu réseau, double webhook Shopify…). Sinon on
   inscrit la vente au journal (append-only) et on marque l'id comme appliqué au
   compteur d'affichage. Renvoie { ok, deja?, raison? }. */
function enregistrerVente(etat, vente) {
  if (!vente || vente.id == null) return { ok: false, raison: 'vente sans id' };
  const id = String(vente.id);
  if (etat.applique[id]) return { ok: true, deja: true }; // déjà vue → ignorer
  const ligne = {};
  Object.keys((vente.ligne) || {}).forEach((nom) => {
    const q = round3(vente.ligne[nom]);
    if (q > 0) ligne[cleParfum(nom)] = q;
  });
  if (!Object.keys(ligne).length) return { ok: false, raison: 'vente vide' };
  etat.ventes.push({ id, ligne, ts: (vente.ts || new Date().toISOString()) });
  etat.applique[id] = true;
  return { ok: true };
}

/* ── DISPONIBILITÉ pour l'affichage boutique ────────────────────────────────
   Le compteur montré au client = enveloppe poussée par l'ERP MOINS les ventes
   journalisées depuis la dernière resynchro ERP (celles pas encore intégrées
   dans la consigne). C'est le « miroir » : l'ERP fait foi, on décrémente
   localement pour l'affichage temps réel entre deux synchros.
   Renvoie, par parfum : { reserveErp, venduDepuisSync, dispo, etat }. */
function disponibilite(etat, curseurErp) {
  // curseurErp : index dans etat.ventes jusqu'où l'ERP a DÉJÀ intégré les ventes
  // dans la réserve qu'il a poussée. Les ventes après le curseur ne sont pas
  // encore reflétées dans etat.reserve → on les retire pour l'affichage.
  const from = Math.max(0, +curseurErp || 0);
  const venduDepuis = {};
  for (let i = from; i < etat.ventes.length; i++) {
    const l = etat.ventes[i].ligne;
    Object.keys(l).forEach((k) => { venduDepuis[k] = round3((venduDepuis[k] || 0) + l[k]); });
  }
  const out = {};
  Object.keys(etat.reserve).forEach((k) => {
    const r = round3(etat.reserve[k]);
    const v = round3(venduDepuis[k] || 0);
    const dispo = Math.max(0, round3(r - v));
    out[k] = {
      reserveErp: r,
      venduDepuisSync: v,
      dispo,
      etat: dispo > 0 ? 'dispo' : 'reassort', // 0 → réassort 48h (jamais « épuisé » sec)
    };
  });
  return out;
}

/* ── FLUX C — l'ERP lit le journal pour se resynchroniser ───────────────────
   Renvoie les ventes APRÈS le curseur (celles que l'ERP n'a pas encore
   intégrées), plus le nouveau curseur à mémoriser côté ERP. L'ERP appliquera
   ces ventes via son propre enregistrerVenteOnline (source unique de vérité),
   puis re-poussera la réserve à jour et avancera son curseur. Le sas ne SUPPRIME
   jamais : il expose, l'ERP consomme. */
function journalDepuis(etat, curseurErp) {
  const from = Math.max(0, +curseurErp || 0);
  return {
    ventes: etat.ventes.slice(from),
    curseur: etat.ventes.length, // nouveau curseur à mémoriser une fois appliqué
  };
}

module.exports = {
  creerEtat, cleParfum, round3,
  pousserReserve, enregistrerVente, disponibilite, journalDepuis,
};
