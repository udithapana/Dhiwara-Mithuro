/* ධීවර මිතුරා service worker — only touches caches named "dheewara-mithura-*" */
var PREFIX = 'dheewara-mithura-';
var SHELL = PREFIX + 'shell-v5';
var TILES = PREFIX + 'tiles-v1';
var RUNTIME = PREFIX + 'rt-v1';
var KEEP = [SHELL, TILES, RUNTIME];
var MAX_TILES = 600;

var SHELL_FILES = [
  './', 'index.html', 'style.css?v=5', 'boundaries.js?v=5', 'calc.js?v=5', 'app.js?v=5', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(SHELL_FILES.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && KEEP.indexOf(k) < 0; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trim(cacheName, max) {
  caches.open(cacheName).then(function (c) {
    c.keys().then(function (keys) {
      if (keys.length > max) Promise.all(keys.slice(0, keys.length - max).map(function (k) { return c.delete(k); }));
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // live data (weather, satellite) — handled by the app itself
  if (/open-meteo\.com$/.test(url.hostname) || url.hostname === 'coastwatch.pfeg.noaa.gov') return;

  // map tiles: cache first, keep what the user has looked at
  if (url.hostname === 'tile.openstreetmap.org' || url.hostname === 'tiles.openseamap.org') {
    e.respondWith(caches.open(TILES).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(TILES, MAX_TILES); }
          return res;
        });
      });
    }));
    return;
  }

  // fonts / CDN: cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(RUNTIME).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
    return;
  }

  // app's own files (same folder): network first so updates show, cache as fallback
  if (url.origin === self.location.origin && url.pathname.indexOf(new URL('./', self.registration.scope).pathname) === 0) {
    // always check GitHub for the newest file (skip the browser's HTTP cache)
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.open(SHELL).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
        });
      });
    }));
  }
});
