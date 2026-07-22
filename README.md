# Sas Shopify ↔ ERP — Sensations Macarons

Petit service **miroir** entre ta boutique Shopify et ton ERP. Il tient
l'enveloppe de réserve et journalise les ventes. **L'ERP reste seul maître de
la vérité** ; le sas ne décide jamais rien.

Conception complète : voir `CONCEPTION-SAS-shopify.md`.

---

## Ce que fait ce code

- Reçoit l'enveloppe de réserve poussée par l'ERP (flux A).
- Reçoit les ventes Shopify par webhook, signées et vérifiées (flux B).
- Journalise chaque vente de façon **idempotente** (jamais comptée deux fois).
- Expose la disponibilité pour l'affichage boutique (« dispo » / « réassort 48h »).
- Laisse l'ERP lire le journal pour se resynchroniser (flux C).

Il ne connaît **ni** ton stock réel, **ni** tes recettes, **ni** tes coûts, **ni**
tes clients. Le pire dégât possible s'il était compromis : une enveloppe de
réserve faussée. Rien ne remonte à l'ERP.

---

## Structure

```
src/coeur.js        cœur logique pur (enveloppe + journal idempotent) — 0 dépendance
src/shopify.js      mapping commande Shopify → vente + vérif signature — 0 dépendance
src/persistance.js  sauvegarde de l'état sur fichier JSON (atomique)
src/serveur.js      serveur HTTP Express (plomberie : routes + sécurité)
tests/coeur.test.js     19 tests du cœur (idempotence, pas de survente, resynchro)
tests/serveur.test.js   11 tests du mapping + de la signature
```

Le **cœur** et la **sécurité** sont testés sans réseau (30 assertions). Le
routage Express se valide en intégration une fois `express` installé.

---

## Installation (quand tu choisiras un hébergeur)

1. `npm install` (installe Express).
2. Copie `.env.example` en `.env` et remplis :
   - `ERP_TOKEN` : une longue chaîne aléatoire, partagée avec l'ERP.
   - `SHOPIFY_WEBHOOK_SECRET` : fourni par Shopify à la création du webhook.
3. `npm test` pour vérifier que tout est vert.
4. `npm start` pour lancer le service.

---

## Les endpoints

| Méthode | Route | Qui | Rôle |
|--------|-------|-----|------|
| POST | `/erp/reserve` | ERP (jeton) | pousse l'enveloppe de réserve |
| GET | `/erp/journal?curseur=N` | ERP (jeton) | lit les ventes à intégrer |
| POST | `/shopify/webhook` | Shopify (signé) | notifie une vente |
| GET | `/dispo?curseur=N` | public | disponibilité pour la boutique |
| GET | `/health` | public | supervision |

---

## Sécurité — les garde-fous en place

- **Clés en variables d'environnement**, jamais dans le code (`.env` est gitignoré).
- **ERP authentifié** par jeton partagé (`Authorization: Bearer …`).
- **Webhooks vérifiés** par signature HMAC-SHA256 : une vente non signée par
  Shopify est rejetée. Personne ne peut injecter de fausses ventes.
- **Sens unique** : aucun endpoint n'écrit dans l'ERP. Le sas expose, l'ERP tire.
- **Idempotence** par id de commande Shopify : un rejeu ne double jamais une vente.
- **Écriture d'état atomique** : jamais d'`etat.json` à moitié écrit.

---

## Ce qui reste à faire à la mise en place

1. **Choisir un hébergeur** (petit service Node qui tourne en continu).
2. **Créer le webhook Shopify** « commande créée/payée » pointant vers
   `/shopify/webhook`, et coller son secret dans `.env`.
3. **Définir la convention de mapping** parfum : le code lit une propriété
   `parfum` sur chaque ligne de commande, sinon le titre de l'article. À caler
   sur la façon dont tu nommes tes produits Shopify.
4. **Côté ERP** : ajouter le bouton « Synchroniser les ventes en ligne » qui
   appelle `/erp/journal`, applique les ventes via `enregistrerVenteOnline`
   (déjà codé), mémorise le curseur, et re-pousse la réserve via `/erp/reserve`.

Les points 1 et 2 peuvent nécessiter un développeur pour la mise en ligne et la
maintenance — c'est de l'infrastructure, pas de la logique métier.
