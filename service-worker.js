const CACHE = 'sm-iphone-v35';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './dexie.min.js',
  './qr.min.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// INSTALL : précache des ressources. PAS de skipWaiting automatique :
// la nouvelle version attend que l'utilisateur clique « Recharger » dans l'app.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
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

// FETCH : Stale-While-Revalidate.
// On répond immédiatement avec le cache (rapidité, hors-ligne), tout en allant
// chercher une version fraîche en arrière-plan pour mettre le cache à jour.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let sameOrigin = true;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (err) {}
  if (!sameOrigin) return;

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
