/* 拾光·澈屿 Service Worker（根目录版）—— 策略同 src/sw.js */
const CACHE = 'shuguang-root-v25';
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
  './src/legacy-body-v4.js',
  './src/npc-render.js',
  './src/map-placeholders.js',
  './src/icons/icon-192.png',
  './src/icons/icon-512.png',
  './src/icons/icon-512-maskable.png',
  './src/icons/apple-touch-icon.png'
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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 媒体视频（/media/*.mp4）：**必须放行**。视频请求带 Range 头，nginx 回 206，
  // 而 Cache Storage 不收 206 —— 一旦进下面缓存分支，put 抛错被吞 → 兜底 504 → 视频加载失败
  //（表现为：试开场弹「❌ 开场动画加载失败: /media/intro.mp4」）。靠 nginx 7 天 HTTP 缓存就够。
  if (url.pathname.indexOf('/media/') >= 0) return;

  // 线上数据包：永远网络优先（陛下更新了数据要立刻能拉到），断网才回缓存
  if (url.pathname.indexOf('online-data.json') >= 0) {
    e.respondWith((async () => {
      try {
        const net = await fetch(new Request(req.url, { cache: 'no-store' }));
        const c = await caches.open(CACHE);
        if (net && net.ok && net.status === 200) c.put(req, net.clone());
        return net;
      } catch (_) {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || new Response('{}', { status: 404 });
      }
    })());
    return;
  }

  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith((async () => {
      try {
        const net = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('net-timeout')), 2500))
        ]);
        if (net && net.ok && net.status === 200) {
          const c = await caches.open(CACHE);
          c.put(req, net.clone());
        }
        return net;
      } catch (_) {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    // 带 Range 的请求（音视频分片等）不进缓存，直接透传
    if (req.headers.has('range')) return fetch(req);
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(r => {
      if (r && r.ok && r.status === 200) c.put(req, r.clone());
      return r;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
