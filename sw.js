// El nombre incluye el ámbito porque GitHub Pages comparte el origen entre proyectos.
const prefix = 'woofia:' + self.registration.scope + ':';
const version = prefix + '3.13.0';
const here = path => new URL(path, self.registration.scope).href;
const shell = ['offline.html','assets/axcend.png','assets/design.css','assets/body.woff2','assets/display.woff2','manifest.json','icon-192.png?v=axn-v2','icon-512.png?v=axn-v2','icon-maskable.png?v=axn-v2','apple-touch-icon.png?v=axn-v2'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll(shell.map(path => new Request(here(path), {cache:'reload'})))));
});
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== version).map(name => caches.delete(name)));
    // La caché v2 era global. Retirá únicamente las entradas de esta instalación.
    if (names.includes('axcend-v2-static')) {
      const legacy = await caches.open('axcend-v2-static');
      for (const req of await legacy.keys()) if (req.url.startsWith(self.registration.scope)) await legacy.delete(req);
      if (!(await legacy.keys()).length) await caches.delete('axcend-v2-static');
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req, {cache:'no-cache'}).catch(async () => (await caches.open(version)).match(here('offline.html'))));
    return;
  }
  const path = new URL(req.url).pathname;
  if (!/\.(?:js|css|json|png|webp|woff2|ico|jpg)$/.test(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(version);
    const artwork = /\/(Activos|Ocultos|Chara_Nkd|Elements)\//.test(path);
    const hit = await cache.match(req);
    if (hit && artwork) return hit;
    try {
      const response = await fetch(req, {cache:artwork ? 'default' : 'no-cache'});
      if (response.ok && response.type === 'basic' && !new URL(req.url).search) {
        await cache.put(req, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return hit || Response.error();
    }
  })());
});
