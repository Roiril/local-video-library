// ─── Version ─────────────────────────────────────────────────────────────────
// ⚠️  デプロイのたびにここをインクリメントする（例: v1 → v2）
// これが変わるだけで古いキャッシュが全て削除され、最新版が配信される
const CACHE_VERSION = 'v1';
const CACHE_NAME = `video-lib-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
];

// Install: App Shell を新しいキャッシュに保存し、即座に有効化する
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // 待機をスキップして即座に active 状態になる（旧バージョンを即置き換え）
  self.skipWaiting();
});

// Activate: 古いキャッシュを全て削除し、全クライアントを即座に制御下に置く
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  // 全クライアント（開いているタブ）を即座にこの SW の制御下に置く
  // → app.js 側の controllerchange イベントが発火し、自動リロードされる
  self.clients.claim();
});

// Fetch: キャッシュファースト戦略（同一オリジンの GET のみ対象）
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
