// Service worker do Space Hits: não guarda o site em cache (cada visita pega a versão mais nova).
// Só mostra uma página simples quando o aparelho está sem internet.
const OFFLINE = "/offline.html";
self.addEventListener("install", e => { e.waitUntil(caches.open("space-hits-v1").then(c => c.add(OFFLINE))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
