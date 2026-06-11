
// Force unregister service worker to clear old cache
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
      console.log('Service Worker unregistered');
    }
  });
}
// Clear all caches
caches.keys().then(function(names) {
  for (let name of names) caches.delete(name);
});
