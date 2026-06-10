# Sensations Macarons — Pilotage : guide d'installation

Application de gestion **production + stock + traçabilité**, 100 % hors ligne après installation, conçue pour iPhone sans Mac ni App Store.

## Contenu du dossier `sm-app`

| Fichier | Rôle |
|---|---|
| `index.html` | Interface (structure + styles) |
| `app.js` | Toute la logique : stock, lots, recettes, productions, traçabilité, étiquettes |
| `dexie.min.js` | Couche base de données locale (IndexedDB) — autonome, aucune connexion requise |
| `qr.min.js` | Générateur de QR codes — autonome, fonctionne hors ligne |
| `service-worker.js` | Cache offline (rend l'app utilisable sans réseau) |
| `manifest.webmanifest` | Déclaration PWA (nom, icône, plein écran) |
| `icon-192.png` / `icon-512.png` | Icônes de l'app |

## Étape 1 — Mettre les fichiers en ligne (GitHub Pages, depuis l'iPhone)

1. Crée un compte gratuit sur **github.com**.
2. **New repository** → nom `sensations-macarons` → coche **Public** → **Create**.
3. **Add file → Upload files**. Depuis l'app **Fichiers** de l'iPhone, sélectionne les **7 fichiers** (pas le dossier : les fichiers doivent être à la racine). **Commit changes**.
4. **Settings → Pages → Source : Deploy from a branch → `main` / `root` → Save**.
5. Patiente ~1 minute. Ton adresse devient :
   `https://TON-PSEUDO.github.io/sensations-macarons/`

> HTTPS est obligatoire pour qu'une PWA fonctionne. GitHub Pages le fournit automatiquement.

## Étape 2 — Installer sur l'écran d'accueil

1. Ouvre l'adresse **dans Safari** (pas Chrome : seul Safari installe les PWA sur iPhone).
2. Bouton **Partager** (carré + flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Une icône macaron apparaît. Lancée depuis cette icône, l'app s'ouvre **en plein écran**.

## Étape 3 — Mode hors ligne

- **Premier lancement : garde le réseau actif** quelques secondes (le service worker met l'app en cache).
- Ensuite, l'app fonctionne en **mode avion** : toutes les données sont lues et écrites localement sur le téléphone.

## ⚠ Sauvegarde — à lire absolument

iOS peut **effacer les données d'une PWA après environ 7 jours sans ouverture** (politique d'Apple). Pour ne rien perdre :

- Utilise le bouton **⬇ Exporter** (barre de gauche) **chaque semaine** → un fichier `.json` est téléchargé. Range-le dans iCloud Drive.
- En cas de perte / changement de téléphone : **⬆ Importer** ce fichier restaure tout.
- L'app affiche un rappel automatique si plus de 7 jours se sont écoulés depuis le dernier export.

## Comment utiliser (ordre logique)

1. **Fournisseurs** → ajoute tes fournisseurs (nut&me, Calconut…).
2. **Matières & lots** → crée tes matières (poudre d'amande, sucre…), puis **Réception lot** à chaque livraison (n° lot, quantité, DLC).
3. **Recettes (BOM)** → définis ce que consomme un batch (ex. 60 macarons = 0,3 kg poudre + …).
4. **Productions** → lance une production : le stock se décrémente **automatiquement** (lot à DLC la plus proche d'abord).
5. **Commandes** → crée la commande, puis **Lier batch** pour la rattacher à une production.
6. **Traçabilité** → exporte en CSV les ingrédients d'une commande ou l'origine d'un batch (utile pour un contrôle DDPP).
7. **Étiquettes QR** → génère une étiquette par batch (QR + nom, lot, date). Bouton **Imprimer** pour les coller sur les boîtes.
8. **Coûts & prix** → évolution du prix d'achat de chaque matière, prix courant et variation, coût matière par recette (par batch et par pièce), et rentabilité mensuelle (CA − coût matière = marge).
9. **Suivi DLC** → lots actifs classés par urgence (expirés, sous 3 jours, sous 7 jours), pour écouler en priorité.

## Offre / Coffrets & commandes détaillées

- L'onglet **Offre / Coffrets** contient ton catalogue préenregistré : les coffrets (6, 8, 16, 25 macarons avec leurs prix), les 15 parfums, et les options. Tu peux modifier un prix ou désactiver un coffret.
- Dans une **commande**, tu choisis : (1) le coffret, (2) les parfums avec une quantité par parfum, (3) la personnalisation des couleurs, (4) le prix — pré-rempli selon le coffret mais modifiable, (5) le statut de paiement (en attente / payé), (6) le mode de règlement, et des notes.
- Le bouton **Détail** d'une commande affiche le récapitulatif complet, et signale si le total des parfums ne correspond pas à la taille du coffret.

## Suppression d'une production

- Si la production n'est **pas liée** à une commande, tu peux la supprimer **avec ou sans recréditer** les ingrédients dans leurs lots d'origine.
- Si elle **est attribuée** à une commande, la suppression est **bloquée** pour préserver la traçabilité. Détache d'abord le batch depuis la commande (bouton « Lier » → « Détacher »), ce qui restitue le stock de produit fini.

## Coûts & rentabilité

- À chaque **réception de lot**, saisis la quantité et le **prix total payé** : le prix unitaire est calculé automatiquement et affiché.
- L'onglet **Coûts & prix** trace l'évolution du prix unitaire de chaque matière dans le temps, et calcule le coût matière de chaque recette au prix d'achat le plus récent.
- La **rentabilité mensuelle** compare ton chiffre d'affaires (commandes) au coût réel des matières consommées par tes productions.
- Plus tu réceptionnes de lots avec leur prix, plus les courbes sont précises.

## Mise à jour de l'app (versions futures)

Le cache porte désormais un numéro de version. Quand tu réuploades une nouvelle version sur GitHub, il suffit d'**ouvrir l'app une fois en ligne** : elle se met à jour seule, sans désinstaller. Tes données sont conservées.

## Étiquettes QR — comment ça marche

- Chaque batch produit a une étiquette avec un **QR code** qui encode un lien vers sa fiche de traçabilité.
- Scanné avec l'**appareil photo de l'iPhone**, le QR propose d'ouvrir l'app directement sur la chaîne fournisseur → lot → batch de ce lot précis.
- Le QR ne fonctionne que sur l'appareil qui contient les données (ou un appareil ayant importé la même sauvegarde) : c'est un outil interne de traçabilité, pas un lien public.
- Les QR sont générés **hors ligne**, sans aucun service externe.

## Données de démonstration

Au premier lancement, l'app contient quelques matières, lots et une recette d'exemple. Supprime-les quand tu saisis tes vraies données.
