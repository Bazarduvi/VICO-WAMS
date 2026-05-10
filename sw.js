// WAMS Service Worker — v3.0
const CACHE_NAME = 'wams-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.png'];

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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'wams-share-img').map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ============================
// FETCH — handles share target POST + cache-first shell
// ============================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── IMAGE SHARE TARGET (POST /share-target) ──────────────────────
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();

          // Text/URL share (existing behaviour)
          const sharedUrl = formData.get('url') || formData.get('text') || '';
          if (sharedUrl) {
            const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
            if (urlMatch) return Response.redirect('/?url=' + encodeURIComponent(urlMatch[0]), 303);
          }

          // Image share — stash blob in a dedicated cache, redirect with flag
          const imageFile = formData.get('image');
          if (imageFile && imageFile instanceof File) {
            const imgCache = await caches.open('wams-share-img');
            // Clear previous stash
            const oldKeys = await imgCache.keys();
            await Promise.all(oldKeys.map(k => imgCache.delete(k)));
            // Store new image
            const arrayBuf = await imageFile.arrayBuffer();
            const response = new Response(arrayBuf, {
              headers: { 'Content-Type': imageFile.type || 'image/png' }
            });
            await imgCache.put('/shared-image', response);
            return Response.redirect('/?wams_shared_img=1', 303);
          }
        } catch (e) {
          console.error('[SW] Share target error:', e);
        }
        return Response.redirect('/', 303);
      })()
    );
    return;
  }

  // ── SKIP non-GET and external API calls ──────────────────────────
  if (event.request.method !== 'GET') return;

  const isExternal = url.origin !== self.location.origin;
  const isApiDomain = ['googleapis', 'groq.com', 'img.youtube.com', 'noembed.com',
    'allorigins.win', 'corsproxy.io', 'pollinations.ai', 'vimeo.com',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'dailymotion.com',
    'twitch.tv', 'reddit.com', 'imgur.com', 'flickr.com'
  ].some(d => url.hostname.includes(d));

  if (isExternal && isApiDomain) return; // network only

  // ── CACHE-FIRST for app shell ─────────────────────────────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/index.html') || caches.match('/');
      });
    })
  );
});
