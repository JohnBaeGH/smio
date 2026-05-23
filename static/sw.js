const CACHE_NAME = 'smio-v1';
const STATIC_ASSETS = [
  '/app/static/manifest.json',
  '/app/static/icons/icon-192.png',
  '/app/static/icons/icon-512.png',
];

// 설치: 정적 에셋 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// 활성화: 구버전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 캐시 폴백
self.addEventListener('fetch', (event) => {
  // Streamlit WebSocket은 캐시 건너뜀
  if (event.request.url.includes('/_stcore/') ||
      event.request.url.includes('/stream') ||
      event.request.method !== 'GET') {
    return;
  }

  // 정적 에셋: 캐시 우선
  if (event.request.url.includes('/app/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // 그 외: 네트워크 우선
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
