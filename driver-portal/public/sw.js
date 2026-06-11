const CACHE_NAME = 'flowops-driver-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logos/flowops-logo.png',
  '/logos/flowops-logo-192.png',
  '/logos/flowops-logo-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;
        
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200) return response;
            
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));
            
            return response;
          });
      })
  );
});
