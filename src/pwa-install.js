/* 拾光·澈屿 PWA 安装引导 v3
   —— 自动识别浏览器，给出「这个浏览器」能走通的安装路径
   1) 微信/企微/QQ/微博/钉钉：不支持安装 → 引导去系统浏览器打开
   2) Chrome / Edge / 三星 Internet：原生一键安装
   3) 小米/华为/OPPO/vivo/UC/百度/夸克：图解该浏览器的「添加到桌面」菜单位置
   4) iOS Safari：分享 → 添加到主屏幕
   5) 附带自检面板：装不上时能一眼看到卡在哪一步
*/
(function () {
  if (window.__MER_PWA_INIT__) return; window.__MER_PWA_INIT__ = true;

  const UA = navigator.userAgent || '';
  const hit = r => new RegExp(r, 'i').test(UA);
  const IS_IOS = /iPhone|iPad|iPod/i.test(UA);
  const IS_ANDROID = /Android/i.test(UA);
  const IS_STANDALONE =
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator.standalone === true);
  const CAN_SW = ('serviceWorker' in navigator) &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const DISMISS_KEY = 'mer_pwa_dismiss_v2';
  const INSTALLED_KEY = 'mer_pwa_installed_v1';

  // ---------- 浏览器识别（顺序敏感：越靠前越优先） ----------
  const BROWSERS = [
    { key: 'wechat',   name: '微信',        re: 'MicroMessenger', kind: 'blocked' },
    { key: 'wxwork',   name: '企业微信',    re: 'wxwork', kind: 'blocked' },
    { key: 'dingtalk', name: '钉钉',        re: 'DingTalk', kind: 'blocked' },
    { key: 'weibo',    name: '微博',        re: 'Weibo', kind: 'blocked' },
    { key: 'qq',       name: 'QQ 浏览器',   re: 'QQ/|MQQBrowser', kind: 'blocked' },
    { key: 'alipay',   name: '支付宝',      re: 'AlipayClient', kind: 'blocked' },
    { key: 'miui',     name: '小米浏览器',  re: 'MiuiBrowser|XiaoMi|Redmi', kind: 'manual' },
    { key: 'huawei',   name: '华为浏览器',  re: 'HuaweiBrowser|HUAWEI|HarmonyOS', kind: 'manual' },
    { key: 'honor',    name: '荣耀浏览器',  re: 'HonorBrowser|HONOR', kind: 'manual' },
    { key: 'oppo',     name: 'OPPO 浏览器', re: 'HeyTapBrowser|OppoBrowser|realme', kind: 'manual' },
    { key: 'vivo',     name: 'vivo 浏览器', re: 'VivoBrowser|vivo', kind: 'manual' },
    { key: 'uc',       name: 'UC 浏览器',   re: 'UCBrowser|UCWEB', kind: 'manual' },
    { key: 'baidu',    name: '百度浏览器',  re: 'Baidu|BIDUBrowser|baiduboxapp', kind: 'manual' },
    { key: 'quark',    name: '夸克浏览器',  re: 'Quark', kind: 'manual' },
    { key: 'sogou',    name: '搜狗浏览器',  re: 'SogouMobileBrowser', kind: 'manual' },
    { key: 'samsung',  name: '三星浏览器',  re: 'SamsungBrowser', kind: 'native' },
    { key: 'edge',     name: 'Edge',        re: 'EdgA|Edg/', kind: 'native' },
    { key: 'firefox',  name: 'Firefox',     re: 'Firefox|FxiOS', kind: 'native' },
    { key: 'chrome',   name: 'Chrome',      re: 'Chrome/', kind: 'native' },
    { key: 'safari',   name: 'Safari',      re: 'Safari', kind: 'ios' },
  ];
  // 剔除「国产壳浏览器 UA 里也带 Chrome/」的误判
  const SHELL_RE = 'MicroMessenger|wxwork|QQ/|MQQBrowser|UCBrowser|UCWEB|Quark|Baidu|BIDUBrowser|baiduboxapp|MiuiBrowser|XiaoMi|Redmi|HeyTapBrowser|OppoBrowser|VivoBrowser|HuaweiBrowser|HONOR|SogouMobileBrowser|DingTalk';
  let B = null;
  for (const b of BROWSERS) {
    if (hit(b.re)) {
      if (b.key === 'chrome' && hit(SHELL_RE)) continue;   // 是国产壳，继续往下找真身
      B = b; break;
    }
  }
  if (!B) B = { key: 'unknown', name: '当前浏览器', re: '', kind: IS_IOS ? 'ios' : (IS_ANDROID ? 'manual' : 'native') };
  if (IS_IOS && (B.key === 'chrome' || B.key === 'edge' || B.key === 'firefox' || B.key === 'miui')) {
    B = { key: 'ios-other', name: B.name, re: '', kind: 'ios' };   // iOS 上全部走 Safari 内核
  }

  // ---------- Service Worker ----------
  let swState = 'unsupported';
  if (CAN_SW) {
    navigator.serviceWorker.register('./sw.js').then(() => { swState = 'registered'; })
      .catch(e => { swState = 'failed: ' + (e && e.message || e); });
  }

  if (IS_STANDALONE) return;                                  // 已经在桌面 App 里，不打扰

  // ---------- 样式 ----------
  const STYLE = `
  .mer-pwa-fab{position:fixed;right:14px;bottom:96px;z-index:99999;
    display:inline-flex;align-items:center;gap:6px;padding:11px 15px;
    border-radius:999px;border:none;cursor:pointer;
    background:linear-gradient(135deg,#a78cd9,#ff9ec4);color:#fff;
    font:700 14px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    box-shadow:0 8px 24px rgba(120,80,200,.36),0 2px 6px rgba(0,0,0,.18);
    transition:transform .18s,box-shadow .18s;letter-spacing:.5px;
    -webkit-tap-highlight-color:transparent}
  .mer-pwa-fab:active{transform:scale(.96)}
  .mer-pwa-fab .x{display:inline-block;width:18px;height:18px;line-height:18px;
    text-align:center;border-radius:50%;background:rgba(255,255,255,.28);
    font-size:12px;margin-left:4px}
  .mer-pwa-bar{position:fixed;left:0;right:0;top:0;z-index:99998;
    background:linear-gradient(135deg,#ff8fb1,#ffb36b);color:#fff;
    padding:10px 12px;font:600 13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    box-shadow:0 4px 14px rgba(0,0,0,.18);text-align:center}
  .mer-pwa-bar b{background:#fff;color:#e2598a;border-radius:6px;padding:1px 5px}
  .mer-pwa-bar .cbtn{margin-left:8px;display:inline-block;background:rgba(255,255,255,.9);
    color:#e2598a;border:none;border-radius:999px;padding:4px 12px;font-weight:700;font-size:12px}
  .mer-pwa-modal{position:fixed;inset:0;z-index:100000;display:none;
    align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow:auto}
  .mer-pwa-modal.show{display:flex;animation:merFadeIn .2s ease}
  .mer-pwa-modal .card{background:#fff;width:min(430px,94vw);max-height:88vh;overflow:auto;
    border-radius:22px 22px 0 0;padding:20px 22px 28px;
    box-shadow:0 -10px 30px rgba(0,0,0,.2);text-align:center;position:relative;
    color:#3a3350;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    animation:merSlideUp .25s ease}
  .mer-pwa-modal .close{position:absolute;top:8px;right:12px;width:30px;height:30px;
    border:none;background:transparent;font-size:24px;color:#a098b8;cursor:pointer;line-height:1}
  .mer-pwa-modal h3{margin:4px 0 2px;font-size:18px;color:#3a3350}
  .mer-pwa-modal p{margin:6px 0;color:#7a7393;font-size:13px}
  .mer-pwa-modal .hero{width:80px;height:80px;border-radius:20px;
    box-shadow:0 8px 20px rgba(120,80,200,.32);margin:6px auto 8px;display:block;
    background-image:url('./icons/icon-192.png');background-size:cover;background-position:center}
  .mer-pwa-modal .steps{text-align:left;background:#f6f1fb;border-radius:14px;
    padding:12px 14px;margin:12px 0;line-height:1.85;font-size:14px;color:#4a4360}
  .mer-pwa-modal .steps b{color:#7f66c4}
  .mer-pwa-modal .tip{text-align:left;background:#fff6e8;border-radius:12px;
    padding:10px 12px;margin:10px 0;font-size:13px;color:#8a6a3a;line-height:1.7}
  .mer-pwa-modal .primary{display:block;width:100%;padding:13px 20px;border-radius:14px;
    background:linear-gradient(135deg,#a78cd9,#ff9ec4);color:#fff;font-weight:700;
    border:none;cursor:pointer;box-shadow:0 6px 18px rgba(120,80,200,.36);
    font-size:15px;margin-top:10px;-webkit-tap-highlight-color:transparent}
  .mer-pwa-modal .primary:active{transform:scale(.98)}
  .mer-pwa-modal .ghost{display:block;width:100%;margin:8px 0 0;padding:11px;border-radius:12px;
    border:1px solid #e3dcf2;background:#fff;color:#7f66c4;font-weight:600;font-size:14px;cursor:pointer}
  .mer-pwa-modal .secondary{display:block;margin:12px auto 0;background:transparent;border:none;
    color:#a098b8;font-size:12px;cursor:pointer;text-decoration:underline}
  .mer-pwa-modal .copyurl{font-size:12px;color:#7a7393;margin-top:8px;word-break:break-all;
    background:#f6f1fb;border-radius:8px;padding:6px 8px}
  .mer-pwa-modal .diag{text-align:left;background:#2f2a3d;color:#d9d3ea;border-radius:12px;
    padding:10px 12px;margin:10px 0;font:12px/1.7 ui-monospace,Menlo,Consolas,monospace;
    white-space:pre-wrap;word-break:break-all;display:none}
  @keyframes merFadeIn{from{opacity:0}to{opacity:1}}
  @keyframes merSlideUp{from{transform:translateY(60px);opacity:.6}to{transform:translateY(0);opacity:1}}
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  const copy = async text => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        return true;
      } catch (e) { return false; }
    }
  };

  // ---------- 情况 A：微信/QQ 等不支持安装的内嵌浏览器 ----------
  if (B.kind === 'blocked') {
    const bar = document.createElement('div');
    bar.className = 'mer-pwa-bar';
    bar.innerHTML = `⚠️ 当前在 <b>${B.name}</b> 里打开，它不支持装到桌面。<br>` +
      `请点右上角 <b>···</b> → <b>在浏览器中打开</b>（选系统浏览器 / Chrome）` +
      `<button class="cbtn" id="merPwaCopy2">复制网址</button>`;
    document.body.appendChild(bar);
    document.body.style.paddingTop = (document.body.style.paddingTop || '') + '';
    bar.querySelector('#merPwaCopy2').onclick = async e => {
      e.stopPropagation();
      const ok = await copy(location.href);
      e.target.textContent = ok ? '✓ 已复制' : '复制失败，长按地址栏';
      setTimeout(() => e.target.textContent = '复制网址', 1600);
    };
    return;   // 内嵌浏览器里不再显示安装按钮
  }

  // ---------- 情况 B：可以走安装流程 ----------
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALLED_KEY, '1');
    fab.remove();
    alert('✅ 安装成功！请回到手机桌面找「拾光」图标。\n（部分小米机型会自动收进抽屉，见下方说明）');
  });

  const fab = document.createElement('button');
  fab.className = 'mer-pwa-fab';
  fab.innerHTML = '📲 装到桌面 <span class="x" title="不再提醒">×</span>';
  document.body.appendChild(fab);

  const modal = document.createElement('div');
  modal.className = 'mer-pwa-modal';
  modal.innerHTML = `
    <div class="card">
      <button class="close" aria-label="关闭">×</button>
      <div class="hero"></div>
      <h3>装到桌面 · 去掉顶部页签</h3>
      <p id="merPwaSub"></p>
      <div class="steps" id="merPwaSteps"></div>
      <div class="tip" id="merPwaTip"></div>
      <button class="primary" id="merPwaPrimary"></button>
      <button class="ghost" id="merPwaCopy">📋 复制网址（换 Chrome / Edge 打开最稳）</button>
      <button class="secondary" id="merPwaDiagBtn">装不上？点这里自检</button>
      <div class="diag" id="merPwaDiag"></div>
    </div>`;
  document.body.appendChild(modal);

  const $ = id => modal.querySelector('#' + id);
  const stepsEl = $('merPwaSteps'), primary = $('merPwaPrimary'), subEl = $('merPwaSub'), tipEl = $('merPwaTip');

  // 各浏览器的手动路径（小米单列，最常见也最容易找不到图标）
  const MANUAL = {
    miui: {
      sub: '检测到 <b>小米浏览器</b>，按下面三步手动添加：',
      steps: `① 点右下角 <b>☰ 菜单</b>（三条横线）<br>` +
             `② 找到 <b>添加到主屏幕</b> / <b>发送到桌面</b>（有些版本在「工具箱」里）<br>` +
             `③ 确认后，桌面或抽屉里就会出现「拾光」`,
      tip: `<b>小米用户注意：</b>装完桌面看不到？<br>` +
           `· 桌面是<b>抽屉模式</b>时，图标会进抽屉：桌面<b>上滑</b> → 搜索框输入「拾光」<br>` +
           `· 或去 <b>设置 → 应用设置 → 应用管理</b> → 搜「拾光」→ 打开 <b>桌面快捷方式</b><br>` +
           `· 若打开后还有地址栏，说明装的是网页快捷方式，改用 <b>Chrome / Edge</b> 打开本页再装一次即可全屏`
    },
    huawei: {
      sub: '检测到 <b>华为浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b>（部分版本叫「发送到桌面」）<br>③ 回桌面找「拾光」`,
      tip: `装完桌面看不到？桌面<b>上滑进抽屉</b>，搜索「拾光」即可找到。`
    },
    honor: {
      sub: '检测到 <b>荣耀浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `装完桌面看不到？桌面<b>上滑进抽屉</b>，搜索「拾光」即可找到。`
    },
    oppo: {
      sub: '检测到 <b>OPPO 浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `装完桌面看不到？桌面<b>上滑进抽屉</b>，搜索「拾光」即可找到。`
    },
    vivo: {
      sub: '检测到 <b>vivo 浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `装完桌面看不到？桌面<b>上滑进抽屉</b>，搜索「拾光」即可找到。`
    },
    uc: {
      sub: '检测到 <b>UC 浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `UC 装的图标有些版本仍会带地址栏。想要完全无页签，建议复制网址到 <b>Chrome / Edge</b> 打开再装。`
    },
    baidu: {
      sub: '检测到 <b>百度浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `想要完全无页签，建议复制网址到 <b>Chrome / Edge</b> 打开再装。`
    },
    quark: {
      sub: '检测到 <b>夸克浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>··· 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `想要完全无页签，建议复制网址到 <b>Chrome / Edge</b> 打开再装。`
    },
    sogou: {
      sub: '检测到 <b>搜狗浏览器</b>，按下面步骤：',
      steps: `① 点底部 <b>☰ 菜单</b><br>② 选 <b>添加到桌面</b><br>③ 回桌面找「拾光」`,
      tip: `想要完全无页签，建议复制网址到 <b>Chrome / Edge</b> 打开再装。`
    },
    unknown: {
      sub: '按下面步骤手动添加：',
      steps: `① 点浏览器的 <b>☰ / ··· 菜单</b><br>② 找 <b>添加到主屏幕</b> / <b>安装应用</b><br>③ 回桌面找「拾光」`,
      tip: `如果你的浏览器没有这一项，复制网址到 <b>Chrome / Edge</b> 打开，就能一键安装。`
    }
  };

  function renderSteps() {
    if (IS_IOS || B.kind === 'ios') {
      subEl.innerHTML = 'iPhone / iPad 请按下面三步：';
      stepsEl.innerHTML =
        `① 点底部中间的 <b>分享按钮</b> <span style="font-size:17px">⬆️</span>（方框 + 向上箭头）<br>` +
        `② 向下滑，选 <b>添加到主屏幕</b> <span style="font-size:17px">➕</span><br>` +
        `③ 点右上角 <b>添加</b>（名字会自动填「拾光」）<br>` +
        `<span style="color:#8a7fa8">注意：必须用 <b>Safari</b>，Chrome/微信里没有这个选项</span>`;
      tipEl.innerHTML = `iOS 装完后点桌面图标打开，顶部就没有地址栏了。`;
      primary.textContent = '我装好了';
      return;
    }
    if (deferred) {
      subEl.innerHTML = '你的浏览器支持一键安装，点下面按钮即可：';
      stepsEl.innerHTML =
        `① 点 <b>一键安装</b>，会弹出系统确认框<br>` +
        `② 点 <b>安装 / 添加</b><br>` +
        `③ 回桌面点「拾光」图标打开 —— 顶部就没有页签了`;
      tipEl.style.display = 'none';
      primary.textContent = '📲 一键安装';
      return;
    }
    const m = MANUAL[B.key] || MANUAL.unknown;
    subEl.innerHTML = m.sub + (deferred ? '' : '');
    stepsEl.innerHTML = m.steps;
    tipEl.innerHTML = m.tip;
    tipEl.style.display = '';
    primary.textContent = '我按步骤装好了';
  }

  function openModal() { renderSteps(); modal.classList.add('show'); }
  function closeModal() { modal.classList.remove('show'); }
  modal.querySelector('.close').onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };

  function doInstall() {
    if (!deferred) { closeModal(); return; }
    const d = deferred; deferred = null;
    d.prompt();
    d.userChoice.then(res => {
      if (res && res.outcome === 'accepted') {
        localStorage.setItem(INSTALLED_KEY, '1');
        fab.remove();
      }
      closeModal();
    }).catch(() => closeModal());
  }

  fab.onclick = e => {
    if (e.target.classList.contains('x')) {
      localStorage.setItem(DISMISS_KEY, 'gone'); fab.remove(); return;
    }
    if (deferred && !IS_IOS && B.kind !== 'ios') doInstall();
    else openModal();
  };
  primary.onclick = () => { if (deferred) doInstall(); else closeModal(); };

  $('merPwaCopy').onclick = async e => {
    const ok = await copy(location.href);
    e.target.textContent = ok ? '✓ 已复制，去 Chrome/Edge 粘贴打开' : '复制失败，请长按地址栏手动复制';
    setTimeout(() => e.target.textContent = '📋 复制网址（换 Chrome / Edge 打开最稳）', 2200);
  };

  // ---------- 自检面板 ----------
  $('merPwaDiagBtn').onclick = async () => {
    const box = $('merPwaDiag');
    let mf = '未找到';
    try {
      const link = document.querySelector('link[rel="manifest"]');
      const u = link ? new URL(link.href, location.href).href : './manifest.webmanifest';
      const r = await fetch(u, { cache: 'no-store' });
      const j = await r.json();
      mf = (r.ok ? 'OK' : 'HTTP ' + r.status) + ' / name=' + (j.name || '?') + ' / display=' + (j.display || '?');
    } catch (e) { mf = '读取失败 ' + (e.message || e); }
    let iconOk = '未知';
    try {
      const r = await fetch('./icons/icon-192.png', { cache: 'no-store' });
      iconOk = r.ok ? 'OK' : 'HTTP ' + r.status;
    } catch (e) { iconOk = '失败'; }
    const lines = [
      '【拾光·澈屿 安装自检】',
      '时间: ' + new Date().toLocaleString(),
      '网址: ' + location.href,
      '协议: ' + location.protocol.replace(':', '') + (location.protocol === 'https:' ? ' ✓' : ' ✗ 必须是 https'),
      '浏览器: ' + B.name + ' (' + B.key + ')',
      'ServiceWorker: ' + swState,
      'manifest: ' + mf,
      '图标192: ' + iconOk,
      '可安装事件: ' + (deferred ? '已捕获 ✓（可一键安装）' : '未捕获（需手动添加桌面）'),
      '当前模式: ' + (IS_STANDALONE ? 'standalone（已在桌面 App 里）' : '浏览器页签模式'),
      'UA: ' + UA
    ];
    box.textContent = lines.join('\n');
    box.style.display = 'block';
    const ok = await copy(box.textContent);
    $('merPwaDiagBtn').textContent = ok ? '✓ 诊断信息已复制，发给开发者看看' : '诊断信息如下，可截图发给开发者';
  };

  if (localStorage.getItem(DISMISS_KEY) === 'gone') fab.remove();

  window.matchMedia && window.matchMedia('(display-mode: standalone)')
    .addEventListener && window.matchMedia('(display-mode: standalone)')
    .addEventListener('change', e => { if (e.matches) fab.remove(); });
})();
