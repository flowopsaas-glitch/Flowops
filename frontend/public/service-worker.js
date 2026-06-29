/**
 * Tombstone for the LEGACY FlowOps service worker.
 *
 * Older builds registered THIS path (`/service-worker.js`) as a cache-first
 * worker that pinned the installed app to a stale bundle (and a non-existent
 * /manifest.json), which left desktop installs showing old content + a blank
 * icon. The app now uses the vite-plugin-pwa worker at `/sw.js`.
 *
 * Any client still bound to `/service-worker.js` will, on its next update
 * check, fetch this file, install it, then in `activate` drop all caches,
 * unregister itself, and reload its windows onto the fresh build — which then
 * registers the correct `/sw.js`. This makes already-installed apps self-heal
 * with no manual "clear site data" step.
 *
 * Do NOT add caching logic here. This file's only job is to tear itself down.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore */ }
    try { await self.clients.claim(); } catch (_) { /* ignore */ }
    try { await self.registration.unregister(); } catch (_) { /* ignore */ }
    try {
      const wins = await self.clients.matchAll({ type: 'window' });
      wins.forEach((c) => { try { c.navigate(c.url); } catch (_) { /* ignore */ } });
    } catch (_) { /* ignore */ }
  })());
});

// Pure pass-through — never serve anything from cache while tearing down.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
