/* Mercury PWA 安装引导（根目录版）—— 同 src/pwa-install.js：注册相对当前页的 sw.js */
(function () {
  if (window.__MER_PWA_INIT__) return; window.__MER_PWA_INIT__ = true;

  const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const IS_ANDROID = /Android/i.test(navigator.userAgent);
  const IS_STANDALONE =
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator.standalone === true);
  const CAN_SW = ('serviceWorker' in navigator) &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const DISMISS_KEY = 'mer_pwa_dismiss_v1';

  if (CAN_SW) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (IS_STANDALONE || localStorage.getItem(DISMISS_KEY) === 'gone') return;

  const STYLE = `
  .mer-pwa-fab{position:fixed;right:14px;bottom:96px;z-index:99999;
    display:inline-flex;align-items:center;gap:6px;padding:10px 14px;
    border-radius:999px;border:none;cursor:pointer;
    background:linear-gradient(135deg,#a78cd9,#ff9ec4);color:#fff;
    font:700 14px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    box-shadow:0 8px 24px rgba(120,80,200,.36),0 2px 6px rgba(0,0,0,.18);
    transition:transform .18s,box-shadow .18s;letter-spacing:.5px;
    -webkit-tap-highlight-color:transparent}
  .mer-pwa-fab:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(120,80,200,.48)}
  .mer-pwa-fab:active{transform:translateY(0)}
  .mer-pwa-fab .x{display:inline-block;width:18px;height:18px;line-height:18px;
    text-align:center;border-radius:50%;background:rgba(255,255,255,.28);
    font-size:12px;margin-left:4px}
  .mer-pwa-modal{position:fixed;inset:0;z-index:100000;display:none;
    align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .mer-pwa-modal.show{display:flex;animation:merFadeIn .2s ease}
  .mer-pwa-modal .card{background:#fff;width:min(420px,94vw);
    border-radius:22px 22px 0 0;padding:20px 22px 26px;
    box-shadow:0 -10px 30px rgba(0,0,0,.2);text-align:center;position:relative;
    color:#3a3350;font:14px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    animation:merSlideUp .25s ease}
  .mer-pwa-modal .close{position:absolute;top:10px;right:14px;width:28px;height:28px;
    border:none;background:transparent;font-size:22px;color:#a098b8;cursor:pointer;
    line-height:1;border-radius:50%}
  .mer-pwa-modal h3{margin:4px 0 4px;font-size:18px;color:#3a3350}
  .mer-pwa-modal p{margin:6px 0;color:#7a7393;font-size:13px}
  .mer-pwa-modal .hero{width:88px;height:88px;border-radius:20px;
    box-shadow:0 8px 20px rgba(120,80,200,.32);margin:6px auto 10px;display:block;
    background-image:url('./icons/icon-192.png');background-size:cover;background-position:center}
  .mer-pwa-modal .steps{text-align:left;background:#f6f1fb;border-radius:14px;
    padding:12px 14px;margin:12px 0;line-height:1.9;font-size:14px;color:#4a4360}
  .mer-pwa-modal .steps b{color:#7f66c4}
  .mer-pwa-modal .primary{display:inline-block;padding:12px 28px;border-radius:999px;
    background:linear-gradient(135deg,#a78cd9,#ff9ec4);color:#fff;font-weight:700;
    border:none;cursor:pointer;box-shadow:0 6px 18px rgba(120,80,200,.36);
    font-size:15px;margin-top:6px;-webkit-tap-highlight-color:transparent}
  .mer-pwa-modal .primary:active{transform:scale(.97)}
  .mer-pwa-modal .secondary{display:block;margin:10px auto 0;background:transparent;border:none;
    color:#a098b8;font-size:12px;cursor:pointer}
  .mer-pwa-modal .copyurl{font-size:12px;color:#7a7393;margin-top:6px;word-break:break-all;
    background:#f6f1fb;border-radius:8px;padding:6px 8px}
  @keyframes merFadeIn{from{opacity:0}to{opacity:1}}
  @keyframes merSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  const fab = document.createElement('button');
  fab.className = 'mer-pwa-fab';
  fab.innerHTML = '📲 装到桌面 <span class="x" title="不再提醒">×</span>';
  document.body.appendChild(fab);

  const modal = document.createElement('div');
  modal.className = 'mer-pwa-modal';
  modal.innerHTML = `
    <div class="card">
      <button class="close" aria-label="关闭">×</button>
      <img class="hero" alt="">
      <h3>装到桌面 · 去掉顶部页签</h3>
      <p>一次操作，之后像 App 一样从桌面点开</p>
      <div class="steps" id="merPwaSteps"></div>
      <button class="primary" id="merPwaPrimary"></button>
      <button class="secondary" id="merPwaCopy">复制网址，方便发给朋友</button>
      <div class="copyurl" id="merPwaUrl" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const stepsEl = modal.querySelector('#merPwaSteps');
  const primaryBtn = modal.querySelector('#merPwaPrimary');
  const urlBox = modal.querySelector('#merPwaUrl');
  const setUrl = () => { urlBox.textContent = location.href; urlBox.style.display = ''; };

  function openModal() {
    setUrl();
    if (IS_IOS) {
      stepsEl.innerHTML =
        `① 点屏幕底部的 <b>分享按钮</b> <span style="font-size:18px">⬆️</span>（Safari 下方那个方框+上箭头）<br>` +
        `② 在弹出的菜单里选 <b>添加到主屏幕</b> <span style="font-size:18px">➕</span><br>` +
        `③ 点右上角 <b>添加</b>即可（图标、名字会自动写好）`;
      primaryBtn.textContent = '我装好了';
    } else if (IS_ANDROID) {
      stepsEl.innerHTML =
        `① 点下方按钮，浏览器会弹「安装应用」的确认框<br>` +
        `② 点 <b>安装</b>，桌面就会出现「换装」图标<br>` +
        `③ 之后点桌面图标进来，顶部就没有页签了`;
      primaryBtn.textContent = '📲 一键安装';
    } else {
      stepsEl.innerHTML =
        `桌面 Chrome：地址栏右侧会出现 <b>「安装」图标</b> ⊕，点一下即可<br>` +
        `其他浏览器：用手机上的 Chrome / Edge 打开本页即可一键安装`;
      primaryBtn.textContent = '我装好了';
    }
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); }
  modal.querySelector('.close').onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };

  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });

  fab.onclick = e => {
    if (e.target.classList.contains('x')) {
      localStorage.setItem(DISMISS_KEY, 'gone'); fab.remove(); return;
    }
    if (IS_IOS || (!deferred && !IS_ANDROID)) openModal();
    else if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(() => { deferred = null; closeModal(); });
    } else openModal();
  };
  primaryBtn.onclick = () => {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(() => { deferred = null; closeModal(); });
    } else closeModal();
  };
  modal.querySelector('#merPwaCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = location.href; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
    modal.querySelector('#merPwaCopy').textContent = '✓ 已复制';
    setTimeout(() => modal.querySelector('#merPwaCopy').textContent = '复制网址，方便发给朋友', 1500);
  };

  if (IS_STANDALONE) { fab.remove(); return; }
  window.matchMedia && window.matchMedia('(display-mode: standalone)')
    .addEventListener('change', e => { if (e.matches) fab.remove(); });
})();
