/*
 * Small offline shell for the static GitHub Pages build.
 *
 * The app is a single-page hash-router, so a navigation request always points
 * at index.html. On install we cache the shell, its hashed assets, the fonts
 * referenced by CSS, and the two built-in packs. Hashed assets are immutable;
 * navigations remain network-first so a new deployment is picked up online.
 */
const CACHE_NAME = "yomidojo-shell-v2";
const INDEX_URL = new URL("./index.html", self.registration.scope).toString();
const ROOT_URL = new URL("./", self.registration.scope).toString();
const SEED_URLS = ["builtin-n1.json", "builtin-n2.json"].map((name) =>
  new URL(`data/${name}`, self.registration.scope).toString(),
);

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const visited = new Set();
  const queue = [INDEX_URL, ROOT_URL, ...SEED_URLS];

  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) continue;
      await cache.put(url, response.clone());
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        const html = await response.text();
        for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const asset = new URL(match[1], INDEX_URL).toString();
          if (asset.startsWith(self.registration.scope) && !visited.has(asset)) {
            queue.push(asset);
          }
        }
      } else if (type.includes("text/css")) {
        const css = await response.text();
        for (const match of css.matchAll(/url\(([^)]+)\)/g)) {
          const value = match[1].trim().replace(/^['"]|['"]$/g, "");
          if (!value || value.startsWith("data:")) continue;
          const asset = new URL(value, url).toString();
          if (asset.startsWith(self.registration.scope) && !visited.has(asset)) {
            queue.push(asset);
          }
        }
      }
    } catch {
      // A partially available cache is still useful. The runtime fetch
      // handler fills in anything missed while the user is online.
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precache();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(INDEX_URL, response.clone());
          return response;
        } catch {
          return (
            (await cache.match(INDEX_URL, { ignoreVary: true })) ??
            (await cache.match(ROOT_URL, { ignoreVary: true })) ??
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Static hosts commonly emit `Vary: Origin`. Install-time fetches do not
      // send an Origin header, while module/script requests do. Ignoring Vary
      // keeps the immutable hashed assets addressable for offline reloads.
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })(),
  );
});
