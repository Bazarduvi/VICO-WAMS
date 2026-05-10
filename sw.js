// WAMS Service Worker — v3.1 (GitHub Pages: /VICO-WAMS/)
const CACHE_NAME = 'wams-v3';
const BASE = '/VICO-WAMS';
const STATIC_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icon.png'
];

// ============================
// INSTALL
// ============================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err => console.warn('[SW] Pre-cache partial:', err))
    )
  );
  self.skipWaiting();
});

// ============================
// ACTIVATE
// ============================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== 'wams-share-img').map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ============================
// FETCH
// ============================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── IMAGE SHARE TARGET (POST /VICO-WAMS/share-target) ────────────
  if (event.request.method === 'POST' && url.pathname === BASE + '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();

          // Text/URL share
          const sharedUrl = formData.get('url') || formData.get('text') || '';
          if (sharedUrl) {
            const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
            if (urlMatch) return Response.redirect(BASE + '/?url=' + encodeURIComponent(urlMatch[0]), 303);
          }

          // Image share — stash blob in cache, redirect with flag
          const imageFile = formData.get('image');
          if (imageFile && imageFile instanceof File) {
            const imgCache = await caches.open('wams-share-img');
            const oldKeys = await imgCache.keys();
            await Promise.all(oldKeys.map(k => imgCache.delete(k)));
            const arrayBuf = await imageFile.arrayBuffer();
            const response = new Response(arrayBuf, {
              headers: { 'Content-Type': imageFile.type || 'image/png' }
            });
            await imgCache.put('/shared-image', response);
            return Response.redirect(BASE + '/?wams_shared_img=1', 303);
          }
        } catch (e) {
          console.error('[SW] Share target error:', e);
        }
        return Response.redirect(BASE + '/', 303);
      })()
    );
    return;
  }

  // ── Skip non-GET ─────────────────────────────────────────────────
  if (event.request.method !== 'GET') return;

  // ── Skip external API calls ───────────────────────────────────────
  const isExternal = url.origin !== self.location.origin;
  const isApiDomain = ['googleapis', 'groq.com', 'img.youtube.com', 'noembed.com',
    'allorigins.win', 'corsproxy.io', 'pollinations.ai', 'vimeo.com',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'dailymotion.com',
    'twitch.tv', 'reddit.com', 'imgur.com', 'flickr.com'
  ].some(d => url.hostname.includes(d));

  if (isExternal && isApiDomain) return;

  // ── Cache-first for app shell ─────────────────────────────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match(BASE + '/index.html') || caches.match(BASE + '/');
        }
      });
    })
  );
});
