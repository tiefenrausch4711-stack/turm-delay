// Früher lag die normale App direkt hier. Seit dem 01.10.2026 liegt sie unter app/ und die Test-App unter test/.
// Dieser Service Worker räumt den alten auf. Er meldet sich sofort ab und lädt offene Seiten neu,
// damit sie die Startseite aus dem Netz holen. Die Speicher der beiden Apps fasst er nicht an.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});
