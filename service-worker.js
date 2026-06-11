const CACHE = 'sm-iphone-v148';
const ASSETS = [
  './',
  './index.html',
  './utils.js',
  './app.js',
  './dexie.min.js',
  './qr.min.js',
  './pdf_extract.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
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
    || url.pathname.endsWith('/utils.js')
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
