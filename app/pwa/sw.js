// Service worker de la PWA. La ruta /sw.js antepone `self.PWA = {version, base, precache}` (ver app/routes.php).
//
// Estrategias:
//  - Páginas: red primero (siempre la versión más nueva) y, sin conexión, la última guardada.
//  - Archivos propios (/assets): se responde con lo guardado y se actualiza en segundo plano.
//  - Librerías y fuentes de CDN (OpenCV, pdf.js, Tesseract, Google Fonts): guardadas al primer uso; sus URLs
//    llevan versión fija, así que no cambian. Con eso la app funciona sin conexión después de usar cada modo una vez.

const { version, base, precache } = self.PWA;
const SHELL = `shell-${version}`;
const CDN = 'cdn-v2'; // v2: las librerías se piden con CORS (SRI); v1 podía tener respuestas opacas
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Uno por uno: si un archivo falla, el resto se guarda igual.
    await Promise.all(precache.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => (k.startsWith('shell-') && k !== SHELL) || (k.startsWith('cdn-') && k !== CDN)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La página pide activar la versión nueva cuando el usuario acepta actualizar.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Páginas: navegación normal o sección pedida por el enrutador (navegación sin recarga).
  if (req.mode === 'navigate' || req.headers.get('X-Requested-With') === 'scanner-router') {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith(`${base}/assets/`)) {
    event.respondWith(staleWhileRevalidate(event, req));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true }))
      ?? (await cache.match(`${base}/`))
      ?? new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return (await update) ?? new Response('', { status: 504 });
}

async function cacheFirst(req) {
  const cache = await caches.open(CDN);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  // Respuestas CORS correctas u opacas (hojas de estilo de fuentes): ambas sirven para volver a usarlas.
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
