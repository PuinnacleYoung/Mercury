/* ============================================================
   拾光·澈屿 · 全机型 UI 自适应（vmin 精确算法）
   —— 根据屏幕短边 vmin 算 --ui-scale，CSS 自动用 calc() 缩放
   —— 横屏高度 < 480px 自动改 .left-ui 横排、摇杆移右下（CSS）
   ============================================================ */
(function () {
  function update () {
    var w = window.innerWidth, h = window.innerHeight;
    var vmin = Math.min(w, h);                      // 屏幕短边
    var isLandscape = w > h;

    var scale = 1;
    if (isLandscape) {
      if      (vmin < 320) scale = 0.55;            // 折叠/极窄
      else if (vmin < 380) scale = 0.62;            // 紧凑手机横屏
      else if (vmin < 480) scale = 0.72;            // 大屏手机横屏
      else if (vmin < 600) scale = 0.82;            // 小平板
      else if (vmin < 800) scale = 0.92;            // iPad 横屏
      else                 scale = 1;               // 桌面
    } else {
      // 竖屏（被横屏遮罩拦截，这里只是兜底）
      if      (vmin < 380) scale = 0.85;
      else if (vmin < 500) scale = 0.92;
      else                 scale = 1;
    }

    var root = document.documentElement;
    root.style.setProperty('--ui-scale', scale);
    root.dataset.uiScale = scale.toFixed(2);
    root.dataset.vmin = vmin;
  }

  // 立即 + 延迟（CSS 布局稳定后再算一次）
  update();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      update();
      setTimeout(update, 50);
      setTimeout(update, 300);
    });
  } else {
    setTimeout(update, 50);
    setTimeout(update, 300);
  }

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', function () { setTimeout(update, 100); });
})();