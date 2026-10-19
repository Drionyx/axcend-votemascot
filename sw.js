// AXCEND - Service Worker
// Estrategia:
//   - HTML  → network-first (para que las actualizaciones se vean al instante)
//   - Estáticos (imágenes, iconos, manifest) → cache-first (para que cargue rápido)
//   - Firebase y CDNs externos → no se cachean (siempre red)
//   - Fallback offline → sirve index.html desde caché si no hay red

const CACHE_VERSION = 'axcend-v2';
const CACHE_STATIC = CACHE_VERSION + '-static';

const ASSETS_PRECACHE = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './favicon.ico',
  './favicon.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

// ============================================================
// INSTALL: precachear assets críticos
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => cache.addAll(ASSETS_PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE: limpiar cachés viejas y tomar el control
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_STATIC)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH: rutas de red vs caché según el tipo
// ============================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No interceptar peticiones a otros dominios (Firebase, CDNs, etc.)
  if (url.origin !== self.location.origin) return;

  // HTML → network-first (para que los deploys nuevos se vean enseguida)
  if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Estáticos (imágenes, iconos, css, js) → cache-first
  if (/\.(png|jpg|jpeg|webp|svg|gif|ico|css|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // manifest y sw → network-first
  if (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('/sw.js')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Cualquier otra ruta → network-first con fallback a caché
  event.respondWith(networkFirst(req));
});

// ============================================================
// ESTRATEGIAS
// ============================================================

// Network-first: intenta la red, si falla usa caché; si la red responde, actualiza caché
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback offline para HTML
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline y sin caché disponible', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Cache-first: intenta caché, si no, va a red y guarda
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    return new Response('', { status: 404 });
  }
}