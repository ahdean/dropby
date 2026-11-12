/*
 * dropby service worker.
 *
 * Deliberately small and conservative:
 *   - Makes the app installable and gives it an "you're offline" screen.
 *   - Caches only build assets (scripts, styles, fonts, icons), which have
 *     unique file names and never change.
 *   - NEVER caches pages or data. Calendar data must always be fresh and is
 *     private to the signed-in person, so it always comes from the network.
 *
 * Bump VERSION to make every device drop its old cache.
 */
const VERSION = "dropby-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

function isBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase and anything else: untouched

  // Page loads: always the network; if there is none, the offline screen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(VERSION);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  // Build assets: cache first, fill the cache on first use.
  if (isBuildAsset(url)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
