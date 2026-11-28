/* Advanced Tasks Supervisor — Service Worker v2
 * Web Push display + notification click routing + offline app shell. */
const CACHE = 'ats-static-v2';
const PRECACHE = ['/logo-icon.svg', '/flags/dz.svg', '/flags/fr.svg', '/flags/gb.svg', '/offline.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    })(),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'ATS PRO', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'ATS PRO';
  const options = {
    body: payload.body || '',
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    lang: payload.lang || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/dashboard' },
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: [90, 60, 90],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          client.postMessage({ type: 'navigate', url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // App navigations: network first, cached shell as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          return cache.match('/offline.html') ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: cache first, refresh in background.
  if (/\/_next\/static\/|\/fonts\/|\/icons\/|\/flags\//.test(new URL(req.url).pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) {
          fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); }).catch(() => undefined);
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});
