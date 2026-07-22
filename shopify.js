'use strict';
/* Fonctions PURES utilisées par le serveur, isolées ici pour être testables
   SANS express (le vrai risque = le mapping des ventes et la vérif de signature).
   src/serveur.js les importe. Aucune dépendance réseau. */
const crypto = require('crypto');

// Mapping commande Shopify → { id, ligne:{parfum:qte} }. Convention : le nom de
// parfum ERP est porté par une propriété « parfum » de la ligne, sinon on
// retombe sur le titre de l'article. À ajuster selon la config boutique.
function extraireVente(order) {
  if (!order || order.id == null) return null;
  const ligne = {};
  (order.line_items || []).forEach((it) => {
    const prop = (it.properties || []).find((p) => (p.name || '').toLowerCase() === 'parfum');
    const nom = prop ? prop.value : (it.title || '');
    const qte = +it.quantity || 0;
    if (nom && qte > 0) ligne[nom] = (ligne[nom] || 0) + qte;
  });
  if (!Object.keys(ligne).length) return null;
  return { id: order.id, ligne, ts: order.created_at || new Date().toISOString() };
}

// Vérif signature Shopify : HMAC-SHA256 base64 sur le corps BRUT, comparé à
// temps constant. `secret` passé explicitement (le serveur lui donne la valeur
// d'environnement) → testable de façon déterministe.
function verifieSignatureShopify(secret, hmacRecu, rawBody) {
  if (!secret || !hmacRecu) return false;
  const attendu = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(String(hmacRecu));
  const b = Buffer.from(attendu);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { extraireVente, verifieSignatureShopify };
