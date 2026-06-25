const CACHE = 'sm-iphone-v907';
const ASSETS = [
  './',
  './index.html',
  './utils.js?v=907',
  './app.js?v=907',
  './dexie.min.js',
  './qr_min.js?v=907',
  './pdf_extract.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './fonts/Outfit-Light.ttf',
  './fonts/Outfit-Regular.ttf',
  './fonts/Outfit-Medium.ttf',
  './fonts/Outfit-SemiBold.ttf',
  './fonts/Outfit-Bold.ttf',
  './fonts/Fraunces-Variable.ttf',
  './fonts/BellotaText-Regular.ttf',
  './fonts/BellotaText-Bold.ttf'
];

// INSTALL : précache + activation IMMÉDIATE de la nouvelle version (skipWaiting).
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(ASSETS).then(()=>{
        return c.add('./html5-qrcode.min.js?v=907').catch(()=>{});
      })
    ).then(() => self.skipWaiting())
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

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

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
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.open(CACHE).then(c => c.match(req, {ignoreSearch:true}).then(r => r || c.match('./index.html'))))
    );
    return;
  }

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
