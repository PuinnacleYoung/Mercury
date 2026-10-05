/* 拾光·澈屿 Service Worker v136
   二十三更 v3：解决 Pad/手机缓存不更新问题——
   ① JS/CSS/JSON 改 network-first（3s 超时回缓存），保证每次拿最新
   ② 预缓存不再写版本号（避免 sw.js 里的旧版本号和 index.html 里的新版本号对不上）
   ③ 页面端通过 postMessage 拿 SW 版本号做比对，不一致自动刷新 */
const CACHE = 'shuguang-v138';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './body-template.js',
  './npc-render.js',
  './map-placeholders.js',
  './media-store.js',
  './cloud-sync.js',
  './fl-draw.js',
  './fl-board.js',
  './棋牌引擎.html',
  './银行引擎.html',
  './二合游戏引擎.html',
  './后端管理引擎.html',
  './登录页面引擎.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './服装编辑引擎.html',
  './地图编辑引擎.html',
  './塔罗编辑引擎.html',
  './数据备份与迁移.html',
  './安全区方案.html',
  './数据恢复工具.html',
  './assets/',
  './assets/cur/cur-coin.webp',
  './assets/cur/cur-diamond.webp',
  './assets/cur/cur-pearl.webp'
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

/* 页面端发 {type:'GET_SW_VERSION'} → 回 CACHE 版本号，页面比对不一致就自动刷新 */
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

  // 媒体（/media/）：不进缓存，靠 nginx 7d HTTP 缓存
  if (url.pathname.indexOf('/media/') >= 0) return;

  // 带 Range 的请求（音视频分片）：直接透传（Cache 不收 206）
  if (req.headers.has('range')) { e.respondWith(fetch(req)); return; }

  // ── 判断是否是"关键资源"（JS/CSS/JSON + HTML 导航） ──
  var isNav = req.mode === 'navigate' || req.destination === 'document';
  var isCode = /\.(js|css|json)(\?|$)/i.test(url.pathname);

  if (isNav || isCode) {
    // 网络优先（3s 超时回缓存）—— 改完代码 Pad 也能立刻拿到
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

  // 线上数据包：永远网络优先
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

  // 其他静态资源（图片/字体/wasm）：缓存优先 + 后台更新
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
