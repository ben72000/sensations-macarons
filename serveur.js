'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   SAS SHOPIFY ↔ ERP — SERVEUR HTTP (transport autour du cœur logique)
   ────────────────────────────────────────────────────────────────────────────
   N'ajoute AUCUNE logique métier : il ne fait que router les requêtes vers
   src/coeur.js et appliquer les garde-fous de SÉCURITÉ (auth, signature).
   Toute la vérité vit dans le cœur ; ici c'est de la plomberie.

   ENDPOINTS :
     POST /erp/reserve   (auth ERP)      — flux A : l'ERP pousse l'enveloppe
     GET  /erp/journal   (auth ERP)      — flux C : l'ERP lit les ventes à intégrer
     POST /shopify/webhook (signature)   — flux B : Shopify notifie une vente
     GET  /dispo         (public)        — dispo pour l'affichage boutique

   SÉCURITÉ (garde-fous du document de conception) :
     • Clés en VARIABLES D'ENVIRONNEMENT, jamais en dur (rien de secret dans le
       code / le dépôt). Voir .env.example.
     • L'ERP s'authentifie par un jeton partagé (ERP_TOKEN) en en-tête.
     • Les webhooks Shopify sont vérifiés par signature HMAC (SHOPIFY_WEBHOOK_SECRET) :
       une requête non signée par Shopify est rejetée → personne ne peut injecter
       de fausses ventes.
     • SENS UNIQUE : aucun endpoint ne permet d'écrire dans l'ERP. Le sas expose,
       l'ERP tire. Le sas ne connaît même pas l'adresse de l'ERP (il n'est pas
       joignable : c'est voulu).
   ════════════════════════════════════════════════════════════════════════════ */

const express = require('express');
const C = require('./coeur');
const { extraireVente, verifieSignatureShopify } = require('./shopify');
const { chargerEtat, sauverEtat } = require('./persistance');

// ── Config depuis l'environnement (jamais en dur) ───────────────────────────
const PORT = process.env.PORT || 3000;
const ERP_TOKEN = process.env.ERP_TOKEN || '';                       // jeton partagé ERP↔sas
const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';     // secret webhook Shopify

if (!ERP_TOKEN)      console.error('[sas] ATTENTION : ERP_TOKEN non défini — l\'ERP ne pourra pas s\'authentifier.');
if (!SHOPIFY_SECRET) console.error('[sas] ATTENTION : SHOPIFY_WEBHOOK_SECRET non défini — les webhooks seront tous rejetés.');

// État en mémoire, persisté sur disque (persistance simple, remplaçable par une vraie base).
let etat = chargerEtat() || C.creerEtat();
function persister() { try { sauverEtat(etat); } catch (e) { console.error('[sas] persist échec', e.message); } }

const app = express();

// Auth de l'ERP par jeton partagé (en-tête Authorization: Bearer <ERP_TOKEN>).
function authErp(req, res, next) {
  const h = req.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!ERP_TOKEN || tok !== ERP_TOKEN) return res.status(401).json({ ok: false, raison: 'non autorisé' });
  next();
}

// ── FLUX B — webhook Shopify (RAW body pour la signature) ───────────────────
app.post('/shopify/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  const hmacRecu = req.get('X-Shopify-Hmac-Sha256') || '';
  if (!verifieSignatureShopify(SHOPIFY_SECRET, hmacRecu, raw)) {
    return res.status(401).json({ ok: false, raison: 'signature invalide' });
  }
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { return res.status(400).json({ ok: false, raison: 'json invalide' }); }

  // On extrait { id, ligne:{parfum:qte} } depuis la commande Shopify. Le mapping
  // « article Shopify → nom de parfum ERP » se fait via une étiquette portée par
  // la variante (métachamp/nom) : ADAPTER selon la config boutique. Ici, on lit
  // line_items[].properties/title ; à câbler précisément à la mise en place.
  const vente = extraireVente(payload);
  if (!vente) return res.status(200).json({ ok: true, ignore: 'pas de ligne parfum' });

  const r = C.enregistrerVente(etat, vente);
  if (r.ok && !r.deja) persister();
  // Toujours 200 à Shopify si traité (même « deja »), pour qu'il ne réessaie pas en boucle.
  return res.status(200).json({ ok: true, deja: !!r.deja });
});

// JSON pour les autres routes.
app.use(express.json());

// ── FLUX A — l'ERP pousse l'enveloppe de réserve ────────────────────────────
app.post('/erp/reserve', authErp, (req, res) => {
  const reserve = (req.body && req.body.reserve) || {};
  C.pousserReserve(etat, reserve);
  persister();
  res.json({ ok: true, reserve: etat.reserve, curseur: etat.ventes.length });
});

// ── FLUX C — l'ERP lit le journal à intégrer (depuis son curseur) ───────────
app.get('/erp/journal', authErp, (req, res) => {
  const curseur = +req.query.curseur || 0;
  const j = C.journalDepuis(etat, curseur);
  res.json({ ok: true, ventes: j.ventes, curseur: j.curseur });
});

// ── DISPONIBILITÉ publique (affichage boutique) ─────────────────────────────
app.get('/dispo', (req, res) => {
  const curseur = +req.query.curseur || 0;
  res.json({ ok: true, dispo: C.disponibilite(etat, curseur), delaiReassortH: 48 });
});

// Santé (monitoring hébergeur).
app.get('/health', (req, res) => res.json({ ok: true, ventes: etat.ventes.length }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`[sas] à l'écoute sur :${PORT}`));
}

module.exports = { app, _etat: () => etat };
