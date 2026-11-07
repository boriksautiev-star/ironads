const CACHE_NAME = 'IronAds-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/profile.html',
  '/listing.html',
  '/chats.html',
  '/chat.html',
  '/history.html',
  '/moderation.html',
  '/admin.html',
  '/settings.html',
  '/manifest.json',
  '/register-sw.js',
  '/admin-frontend.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Исключаем OAuth и API запросы
  if (url.pathname.startsWith('/auth/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});