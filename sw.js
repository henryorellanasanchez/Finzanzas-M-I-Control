/* ====================================================================
   sw.js — Service Worker mínimo.
   Dos motivos para que exista:
   1. Es un requisito técnico de Chrome/Android para ofrecer "Instalar
      app" en vez de un simple acceso directo (en iOS/Safari no hace
      falta, "Agregar a inicio" ya funciona sin esto).
   2. De paso, cachea el "shell" de la app (HTML/CSS/JS/íconos propios)
      para que cargue rápido y no se rompa por una conexión inestable.

   Lo que NO hace a propósito: no cachea nada de Supabase, Google ni
   los CDNs (Chart.js, fuentes, etc.) — esos siempre van a la red, así
   que tus datos financieros nunca se sirven "viejos" desde acá. Si no
   hay conexión en absoluto, la app carga su interfaz desde caché pero
   la pantalla de login/datos seguirá necesitando internet para
   funcionar de verdad (esto no es una app 100% offline-first, es un
   shell resiliente + instalable).

   Si editas css/app.css o cualquier js/*.js, sube CACHE_NAME (v1→v2)
   para que los usuarios reciban la versión nueva en vez de la cacheada.
   ==================================================================== */

const CACHE_NAME = 'finanzas-shell-v4';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/config.js',
  './js/constants.js',
  './js/dataLayer.js',
  './js/googleCalendar.js',
  './js/i18n.js',
  './js/registry.js',
  './js/state.js',
  './js/theme.js',
  './js/ui.js',
  './js/utils.js',
  './js/modules/agregar.js',
  './js/modules/compartir.js',
  './js/modules/dashboard.js',
  './js/modules/deudas.js',
  './js/modules/exportar.js',
  './js/modules/gastos.js',
  './js/modules/ingresos.js',
  './js/modules/mensual.js',
  './js/modules/notas.js',
  './js/modules/presupuestos.js',
  './js/modules/recordatorios.js',
  './js/modules/registros.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/mi-control.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nunca interferir con escrituras (POST/PATCH/DELETE a Supabase/Google) ni
  // con dominios ajenos (Supabase, Google, CDNs): eso siempre va directo a
  // la red, sin pasar por este Service Worker.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación (abrir/recargar la app): red primero, y si no hay conexión
  // cae al index.html cacheado en vez de mostrar el error del navegador.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Archivos propios (css/js/íconos): cache primero para que cargue al
  // instante, y en paralelo actualiza la caché desde la red para la
  // próxima vez (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
