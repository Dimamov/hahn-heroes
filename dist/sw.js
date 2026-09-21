const CACHE='hahn-v1';
const ASSETS=['/','/index.html','/hahn-concept.jpg','/manifest.webmanifest','/app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>event.respondWith(fetch(event.request).catch(()=>caches.match(event.request))));
