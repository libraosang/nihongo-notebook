/* ========================================================
   日本語学習ノート · Service Worker
   - 静的アセット（HTML/CSS/JS/manifest/icon）はキャッシュファースト
   - data/notes.json はネットワークファースト（更新を素早く反映）
   ======================================================== */

const CACHE_NAME = 'nihongo-notebook-v2-stage2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style.css',
  './assets/app.js',
  './assets/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {/* 一部失敗しても続行 */})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // データ JSON: ネットワーク優先（オフライン時のみキャッシュ）
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Google Fonts: ネットワーク優先＋キャッシュフォールバック
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // 静的アセット: キャッシュ優先
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      // 同一オリジンのみキャッシュに追加
      if (url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
