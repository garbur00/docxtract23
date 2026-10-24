/* ═══════════════════════════════════════════════════════════════════
   DocXtract Service Worker
   Strategy:
   - Navigations: network-first, with cached HTML only when offline
   - Static assets: cache-first (build assets use content hashes)
   - API and health calls: NEVER cached (always network — data is dynamic)
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = "docxtract-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install — pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {/* tolerate missing assets */})
    )
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API, health or non-GET — always go to network.
  if (request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname === "/health") {
    return; // let the browser handle it normally
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION).catch(() => null);
      try {
        const response = await fetch(request);
        if (cache && response.ok && response.type === "basic") {
          await cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        const cached = cache && (
          await cache.match(request)
          || await cache.match("/index.html")
          || await cache.match("/")
        );
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Content-hashed build assets must keep the same bytes for their URL.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION).catch(() => null);
    const cached = cache && await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (cache && response.ok && response.type === "basic") {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
