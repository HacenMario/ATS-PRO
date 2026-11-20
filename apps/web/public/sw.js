/* Advanced Tasks Supervisor — Service Worker
 * Handles Web Push display + notification click routing + offline app shell.
 * Push payloads carry LOCALIZED title/body rendered by the API in the
 * recipient's preferred language (see docs/NOTIFICATIONS.md).
 */
const CACHE = 'ats-static-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/logo-icon.svg', '/flags/dz.svg', '/flags/fr.svg', '/flags/gb.svg'])),
  );
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
    payload = { title: 'Advanced Tasks Supervisor', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Advanced Tasks Supervisor';
  const options = {
    body: payload.body || '',
    tag: payload.tag || undefined,           // dedup: replaces an identical open notification
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

// Navigation messages from the page (notification opened an existing window).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});
