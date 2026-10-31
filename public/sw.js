const CACHE_PREFIX = "smartsell-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/brand/smartsell-icon-192.png",
  "/brand/smartsell-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        const index = await cache.match("/index.html");
        if (!index) throw new Error("Smartsell app shell is not available.");
        const html = await index.text();
        const assets = Array.from(
          html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g),
          (match) => match[1],
        );
        await cache.addAll(assets);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/index.html");
        if (!cached) throw new Error("Smartsell app shell is not cached.");
        return cached;
      }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/brand/");
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
