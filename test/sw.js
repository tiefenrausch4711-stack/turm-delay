// Bei jeder neuen Version VERSION erhöhen. Die neue Version wird beim nächsten App-Start übernommen.
// Test-App. Nur eigene Speicher werden gelöscht, damit die normale App unberührt bleibt.
const PREFIX = 'lagcam-test-';
const VERSION = PREFIX + 'v35';
const FILES = ['./', 'index.html', 'app.js', 'analysis.js', 'draw.js', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den Browser-Zwischenspeicher, sonst landen alte Dateien im neuen Offline-Speicher
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Die Seite fordert das beim Start an, wenn eine neue Version bereitliegt
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION)
      .then(c => c.match(e.request, { ignoreSearch: true }))
      .then(hit => hit || fetch(e.request))
  );
});
