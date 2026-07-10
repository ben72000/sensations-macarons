// [v1275] Nettoyage (Sweeper) : suppression de l'écran d'accueil expérimental « Le Fil » (renderAccueil + 8 helpers + variable _accueilSlide, ~282 lignes de JS) et de ses styles CSS .acc-* (~35 lignes) dans index.html. Code entièrement dormant : débranché du routeur (accueil → renderDash inchangé), appelé nulle part, aucune dépendance externe. Aucun changement fonctionnel ni visuel. Suite de tests (282 assertions) verte après coupe.
// [v1274] Espace CGV : les Conditions Générales de Vente et de Prestation (version 3, conformes à l'audit juridique) sont intégrées comme une nouvelle rubrique du menu. Le texte des 16 articles + l'annexe (formulaire de rétractation) est figé ; seuls les champs variables (identité, SIRET, adresse, contact, médiateur MCP pré-rempli) sont renseignés via un formulaire, persistés dans sm_settings.legal (donc inclus dans les sauvegardes). Diffusion en Page CGV affichable + Export PDF (impression → Enregistrer en PDF), bloquée tant qu'un champ obligatoire manque. Aucune table Dexie ajoutée, aucune fonctionnalité retirée.
// [v1273] Commandes : les commandes des SEMAINES FUTURES sont désormais compilées dans un encart « À venir » (déplié par défaut, une ligne par commande comme « À encaisser »), groupé par semaine (de la plus proche à la plus lointaine, dates croissantes). Seules les commandes de la SEMAINE COURANTE (+ retards non livrés) restent en cartes complètes dépliées → lisibilité accrue. Bascule automatique : dès que la semaine d'une commande arrive, elle repasse en carte complète. Aucune logique de statut/paiement/produisibilité modifiée.
// [v1272] Temps de production : le tableau « Par parfum / recette » (qui débordait à droite sur iPhone) est remplacé par un rendu en CARTES. Une carte par parfum : nom + nb de batches en tête, puis Réel / Actif / Moy./batch en grille 3 colonnes. Aucune donnée ni logique changée (garde-fou actif>réel + ⚠ conservés). Tableaux « Par jour » et « Détail par batch » inchangés.
// [v1271] Assemblage : le bouton « Assembler » ne démarre plus de session/chrono d'atelier (l'assemblage physique est fait en amont, temps déjà compté). Il matérialise seulement l'action (décrément composants + création lot).
// [v1270] Section Impot sur le revenu dans la Comptabilite : abattement micro (71%/50%) + taux marginal (30% par defaut) -> impot estime et net reel apres URSSAF+impot. Taux reglable dans Parametres.
const CACHE = 'sm-iphone-v336';
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
