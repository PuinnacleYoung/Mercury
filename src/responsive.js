/* ============================================================
   拾光·澈屿 · 全机型 UI 自适应 v2
   —— 【核心原则】只缩尺寸，绝不挪位置
      手机横屏看到的布局 == 电脑横屏看到的布局
      摇杆永远在左下、左侧按钮永远竖排、衣橱永远左预览右面板
   —— 缩放比例 --ui-scale 由本脚本算好写到 :root（inline，优先级最高）
   —— ?hard=1 一键清缓存（注销 SW + 清 caches + 重载）
   ============================================================ */

/* ---- ?hard=1：线上改版后手机还在吃旧缓存时，加这个参数清一次 ---- */
(function () {
  try {
    if (!/[?&]hard=1/.test(location.search)) return;
    var done = false;
    var go = function () {
      if (done) return; done = true;
      var url = location.href.replace(/([?&])hard=1&?/, '$1').replace(/[?&]$/, '');
      setTimeout(function () { location.replace(url); }, 400);
    };
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }).then(function () {
        if (window.caches && caches.keys) {
          return caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); });
        }
      }).then(go, go);
    } else { go(); }
    document.write('<div style="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;'
      + 'justify-content:center;background:#2b2140;color:#fff;font:700 16px sans-serif">'
      + '🧹 正在清除缓存…</div>');
  } catch (e) { }
})();

(function () {
  /* 参考高度：屏幕高度 ≥ 620px 时 UI 用原始尺寸（和电脑一致） */
  var REF_H = 620;
  var MIN_SCALE = 0.58;   // 再小就看不清了
  var MAX_SCALE = 1;      // 桌面永远 1，绝不放大

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* 判断是不是"手机/平板"——桌面一律不缩放，陛下电脑上看到的原样不动 */
  function isHandheld() {
    try {
      var ua = navigator.userAgent || '';
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
      // iPadOS 伪装成 Macintosh：靠触摸点数识破
      var iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
      var mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|Mobile|Silk|Tablet/i.test(ua);
      // 有精确鼠标 + 无触摸 = 真桌面
      var fineMouse = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (!touch && !mobileUA) return false;
      if (fineMouse && !mobileUA && !iPadOS) return false;
      return touch || mobileUA || iPadOS;
    } catch (e) { return false; }
  }

  function update() {
    var w = window.innerWidth, h = window.innerHeight;
    var landscape = w >= h;
    var scale = 1;

    if (!isHandheld()) {
      scale = 1;                                   // 电脑：一根手指都不碰
    } else if (landscape) {
      // 横屏：按「屏幕高度」算 —— 竖排按钮 + 摇杆必须一屏塞得下
      scale = clamp(h / REF_H, MIN_SCALE, MAX_SCALE);
      // 极窄（宽度 < 520，比如折叠机）再压一档，防止左右溢出
      if (w < 520) scale = Math.min(scale, clamp(w / 520, MIN_SCALE, MAX_SCALE));
    } else {
      // 竖屏（横屏锁会拦，这里只是兜底）：按短边算，别缩太狠
      scale = clamp(Math.min(w, h) / 430, 0.78, 1);
    }

    var root = document.documentElement;
    var tag = scale.toFixed(3);
    var changed = root.dataset.uiScale !== tag;
    root.style.setProperty('--ui-scale', scale);
    root.dataset.uiScale = tag;
    root.dataset.vmin = String(Math.min(w, h));
    root.dataset.isHandheld = isHandheld() ? '1' : '0';

    // 通知页面：缩放变了，重算世界视口（大厅 / 地图的房子位置）
    if (changed) {
      try { window.dispatchEvent(new Event('ui-scale-change')); } catch (e) { }
    }
  }

  update();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      update(); setTimeout(update, 50); setTimeout(update, 300);
    });
  } else {
    setTimeout(update, 50); setTimeout(update, 300);
  }

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', function () { setTimeout(update, 120); });
  // 手机浏览器地址栏收起/展开会改高度
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
  }
})();
