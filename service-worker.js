// [v1376] MISE EN BOÎTE — Fusion de deux boîtes du même lot. Regrouper physiquement des boîtes issues d'un même lot quand les stocks baissent, SANS perdre la traçabilité. Règle métier stricte (décision de Ben) : on ne fusionne QUE deux boîtes du même parfum ET du même lot (même etiquetteDe = même lot parent, + recipeId/composant/degDeclasse corroborants) — tout le reste est REFUSÉ avec motif (lots/parfums/stades différents, même boîte, non-boîte, boîtes vides). Préserve : somme des restes + des quantités produites/réelles (invariant produit−consommé=reste intact), DLC la plus courte (la plus prudente), traçabilité (etiquetteDe conservé + historique fusionHisto empilable + entrée d'audit dédiée « fusion-boite »). Sécurité : snapshot avant, update+delete dans une transaction. Deux modes : sélection manuelle (lots à ≥2 boîtes, coche exactement 2, même lot garanti par le groupe) et flash QR (scan des 2 boîtes, réutilise openScanner). Entrée « 🔀 Fusionner des boîtes » sur Stock par parfum. Suite v1376 : 35 assertions.
// [v1375] MISE EN BOÎTE — deux bugs d'étiquettes corrigés (audit du flux). BUG#2 (critique) : dans « Étiquettes groupées », lbGenerate lisait des champs #lbcopies_/#lbpieces_ INEXISTANTS dans le DOM (les saisies vivent dans le modèle _lbLignes) → copies forcé à 1 et pièces/boîte ignorées (repli sur la quantité du lot). Désormais lbGenerate lit _lbLignes (la source de vérité, comme le rangement) et imprime dès copies>0 : les quantités saisies sont honorées ET plusieurs boîtes par lot (3×20 + 1×12) sont enfin possibles dans le PDF. BUG#1 : depuis Stock par parfum → « Étiquettes (boîtes) », un toast s'affichait mais le menu Imprimer/Enregistrer disparaissait — closeModal() puis ré-ouverture déclenchait un history.back() dont le popstate différé refermait le modal de résultats ; _etiqValiderGo ne ferme plus le modal avant les résultats, et _etiqResultats remplace le contenu EN PLACE. Règles gravées : l'écran et le générateur lisent le même modèle (v1339/v1374) ; on ne ferme-puis-rouvre jamais un modal à travers un saut async (v1363). Suite v1375 : 17 assertions (dont preuve comportementale à DOM vide).
// [v1374] CHANTIER FIABILITÉ 3/3 — La carte des dépendances entre les chiffres. 11 figures déclarées (FIGURES) : CA encaissé, CA marchés, charges fixes, coût de revient FIFO, point mort, stock fini par parfum, prévisionnel, revenu horaire, sérénité, audits comptable et stock/temps — chacune avec ses sources (tables Dexie ET clés kv), ses amonts, sa règle gelée en une ligne, ses suites de tests. Moteur d'aval transitif (_figAval) + outil `node tests/quoi-retester.js <sources> [--run]` : « j'ai touché X, voici les chiffres périmés et les suites à relancer ». Au commit d'audit, la carte est prévenue (sources dédupliquées, kv par clé) et l'événement sm-figures-perimees est émis ; AUCUN re-rendu automatique (non-but déclaré et testé). Écran « 🕸 Carte des chiffres » dans Sauvegarde & sécurité (sources en clair, règles, protections, badge périmé). Gardes : fonctions/tables/clés kv/suites citées existent, aucun cycle (détecté et nommé), ratchet A7 sur les figures sans suite (une seule : sérénité, déclarée). Suite v1374 : 23 assertions — agrégat : 80 suites, 1779 assertions vertes.
// [v1373] CHANTIER FIABILITÉ 2/3 — Schémas de validation à l'entrée. 21 tables couvertes par un schéma (types français : nombreFini, dateJ, idRef, horoMs…) appliqué via les hooks Dexie creating/updating : une écriture PROUVABLEMENT mal formée (montant en chaîne, NaN, date malformée, tableau attendu, champ d'identité absent à la création) est REFUSÉE — exception typée ValidationRefusee, toast avec motif lisible, entrée « rejet » au journal. Le suspect non prouvé (énumération inconnue — « embarque » serait signalé aujourd'hui —, signe inhabituel) PASSE et est journalisé (« suspect ») : leçon v1370, on ne crie pas au loup sur du sain (corpus de 11 fixtures réelles en garde-fou). Les modifications ne valident que les champs écrits : les fiches anciennes restent éditables. Restauration/fusion : hooks suspendus (audit compris), une seule entrée récapitulative. Interrupteur « validation stricte » à l'écran Sauvegardes (défaut : activée ; désactivée → refus évités journalisés + bannière ambre). Corrigé au passage : Dexie.ignoreTransaction sur toutes les écritures de journal issues de hooks/rappels (zone Dexie morte). Suite v1373 : 32 assertions.
// [v1372] CHANTIER FIABILITÉ 1/3 — Stockage unifié + journal d'audit. (a) Ouverture : suite livrée ROUGE réparée (5 harnais sans _dansPeriode, 2 gardes vague 56 ré-ancrées sur le dossier de justification) + 18 suites orphelines (vagues 63-71) inscrites dans run-all.js. (b) Table Dexie `kv` (schéma v32) : 17 clés localStorage MÉTIER (modèles de pyramides, compteurs légaux de factures/avoirs, journal copilote, charges récurrentes, temps appris, motifs de suppression…) recopiées en base → sauvegardées, vérifiées par somme de contrôle, restaurées automatiquement au boot si localStorage a été purgé (purge iOS / restauration / nouvel appareil). Ordre d'écriture gelé : localStorage d'abord, kv ensuite — en divergence, localStorage gagne et la divergence est journalisée. Point de passage unique (setItem/removeItem enveloppés) : les clés futures sont couvertes d'office, et toute clé non classée fait échouer la suite. (c) Table `auditLog` : chaque création/modification/suppression en base tracée champ par champ (avant → après) via les hooks Dexie, flush au COMMIT seulement, entrées bornées 1200 car., rétention 2000, écran « Sauvegarde & sécurité → 📜 Journal des écritures ». journalCompta reste le journal légal. (d) Somme de contrôle : le périmètre voyage dans le fichier (_checksumTables) ; les sauvegardes d'avant v1372 se vérifient sur la liste héritée figée — aucune invalidation rétroactive. (e) Une restauration d'ancienne sauvegarde n'efface ni kv ni auditLog. Suite v1372 : 49 assertions, preuves par réintroduction. (Note : la v1371 d'une session interrompue — journal copilote durable — est ré-absorbée ici.)
// [v1275] Nettoyage (Sweeper) : suppression de l'écran d'accueil expérimental « Le Fil » (renderAccueil + 8 helpers + variable _accueilSlide, ~282 lignes de JS) et de ses styles CSS .acc-* (~35 lignes) dans index.html. Code entièrement dormant : débranché du routeur (accueil → renderDash inchangé), appelé nulle part, aucune dépendance externe. Aucun changement fonctionnel ni visuel. Suite de tests (282 assertions) verte après coupe.
// [v1274] Espace CGV : les Conditions Générales de Vente et de Prestation (version 3, conformes à l'audit juridique) sont intégrées comme une nouvelle rubrique du menu. Le texte des 16 articles + l'annexe (formulaire de rétractation) est figé ; seuls les champs variables (identité, SIRET, adresse, contact, médiateur MCP pré-rempli) sont renseignés via un formulaire, persistés dans sm_settings.legal (donc inclus dans les sauvegardes). Diffusion en Page CGV affichable + Export PDF (impression → Enregistrer en PDF), bloquée tant qu'un champ obligatoire manque. Aucune table Dexie ajoutée, aucune fonctionnalité retirée.
// [v1273] Commandes : les commandes des SEMAINES FUTURES sont désormais compilées dans un encart « À venir » (déplié par défaut, une ligne par commande comme « À encaisser »), groupé par semaine (de la plus proche à la plus lointaine, dates croissantes). Seules les commandes de la SEMAINE COURANTE (+ retards non livrés) restent en cartes complètes dépliées → lisibilité accrue. Bascule automatique : dès que la semaine d'une commande arrive, elle repasse en carte complète. Aucune logique de statut/paiement/produisibilité modifiée.
// [v1272] Temps de production : le tableau « Par parfum / recette » (qui débordait à droite sur iPhone) est remplacé par un rendu en CARTES. Une carte par parfum : nom + nb de batches en tête, puis Réel / Actif / Moy./batch en grille 3 colonnes. Aucune donnée ni logique changée (garde-fou actif>réel + ⚠ conservés). Tableaux « Par jour » et « Détail par batch » inchangés.
// [v1271] Assemblage : le bouton « Assembler » ne démarre plus de session/chrono d'atelier (l'assemblage physique est fait en amont, temps déjà compté). Il matérialise seulement l'action (décrément composants + création lot).
// [v1270] Section Impot sur le revenu dans la Comptabilite : abattement micro (71%/50%) + taux marginal (30% par defaut) -> impot estime et net reel apres URSSAF+impot. Taux reglable dans Parametres.
const CACHE = 'sm-iphone-v409';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './dexie.min.js',
  './qr.min.js',
  './rd_packs.json',
  './rd_pack_alice.json',
  './rd_pack_bau.json',
  './rd_pack_lenotre.json',
  './rd_pack_karina.json',
  './rd_pack_maddie.json',
  './rd_pack_sab.json',
  './rd_pack_tfp.json',
  './rd_pack_quinonero.json',
  './rd_pack_chiara.json',
  './rd_pack_matt.json',
  './rd_pack_maja.json',
  './rd_pack_herme.json',
  './rd_pack_michalak.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './Outfit-Regular.ttf',
  './Outfit-SemiBold.ttf',
  './Outfit-Bold.ttf',
  './BellotaText-Regular.ttf',
  './BellotaText-Bold.ttf'
];

// INSTALL : précache + activation IMMÉDIATE de la nouvelle version (skipWaiting).
// On n'attend plus un clic utilisateur : la mise à jour s'applique d'elle-même.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// ACTIVATE : purge des anciens caches puis prise de contrôle des onglets.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Permet à l'application de demander l'activation immédiate de la version en attente
// (déclenché par le bouton « Recharger l'application »).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// FETCH :
// - Pour le CODE (index.html, app.js, et la navigation) : NETWORK-FIRST.
//   On tente d'abord le réseau (donc la dernière version en ligne) ; en cas d'échec
//   (hors-ligne), on retombe sur le cache. Fini les vieux app.js servis indéfiniment.
// - Pour le RESTE (librairies, icônes) : Stale-While-Revalidate (rapide + hors-ligne).
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  const isCode = req.mode === 'navigate'
    || url.pathname.endsWith('/app.js')
    || url.pathname.endsWith('/index.html')
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (isCode) {
    // network-first
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.open(CACHE).then(c => c.match(req).then(r => r || c.match('./index.html'))))
    );
    return;
  }

  // stale-while-revalidate pour le reste
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
