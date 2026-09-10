/* 拾光·澈屿 —— 手机锁横屏
   规则：手机 / 平板手机 访问 → 强制横屏；电脑（含桌面浏览器）完全不干预。
   三层保险：
     ① 系统级：screen.orientation.lock('landscape')（Chrome / Edge 全屏或 PWA 下有效）
     ② 交互级：竖屏时盖一层「请把手机横过来」遮罩，点任意处自动全屏 + 锁横屏
     ③ 兜底层：手机系统方向被锁死时，用 CSS 把整个画面旋转 90°，竖着拿也能横着看
   关闭方法（给陛下留的后路）：网址后面加 ?ls=off，或点遮罩底部的小字。
*/
(function () {
  if (window.__MER_LS_INIT__) return; window.__MER_LS_INIT__ = true;

  const UA = navigator.userAgent || '';
  // iPadOS 13+ 会把 UA 伪装成 Macintosh，用触摸点数补判
  const isIPadOS = /Macintosh/.test(UA) && navigator.maxTouchPoints > 1;
  const isPhoneLike = /Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|Mobile/i.test(UA);
  const isTablet = /iPad|Tablet|Silk|Nexus (7|9|10)|Xoom|SM-T|SM-P|Lenovo Tab|HUAWEI MatePad|Pad/i.test(UA);
  const IS_MOBILE = (isPhoneLike && !isTablet) || isIPadOS;

  const OFF_KEY = 'mer_landscape_off';
  const MODE_KEY = 'mer_landscape_mode';
  const qs = new URLSearchParams(location.search);
  if (qs.get('ls') === 'off') localStorage.setItem(OFF_KEY, '1');
  if (qs.get('ls') === 'on') localStorage.removeItem(OFF_KEY);

  if (!IS_MOBILE) return;                            // 电脑：完全不干预
  if (localStorage.getItem(OFF_KEY) === '1') return; // 陛下手动关过

  const isPortrait = () => window.innerHeight > window.innerWidth;
  let rotateMode = localStorage.getItem(MODE_KEY) === 'rotate';

  // ---------- 样式 ----------
  const st = document.createElement('style');
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
  .mer-ls-exit{position:fixed;right:10px;bottom:10px;z-index:999996;display:none;
    padding:5px 11px;border-radius:999px;border:none;cursor:pointer;
    background:rgba(43,33,64,.55);color:rgba(255,255,255,.6);font-size:11px}
  .mer-ls-exit.show{display:block}
  `;
  document.head.appendChild(st);

  // ---------- 遮罩 ----------
  const mask = document.createElement('div');
  mask.className = 'mer-ls-mask';
  mask.innerHTML = `
    <div class="mer-ls-phone"></div>
    <h2>请把手机横过来</h2>
    <p>拾光·澈屿 在手机上按横屏设计<br>横过来就能满屏玩，顶部也不会有页签</p>
    <div class="row">
      <button class="mer-ls-btn" id="merLsLock">🔒 自动全屏并锁定横屏</button>
      <button class="mer-ls-btn ghost" id="merLsRotate">📐 竖着拿也能看（旋转画面）</button>
    </div>
    <button class="mer-ls-tiny" id="merLsOff">临时关闭横屏限制</button>`;
  document.body.appendChild(mask);

  const exitBtn = document.createElement('button');
  exitBtn.className = 'mer-ls-exit';
  exitBtn.textContent = '退出旋转画面';
  document.body.appendChild(exitBtn);

  // ---------- ① 系统级锁定 ----------
  async function lockLandscape() {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (_) { /* 需要用户手势，失败忽略 */ }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
        return true;
      }
    } catch (_) { }
    return false;
  }

  // ---------- ③ CSS 旋转兜底 ----------
  let savedBodyCss = null;
  function applyRotate() {
    const on = rotateMode && isPortrait();
    const b = document.body;
    if (on) {
      if (savedBodyCss === null) savedBodyCss = b.style.cssText;
      const w = window.innerWidth, h = window.innerHeight;
      b.style.position = 'fixed';
      b.style.top = '0';
      b.style.left = w + 'px';
      b.style.width = h + 'px';
      b.style.height = w + 'px';
      b.style.transformOrigin = 'top left';
      b.style.transform = 'rotate(90deg)';
      b.style.overflow = 'auto';
      b.style.background = b.style.background || '';
      exitBtn.classList.add('show');
    } else {
      if (savedBodyCss !== null) { b.style.cssText = savedBodyCss; savedBodyCss = null; }
      exitBtn.classList.remove('show');
    }
  }

  function sync() {
    if (rotateMode) { applyRotate(); mask.classList.remove('show'); }
    else { applyRotate(); mask.classList.toggle('show', isPortrait()); }
  }

  // ---------- 事件 ----------
  mask.querySelector('#merLsLock').onclick = async e => {
    e.stopPropagation();
    const ok = await lockLandscape();
    if (!ok) {
      // 锁不上（多数浏览器不允许）→ 直接退到旋转兜底，别卡住陛下
      rotateMode = true;
      localStorage.setItem(MODE_KEY, 'rotate');
      sync();
    }
  };
  mask.querySelector('#merLsRotate').onclick = e => {
    e.stopPropagation();
    rotateMode = true;
    localStorage.setItem(MODE_KEY, 'rotate');
    sync();
  };
  mask.querySelector('#merLsOff').onclick = e => {
    e.stopPropagation();
    localStorage.setItem(OFF_KEY, '1');
    location.reload();
  };
  exitBtn.onclick = () => {
    rotateMode = false;
    localStorage.removeItem(MODE_KEY);
    sync();
  };
  // 点遮罩空白处也尝试锁定（用户手势已具备）
  mask.onclick = () => lockLandscape();

  window.addEventListener('orientationchange', () => setTimeout(sync, 260));
  window.addEventListener('resize', () => setTimeout(sync, 160));

  sync();
  // 页面加载时先试一次（PWA / 已全屏的场景下会成功）
  if (isPortrait()) lockLandscape();
})();
