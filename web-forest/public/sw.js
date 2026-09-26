/**
 * Offline shell for the walk.
 *
 * Stage wifi and campus dead spots are the whole reason this exists: once the
 * app has been opened on a device, the shell and its build output are served
 * from cache, so the demo does not depend on the network. Only the iNaturalist
 * calls need the network, and those already report offline on their own.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, and why:
 *
 * v2 cache-firsted every same-origin GET. Under `vite dev` that meant it cached
 * all 198 dev modules — `/src/app.tsx`, `/src/data.ts`, every asset — and then
 * served them forever. Adding an export to `data.ts` produced a white screen and
 * `does not provide an export named …`, because the browser was reading a build
 * from an hour earlier. In production the same rule would pin `/brand/*.png` and
 * the manifest to whatever shipped first.
 *
 * So cache-first is now limited to `/assets/`, which Vite content-hashes — a
 * hashed URL can never go stale, which is the only condition that makes
 * cache-first safe. Everything else is network-first with a cache fallback:
 * online it is always current, offline it still works.
 *
 * `main.tsx` additionally refuses to register this at all under `dev`.
 *
 * Bump CACHE_VERSION whenever the shell needs to be re-fetched.
 */
const CACHE_VERSION = "magisphere-v7";
/* Deliberately NOT renamed with the shell. The cache key is what a device's
   warmed campus is stored under; renaming it on the Magisphere rename would
   have thrown away every tile banked by "Save offline" on the eve of the
   showcase, to buy nothing but a matching string. */
const TILE_CACHE = "field-guide-tile-v1";

/**
 * Map tiles are cross-origin, so the same-origin guard below would skip them
 * and the walk would be blank offline. A tile URL encodes z/x/y — the image at
 * one URL does not change — so cache-first is correct here for the same reason
 * it is correct for a hashed asset.
 *
 * Kept in its own cache so a shell bump does not throw away a warmed campus,
 * and capped so a long pan cannot fill the device.
 */
/* MUST list a host for every entry in SOURCE (`src/tile-map.tsx`). A layer whose
   host is missing here fetches fine online and is blank offline, which is the
   worst way to find out — so `test/sw.test.ts` fails if the two drift apart.
   `openstreetmap.fr` is CyclOSM and is a different domain from `.org`. */
const TILE_HOST = [
  "tile.openstreetmap.org",
  "server.arcgisonline.com",
];
/* Two full campus layers at z17–19 is ~450 tiles; the cap leaves room for a
   pan on top without evicting what "Save offline" just banked. */
const TILE_LIMIT = 1400;
/* The four stage models the 3D character renders (`src/character-model.tsx`).
   Without them in the shell the character is a blank box exactly when it
   matters — offline on the hall projector. ~165 KB total. The 80 MB species
   pack under /model/species/ is deliberately NOT listed: it loads on demand
   and precaching it would blow the device budget. */
const CHARACTER_MODELS = [
  "/model/character-egg.glb",
  "/model/character-seedling.glb",
  "/model/character-sapling.glb",
  "/model/character-tree.glb",
];
/* The spawn pool. 422 KB of real sweep data and the ONLY input to the rotating
   world — without it offline, "Out right now" silently renders nothing, which
   is the failure mode hardest to notice on a stage. The .glb files it points at
   are still on-demand; this is the index, not the pack. */
const WORLD_DATA = "/model/species-model.json";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/icon-512-maskable.png",
  /* The favicon: the one brand file the app loads by URL rather than
     through the hashed bundle. */
  "/brand/magi/app-icon.svg",
  WORLD_DATA,
  ...CHARACTER_MODELS,
];

/** Content-hashed build output. The only thing safe to serve cache-first. */
function isImmutable(url) {
  return url.pathname.startsWith("/assets/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((key) =>
        Promise.all(
          key.filter((k) => k !== CACHE_VERSION && k !== TILE_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isTile(url) {
  return TILE_HOST.some((host) => url.hostname === host || url.hostname.endsWith("." + host));
}

/** Oldest-first eviction. `cache.keys()` is insertion-ordered. */
function trimTile(cache) {
  return cache.keys().then((key) => {
    if (key.length <= TILE_LIMIT) return undefined;
    return Promise.all(key.slice(0, key.length - TILE_LIMIT).map((k) => cache.delete(k)));
  });
}

/**
 * Cache a tile only when we can see that it is one.
 *
 * This used to accept `response.type === "opaque"` as good enough. Under
 * `no-cors` every cross-origin reply is opaque with status 0 — including the
 * 502s CyclOSM's volunteer server returns under load — so a failed tile was
 * stored as if it were imagery and served from cache from then on. Poisoning is
 * silent, survives reloads, and looks exactly like a hole in the map.
 *
 * All four tile hosts send `Access-Control-Allow-Origin: *` (probed
 * 2026-09-02), so the `<img>` elements request CORS and the status is readable.
 * If a host ever stops sending it the response goes opaque again and this
 * refuses to cache it — the map still draws from the network, it just stops
 * pretending it can work offline.
 */
function handleTile(request) {
  return caches.open(TILE_CACHE).then((cache) =>
    cache.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type !== "opaque") {
            cache.put(request, response.clone()).then(() => trimTile(cache));
          }
          return response;
        }),
    ),
  );
}

function put(request, response) {
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

/** Same-origin navigation → cached shell when the network is gone. */
function handleNavigate(request) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put("/index.html", copy));
      return response;
    })
    .catch(() => caches.match("/index.html").then((hit) => hit || Response.error()));
}

/** Hashed build assets never change under one URL — cache first. */
function handleImmutable(request) {
  return caches.match(request).then((hit) => hit || fetch(request).then((r) => put(request, r)));
}

/** Everything else — current when online, still there when not. */
function handleRest(request) {
  return fetch(request)
    .then((r) => put(request, r))
    .catch(() => caches.match(request).then((hit) => hit || Response.error()));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isTile(url)) {
    event.respondWith(handleTile(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request));
    return;
  }
  event.respondWith(isImmutable(url) ? handleImmutable(request) : handleRest(request));
});
