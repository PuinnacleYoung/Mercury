/* 拾光·澈屿 Service Worker（根目录版）v79 —— 策略同 src/sw.js
   JS/CSS/JSON 走 network-first（3s 超时回缓存），保证 Pad/手机也能立刻拿到最新代码 */
const CACHE = 'shuguang-root-v89';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './src/',
  './src/index.html',
  './src/manifest.webmanifest',
  './src/body-template.js',
  './src/npc-render.js',
  './src/map-placeholders.js',
  './src/icons/icon-192.png',
  './src/icons/icon-512.png',
  './src/icons/icon-512-maskable.png',
  './src/icons/apple-touch-icon.png',
  './src/assets/cur/cur-coin.webp',
  './src/assets/cur/cur-diamond.webp',
  './src/assets/cur/cur-pearl.webp'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'GET_SW_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: CACHE });
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.indexOf('/media/') >= 0) return;
  if (req.headers.has('range')) { e.respondWith(fetch(req)); return; }

  var isNav = req.mode === 'navigate' || req.destination === 'document';
  var isCode = /\.(js|css|json)(\?|$)/i.test(url.pathname);

  if (isNav || isCode) {
    e.respondWith((async () => {
      try {
        const net = await Promise.race([
          fetch(new Request(req.url, { cache: 'no-cache' })),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
        ]);
        if (net && net.ok) {
          const c = await caches.open(CACHE);
          c.put(req, net.clone());
        }
        return net;
      } catch (_) {
        const c = await caches.open(CACHE);
        const hit = await c.match(req);
        if (hit) return hit;
        if (isNav) return (await c.match('./index.html')) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  if (url.pathname.indexOf('online-data.json') >= 0) {
    e.respondWith((async () => {
      try {
        const net = await fetch(new Request(req.url, { cache: 'no-store' }));
        const c = await caches.open(CACHE);
        if (net && net.ok) c.put(req, net.clone());
        return net;
      } catch (_) {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || new Response('{}', { status: 404 });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(r => {
      if (r && r.ok && r.status === 200) c.put(req, r.clone());
      return r;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
