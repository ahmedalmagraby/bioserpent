// BioSerpent service worker — offline-first cache for PWA install.
const CACHE = 'bioserpent-v39';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './css/main.css',
  './css/animations.css',
  './js/engine/canvas.js',
  './js/engine/gameLoop.js',
  './js/engine/inputManager.js',
  './js/engine/particleSystem.js',
  './js/audio/soundManager.js',
  './js/entities/snake.js',
  './js/entities/rival.js',
  './js/entities/food.js',
  './js/entities/powerups.js',
  './js/entities/obstacles.js',
  './js/levels/levelData.js',
  './js/ui/uiManager.js',
  './js/main.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    // cache: 'reload' skips the browser HTTP cache, which would otherwise hand
    // the new worker the previous build's files.
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page itself is network-first: it names every asset by ?v=N, so serving a
// stale copy pinned players to the old build until a second reload. Offline,
// the cached page is used.
function pageFirst(e) {
  // no-cache: always revalidate with the server (HTTP caching would undo this)
  return fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')));
}

// Assets: cache-first, refresh in background (stale-while-revalidate).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(pageFirst(e));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fetching = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit || new Response('', { status: 504, statusText: 'Gateway Timeout' }));
      return hit || fetching;
    })
  );
});
