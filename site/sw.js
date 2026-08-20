/* Service Worker بسيط لتطبيق يلا كتطبيق ويب (PWA) — Card 53.
   يخزّن هيكل الصفحة للعمل السريع وبلا اتصال جزئيًا. */
const CACHE = 'yalla-app-v1';
const ASSETS = [
  './app.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// شبكة أولًا مع رجوع للمخزّن عند انقطاع الاتصال (مناسب لصفحة هبوط ثابتة).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((m) => m || caches.match('./app.html')))
  );
});
