/* FlowOps driver push handler.
 *
 * Imported by the Workbox-generated service worker (see vite.config workbox
 * importScripts) so we can add push WITHOUT hand-writing the whole SW and
 * risking the working offline caching.
 *
 * We send PAYLOAD-LESS pushes from the backend, so 'push' events usually have
 * no data — we show a generic "new job" notification and let the app load
 * details when the driver opens it. If a payload ever is present, we use it.
 */
self.addEventListener('push', (event) => {
  let title = 'FlowOps — New job';
  let body = 'You have a new job assigned. Tap to open.';
  try {
    if (event.data) {
      const d = event.data.json();
      if (d.title) title = d.title;
      if (d.body) body = d.body;
    }
  } catch (_) { /* payload-less push — use defaults */ }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logos/flowops-logo-192.png',
      badge: '/logos/flowops-logo-192.png',
      tag: 'flowops-job',
      renotify: true,
      data: { url: '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if the app is already open, else open a new one.
      for (const c of clients) {
        if ('focus' in c) { c.navigate(target); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
