// Service worker: la app funciona sin conexión y envía partes en segundo plano.
const VERSION = 'partes-maquina-v5';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'config.js', 'db.js', 'sync.js', 'demo.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

importScripts('config.js', 'db.js', 'sync.js');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSION).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Archivos de la app: primero la red (para coger actualizaciones), si no hay, la copia guardada.
// Las llamadas a Supabase nunca se guardan en caché.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// Android: cuando vuelve la cobertura, el sistema despierta al service worker aunque la app esté cerrada.
self.addEventListener('sync', e => {
  if (e.tag !== 'enviar-partes') return;
  e.waitUntil(Sync.enviarPendientes().then(async r => {
    (await self.clients.matchAll()).forEach(c => c.postMessage('partes-enviados'));
    if (r.sinConexion) throw new Error('sin conexión, reintentar');
  }));
});
