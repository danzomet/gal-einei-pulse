// Gal Einei Social Pulse: keeps the app on the device so it opens fast and works offline.
const CACHE = 'pulse-v2';
const FILES = ['./', 'd3.min.js', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const isPage = (req) => req.mode === 'navigate' || new URL(req.url).pathname.endsWith('/') || new URL(req.url).pathname.endsWith('/index.html');
async function refreshPage(req) {
  const cache = await caches.open(CACHE);
  const old = await cache.match('./');
  const res = await fetch(req, { cache: 'no-store' });
  if (!res.ok) return res;
  const fresh = await res.clone().text();
  const before = old ? await old.text() : null;
  await cache.put('./', res.clone());
  if (before !== null && before !== fresh) {
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage('pulse-updated');
  }
  return res;
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (isPage(req)) {
    e.respondWith((async () => {
      // Newest copy first, so numbers are never hours old; the saved copy only when offline or slow (4 s).
      const cached = await caches.match('./');
      const update = refreshPage(req).catch(() => null);
      e.waitUntil(update);
      if (!cached) return (await update) || new Response('Offline', { status: 503 });
      const res = await Promise.race([update, new Promise((r) => setTimeout(() => r(null), 4000))]);
      return res && res.ok ? res : cached;
    })());
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
