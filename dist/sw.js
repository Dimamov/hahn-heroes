const CACHE='hahn-v13';
const ASSETS=['./','./index.html','./ChatGPT Image Sep 20, 2026, 10_01_06 PM.png','./app-icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>event.respondWith(fetch(event.request).catch(()=>caches.match(event.request))));
