// Only immutable, version-pinned engine assets are cached; app code stays fresh.
const CACHE = 'scrapbook-stockfish-19.0.1-full-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.headers.has('x-scrapbook-download')) return;
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/engine/stockfish-19-single.')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(event.request);
    if (saved) return saved;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
