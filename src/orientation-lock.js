/* 拾光·澈屿 —— 手机锁横屏 v3（锁死版）
   ------------------------------------------------------------------
   陛下要的效果：像麻将/消消乐那样 —— 手机上**永远是横版画面**。
   手机横着拿 → 正常横屏；手机竖着拿 → 整个画面转 90° 还是横版，
   不存在「请横屏」遮罩挡路，也不会横竖来回跳。

   三层保险：
     ① 系统级：能真锁就真锁（screen.orientation.lock('landscape')，安卓 Chrome/PWA 有效）
     ② 兜底层：锁不上（iOS Safari 一律锁不上）→ CSS 把 body 整体旋转 90°，竖着拿也横着看
     ③ 视觉级：旋转后把「视口」整个虚拟化，让页面自己以为就是横屏：
        · window.innerWidth / innerHeight → 返回旋转后的逻辑尺寸（横版）
        · CSS 里的 vh / vw   → 换成 var(--mer-vh) / var(--mer-vw)（横版单位）
        · @media 的 max-width ↔ max-height、portrait ↔ landscape → 全部互换
        这样登录世界、地图视口、responsive.js 的缩放全都会按横屏算，不会错位。

   后路（陛下想放开时）：网址加 ?ls=off 彻底关；?ls=mask 退回「请横屏」遮罩模式；
   旋转画面右下角有个小按钮可临时退回遮罩模式。
   注意：index.html 里那套「3 秒倒计时横屏提示」在手机上被本脚本接管，避免两套遮罩打架卡死。
*/
(function () {
  if (window.__MER_LS_INIT__) return; window.__MER_LS_INIT__ = true;

  // 本地存储兜底：隐私模式 / 无痕 / 某些内核会直接抛异常，不能让它打断本脚本
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var UA = navigator.userAgent || '';
  var isIPadOS = /Macintosh/.test(UA) && navigator.maxTouchPoints > 1;      // iPadOS 13+ 伪装成 Mac
  var isPhoneLike = /Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|Mobile/i.test(UA);
  var isTablet = /iPad|Tablet|Silk|Nexus (7|9|10)|Xoom|SM-T|SM-P|Lenovo Tab|HUAWEI MatePad|Pad/i.test(UA);
  var IS_MOBILE = (isPhoneLike && !isTablet) || isIPadOS;

  var OFF_KEY = 'mer_landscape_off';
  var MODE_KEY = 'mer_landscape_mode';     // 'rotate'（默认，锁死横版） | 'mask'（退回提示遮罩）

  var qs = new URLSearchParams(location.search);
  if (qs.get('ls') === 'off') LS.set(OFF_KEY, '1');
  if (qs.get('ls') === 'on') LS.del(OFF_KEY);
  if (qs.get('ls') === 'mask') LS.set(MODE_KEY, 'mask');
  if (qs.get('ls') === 'rotate') LS.set(MODE_KEY, 'rotate');

  if (!IS_MOBILE) return;                  // 电脑：完全不干预
  if (LS.get(OFF_KEY) === '1') return;     // 陛下手动关过

  window.__MER_LS_ACTIVE__ = true;         // 告诉页面：横屏由我接管，别再弹倒计时

  /* 默认就是「锁死横版」：只有陛下显式选过遮罩模式才退回 */
  var mode = LS.get(MODE_KEY) === 'mask' ? 'mask' : 'rotate';
  function setMode(m) {
    mode = m;
    if (m === 'mask') LS.set(MODE_KEY, 'mask'); else LS.del(MODE_KEY);
    sync(true);
  }

  /* ============ 物理视口（永远不被虚拟化污染） ============ */
  function physW() { return document.documentElement.clientWidth || window.screen.availWidth || 0; }
  function physH() { return document.documentElement.clientHeight || window.screen.availHeight || 0; }
  function physPortrait() { return physH() > physW(); }

  /* ============ ① window.innerWidth / innerHeight 虚拟化 ============ */
  var VIRT = { on: false, w: 0, h: 0 };
  var virtInstalled = false;
  var gw = null, gh = null;
  function installVirt() {
    if (virtInstalled) return;
    try {
      var dw = Object.getOwnPropertyDescriptor(window, 'innerWidth')
            || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window) || {}, 'innerWidth');
      var dh = Object.getOwnPropertyDescriptor(window, 'innerHeight')
            || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window) || {}, 'innerHeight');
      gw = dw && dw.get ? dw.get : null;
      gh = dh && dh.get ? dh.get : null;
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        get: function () { return VIRT.on ? VIRT.w : (gw ? gw.call(window) : physW()); }
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        get: function () { return VIRT.on ? VIRT.h : (gh ? gh.call(window) : physH()); }
      });
      virtInstalled = true;
    } catch (e) { /* 定义不了就认命，页面仍会转，只是个别尺寸按物理算 */ }
  }
  installVirt();

  /* ============ ② CSS 单位 / 媒体查询虚拟化 ============ */
  var st = document.createElement('style');
  st.textContent = `
  .mer-ls-mask{position:fixed;inset:0;z-index:999997;display:none;
    align-items:center;justify-content:center;flex-direction:column;gap:16px;
    background:linear-gradient(160deg,#2b2140,#4a3a6e);color:#fff;
    font:600 15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    text-align:center;-webkit-user-select:none;user-select:none}
  .mer-ls-mask.show{display:flex}
  .mer-ls-phone{width:70px;height:116px;border:4px solid rgba(255,255,255,.92);border-radius:14px;
    position:relative;animation:merLsTilt 2s ease-in-out infinite}
  .mer-ls-phone::after{content:'';position:absolute;left:50%;bottom:6px;transform:translateX(-50%);
    width:26px;height:4px;border-radius:4px;background:rgba(255,255,255,.8)}
  @keyframes merLsTilt{0%,40%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
  .mer-ls-mask h2{margin:0;font-size:21px;letter-spacing:1px}
  .mer-ls-mask p{margin:0;font-size:13px;color:rgba(255,255,255,.72);max-width:80vw;line-height:1.7}
  .mer-ls-mask .row{display:flex;flex-direction:column;gap:10px;margin-top:4px;width:78vw;max-width:320px}
  .mer-ls-btn{border:none;border-radius:14px;padding:13px 20px;font-weight:700;font-size:14.5px;
    background:linear-gradient(135deg,#a78cd9,#ff9ec4);color:#fff;cursor:pointer;
    box-shadow:0 6px 18px rgba(120,80,200,.36);-webkit-tap-highlight-color:transparent}
  .mer-ls-btn:active{transform:scale(.97)}
  .mer-ls-btn.ghost{background:rgba(255,255,255,.14);color:#fff;font-weight:600;box-shadow:none}
  .mer-ls-tiny{margin-top:8px;font-size:12px;color:rgba(255,255,255,.45);text-decoration:underline;
    background:none;border:none;cursor:pointer}
  /* 转屏瞬间先隐身，避免看到一帧没转过来的竖版布局 */
  .mer-ls-busy body{visibility:hidden !important}
  .mer-ls-exit{position:fixed;right:8px;bottom:8px;z-index:999996;display:none;
    padding:5px 10px;border-radius:999px;border:none;cursor:pointer;
    background:rgba(43,33,64,.42);color:rgba(255,255,255,.5);font-size:11px;
    opacity:.5;transition:opacity .3s}
  .mer-ls-exit.show{display:block}
  `;
  (document.head || document.documentElement).appendChild(st);

  var unitList = [];    // [{style, prop, orig, prio}]  含 vh / vw 的声明
  var mediaList = [];   // [{rule, orig}]              含尺寸/方向的 @media
  var scanned = [];     // 已扫过的样式表（WeakSet 兼容性一般，用数组 + indexOf）

  function scanSheets() {
    var sheets = document.styleSheets || [];
    for (var s = 0; s < sheets.length; s++) {
      if (scanned.indexOf(sheets[s]) >= 0) continue;
      scanned.push(sheets[s]);
      var rules = null;
      try { rules = sheets[s].cssRules; } catch (e) { continue; }
      if (rules) walkRules(rules);
    }
  }
  function walkRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.cssRules) walkRules(r.cssRules);
        if (r.media && typeof r.media.mediaText === 'string' &&
            /(max-|min-)?(width|height|orientation|aspect-ratio)/.test(r.media.mediaText)) {
          mediaList.push({ rule: r, orig: r.media.mediaText });
        }
        var s = r.style;
        if (!s) continue;
        for (var j = 0; j < s.length; j++) {
          var p = s[j];
          var v = s.getPropertyValue(p);
          // ⚠️ 变量名故意叫 --mer-vh / --mer-vw：不含「数字+vh」，不会被自己误替换
          if (v && /(-?[\d.]+)(vh|vw)/.test(v) && v.indexOf('--mer-v') < 0) {
            unitList.push({ style: s, prop: p, orig: v, prio: s.getPropertyPriority(p) });
          }
        }
      } catch (e) { }
    }
  }
  function virtUnits(on) {
    for (var i = 0; i < unitList.length; i++) {
      var u = unitList[i];
      try {
        if (on) {
          var v = u.orig
            .replace(/(-?[\d.]+)vh/g, 'calc($1 * var(--mer-vh))')
            .replace(/(-?[\d.]+)vw/g, 'calc($1 * var(--mer-vw))');
          u.style.setProperty(u.prop, v, u.prio);
        } else {
          u.style.setProperty(u.prop, u.orig, u.prio);
        }
      } catch (e) { }
    }
  }
  function swapMedia(t) {
    var A = '\u0001', B = '\u0002', C = '\u0003', D = '\u0004';
    return t
      .replace(/max-width/gi, A).replace(/max-height/gi, 'max-width').replace(new RegExp(A, 'g'), 'max-height')
      .replace(/min-width/gi, B).replace(/min-height/gi, 'min-width').replace(new RegExp(B, 'g'), 'min-height')
      .replace(/device-width/gi, C).replace(/device-height/gi, 'device-width').replace(new RegExp(C, 'g'), 'device-height')
      .replace(/orientation:\s*portrait/gi, D)
      .replace(/orientation:\s*landscape/gi, 'orientation: portrait')
      .replace(new RegExp(D, 'g'), 'orientation: landscape');
  }
  function virtMedia(on) {
    for (var i = 0; i < mediaList.length; i++) {
      var m = mediaList[i];
      try { m.rule.media.mediaText = on ? swapMedia(m.orig) : m.orig; } catch (e) { }
    }
  }
  function setUnitVars(on) {
    var rs = document.documentElement.style;
    /* 旋转后：逻辑高 = 物理宽 → 1vh = 物理宽/100；逻辑宽 = 物理高 → 1vw = 物理高/100 */
    if (on) {
      rs.setProperty('--mer-vh', (physW() / 100) + 'px');
      rs.setProperty('--mer-vw', (physH() / 100) + 'px');
    } else {
      rs.removeProperty('--mer-vh');
      rs.removeProperty('--mer-vw');
    }
  }

  /* ============ ③ body 整体旋转 ============ */
  var ROT_KEYS = ['position', 'top', 'left', 'width', 'height', 'margin',
                  'boxSizing', 'overflow', 'transformOrigin', 'transform', 'padding'];
  function applyRotate(on) {
    var b = document.body;
    if (!b) return;
    if (on) {
      b.style.position = 'fixed';
      b.style.top = '0';
      b.style.left = '0';
      /* ⚠️ 不要用 100vh/100vw：那是「地址栏收起后的最大视口」，而虚拟坐标用 clientWidth/Height
         （可视区）。MIUI 等内核地址栏展开时两者差几十像素 → 旋转后顶部被吞一条。
         这里统一用物理可视尺寸，resize 后 sync 会重算。 */
      b.style.width = physH() + 'px';   // 逻辑宽 = 物理可视高
      b.style.height = physW() + 'px';  // 逻辑高 = 物理可视宽
      b.style.margin = '0';
      b.style.boxSizing = 'border-box';
      b.style.overflow = 'auto';
      b.style.transformOrigin = 'top left';
      b.style.transform = 'translate(' + physW() + 'px,0) rotate(90deg)';
      /* 刘海/圆角跟着转：竖屏顶部的安全区，转过来后落在画面左边 */
      b.style.padding = 'env(safe-area-inset-right) env(safe-area-inset-bottom) '
                      + 'env(safe-area-inset-left) env(safe-area-inset-top)';
      document.documentElement.style.overflow = 'hidden';
    } else {
      for (var i = 0; i < ROT_KEYS.length; i++) b.style[ROT_KEYS[i]] = '';
      document.documentElement.style.overflow = '';
    }
  }

  /* ============ ④ 坐标虚拟化 ============
     body 转 90° 后，浏览器给的是「物理竖屏」坐标，页面内部却是「横版逻辑」空间：
     rect / 事件坐标不换算的话，登录世界会被按 390×844 布成 1500×844 直接爆出屏。
     约定：旋转生效期间，页面读到的所有坐标一律是逻辑（横版）坐标。
     变换：逻辑 x = 视觉 y；逻辑 y = 物理宽 − 视觉 x（顺时针转 90° 的逆变换）。 */
  var coordInstalled = false;
  function installCoordVirt() {
    if (coordInstalled) return; coordInstalled = true;

    /* --- 4.1 getBoundingClientRect：视觉 rect → 逻辑 rect --- */
    try {
      var g = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        var r = g.apply(this, arguments);
        if (!VIRT.on || !r) return r;
        var pw = physW();
        return new DOMRect(r.top, pw - r.right, r.height, r.width);
      };
    } catch (e) { }

    /* --- 4.2 事件坐标 clientX/clientY、pageX/pageY → 逻辑 --- */
    function hookPair(proto, xProp, yProp) {
      try {
        var dx = Object.getOwnPropertyDescriptor(proto, xProp);
        var dy = Object.getOwnPropertyDescriptor(proto, yProp);
        if (!dx || !dx.get || !dy || !dy.get) return;
        Object.defineProperty(proto, xProp, {
          configurable: true,
          get: function () { if (!VIRT.on) return dx.get.call(this); return dy.get.call(this); }
        });
        Object.defineProperty(proto, yProp, {
          configurable: true,
          get: function () { if (!VIRT.on) return dy.get.call(this); return physW() - dx.get.call(this); }
        });
      } catch (e) { }
    }
    if (window.MouseEvent) hookPair(MouseEvent.prototype, 'clientX', 'clientY');
    if (window.MouseEvent) hookPair(MouseEvent.prototype, 'pageX', 'pageY');
    if (window.Touch) { hookPair(Touch.prototype, 'clientX', 'clientY'); hookPair(Touch.prototype, 'pageX', 'pageY'); }

    /* --- 4.3 命中检测：页面传逻辑坐标进来，换回视觉坐标问浏览器 --- */
    ['elementFromPoint', 'caretRangeFromPoint', 'caretPositionFromPoint'].forEach(function (m) {
      try {
        var o = Document.prototype[m];
        if (typeof o !== 'function') return;
        Document.prototype[m] = function (x, y) {
          if (VIRT.on && typeof x === 'number' && typeof y === 'number') {
            return o.call(this, physW() - y, x);
          }
          return o.apply(this, arguments);
        };
      } catch (e) { }
    });

    /* --- 4.4 visualViewport 宽高互换（data-fit 安全区缩放按逻辑视口算） --- */
    try {
      var vv = window.visualViewport;
      if (vv) {
        var proto = Object.getPrototypeOf(vv);
        var dw = Object.getOwnPropertyDescriptor(proto, 'width');
        var dh = Object.getOwnPropertyDescriptor(proto, 'height');
        if (dw && dw.get && dh && dh.get) {
          Object.defineProperty(vv, 'width', { configurable: true, get: function () { return VIRT.on ? dh.get.call(vv) : dw.get.call(vv); } });
          Object.defineProperty(vv, 'height', { configurable: true, get: function () { return VIRT.on ? dw.get.call(vv) : dh.get.call(vv); } });
        }
      }
    } catch (e) { }
  }
  installCoordVirt();

  /* ============ 通知页面重排 ============
     ⚠️ 这里只派 resize：orientationchange 一旦从 sync 里派出去，
     就会触发 onTurn → sync → 再派发 → 风暴死循环。OC 只在「旋转状态翻转」时补发一次。 */
  function fireResize() {
    try { window.dispatchEvent(new Event('resize')); } catch (e) { }
    try { if (window.visualViewport) window.visualViewport.dispatchEvent(new Event('resize')); } catch (e) { }
  }

  /* ============ 同步总入口 ============ */
  var lastKey = '';
  var lastOn = null;
  function sync(force) {
    scanSheets();
    var on = (mode === 'rotate') && physPortrait();
    var key = on + '|' + physW() + 'x' + physH() + '|' + mode;
    if (!force && key === lastKey) return;
    lastKey = key;

    VIRT.on = on; VIRT.w = physH(); VIRT.h = physW();
    applyRotate(on);
    setUnitVars(on); virtUnits(on); virtMedia(on);
    window.__MER_LS_ROT = on;

    var de = document.documentElement;
    de.classList.toggle('mer-ls-rot', on);
    mask.classList.toggle('show', !on && mode === 'mask' && physPortrait());
    exitBtn.classList.toggle('show', on);

    /* 常规通知只敲 resize：layoutAuthWorld / responsive / 开场动画全挂在它上面。
       ⚠️ 这里绝不能派 orientationchange —— onTurn 挂在它上面，
       「sync→OC→onTurn→sync」会绕成 200ms 一轮的风暴（busy 隐身无限循环就是它）。 */
    fireResize();
    /* 仅在旋转状态翻转（进/出横版）时补发一次 orientationchange，
       给只听它的旧逻辑用；onTurn 有 turning 去重，这条链到此为止。 */
    if (on !== lastOn) {
      lastOn = on;
      setTimeout(function () {
        try { window.dispatchEvent(new Event('orientationchange')); } catch (e) { }
      }, 350);
    }
  }

  /* ============ ① 系统级真锁（能锁就锁，锁不上就转） ============ */
  var lockTried = false;
  async function lockLandscape() {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (_) { }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
        return true;
      }
    } catch (_) { }
    return false;
  }
  async function tryLock() {
    if (lockTried) return false;
    lockTried = true;
    var ok = await lockLandscape();
    if (ok) { mode = 'rotate'; LS.del(MODE_KEY); sync(true); }   // 真锁上了：物理就是横屏，不会触发旋转
    return ok;
  }

  /* ============ 遮罩 + 退出小按钮 ============ */
  var mask = document.createElement('div');
  mask.className = 'mer-ls-mask';
  mask.innerHTML = `
    <div class="mer-ls-phone"></div>
    <h2>请把手机横过来</h2>
    <p>竖着拿也能看：点下面第二个按钮，画面会整体转成横版</p>
    <div class="row">
      <button class="mer-ls-btn" id="merLsLock">🔒 自动全屏并锁定横屏</button>
      <button class="mer-ls-btn ghost" id="merLsRotate">📐 竖着拿也横版（旋转画面）</button>
    </div>
    <button class="mer-ls-tiny" id="merLsOff">临时关闭横屏限制</button>`;
  document.body.appendChild(mask);

  var exitBtn = document.createElement('button');
  exitBtn.className = 'mer-ls-exit';
  exitBtn.textContent = '退出横版画面';
  document.body.appendChild(exitBtn);

  mask.querySelector('#merLsLock').onclick = function (e) { e.stopPropagation(); tryLock(); };
  mask.querySelector('#merLsRotate').onclick = function (e) { e.stopPropagation(); setMode('rotate'); };
  mask.querySelector('#merLsOff').onclick = function (e) {
    e.stopPropagation(); LS.set(OFF_KEY, '1'); location.reload();
  };
  mask.onclick = function () { tryLock(); };
  exitBtn.onclick = function () { setMode('mask'); };

  /* 用户第一次碰屏幕就有手势了，趁机试着真锁一次（安卓能成，iOS 不成也无所谓） */
  ['pointerdown', 'touchstart', 'click'].forEach(function (ev) {
    window.addEventListener(ev, function () { tryLock(); }, { once: true, passive: true });
  });

  /* ============ 转屏 / 尺寸变化 ============ */
  var turning = false;
  function onTurn() {
    if (turning) return;                     // 转屏风暴去重：同一轮只处理一次
    turning = true;
    document.documentElement.classList.add('mer-ls-busy');   // 转屏瞬间先隐身，杜绝看到一帧竖版
    setTimeout(function () {
      sync(true);
      turning = false;
      setTimeout(function () { document.documentElement.classList.remove('mer-ls-busy'); }, 120);
    }, 200);
  }
  window.addEventListener('orientationchange', onTurn);
  window.addEventListener('resize', function () { setTimeout(sync, 160); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { setTimeout(sync, 200); });
  }

  sync(true);
  setTimeout(function () { sync(true); }, 400);      // 样式表可能后到，再扫一次
  tryLock();                                          // 已是全屏/PWA 时这一下就成
})();
