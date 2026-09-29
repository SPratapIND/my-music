const CACHE_NAME = "my-music-shell-v2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./favicon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache playlist metadata. It changes when music is added/removed.
  if (url.pathname.endsWith("/music/playlist.json") || url.pathname.endsWith("/music/playlist.json")) {
    return;
  }

  // Never cache large audio files. Let the browser handle range requests.
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (!response.ok) return response;

        const copy = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(request, copy))
          .catch(() => {});

        return response;
      });
    })
  );
});
