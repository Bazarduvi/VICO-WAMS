// WAMS - WhatsApp Media Share
// Service Worker v2.0
const CACHE_NAME = 'wams-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png'
];

// Install
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // YouTube thumbnails: cache-first for performance
  if (url.hostname === 'img.youtube.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return cached || new Response('', { status: 404 });
        }
      })
    );
    return;
  }

  // App shell: cache-first
  if (ASSETS.some(a => url.pathname.endsWith(a) || url.pathname === a)) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // Network first for everything else
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Share Target handler
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const sharedUrl = formData.get('url') || formData.get('text') || '';
      const redirectUrl = '/?url=' + encodeURIComponent(sharedUrl);
      return Response.redirect(redirectUrl, 303);
    })());
  }
});

// Push notifications (ready for future use)
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'WAMS', {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png'
  });
});
