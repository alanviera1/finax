const CACHE_PREFIX = "finax";
const CACHE_VERSION = "20260724-gemini-auth-v3";
const APP_SHELL_CACHE = `${CACHE_PREFIX}-app-shell-${CACHE_VERSION}`;
const RUNTIME_STATIC_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./firebase-config.js",
  "./app.js?v=20260724-gemini-auth-v2",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

const OPTIONAL_CDN_ASSETS = [
  "https://cdn.tailwindcss.com/",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
];

const STATIC_DESTINATIONS = new Set([
  "document",
  "script",
  "style",
  "image",
  "font",
]);

function isFinancialApiRequest(url) {
  const hostname = url.hostname.toLowerCase();

  return (
    hostname === "generativelanguage.googleapis.com" ||
    hostname === "firestore.googleapis.com" ||
    hostname.endsWith(".googleapis.com") ||
    hostname.endsWith(".firebaseio.com")
  );
}

function isCacheableResponse(response) {
  return response.ok || response.type === "opaque";
}

async function fetchAndCache(request) {
  const response = await fetch(request);

  if (isCacheableResponse(response)) {
    const requestUrl = new URL(request.url);
    const targetCache =
      requestUrl.origin === self.location.origin
        ? APP_SHELL_CACHE
        : RUNTIME_STATIC_CACHE;
    const cache = await caches.open(targetCache);
    await cache.put(request, response.clone());
  }

  return response;
}

async function staleWhileRevalidate(request, event) {
  const cachedResponse = await caches.match(request);
  const networkUpdate = fetchAndCache(request);

  if (cachedResponse) {
    event.waitUntil(networkUpdate.catch(() => undefined));
    return cachedResponse;
  }

  try {
    return await networkUpdate;
  } catch (error) {
    if (request.mode === "navigate") {
      const appShellFallback = await caches.match(
        new URL("./index.html", self.location.href).href,
      );

      if (appShellFallback) {
        return appShellFallback;
      }
    }

    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const requests = APP_SHELL_URLS.map(
        (url) =>
          new Request(new URL(url, self.location.href), {
            cache: "reload",
          }),
      );

      await cache.addAll(requests);

      const runtimeCache = await caches.open(RUNTIME_STATIC_CACHE);
      await Promise.allSettled(
        OPTIONAL_CDN_ASSETS.map(async (url) => {
          const request = new Request(url, {
            cache: "reload",
            mode: "no-cors",
          });
          const response = await fetch(request);

          if (isCacheableResponse(response)) {
            await runtimeCache.put(request, response);
          }
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const currentCaches = new Set([
        APP_SHELL_CACHE,
        RUNTIME_STATIC_CACHE,
      ]);

      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(`${CACHE_PREFIX}-`) &&
              !currentCaches.has(cacheName),
          )
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firestore conserva su propia persistencia IndexedDB. Estas APIs nunca
  // deben recibir respuestas financieras desde Cache Storage.
  if (isFinancialApiRequest(url)) {
    return;
  }

  if (
    request.method !== "GET" ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isStaticRequest =
    isSameOrigin || STATIC_DESTINATIONS.has(request.destination);

  if (!isStaticRequest) {
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});
