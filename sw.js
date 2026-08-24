// BioSerpent service worker — offline-first cache for PWA install.
const CACHE = 'bioserpent-v18';
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
  './js/entities/food.js',
  './js/entities/powerups.js',
  './js/entities/obstacles.js',
  './js/levels/levelData.js',
  './js/ui/uiManager.js',
  './js/main.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first, refresh in background (stale-while-revalidate).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fetching = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fetching;
    })
  );
});
