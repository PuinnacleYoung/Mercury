/* ============================================================
   棋牌玩法 · 游戏端（card-games.js）· 星途岛四局（十六更）
   ------------------------------------------------------------
   四个地块入口：
     🟥 锋线速演（血旗部队·演武厅）      = UNO      · 流萤
     🀄 防线长议（血旗部队·二层血旗堂）  = 川麻     · 流萤
     🎲 永恒王座·番位之战（风皇娱乐）    = 飞行棋   · 星坠
     🃏 坐庄（地下帝国·地下赌坊）        = 斗地主   · 长庚

   依《星途岛·四局设计》总纲落地（陛下钦定）：
     · 横屏七大区：顶栏 / 左栏押注区 / 中央牌桌 / 右栏观战席(+命运·事件堆) / 底栏操作+战报
     · 观战系统：等待位面可开「观战一桌」（AI 互打），观战者可押注、递纸条；
       对局者绝不押注（总纲硬规则）；观战满 3 分钟 +200 本桌币（每日 3 次）
     · 押注系统：彩池制赔率 = 0.95 × 总池 ÷ 该家池（实时滚动）；
       斗地主固定赔率 庄1.9 / 散2.1 / 跟庄1.8；单注 100–5000、每桌 3 注、押 1 或押 3 次
     · 飞行棋 v5 棋盘：外圈 52 格方框环 + 中央田字格四社机库 + 归航臂 + 永恒王座；
       ★事件格 8 个（事件区 32 张）+ ✈航线 +12 + 同色连跳 +4 + 命运区 20 张
     · 术语包装全换：封杀/官宣/黑天鹅、接令/结案、坐庄/满仓/散户…
     · PC 大屏牌面放大、手机横屏按机型自适应；每桌常驻聊天渠道（本桌/世界/关卡）

   素材与分类在各引擎/牌组里独立管（card_skin_v1），这里只负责「玩」。
   ============================================================= */
(function (global) {
  'use strict';

  var SK = global.CardSkin;

  /* ================= 常量 ================= */
  var GAMES = {
    uno:      { name: '锋线速演',          em: '🟥', deck: 'uno',      seats: [2, 3, 4], def: 3, place: '血旗部队 · 演武厅',      cur: 'firefly' },
    mahjong:  { name: '防线长议',          em: '🀄', deck: 'mahjong',  seats: [3, 4],    def: 4, place: '血旗部队 · 二层血旗堂',  cur: 'firefly' },
    flight:   { name: '永恒王座·番位之战', em: '🎲', deck: 'flight',   seats: [2, 3, 4], def: 4, place: '风皇娱乐 · 经纪人办公室', cur: 'star' },
    doudizhu: { name: '坐庄',              em: '🃏', deck: 'doudizhu', seats: [3],       def: 3, place: '地下帝国 · 地下赌坊',    cur: 'evening' }
  };
  var AI_NAMES = ['五宝', '仓鼠甲', '仓鼠乙', '仓鼠丙'];
  var CUR = {
    star:    { n: '星坠', em: '🌟' },
    firefly: { n: '流萤', em: '✨' },
    evening: { n: '长庚', em: '🌙' }
  };
  var BET_MIN = 100, BET_MAX = 5000, BET_TABLE_MAX = 50000, BET_WINDOW_MS = 60000;

  /* ---------- 飞行棋 v5 几何（总纲 1.2，已校验） ---------- */
  var FL_RING = 52, FL_TOTAL = 56;                        // 0..50 环 · 51..55 归航臂 · 56 王座
  var FL_START = { r: 8, y: 21, g: 34, b: 47 };           // ▶ 出道格
  var FL_ENTRY = { r: 6, y: 19, g: 32, b: 45 };           // ↵ 归航入口
  var FL_STAR = [4, 11, 17, 24, 30, 36, 43, 49];          // ★ 事件格
  var FL_LINE = { 2: 14, 15: 27, 28: 40, 41: 1 };         // ✈ 航线起点→落点（+12）
  var FL_COL = { r: '#e8b23a', y: '#2fa8a0', g: '#3fa34d', b: '#3b82f6' };
  var FL_SOC = { r: '星幕', y: '潮声', g: '拾光', b: '云顶' };
  var FL_CI = { r: 0, y: 1, g: 2, b: 3 };                 // 格号 mod 4 = 色号
  /* 环格号 → 网格(行,列)：顶14 + 右13 + 底13 + 左12（四角共享） */
  function flRC(i) {
    if (i <= 13) return [0, i];
    if (i <= 26) return [i - 13, 13];
    if (i <= 39) return [13, 12 - (i - 27)];
    return [12 - (i - 40), 0];
  }
  /* 归航臂第 k 格（k=0..4） */
  function flArmRC(c, k) {
    if (c === 'r') return [1 + k, 6];
    if (c === 'y') return [6, 12 - k];
    if (c === 'g') return [12 - k, 7];
    return [7, 1 + k];
  }
  var FL_THRONE = { r: [6, 6], y: [6, 7], g: [7, 7], b: [7, 6] };
  /* 机库象限（行1, 列1, 行2, 列2） */
  var FL_QUAD = { r: [1, 1, 5, 5], y: [1, 8, 5, 12], g: [8, 8, 12, 12], b: [8, 1, 12, 5] };

  /* ================= 工具 ================= */
  function $(id) { return document.getElementById(id); }
  /* ⚠️ index.html 的 currentUser 是 let 声明（不在 window 上），只查 global.currentUser 永远是 undefined
     ——hash 直达（#cards-uno）就是这么被掐死的。两处都试。 */
  function curUser() {
    if (global.currentUser) return global.currentUser;
    try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser; } catch (e) { }
    return null;
  }
  function me() { var u = curUser(); return (u && (u.nickname || u.username)) || '我'; }
  function meName() { var u = curUser(); return (u && u.username) || 'me'; }
  function toast(m) { if (global.toast) global.toast(m); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  /* ================= 钱包（星坠 / 流萤 / 长庚） ================= */
  var WAL_KEY = 'card_wallet_v1';
  function walletAll() {
    var w = null;
    try { w = JSON.parse(localStorage.getItem(WAL_KEY) || 'null'); } catch (e) { }
    if (!w || typeof w.star !== 'number') w = { star: 10000, firefly: 10000, evening: 10000 };
    return w;
  }
  function walletAdd(cur, delta) {
    var w = walletAll();
    w[cur] = Math.max(0, Math.round((w[cur] || 0) + delta));
    try { localStorage.setItem(WAL_KEY, JSON.stringify(w)); } catch (e) { }
    renderHud();
    return w[cur];
  }

  /* ================= 状态 ================= */
  var el = null;
  var hall = { open: false, game: null, seats: 3, code: '', players: [], isHost: false, joined: false };
  var G = null;
  var _aiTimer = null, _tickTimer = null, _leftKey = '';
  var cgCh = 'table';
  var cgLogs = { table: [], world: [], level: [] };

  /* ================= 外壳（七大区） ================= */
  function ensureEl() {
    if (el) return el;
    var s = document.createElement('style');
    s.textContent =
      '#cg-hall{position:fixed;inset:0;z-index:130;display:none;flex-direction:column;' +
      'background:linear-gradient(135deg,#241a3d,#3b2a5e 60%,#2a1f47);color:#f5f1fc;font-family:inherit;}' +
      '#cg-hall.on{display:flex;}' +
      /* 顶栏：回合信息 / 三币 / 观战人数 / 侧栏与聊天开关 */
      '.cg-top{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 10px;' +
      'background:rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.12);min-height:46px;}' +
      '.cg-top .tt{font-size:15px;font-weight:800;line-height:1.15;}' +
      '.cg-top .st{font-size:10px;opacity:.72;}' +
      '#cg-hud{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;overflow:hidden;}' +
      '.cg-hi{font-size:11px;font-weight:800;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.16);' +
      'border-radius:999px;padding:3px 9px;white-space:nowrap;}' +
      '.cg-hi.cur{color:#ffd166;border-color:rgba(255,209,102,.5);}' +
      '.cg-tbtn{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff;width:32px;height:32px;' +
      'border-radius:10px;font-size:14px;cursor:pointer;font-weight:800;flex:0 0 auto;}' +
      '.cg-tbtn:hover{border-color:#c9b6f5;}' +
      /* 主区：左栏 21% / 中央 / 右栏 18%（总纲 1.11） */
      '#cg-main{flex:1;min-height:0;display:flex;position:relative;}' +
      '.cg-rail{flex:0 0 21%;min-width:0;display:none;flex-direction:column;gap:8px;padding:8px;' +
      'background:rgba(0,0,0,.22);overflow-y:auto;}' +
      '.cg-rail.rl{border-right:1px solid rgba(255,255,255,.1);}' +
      '.cg-rail.rr{flex-basis:18%;border-left:1px solid rgba(255,255,255,.1);}' +
      '.cg-rail.open{display:flex;}' +
      '#cg-center{flex:1;min-width:0;position:relative;display:flex;flex-direction:column;}' +
      '#cg-canvas{width:100%;flex:1;min-height:0;display:block;background:radial-gradient(ellipse at 50% 40%,#3d2c63,#241a3d);}' +
      '.cg-acts{position:absolute;left:0;right:0;bottom:var(--cg-acts-b,150px);display:flex;gap:8px;flex-wrap:wrap;' +
      'justify-content:flex-start;padding:4px 14px;pointer-events:none;z-index:5;}' +
      '.cg-acts .cg-btn{pointer-events:auto;background:rgba(18,10,38,.78);border-color:rgba(255,255,255,.3);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.4);}' +
      '.cg-acts .cg-btn.pri{background:linear-gradient(135deg,#e5484d,#f0834a);border-color:transparent;}' +
      '.cg-tip{flex:0 0 auto;padding:6px 12px;font-size:12px;opacity:.9;background:rgba(0,0,0,.3);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      /* 通用小件 */
      '.cg-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px;}' +
      '.cg-lab{font-size:11px;font-weight:800;opacity:.85;margin-bottom:7px;letter-spacing:.5px;}' +
      '.cg-sub{font-size:10px;opacity:.6;line-height:1.55;margin-top:6px;}' +
      '.cg-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center;}' +
      '.cg-btn{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;' +
      'padding:7px 12px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '.cg-btn:hover{border-color:#c9b6f5;}' +
      '.cg-btn.on{background:linear-gradient(135deg,#8b6fd6,#b49ae0);border-color:transparent;}' +
      '.cg-btn.pri{background:linear-gradient(135deg,#e5484d,#f0834a);border-color:transparent;}' +
      '.cg-btn:disabled{opacity:.4;cursor:not-allowed;}' +
      '.cg-in{border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.25);color:#fff;' +
      'border-radius:9px;padding:7px 10px;font-family:inherit;font-size:13px;width:110px;letter-spacing:2px;}' +
      '.seat{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border-radius:11px;' +
      'padding:7px 10px;font-size:12px;font-weight:700;min-width:130px;}' +
      '.seat .em{font-size:17px;}' +
      '.seat.me{border:1px solid #c9b6f5;}' +
      '.seat.empty{opacity:.5;}' +
      /* 押注条目 */
      '.cg-odds{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;}' +
      '.cg-odds .bar{flex:1;height:7px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;}' +
      '.cg-odds .bar i{display:block;height:100%;background:linear-gradient(90deg,#8b6fd6,#e5484d);}' +
      '.cg-odds .q{color:#ffd166;min-width:46px;text-align:right;}' +
      '.cg-chip{border:1px solid rgba(255,209,102,.4);background:rgba(255,209,102,.12);color:#ffd166;' +
      'border-radius:8px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;}' +
      '.cg-chip:hover{background:rgba(255,209,102,.24);}' +
      '.cg-betline{font-size:10px;opacity:.78;line-height:1.55;}' +
      /* 战报流 */
      '.cg-logline{font-size:10.5px;line-height:1.6;opacity:.85;border-bottom:1px dashed rgba(255,255,255,.08);padding:3px 0;}' +
      /* 观战头像 */
      '.cg-spec{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;background:rgba(255,255,255,.08);' +
      'border-radius:99px;padding:3px 8px;margin:2px 3px 2px 0;}' +
      /* 聊天抽屉 */
      '#cg-chat{position:absolute;top:0;right:0;bottom:0;width:min(300px,86%);z-index:20;display:none;flex-direction:column;' +
      'background:rgba(16,9,34,.96);border-left:1px solid rgba(255,255,255,.18);box-shadow:-8px 0 24px rgba(0,0,0,.4);}' +
      '#cg-chat.open{display:flex;}' +
      '.cg-chtabs{display:flex;gap:6px;padding:8px;}' +
      '.cg-chtab{flex:1;text-align:center;font-size:11px;font-weight:800;padding:6px 0;border-radius:9px;cursor:pointer;' +
      'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);}' +
      '.cg-chtab.on{background:linear-gradient(135deg,#8b6fd6,#b49ae0);border-color:transparent;}' +
      '#cg-chatlog{flex:1;overflow-y:auto;padding:4px 10px;font-size:11.5px;line-height:1.6;}' +
      '.cg-chmsg b{color:#c9b6f5;}' +
      '#cg-chin{display:flex;gap:6px;padding:8px;border-top:1px solid rgba(255,255,255,.12);}' +
      /* 等待位面：横排竖模块 */
      '#cg-body{flex:1;min-height:0;overflow-y:auto;padding:14px;}' +
      '.cg-cols{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;}' +
      '.cg-col{flex:1 1 230px;min-width:212px;display:flex;flex-direction:column;}' +
      '.cg-col .cg-card{margin-bottom:0;flex:1;display:flex;flex-direction:column;}' +
      '.cg-col .cg-row{flex-direction:column;align-items:stretch;}' +
      '.cg-col .cg-btn{text-align:center;padding:9px 13px;}' +
      '.cg-col .cg-sub{margin-top:auto;padding-top:8px;}' +
      '.cg-code{font-size:30px;font-weight:900;letter-spacing:8px;color:#ffd166;text-align:center;margin:10px 0 2px;}' +
      /* 手机横屏：侧栏改抽屉（默认收起，顶栏按钮开关） */
      '@media (max-width:880px){' +
      '.cg-rail{position:absolute;top:0;bottom:0;z-index:15;width:min(78%,300px);flex-basis:auto;' +
      'background:rgba(14,8,30,.96);box-shadow:0 0 24px rgba(0,0,0,.5);}' +
      '.cg-rail.rl{left:0;}.cg-rail.rr{right:0;}}';
    document.head.appendChild(s);

    el = document.createElement('div');
    el.id = 'cg-hall';
    el.innerHTML =
      '<div class="cg-top">' +
      '  <button class="cg-tbtn" id="cg-cbtn" title="聊天频道">💬</button>' +
      '  <div><div class="tt" id="cg-tt">棋牌</div><div class="st" id="cg-st"></div></div>' +
      '  <div id="cg-hud"></div>' +
      '  <button class="cg-tbtn" id="cg-lbtn" title="押注区">💰</button>' +
      '  <button class="cg-tbtn" id="cg-rbtn" title="观战席/战报">👥</button>' +
      '  <button class="cg-tbtn" id="cg-x" title="退出">✕</button>' +
      '</div>' +
      '<div id="cg-main">' +
      '  <div class="cg-rail rl" id="cg-left"></div>' +
      '  <div id="cg-center">' +
      '    <canvas id="cg-canvas" style="display:none"></canvas>' +
      '    <div class="cg-acts" id="cg-acts"></div>' +
      '    <div class="cg-tip" id="cg-tip" style="display:none"></div>' +
      '    <div id="cg-body"></div>' +
      '  </div>' +
      '  <div class="cg-rail rr" id="cg-right"></div>' +
      '  <div id="cg-chat">' +
      '    <div class="cg-chtabs">' +
      '      <div class="cg-chtab on" data-ch="table">🗣 本桌</div>' +
      '      <div class="cg-chtab" data-ch="world">🌍 世界</div>' +
      '      <div class="cg-chtab" data-ch="level">📺 关卡</div>' +
      '    </div>' +
      '    <div id="cg-chatlog"></div>' +
      '    <div id="cg-chin"><input class="cg-in" id="cg-chinput" placeholder="说点什么…（观战=递纸条）" style="flex:1;width:auto;letter-spacing:0;">' +
      '    <button class="cg-btn pri" id="cg-chsend">发送</button></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(el);
    $('cg-x').onclick = closeHall;
    $('cg-canvas').addEventListener('click', onCanvasClick);
    /* 侧栏开关：大屏默认展开，手机默认收起（机型适配） */
    function railDefault() {
      var wide = window.innerWidth > 880;
      $('cg-left').classList.toggle('open', wide);
      $('cg-right').classList.toggle('open', wide);
    }
    railDefault();
    window.addEventListener('resize', function () {
      if (G) { resizeCanvas(); drawGame(); }
    });
    $('cg-lbtn').onclick = function () { $('cg-left').classList.toggle('open'); $('cg-right').classList.remove('open'); if (G) { resizeCanvas(); drawGame(); } };
    $('cg-rbtn').onclick = function () { $('cg-right').classList.toggle('open'); $('cg-left').classList.remove('open'); if (G) { resizeCanvas(); drawGame(); } };
    $('cg-cbtn').onclick = function () { toggleChat(); };
    Array.prototype.forEach.call(document.querySelectorAll('.cg-chtab'), function (t) {
      t.onclick = function () { cgCh = t.dataset.ch; Array.prototype.forEach.call(document.querySelectorAll('.cg-chtab'), function (x) { x.classList.toggle('on', x === t); }); renderChat(); };
    });
    $('cg-chsend').onclick = sendCgChat;
    $('cg-chinput').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendCgChat(); });
    bindChatNet();
    return el;
  }
  function toggleChat() {
    ensureEl();
    var c = $('cg-chat');
    c.classList.toggle('open');
    if (c.classList.contains('open')) { renderChat(); setTimeout(function () { try { $('cg-chinput').focus(); } catch (e) { } }, 60); }
  }

  /* ================= 战报 / HUD / 侧栏 ================= */
  function cgLog(txt) {
    if (G) { G.log.push(txt); if (G.log.length > 120) G.log.shift(); }
    var r = $('cg-right');
    if (r && r.classList.contains('open') && G) renderRight();
  }
  function renderHud() {
    if (!el) return;
    var hud = $('cg-hud'); if (!hud) return;
    var out = '';
    if (G) {
      if (G.game === 'uno') out += '<span class="cg-hi">通告池 ' + G.stock.length + '</span>' +
        '<span class="cg-hi">方向 ' + (G.dir === 1 ? '顺' : '逆') + '</span>';
      else if (G.game === 'mahjong') out += '<span class="cg-hi">牌墙 ' + G.wall.length + '</span>';
      else if (G.game === 'doudizhu') out += '<span class="cg-hi">倍数 ×' + (G.mult || 1) + '</span>';
      else if (G.game === 'flight') {
        out += '<span class="cg-hi">第 ' + G.round + ' 回合</span>';
        var prog = [];
        G.colors.forEach(function (c, p) {
          var top = G.planes[p].filter(function (v) { return v === FL_TOTAL; }).length;
          prog.push(FL_SOC[c] + ' ' + top + '/4');
        });
        out += '<span class="cg-hi">登顶 ' + esc(prog.join('·')) + '</span>';
      }
      if (G.bet) out += '<span class="cg-hi' + (G.bet.closed ? '' : ' cur') + '">' + (G.bet.closed ? '🔒 封盘' : '💰 押注窗 ' + betLeftSec() + 's') + '</span>';
    }
    var w = walletAll(), parts = [];
    Object.keys(CUR).forEach(function (k) {
      var on = G && GAMES[G.game] && GAMES[G.game].cur === k;
      parts.push('<span class="cg-hi' + (on ? ' cur' : '') + '">' + CUR[k].em + CUR[k].n + ' ' + fmt(w[k] || 0) + '</span>');
    });
    out += parts.join('');
    if (G) out += '<span class="cg-hi">👥 ' + ((G.specs ? G.specs.length : 0) + (G.spectate ? 1 : 0)) + '</span>';
    hud.innerHTML = out;
  }
  function betLeftSec() { return Math.max(0, Math.ceil((G.bet.openUntil - Date.now()) / 1000)); }

  function renderLeft() {
    var box = $('cg-left'); if (!box || !G || !G.bet) return;
    var g = GAMES[G.game], cur = CUR[g.cur];
    var h = '<div class="cg-card"><div class="cg-lab">💰 押注区 · ' + cur.em + cur.n + '</div>';
    if (!G.spectate) {
      h += '<div class="cg-betline">对局者不能押注（总纲铁律）。<br>想押？回等待位面点「👥 观战一桌」，<br>坐上观战席就能押 + 递纸条 + 领津贴。</div>';
    } else if (G.bet.closed) {
      h += '<div class="cg-betline">🔒 已封盘，注单等结算。</div>';
    } else {
      h += '<div class="cg-betline">窗内可押 · 单注 ' + fmt(BET_MIN) + '–' + fmt(BET_MAX) + ' · 每桌限 3 注 · 剩 ' + betLeftSec() + ' 秒</div>';
      if (!G.bet.plan) {
        h += '<div class="cg-row" style="margin-top:6px;">' +
          '<button class="cg-btn" data-plan="1">押 1 次</button>' +
          '<button class="cg-btn" data-plan="3">押 3 次（三段自动投入）</button></div>';
      } else {
        h += '<div class="cg-betline" style="margin-top:4px;">方案：押 ' + G.bet.plan + ' 次' + (G.bet.plan === 3 ? '（后两段自动入池）' : '') + ' · 已下 ' + G.bet.mineCnt + '/3 注</div>';
      }
      var tg = betTargets();
      tg.forEach(function (t, i) {
        if (G.bet.mode === 'pot') {
          var total = G.bet.poolPaid.reduce(function (a, b) { return a + b; }, 0);
          var odds = G.bet.poolPaid[i] > 0 ? (0.95 * total / G.bet.poolPaid[i]) : 0;
          var share = total > 0 ? G.bet.poolPaid[i] / total : 0;
          h += '<div class="cg-odds" style="margin-top:7px;"><span style="min-width:70px;">' + esc(t) + '</span>' +
            '<span class="bar"><i style="width:' + Math.round(share * 100) + '%"></i></span>' +
            '<span class="q">' + (odds ? '×' + odds.toFixed(2) : '—') + '</span></div>';
          if (G.spectate && !G.bet.closed && G.bet.plan) {
            h += '<div class="cg-row" style="margin-top:4px;">' +
              [100, 500, 1000, 5000].map(function (v) { return '<button class="cg-chip" data-t="' + i + '" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div>';
          }
        } else {
          h += '<div class="cg-odds" style="margin-top:7px;"><span style="min-width:70px;">' + esc(t.name) + '</span>' +
            '<span class="q">×' + t.odds.toFixed(1) + '</span></div>';
          if (G.spectate && !G.bet.closed && G.bet.plan) {
            h += '<div class="cg-row" style="margin-top:4px;">' +
              [100, 500, 1000, 5000].map(function (v) { return '<button class="cg-chip" data-t="' + t.idx + '" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div>';
          }
        }
      });
    }
    var mine = G.bet.bets.filter(function (b) { return b.mine; });
    if (mine.length) {
      h += '<div class="cg-lab" style="margin-top:9px;">我的注单</div>';
      mine.forEach(function (b) {
        h += '<div class="cg-betline">🎫 ' + esc(b.targetName) + ' · ' + fmt(b.amt) + ' ' + cur.n + ' · 已入池 ' + fmt(b.paid) + (b.plan === 3 ? '（三段）' : '') + '</div>';
      });
    }
    h += '<div class="cg-sub">彩池制：赔率 = 0.95 × 总池 ÷ 该家池，实时滚动。抽水 5% 归荷官（六顺喵）。</div></div>';
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll('[data-v]'), function (b) {
      b.onclick = function () { placeBet(parseInt(b.dataset.t, 10), parseInt(b.dataset.v, 10)); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-plan]'), function (b) {
      b.onclick = function () { G.bet.plan = parseInt(b.dataset.plan, 10); cgLog('📋 选定押 ' + G.bet.plan + ' 次方案'); renderLeft(); };
    });
  }
  function betTargets() {
    if (G.bet.mode === 'fixed') {
      return [
        { idx: 0, name: '庄家通吃', odds: 1.9 },
        { idx: 1, name: '散户反杀', odds: 2.1 },
        { idx: 2, name: '跟庄', odds: 1.8 }
      ];
    }
    var out = [];
    for (var p = 0; p < G.seats; p++) {
      out.push(G.game === 'flight' ? (FL_SOC[G.colors[p]] + '社') : G.names[p]);
    }
    return out;
  }

  function renderRight() {
    var box = $('cg-right'); if (!box || !G) return;
    var h = '';
    if (G.game === 'flight') {
      h += '<div class="cg-card"><div class="cg-lab">🔮 命运区（紫 · 全场广播）</div><div class="cg-betline">剩 ' + G.fate.length + '/20 张 · 落 ✈ 航线起点当场翻一张</div>' +
        (G.lastFate ? '<div class="cg-betline" style="color:#c9b6f5;">' + esc(G.lastFate) + '</div>' : '') + '</div>';
      h += '<div class="cg-card"><div class="cg-lab">🟠 事件区（琥珀 · 落 ★ 自动翻）</div><div class="cg-betline">弃牌回收循环 · 余 ' + G.evdeck.length + ' 张</div>' +
        (G.lastEvent ? '<div class="cg-betline" style="color:#ffd166;">' + esc(G.lastEvent) + '</div>' : '') + '</div>';
    }
    var specs = (G.specs || []).map(function (s) { return s.n; });
    if (G.spectate) specs.unshift(me() + '（我）');
    h += '<div class="cg-card"><div class="cg-lab">👥 观战席（' + specs.length + '）</div><div>' +
      specs.map(function (n) { return '<span class="cg-spec">🐹 ' + esc(n) + '</span>'; }).join('') + '</div>' +
      '<div class="cg-sub">观战满 3 分钟 +200 ' + CUR[GAMES[G.game].cur].n + '（每日 3 次）。看不到任何人手牌——观战硬规矩。</div></div>';
    h += '<div class="cg-card" style="flex:1;min-height:90px;"><div class="cg-lab">📜 战报</div>' +
      (G.log || []).slice(-14).reverse().map(function (l) { return '<div class="cg-logline">' + esc(l) + '</div>'; }).join('') + '</div>';
    box.innerHTML = h;
  }
  function renderRails() { renderLeft(); renderRight(); renderHud(); }

  /* ================= 聊天渠道（本桌 / 世界 / 关卡） ================= */
  var _chatBound = false;
  function bindChatNet() {
    if (_chatBound || !global.Net || !Net.on) return; _chatBound = true;
    Net.on('chat', function (m) {
      if (!m) return;
      var ch = m.channel === 'level' ? 'level' : (m.channel === 'dm' ? null : 'world');
      if (!ch) return;
      cgLogs[ch].push({ n: m.name || m.from || '??', text: m.text || '' });
      if (cgLogs[ch].length > 60) cgLogs[ch].shift();
      if (el && $('cg-chat').classList.contains('open') && cgCh === ch) renderChat();
    });
  }
  function renderChat() {
    var box = $('cg-chatlog'); if (!box) return;
    var list = cgLogs[cgCh] || [];
    box.innerHTML = list.slice(-40).map(function (m) {
      return '<div class="cg-chmsg"><b>' + esc(m.n) + '：</b>' + esc(m.text) + '</div>';
    }).join('') || '<div class="cg-chmsg" style="opacity:.5;">（还没有消息。观战模式里这里就是「递纸条」弹幕）</div>';
    box.scrollTop = box.scrollHeight;
  }
  function pushTableMsg(n, text) {
    cgLogs.table.push({ n: n, text: text });
    if (cgLogs.table.length > 60) cgLogs.table.shift();
    if (el && $('cg-chat').classList.contains('open') && cgCh === 'table') renderChat();
  }
  function sendCgChat() {
    var inp = $('cg-chinput'); var text = (inp.value || '').trim(); if (!text) return;
    inp.value = '';
    if (cgCh === 'table') {
      pushTableMsg(me(), text);
      /* 联机房里把本桌话递给同桌（私聊通道，不刷世界） */
      if (hall.code && global.Net && Net.connected()) {
        (hall.players || []).forEach(function (p) {
          if (p && p.u && p.u !== meName()) Net.chatCh('dm', '【' + GAMES[hall.game].em + GAMES[hall.game].name + '】' + me() + '：' + text, p.u);
        });
      }
    } else {
      if (global.Net && Net.connected()) { Net.chatCh(cgCh, text); cgLogs[cgCh].push({ n: me(), text: text }); renderChat(); }
      else toast('⚠️ 没连服务器，这个频道发不出去（本桌频道随时能聊）');
    }
  }

  /* ================= 等待位面 ================= */
  function openHall(gameId) {
    var g = GAMES[gameId]; if (!g) return;
    ensureEl();
    hall.open = true; hall.game = gameId; hall.seats = g.def;
    hall.code = ''; hall.isHost = false; hall.joined = false;
    hall.players = [{ u: meName(), n: me(), me: true }];
    G = null;
    el.classList.add('on');
    $('cg-canvas').style.display = 'none';
    $('cg-tip').style.display = 'none';
    $('cg-acts').style.display = 'none';
    $('cg-body').style.display = '';
    $('cg-left').classList.remove('open'); $('cg-right').classList.remove('open');
    $('cg-chat').classList.remove('open');
    $('cg-tt').textContent = g.em + ' ' + g.name + ' · 等待位面';
    $('cg-st').textContent = g.place;
    renderHud();
    bindRoomEvents();
    renderHall();
  }
  function closeHall() {
    if (hall.code && global.Net && Net.connected()) Net.send({ t: 'roomLeave', code: hall.code });
    hall.open = false; hall.code = ''; G = null;
    clearTimeout(_aiTimer); clearInterval(_tickTimer); _tickTimer = null;
    if (el) el.classList.remove('on');
  }

  function renderHall() {
    var g = GAMES[hall.game];
    $('cg-tt').textContent = g.em + ' ' + g.name + ' · 等待位面';
    $('cg-st').textContent = g.place + ' · ' + (hall.code ? ('房号 ' + hall.code) : '还没开房') +
      ' · 在线 ' + hall.players.length + '/' + hall.seats;
    var b = $('cg-body');
    b.innerHTML = '';
    /* 陛下钦定：横着一排竖模块（人数 / 座位 / 开房加入），不再一条条摞。
       ⚠️ 棋牌引擎是管理员系统（要密码），游戏侧绝不放直跳入口 —— 换素材请走管理员中枢。 */
    var cols = document.createElement('div'); cols.className = 'cg-cols';
    b.appendChild(cols);
    function col(title) {
      var wrap = document.createElement('div'); wrap.className = 'cg-col';
      var card = document.createElement('div'); card.className = 'cg-card';
      card.innerHTML = '<div class="cg-lab">' + title + '</div>';
      wrap.appendChild(card); cols.appendChild(wrap);
      return card;
    }

    /* ① 人数 */
    var c1 = col('① 这一桌几个人');
    var r1 = document.createElement('div'); r1.className = 'cg-row';
    g.seats.forEach(function (n) {
      var btn = document.createElement('button');
      btn.className = 'cg-btn' + (hall.seats === n ? ' on' : '');
      btn.textContent = n + ' 人';
      btn.disabled = !!hall.code;
      btn.onclick = function () { hall.seats = n; syncSeats(); renderHall(); };
      r1.appendChild(btn);
    });
    c1.appendChild(r1);
    var sub1 = document.createElement('div'); sub1.className = 'cg-sub';
    sub1.textContent = '座位摆法：2 人对面坐、3 人坐左上/右上、4 人四角分开，谁出牌牌就亮在谁头上。';
    c1.appendChild(sub1);

    /* ② 座位 */
    var c2 = col('② 座位（空位开局由 AI 补位）');
    var r2 = document.createElement('div'); r2.className = 'cg-row';
    for (var i = 0; i < hall.seats; i++) {
      var p = hall.players[i];
      var d = document.createElement('div');
      d.className = 'seat' + (p ? (p.me ? ' me' : '') : ' empty');
      d.innerHTML = '<span class="em">' + (p ? (p.me ? '🙋' : '🐹') : '➕') + '</span>' +
        '<span>' + (p ? esc(p.n) : '空位（AI）') + '</span>';
      r2.appendChild(d);
    }
    c2.appendChild(r2);
    var sub2 = document.createElement('div'); sub2.className = 'cg-sub';
    sub2.textContent = '真联机：好友输入同一个房号就能坐到这张桌子；人不够的位置由 AI 顶上，随时能开局。';
    c2.appendChild(sub2);

    /* ③ 开房 / 观战 / 加入 */
    var c3 = col('③ 开房 · 观战 · 单机');
    var r3 = document.createElement('div'); r3.className = 'cg-row';
    function mkBtn(cls, txt, fn) { var x = document.createElement('button'); x.className = 'cg-btn ' + cls; x.textContent = txt; x.onclick = fn; return x; }
    if (!hall.code) {
      r3.appendChild(mkBtn('pri', '🏠 开个房间', createRoom));
      r3.appendChild(mkBtn('', '🔑 加入房间', function () { var c = prompt('输入房号（4 位）'); if (c) joinRoom(String(c).trim().toUpperCase()); }));
      r3.appendChild(mkBtn('', '👥 观战一桌（AI 互打）', function () { startGame(buildSetup(hall.game, hall.seats), { spectate: true }); }));
      r3.appendChild(mkBtn('', '🎲 下场玩（单机直开）', function () { startGame(buildSetup(hall.game, hall.seats)); }));
    } else {
      r3.appendChild(mkBtn('', '📨 邀请好友', inviteFriend));
      r3.appendChild(mkBtn('', '👥 观战一桌（AI 互打）', function () { startGame(buildSetup(hall.game, hall.seats), { spectate: true }); }));
      r3.appendChild(mkBtn('', '🚪 离开房间', function () { if (global.Net && Net.connected()) Net.send({ t: 'roomLeave', code: hall.code }); hall.code = ''; hall.players = [{ u: meName(), n: me(), me: true }]; renderHall(); }));
      var b7 = mkBtn(hall.isHost ? 'pri' : '', hall.isHost ? '▶️ 开始（我是房主）' : '⏳ 等房主开始', function () { var st = buildSetup(hall.game, hall.seats); if (global.Net && Net.connected()) Net.send({ t: 'roomStart', code: hall.code, setup: st }); startGame(st); });
      b7.disabled = !hall.isHost;
      r3.appendChild(b7);
    }
    c3.appendChild(r3);
    if (hall.code) {
      var codeRow = document.createElement('div'); codeRow.className = 'cg-code';
      codeRow.textContent = hall.code;
      c3.appendChild(codeRow);
    }
    var sub3 = document.createElement('div'); sub3.className = 'cg-sub';
    sub3.textContent = '本桌货币：' + CUR[g.cur].em + CUR[g.cur].n + '。观战席能押注（彩池制）、递纸条、领观战津贴；对局者专心打牌，不能押。';
    c3.appendChild(sub3);

    renderActs([]);
  }

  function syncSeats() {
    hall.players = hall.players.slice(0, hall.seats);
    if (hall.code && global.Net && Net.connected()) Net.send({ t: 'roomSeats', code: hall.code, seats: hall.seats });
  }
  function createRoom() {
    if (global.Net && Net.connected()) {
      Net.send({ t: 'roomCreate', game: hall.game, seats: hall.seats });
      toast('🏠 正在开房…');
    } else {
      hall.code = 'LOCAL'; hall.isHost = true;
      toast('⚠️ 没连服务器，先单机开一局（AI 陪你）');
      renderHall();
    }
  }
  function joinRoom(code) {
    if (!code) return;
    if (global.Net && Net.connected()) Net.send({ t: 'roomJoin', code: code });
    else toast('⚠️ 没连服务器，只能单机');
  }
  function inviteFriend() {
    var g = GAMES[hall.game];
    var txt = '【' + g.em + g.name + '】来一局？房号 ' + hall.code + '（' + hall.seats + ' 人）';
    var friends = (global.Net && Net.self && Net.self() && Net.self().friends) || [];
    if (global.Net && Net.connected() && friends.length) {
      friends.slice(0, 1).forEach(function (f) { Net.send({ t: 'chat', text: txt, channel: 'dm', to: f }); });
      toast('📨 已把房号私聊给好友（' + txt + '）');
    } else {
      try { if (navigator.clipboard) navigator.clipboard.writeText(txt); } catch (e) { }
      prompt('把这段发给好友（已尝试复制）：', txt);
    }
  }

  /* ---- 服务器房间回包 ---- */
  var _bound = false;
  function bindRoomEvents() {
    if (_bound || !global.Net) return; _bound = true;
    Net.on('roomInfo', function (m) {
      if (!m || !m.room || m.room.game !== hall.game) { if (m && m.room) { hall.game = m.room.game; } else return; }
      var r = m.room;
      hall.code = r.code; hall.seats = r.seats || hall.seats;
      hall.players = r.players || [];
      hall.isHost = r.host === meName();
      hall.game = r.game;
      if (hall.open) renderHall();
    });
    Net.on('roomStart', function (m) {
      if (!m || !m.setup) return;
      hall.game = m.game || hall.game; hall.seats = m.setup.seats || hall.seats;
      if (hall.open) startGame(m.setup);
      else { openHall(hall.game); startGame(m.setup); }
    });
    Net.on('roomErr', function (m) { toast('❌ ' + (m.msg || '房间操作失败')); });
  }

  /* ================= 发牌（UNO / 川麻 / 斗地主） ================= */
  function buildSetup(gameId, seats) {
    var s = { game: gameId, seats: seats, seat: 0, seed: Date.now() };
    if (gameId === 'uno') s.hands = unoDeal(seats);
    else if (gameId === 'mahjong') s.wall = shuffle(mjWall());
    else if (gameId === 'flight') s.colors = ['r', 'y', 'g', 'b'].slice(0, seats);
    else if (gameId === 'doudizhu') s.deal = ddDeal();
    return s;
  }
  function unoDeck() {
    var d = [], cols = ['r', 'y', 'g', 'b'];
    cols.forEach(function (c) {
      d.push({ id: c + '0', color: c, shape: 's0' });
      for (var n = 1; n <= 9; n++) { d.push({ id: c + n + 'a', color: c, shape: 's' + n }); d.push({ id: c + n + 'b', color: c, shape: 's' + n }); }
      ['skip', 'rev', 'd2'].forEach(function (f) { d.push({ id: c + f + 'a', color: c, shape: f }); d.push({ id: c + f + 'b', color: c, shape: f }); });
    });
    for (var i = 0; i < 4; i++) { d.push({ id: 'w' + i, color: 'k', shape: 'wild' }); d.push({ id: 'w4' + i, color: 'k', shape: 'wild4' }); }
    return d;
  }
  function unoDeal(seats) {
    var d = shuffle(unoDeck()), hands = [];
    for (var i = 0; i < seats; i++) hands.push(d.splice(0, 7));
    var first = null;
    while (d.length && (!first || first.shape === 'wild' || first.shape === 'wild4')) first = d.pop();
    G_uno_first = first || { color: 'r', shape: 's5' };
    G_uno_stock = d;
    return hands;
  }
  var G_uno_stock = [], G_uno_first = null;

  function mjWall() {
    var w = [], suits = ['wan', 'tiao', 'tong'];
    suits.forEach(function (s) { for (var r = 1; r <= 9; r++) for (var k = 0; k < 4; k++) w.push({ id: s + r + '_' + k, kind: 'suit', suit: s, rank: r }); });
    return w;
  }
  function mjKey(t) { return t.suit + '_' + t.rank; }
  function mjCounts(hand) { var m = {}; hand.forEach(function (t) { var k = mjKey(t); m[k] = (m[k] || 0) + 1; }); return m; }
  /* 胡型判定：七对（连环计）/ 标准（4 组面子 + 1 对将）→ 返回战功名 */
  function mjWinShape(counts) {
    var keys = Object.keys(counts);
    var total = 0; keys.forEach(function (k) { total += counts[k]; });
    if (total % 3 !== 2) return null;
    var pairs = 0, ok = true;
    keys.forEach(function (k) { if (counts[k] % 2 !== 0) ok = false; pairs += counts[k] / 2; });
    if (ok && pairs === 7) return '连环计（七对）';
    function canForm(c) {
      var ks = Object.keys(c).filter(function (k) { return c[k] > 0; }).sort();
      if (!ks.length) return true;
      var k0 = ks[0];
      if (c[k0] >= 3) { c[k0] -= 3; if (canForm(c)) { c[k0] += 3; return true; } c[k0] += 3; }
      var m = /^(wan|tiao|tong)_(\d)$/.exec(k0);
      if (m) {
        var s = m[1], r = parseInt(m[2], 10);
        var k1 = s + '_' + (r + 1), k2 = s + '_' + (r + 2);
        if (r + 2 <= 9 && c[k1] > 0 && c[k2] > 0) {
          c[k0]--; c[k1]--; c[k2]--;
          if (canForm(c)) { c[k0]++; c[k1]++; c[k2]++; return true; }
          c[k0]++; c[k1]++; c[k2]++;
        }
      }
      return false;
    }
    for (var i = 0; i < keys.length; i++) {
      if (counts[keys[i]] >= 2) {
        var c = {}; keys.forEach(function (k) { c[k] = counts[k]; });
        c[keys[i]] -= 2;
        if (canForm(c)) return '小捷（平胡）';
      }
    }
    return null;
  }
  function mjWin(counts) { return !!mjWinShape(counts); }

  function ddDeck() {
    var d = [], suits = ['spade', 'heart', 'club', 'diamond'], ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    suits.forEach(function (s) { ranks.forEach(function (r) { d.push({ id: s + r, suit: s, rank: r, v: ddVal(r) }); }); });
    d.push({ id: 'jk_s', rank: 'JOKER', joker: 'jk_s', v: 16 });
    d.push({ id: 'jk_b', rank: 'JOKER', joker: 'jk_b', v: 17 });
    return d;
  }
  function ddVal(r) { return ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'].indexOf(r) + 3; }
  function ddDeal() { var d = shuffle(ddDeck()); return { hands: [d.slice(0, 17), d.slice(17, 34), d.slice(34, 51)], bottom: d.slice(51, 54) }; }
  /* 牌型识别：{type, v, len}  type: single/pair/trio/trio1/trio2/straight/pairSeq/plane/bomb/rocket */
  function ddCombo(cards) {
    if (!cards.length) return null;
    var n = cards.length;
    var vals = cards.map(function (c) { return c.v; }).sort(function (a, b) { return a - b; });
    var cnt = {}; vals.forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; });
    var ks = Object.keys(cnt).map(Number).sort(function (a, b) { return a - b; });
    if (n === 2 && vals[0] === 16 && vals[1] === 17) return { type: 'rocket', v: 100, len: 1 };
    if (ks.length === 1) {
      if (n === 1) return { type: 'single', v: ks[0], len: 1 };
      if (n === 2) return { type: 'pair', v: ks[0], len: 1 };
      if (n === 3) return { type: 'trio', v: ks[0], len: 1 };
      if (n === 4) return { type: 'bomb', v: ks[0], len: 1 };
      return null;
    }
    if (ks.length === 2) {
      var a = ks[0], b = ks[1];
      if (cnt[a] === 3 && (n === 4)) return { type: 'trio1', v: a, len: 1 };
      if (cnt[b] === 3 && (n === 4)) return { type: 'trio1', v: b, len: 1 };
      if (cnt[a] === 3 && n === 5) return { type: 'trio2', v: a, len: 1 };
      if (cnt[b] === 3 && n === 5) return { type: 'trio2', v: b, len: 1 };
      if (cnt[a] === 4 && n === 6) return { type: 'four2', v: a, len: 1 };
      if (cnt[b] === 4 && n === 6) return { type: 'four2', v: b, len: 1 };
      return null;
    }
    var times = cnt[ks[0]];
    var uniform = ks.every(function (k) { return cnt[k] === times; });
    var seq = ks.every(function (k, i) { return i === 0 || k === ks[i - 1] + 1; });
    var noHigh = ks[ks.length - 1] < 15;
    if (!uniform || !seq || !noHigh) return null;
    if (times === 1 && n >= 5) return { type: 'straight', v: ks[0], len: n };
    if (times === 2 && n >= 6) return { type: 'pairSeq', v: ks[0], len: ks.length };
    if (times === 3 && n >= 6) return { type: 'plane', v: ks[0], len: ks.length };
    return null;
  }
  function ddBeats(a, b) {
    if (!a) return true;
    if (b.type === 'rocket') return true;
    if (a.type === 'rocket') return false;
    if (b.type === 'bomb') { if (a.type === 'bomb') return b.v > a.v; return true; }
    if (a.type === 'bomb') return true;
    return (a.type === b.type && a.len === b.len && b.v > a.v);
  }

  /* ================= 开局 ================= */
  function startGame(setup, opts) {
    var spectate = !!(opts && opts.spectate);
    G = { setup: setup, game: setup.game, seats: setup.seats, turn: 0, over: null, msg: '', sel: [], phase: 'play', log: [], spectate: spectate, round: 0, t0: Date.now() };
    G.lastPlay = []; for (var lp = 0; lp < setup.seats; lp++) G.lastPlay.push(null);
    G.names = []; G.ai = [];
    for (var i = 0; i < setup.seats; i++) {
      if (i === 0 && !spectate) { G.names.push(me()); G.ai.push(false); }
      else { G.names.push(AI_NAMES[i % AI_NAMES.length]); G.ai.push(true); }
    }
    if (setup.game === 'uno') {
      G.hands = setup.hands.map(function (h) { return h.slice(); });
      G.stock = (G_uno_stock || []).slice();
      G.pile = [G_uno_first || { color: 'r', shape: 's5' }];
      G.cur = G.pile[0].color; G.dir = 1;
    } else if (setup.game === 'mahjong') {
      var wall = setup.wall.slice();
      G.hands = []; for (var i2 = 0; i2 < setup.seats; i2++) G.hands.push(wall.splice(0, 13));
      G.wall = wall; G.drawn = null; G.win = -1;
    } else if (setup.game === 'flight') {
      G.colors = setup.colors;
      G.planes = setup.colors.map(function () { return [-1, -1, -1, -1]; });
      G.dice = 0; G.turn = 0; G.pick = -1; G.skipFlag = {}; G.againFlag = false;
      G.fate = flDeck20(); G.evdeck = shuffle(flDeck32());
      G.lastFate = ''; G.lastEvent = '';
      G.names = G.colors.map(function (c, p) {
        return FL_SOC[c] + (p === 0 && !spectate ? '·' + me() : '');
      });
    } else if (setup.game === 'doudizhu') {
      G.hands = setup.deal.hands.map(function (h) { return h.slice(); });
      G.bottom = setup.deal.bottom.slice();
      G.landlord = -1; G.last = null; G.lastBy = -1; G.bidPass = 0; G.phase = 'bid'; G.mult = 1;
      G.hands[0] = G.hands[0].sort(function (a, b) { return b.v - a.v; });
    }
    initBet();
    $('cg-body').style.display = 'none';
    $('cg-canvas').style.display = '';
    $('cg-tip').style.display = '';
    $('cg-acts').style.display = '';
    resizeCanvas();
    /* 大屏展开左右栏（openHall 里收起过），手机保持抽屉（机型适配） */
    var wide2 = window.innerWidth > 880;
    $('cg-left').classList.toggle('open', wide2);
    $('cg-right').classList.toggle('open', wide2);
    _leftKey = '';
    cgLog('🎬 开局' + (spectate ? '（观战席视角，AI 互打）' : '') + ' · 押注窗 ' + Math.round(BET_WINDOW_MS / 1000) + ' 秒');
    drawGame();
    renderRails();
    scheduleAI();
    startTick();
  }
  function resizeCanvas() {
    var cv = $('cg-canvas'); if (!cv) return;
    var w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || 400;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv._dpr = dpr;
  }
  function ctxOf() {
    var cv = $('cg-canvas'); var c = cv.getContext('2d');
    c.setTransform(cv._dpr || 1, 0, 0, cv._dpr || 1, 0, 0);
    return { c: c, W: cv.width / (cv._dpr || 1), H: cv.height / (cv._dpr || 1) };
  }

  /* ================= 渲染 ================= */
  /* 牌面尺寸：PC 大屏显著放大，手机横屏按机型自适应（陛下钦定：别再小得像瓜子） */
  function cardW(W, H, perRow) {
    var a = W / perRow, b = H * 0.205;
    return Math.max(50, Math.min(Math.round(Math.min(a, b)), 126));
  }
  function drawGame() {
    if (!G) return;
    var o = ctxOf(), c = o.c, W = o.W, H = o.H;
    c.clearRect(0, 0, W, H);
    c.save();
    var grd = c.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, Math.max(W, H) * 0.7);
    grd.addColorStop(0, '#463270'); grd.addColorStop(1, '#241a3d');
    c.fillStyle = grd; c.fillRect(0, 0, W, H);
    c.restore();
    if (G.game === 'uno') drawUno(c, W, H);
    else if (G.game === 'mahjong') drawMj(c, W, H);
    else if (G.game === 'flight') drawFlight(c, W, H);
    else if (G.game === 'doudizhu') drawDd(c, W, H);
    var turnTxt = G.over ? ('🏁 ' + G.over) : (G.msg || ('轮到：' + (G.names[G.turn] || '—')));
    $('cg-tip').textContent = turnTxt + '　' + (G.over ? ('（点下面「再来一局」重开）') : tipText());
    renderActs(actionDefs());
    renderHud();
  }
  function tipText() {
    if (G.game === 'uno') return '锋线速演：点通告单出牌（同色/同数字/功能牌），没有就「抽一张」。剩 1 张记得官宣！';
    if (G.game === 'mahjong') return '防线长议：接令一张传令一张，凑 4 组面子 + 1 对将就能结案，也能凑连环计（七对）。';
    if (G.game === 'flight') return '永恒王座：掷 6 才能出道，绕外环一圈从 ↵ 归航、精确点数登上 ♛。落 ★ 翻事件卡，落 ✈ 冲航线翻命运卡。';
    return '坐庄：先抢筹坐庄（吃 3 张暗料），再轮流出牌压上家（顺子/连对/黑天鹅…），庄家 vs 两家散户，谁先出完谁赢。';
  }
  function renderActs(defs) {
    var box = $('cg-acts'); box.innerHTML = '';
    (defs || []).forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'cg-btn' + (d.pri ? ' pri' : '');
      b.textContent = d.label; b.disabled = !!d.disabled;
      b.onclick = d.fn;
      box.appendChild(b);
    });
  }
  function actionDefs() {
    var out = [];
    if (G.over) {
      out.push({ label: '🔄 再来一局', pri: true, fn: function () { var sp = G.spectate; startGame(buildSetup(G.game, G.seats), { spectate: sp }); } });
      out.push({ label: '🚪 退出', fn: closeHall });
      return out;
    }
    if (G.spectate) return out;   /* 观战席：只看不摸 */
    if (G.game === 'uno') {
      out.push({ label: '🂠 抽一张', fn: unoDraw });
      out.push({ label: '⏭ 过', fn: function () { advance(1); drawGame(); scheduleAI(); } });
      if (G.pendingWild) {
        ['r', 'y', 'g', 'b'].forEach(function (col) {
          out.push({ label: FL_SOC[col] + '色', pri: true, fn: function () { unoPickColor(col); } });
        });
      }
    } else if (G.game === 'mahjong') {
      if (G.canWin) out.push({ label: '🀄 结案！', pri: true, fn: mjWinDo });
      out.push({ label: '🎴 接令', disabled: !!G.drawn || G.turn !== 0, fn: mjDraw });
    } else if (G.game === 'flight') {
      out.push({ label: '🎲 掷骰', pri: true, disabled: G.turn !== 0 || !!G.over, fn: flRoll });
    } else if (G.game === 'doudizhu') {
      if (G.phase === 'bid') {
        out.push({ label: '💰 满仓坐庄', pri: true, fn: function () { G.landlord = 0; ddTakeBottom(); } });
        out.push({ label: '🙅 不坐', fn: function () { G.bidPass++; if (G.bidPass >= G.seats) { G.landlord = rnd(G.seats); ddTakeBottom(); } else { G.turn = 1; scheduleAI(); } drawGame(); } });
      } else {
        out.push({ label: '⬆️ 出牌', pri: true, fn: ddPlay });
        out.push({ label: '⏭ 过', fn: ddPass });
        out.push({ label: '🧹 清空选择', fn: function () { G.sel = []; drawGame(); } });
      }
    }
    out.push({ label: '🚪 退出', fn: closeHall });
    return out;
  }

  /* ---------- 通用：手牌几何 ---------- */
  function handGeom(n, cw, W) {
    var maxW = Math.min(W - 24, W * 0.86) - cw;
    var step = n > 1 ? Math.min(cw * 0.86, maxW / (n - 1)) : 0;
    var x0 = W / 2 - (step * (n - 1) + cw) / 2;
    return { x0: x0, step: step };
  }
  function hitHand(x, y, n, W, H, cw, ch, baseY) {
    var g = handGeom(n, cw, W);
    if (y < baseY - ch * 0.2 || y > baseY + ch) return -1;
    for (var i = 0; i < n; i++) {
      var cx = g.x0 + i * g.step;
      if (x >= cx && x <= cx + cw) return i;
    }
    return -1;
  }
  function drawHandRow(c, hand, W, H, cw, ch, baseY, sel, deck, flipIdx) {
    var n = hand.length;
    var g = handGeom(n, cw, W);
    for (var i = 0; i < n; i++) {
      var cx = g.x0 + i * g.step, cy = baseY - (sel && sel.indexOf(i) >= 0 ? Math.round(cw * 0.2) : 0);
      if (flipIdx && flipIdx.indexOf(i) >= 0) SK.drawBack(c, deck, cx, cy, cw, ch);
      else SK.drawCard(c, deck, hand[i], cx, cy, cw, ch, {});
    }
  }
  function setActsBottom(px) {
    if (el) el.style.setProperty('--cg-acts-b', Math.round(px) + 'px');
  }

  /* ---------- 通用：座位摆法（陛下钦定：我永远坐南） ---------- */
  function seatAnchors(n) {
    if (n <= 2) return [{ x: .5, y: .05, a: 'c' }];
    if (n === 3) return [{ x: .17, y: .06, a: 'l' }, { x: .83, y: .06, a: 'r' }];
    return [{ x: .06, y: .15, a: 'l' }, { x: .5, y: .035, a: 'c' }, { x: .94, y: .15, a: 'r' }];
  }
  function drawSeat(c, p, an, W, H, deck, cw, ch, extra) {
    var hand = G.hands ? G.hands[p] : null;
    var cnt = hand ? Math.min(hand.length, 12) : 0;
    var mw = cw * 0.38, mh = ch * 0.38, gap = mw * 0.32;
    var fanW = cnt ? (cnt - 1) * gap + mw : 0;
    var played = (G.lastPlay && G.lastPlay[p]) || [];
    var pw = played.length ? Math.min(cw * 0.62, W * 0.24 / Math.max(played.length, 1)) : 0;
    var ph = pw * 1.42, pstep = pw * 0.78;
    var rowW = fanW + (played.length ? 10 + (played.length - 1) * pstep + pw : 0);
    var rowX = an.a === 'l' ? 14 : an.a === 'r' ? W - 14 - rowW : W * an.x - rowW / 2;
    c.fillStyle = (G.turn === p) ? '#ffd166' : 'rgba(255,255,255,.88)';
    c.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = an.a === 'l' ? 'left' : an.a === 'r' ? 'right' : 'center';
    var nameX = an.a === 'l' ? 14 : an.a === 'r' ? W - 14 : W * an.x;
    var nameY = an.y * H + 12;
    c.fillText((G.turn === p ? '▶ ' : '') + G.names[p] + (extra || '') + (hand ? ' · ' + hand.length + ' 张' : ''), nameX, nameY);
    for (var k = 0; k < cnt; k++) SK.drawBack(c, deck, rowX + k * gap, nameY + 7, mw, mh);
    if (played.length) {
      var lx = rowX + fanW + 10;
      for (var j = 0; j < played.length; j++) SK.drawCard(c, deck, played[j], lx + j * pstep, nameY + 7 - (ph - mh) / 2, pw, ph, {});
    }
  }
  function drawMyPlayed(c, deck, W, H, cw, ch, baseY) {
    var played = (G.lastPlay && G.lastPlay[0]) || [];
    if (!played.length) return;
    var pw = Math.min(cw * 0.62, W * 0.24 / Math.max(played.length, 1)), ph = pw * 1.42, pstep = pw * 0.78;
    var rowW = (played.length - 1) * pstep + pw;
    var x0 = Math.min(W - 14 - rowW, Math.max(W / 2 + cw * 0.55, 14)), y0 = baseY - ph - 14;
    for (var j = 0; j < played.length; j++) SK.drawCard(c, deck, played[j], x0 + j * pstep, y0, pw, ph, {});
  }

  /* ---------- UNO（锋线速演） ---------- */
  var UNO_COL = { r: '#e5484d', y: '#f5c518', g: '#3fa34d', b: '#3b82f6', k: '#2b2140' };
  function drawUno(c, W, H) {
    var cw = cardW(W, H, 8.5), ch = cw * 1.42;
    setActsBottom(ch + 16 + 46);
    var ans = seatAnchors(G.seats);
    for (var p = 1; p < G.seats; p++) drawSeat(c, p, ans[p - 1], W, H, 'uno', cw, ch, '');
    var pw2 = Math.round(cw * 0.86), ph2 = Math.round(ch * 0.86);
    var px = W / 2 - pw2 / 2, py = H * 0.30;
    var anyPlayed = G.lastPlay.some(function (x) { return x && x.length; });
    if (!anyPlayed) SK.drawCard(c, 'uno', G.pile[G.pile.length - 1], px, py, pw2, ph2, {});
    else { SK.drawBack(c, 'uno', px + 4, py - 4, pw2, ph2, {}); SK.drawBack(c, 'uno', px, py, pw2, ph2, {}); }
    c.fillStyle = UNO_COL[G.cur] || '#fff';
    c.beginPath(); c.arc(px + pw2 + 22, py + ph2 * 0.45, 10, 0, 6.2832); c.fill();
    c.fillStyle = 'rgba(255,255,255,.82)'; c.font = '12px sans-serif'; c.textAlign = 'center';
    c.fillText('通告池 ' + G.stock.length, px + pw2 + 22, py + ph2 * 0.45 + 26);
    drawMyPlayed(c, 'uno', W, H, cw, ch, H - ch - 16);
    if (!G.spectate) {
      drawHandRow(c, G.hands[0], W, H, cw, ch, H - ch - 16, null, 'uno', null);
      c.fillStyle = (G.turn === 0 && !G.over) ? '#ffd166' : 'rgba(255,255,255,.88)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + me() + ' · ' + G.hands[0].length + ' 张通告', W / 2, H - 6);
    } else {
      var g0 = handGeom(Math.min(G.hands[0].length, 12), cw * 0.6, W);
      for (var k = 0; k < Math.min(G.hands[0].length, 12); k++) SK.drawBack(c, 'uno', g0.x0 + k * g0.step, H - ch * 0.6 - 14, cw * 0.6, ch * 0.6);
      c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(G.names[0] + ' · ' + G.hands[0].length + ' 张通告', W / 2, H - 6);
    }
  }
  function unoPlayable(card) {
    var top = G.pile[G.pile.length - 1];
    if (card.shape === 'wild' || card.shape === 'wild4') return true;
    if (card.color === G.cur) return true;
    return card.shape === top.shape;
  }
  function advance(n) { for (var i = 0; i < n; i++) G.turn = (G.turn + G.dir + G.seats) % G.seats; }
  function unoPlay(i) {
    if (G.turn !== 0 || G.over || G.spectate) return;
    var card = G.hands[0][i];
    if (!card || !unoPlayable(card)) { toast('🚫 这张出不了（要同色 / 同数字 / 换赛道）'); return; }
    G.hands[0].splice(i, 1); G.pile.push(card); G.cur = card.color; G.lastPlay[0] = [card];
    if (card.shape === 'skip') cgLog('📸 ' + G.names[0] + ' 打出「封杀」——狗仔闪光灯糊脸！');
    if (card.shape === 'wild4') cgLog('🦢 ' + G.names[0] + ' 甩出「黑天鹅」！全场暗场 0.5 秒');
    if (G.hands[0].length === 0) { G.winSeat = 0; G.over = G.names[0] + ' 杀青！本局通告全部播完 🎉'; settleBets(); drawGame(); return; }
    if (G.hands[0].length === 1) cgLog('📣 ' + G.names[0] + ' 官宣！（就剩 1 张了）');
    if (card.shape === 'wild' || card.shape === 'wild4') { G.pendingWild = card; drawGame(); return; }
    applyUno(card);
  }
  function unoPickColor(col) {
    var card = G.pendingWild; G.pendingWild = null; G.cur = col;
    if (card) applyUno(card);
    drawGame(); scheduleAI();
  }
  function applyUno(card) {
    if (card.shape === 'skip') advance(2);
    else if (card.shape === 'rev') { G.dir *= -1; cgLog('🔄 舆论反转！出牌方向掉头'); advance(1); }
    else if (card.shape === 'd2') { unoPen(1, 2); advance(2); }
    else if (card.shape === 'wild4') { unoPen(1, 4); advance(2); }
    else advance(1);
    drawGame(); scheduleAI();
  }
  function unoPen(seat, n) {
    var s = (G.turn + G.dir + G.seats) % G.seats;
    for (var i = 0; i < n; i++) {
      if (!G.stock.length) { G.stock = shuffle(G.pile.splice(0, G.pile.length - 1)); }
      if (G.stock.length) G.hands[s].push(G.stock.pop());
    }
    G.msg = G.names[s] + ' 被' + (n >= 4 ? '黑天鹅砸中' : '轧戏') + '，罚抽 ' + n + ' 张';
    cgLog(G.msg);
  }
  function unoDraw() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    if (!G.stock.length) G.stock = shuffle(G.pile.splice(0, G.pile.length - 1));
    var cd = G.stock.pop(); if (cd) G.hands[0].push(cd);
    G.msg = '抽了一张新通告';
    if (cd && !unoPlayable(cd)) { advance(1); scheduleAI(); }
    drawGame();
  }
  function nextTurn() {
    if (G.game === 'uno') G.turn = (G.turn + G.dir + G.seats) % G.seats;
    else G.turn = (G.turn + 1) % G.seats;
  }
  /* ---------- AI ---------- */
  function scheduleAI() {
    clearTimeout(_aiTimer);
    if (!G || G.over) return;
    if (G.game === 'uno' && G.pendingWild) return;
    if (!G.ai[G.turn]) return;
    _aiTimer = setTimeout(aiStep, 620);
  }
  function aiStep() {
    if (!G || G.over || !G.ai[G.turn]) return;
    var t = G.turn;
    if (G.game === 'uno') {
      var h = G.hands[t], idx = -1;
      for (var i = 0; i < h.length; i++) { if (unoPlayable(h[i])) { idx = i; break; } }
      if (idx < 0) {
        if (!G.stock.length) G.stock = shuffle(G.pile.splice(0, G.pile.length - 1));
        var cd = G.stock.pop(); if (cd) h.push(cd);
        G.msg = G.names[t] + ' 抽了一张新通告';
        advance(1); drawGame(); scheduleAI(); return;
      }
      var card = h.splice(idx, 1)[0]; G.pile.push(card); G.cur = card.color; G.lastPlay[t] = [card];
      if (card.shape === 'skip') cgLog('📸 ' + G.names[t] + ' 封杀！');
      if (card.shape === 'wild4') cgLog('🦢 ' + G.names[t] + ' 甩出黑天鹅！');
      if (h.length === 0) { G.winSeat = t; G.over = G.names[t] + ' 杀青！'; settleBets(); drawGame(); return; }
      if (h.length === 1) cgLog('📣 ' + G.names[t] + ' 官宣！');
      if (card.shape === 'wild' || card.shape === 'wild4') { G.cur = ['r', 'y', 'g', 'b'][rnd(4)]; }
      G.msg = G.names[t] + ' 打出一张';
      applyUno(card);
      return;
    }
    if (G.game === 'mahjong') mjAI(t);
    else if (G.game === 'flight') flAI(t);
    else if (G.game === 'doudizhu') ddAI(t);
  }

  /* ---------- 川麻（防线长议） ---------- */
  function mjDraw() {
    if (G.turn !== 0 || G.drawn || G.spectate) return;
    if (!G.wall.length) { G.over = '牌墙摸完了，流局'; drawGame(); return; }
    G.drawn = G.wall.pop();
    G.winShape = mjWinShape(mjCounts(G.hands[0].concat([G.drawn])));
    G.canWin = !!G.winShape;
    drawGame();
  }
  function mjDiscard(i) {
    if (G.turn !== 0 || !G.drawn || G.spectate) return;
    var hand = G.hands[0];
    var tile = (i === hand.length) ? G.drawn : hand.splice(i, 1)[0];
    if (i === hand.length) { } else { hand.push(G.drawn); }
    G.drawn = null; G.canWin = false;
    G.discard = tile; G.lastPlay[0] = [tile];
    cgLog(G.names[0] + ' 传令出去一张');
    nextTurn(); drawGame(); scheduleAI();
  }
  function mjWinDo() {
    G.winSeat = 0; G.winName = G.winShape || '小捷（平胡）';
    G.over = me() + ' 独走 · ' + G.winName + ' · 结案！🀄🎉';
    settleBets(); drawGame();
  }
  function mjAI(t) {
    if (!G.wall.length) { G.over = '牌墙摸完了，流局'; drawGame(); return; }
    var tile = G.wall.pop();
    var all = G.hands[t].concat([tile]);
    var shape = mjWinShape(mjCounts(all));
    if (shape) {
      G.winSeat = t; G.winName = shape;
      G.over = G.names[t] + ' 独走 · ' + shape + ' · 结案！🀄';
      settleBets(); drawGame(); return;
    }
    G.hands[t].push(tile);
    var drop = rnd(G.hands[t].length);
    G.lastPlay[t] = [G.hands[t].splice(drop, 1)[0]];
    G.msg = G.names[t] + ' 接令传令';
    nextTurn(); drawGame(); scheduleAI();
  }
  function drawMj(c, W, H) {
    var tw = cardW(W, H, 11), th = tw * 1.36;
    setActsBottom(th + 20 + 46);
    var ans = seatAnchors(G.seats);
    for (var p = 1; p < G.seats; p++) drawSeat(c, p, ans[p - 1], W, H, 'mahjong', tw, th, '');
    c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'left'; c.font = '12px sans-serif';
    c.fillText('牌墙 ' + G.wall.length, 14, H * 0.52);
    drawMyPlayed(c, 'mahjong', W, H, tw, th, H - th - 20);
    if (!G.spectate) {
      var hand = G.hands[0];
      var gm = handGeom(hand.length, tw, W);
      drawHandRow(c, hand, W, H, tw, th, H - th - 20, null, 'mahjong', null);
      if (G.drawn) {
        var rowW = gm.step * (hand.length - 1) + tw;
        var gx = Math.min(gm.x0 + rowW + 14, W - tw - 10);
        SK.drawCard(c, 'mahjong', G.drawn, gx, H - th - 34, tw, th, { hi: G.canWin ? '#ffd166' : null });
        if (G.canWin) {
          c.fillStyle = '#ffd166'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center';
          c.fillText('可结案！', gx + tw / 2, H - th - 40);
        }
      }
      c.fillStyle = (G.turn === 0 && !G.over) ? '#ffd166' : 'rgba(255,255,255,.88)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + me() + ' · ' + hand.length + ' 张' + (G.drawn ? '（含接令先传一张）' : '（点「接令」）'), W / 2, H - 6);
    } else {
      var g0 = handGeom(Math.min(G.hands[0].length, 13), tw * 0.6, W);
      for (var k = 0; k < Math.min(G.hands[0].length, 13); k++) SK.drawBack(c, 'mahjong', g0.x0 + k * g0.step, H - th * 0.6 - 16, tw * 0.6, th * 0.6);
      c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(G.names[0] + ' · ' + G.hands[0].length + ' 张', W / 2, H - 6);
    }
  }

  /* ---------- 斗地主（坐庄） ---------- */
  function ddTakeBottom() {
    G.hands[G.landlord] = G.hands[G.landlord].concat(G.bottom);
    G.hands[G.landlord].sort(function (a, b) { return b.v - a.v; });
    G.phase = 'play'; G.turn = G.landlord; G.last = null; G.lastBy = -1;
    G.msg = (G.landlord === 0 ? me() : G.names[G.landlord]) + ' 满仓坐庄（吃进 3 张暗料）';
    cgLog('💼 ' + G.msg);
    drawGame(); scheduleAI();
  }
  function ddPlay() {
    if (G.turn !== 0 || !G.sel.length || G.over || G.spectate) return;
    var cards = G.sel.map(function (i) { return G.hands[0][i]; });
    var cb = ddCombo(cards);
    if (!cb) { toast('🚫 牌型不合法（单/对/三/三带/顺子5+/连对/飞机/黑天鹅/双黑天鹅）'); return; }
    if (G.lastBy !== 0 && G.last && !ddBeats(G.last, cb)) { toast('🚫 压不过上家'); return; }
    ddDoPlay(0, cards, cb);
  }
  function ddDoPlay(p, cards, cb) {
    var ids = {}; cards.forEach(function (c) { ids[c.id] = 1; });
    G.hands[p] = G.hands[p].filter(function (c) { return !ids[c.id]; });
    G.last = cb; G.lastBy = p; G.table = cards.slice(); G.lastPlay[p] = cards.slice();
    if (cb.type === 'bomb') { G.mult = Math.min(8, (G.mult || 1) * 2); cgLog('🦢 ' + G.names[p] + ' 甩黑天鹅！倍数 ×' + G.mult); }
    if (cb.type === 'rocket') { G.mult = Math.min(8, (G.mult || 1) * 4); cgLog('🦢🦢 双黑天鹅！倍数 ×' + G.mult); }
    if (!G.hands[p].length) {
      var zWin = (p === G.landlord);
      G.winSeat = zWin ? 'z' : 's';
      G.over = (zWin ? '庄家 ' : '散户 ') + G.names[p] + (zWin ? ' 通吃！👑' : ' 反杀！🎉');
      settleBets(); drawGame(); return;
    }
    G.turn = (p + 1) % G.seats;
    drawGame(); scheduleAI();
  }
  function ddPass() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    if (G.lastBy === 0 || !G.last) { toast('🚫 你是先手，必须出牌'); return; }
    G.turn = (G.turn + 1) % G.seats;
    drawGame(); scheduleAI();
  }
  function ddFindBeat(hand, last) {
    var byV = {};
    hand.forEach(function (c, i) { (byV[c.v] = byV[c.v] || []).push(i); });
    var vs = Object.keys(byV).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v <= (last ? last.v : 0)) continue;
      var idxs = byV[v];
      var want = { single: 1, pair: 2, trio: 3, bomb: 4 }[last.type];
      if (want && idxs.length >= want) {
        var cards = idxs.slice(0, want).map(function (k) { return hand[k]; });
        var cb = ddCombo(cards);
        if (cb && ddBeats(last, cb)) return { cards: cards, cb: cb };
      }
    }
    for (var j = 0; j < vs.length; j++) if (byV[vs[j]].length === 4) {
      var cs = byV[vs[j]].slice(0, 4).map(function (k) { return hand[k]; });
      return { cards: cs, cb: ddCombo(cs) };
    }
    return null;
  }
  function ddAI(t) {
    if (G.phase === 'bid') {
      var strong = G.hands[t].some(function (c) { return c.v >= 15; });
      if (strong) { G.landlord = t; ddTakeBottom(); }
      else {
        G.bidPass++;
        if (G.bidPass >= G.seats) { G.landlord = rnd(G.seats); ddTakeBottom(); }
        else { G.turn = (t + 1) % G.seats; scheduleAI(); }
      }
      return;
    }
    var hand = G.hands[t];
    var mustLead = (G.lastBy === t || !G.last);
    if (mustLead) {
      var v = hand[hand.length - 1].v;
      var same = hand.filter(function (c) { return c.v === v; });
      var cards = same.length >= 2 ? same.slice(0, 2) : [hand[hand.length - 1]];
      var cb = ddCombo(cards);
      if (cb) { ddDoPlay(t, cards, cb); return; }
      ddDoPlay(t, [hand[hand.length - 1]], ddCombo([hand[hand.length - 1]]));
      return;
    }
    var hit = ddFindBeat(hand, G.last);
    if (!hit) { G.turn = (t + 1) % G.seats; G.msg = G.names[t] + ' 过'; drawGame(); scheduleAI(); return; }
    ddDoPlay(t, hit.cards, hit.cb);
  }
  function drawDd(c, W, H) {
    var cw = cardW(W, H, 12), ch = cw * 1.42;
    setActsBottom(ch + 16 + 46);
    var ans = seatAnchors(G.seats);
    for (var p = 1; p < G.seats; p++) drawSeat(c, p, ans[p - 1], W, H, 'doudizhu', cw, ch, G.landlord === p ? ' 👑庄家' : '');
    if (G.phase === 'bid') {
      var bw = Math.round(cw * 0.72), bh = Math.round(bw * 1.42);
      var bx0 = W / 2 - (3 * bw * 1.25 - bw * 0.25) / 2;
      c.fillStyle = '#ffd166'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center';
      c.fillText('抢筹阶段 · 暗料 3 张（庄家揭晓前谁也看不到）', W / 2, H * 0.40);
      G.bottom.forEach(function (x, i) { SK.drawBack(c, 'doudizhu', bx0 + i * bw * 1.25, H * 0.42, bw, bh); });
    }
    drawMyPlayed(c, 'doudizhu', W, H, cw, ch, H - ch - 16);
    if (!G.spectate) {
      drawHandRow(c, G.hands[0], W, H, cw, ch, H - ch - 16, G.sel, 'doudizhu', null);
      c.fillStyle = (G.turn === 0 && !G.over) ? '#ffd166' : 'rgba(255,255,255,.88)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + me() + (G.landlord === 0 ? ' 👑庄家' : ' 散户') + ' · ' + G.hands[0].length + ' 张（点牌选中）', W / 2, H - 6);
    } else {
      var g0 = handGeom(Math.min(G.hands[0].length, 17), cw * 0.55, W);
      for (var k = 0; k < Math.min(G.hands[0].length, 17); k++) SK.drawBack(c, 'doudizhu', g0.x0 + k * g0.step, H - ch * 0.55 - 14, cw * 0.55, ch * 0.55);
      c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(G.names[0] + (G.landlord === 0 ? ' 👑庄家' : ' 散户') + ' · ' + G.hands[0].length + ' 张', W / 2, H - 6);
    }
  }

  /* ================= 飞行棋 v5 / 押注 / 观战引擎 见下半 ================= */
  /* ---------- 飞行棋 v5（永恒王座 · 番位之战） ---------- */
  var FL_FATE = [
    { n: '黑天鹅 · 赔率重算', f: 'odds' },
    { n: '全场热搜 · 所有人前进 1', f: 'all1' },
    { n: '限薪令 · 领先者后退 2', f: 'lead2' },
    { n: '金牌经纪人 · 己方最前的艺人 +3', f: 'me3' },
    { n: '封杀令 · 指定一家机库返航', f: 'kill' },
    { n: '观众缘 · 垫底经纪人 +4', f: 'last4' },
    { n: '资本入场 · 掌声雷动（气氛组）', f: null },
    { n: '天命轮盘 · 所有未出道艺人重掷出道', f: 'reroll' }
  ];
  var FL_EV = [
    { n: '试镜成功 +2', f: 2 },
    { n: '喜提热搜 +3', f: 3 },
    { n: '演唱会 · 立即再掷', f: 'again' },
    { n: '绯闻缠身 −2', f: -2 },
    { n: '被封杀 · 敌机回机库', f: 'kill' },
    { n: '狗仔盯梢 · 停一回合', f: 'skip' },
    { n: '拿下代言（资源卡系统后补）', f: null },
    { n: '五宝转盘 · 随机效果', f: 'wheel' }
  ];
  function flDeck32() {
    var d = [];
    for (var i = 0; i < 4; i++) FL_EV.forEach(function (e) { d.push({ n: e.n, f: e.f }); });
    return shuffle(d).slice(0, 32);
  }
  function flDeck20() {
    var d = [];
    for (var i = 0; i < 3; i++) FL_FATE.forEach(function (e) { d.push({ n: e.n, f: e.f }); });
    return shuffle(d).slice(0, 20);
  }
  /* v=0..50 在外环；51..55 归航臂；56 王座 */
  function flPieceRC(p, v) {
    var col = G.colors[p];
    if (v <= 50) return flRC((FL_START[col] + v) % FL_RING);
    if (v <= 55) return flArmRC(col, v - 51);
    return FL_THRONE[col];
  }
  function flRingCell(p, v) { return v <= 50 ? (FL_START[G.colors[p]] + v) % FL_RING : -1; }
  /* 撞子：有敌机落在同一环格 → 全回机库 */
  function flBounceAt(p, cell) {
    if (cell < 0) return;
    G.planes.forEach(function (other, q) {
      if (q === p) return;
      other.forEach(function (ov, oi) {
        if (ov >= 0 && ov <= 50 && flRingCell(q, ov) === cell) {
          other[oi] = -1;
          cgLog('📸 撞机！' + (FL_SOC[G.colors[q]] + '社') + '的艺人被撞回机库（狗仔闪光灯+头条）');
        }
      });
    });
  }
  function flKillEnemy(p) {
    var cands = [];
    G.planes.forEach(function (ps, q) {
      if (q === p) return;
      ps.forEach(function (v, i) { if (v >= 0 && v <= 50) cands.push([q, i]); });
    });
    if (!cands.length) return;
    var hit = cands[rnd(cands.length)];
    G.planes[hit[0]][hit[1]] = -1;
    cgLog('🚫 ' + G.names[hit[0]] + ' 的艺人被封杀，回机库反省');
  }
  function flApplyEvent(p, idx) {
    if (!G.evdeck.length) G.evdeck = shuffle(flDeck32());
    var e = G.evdeck.pop();
    G.lastEvent = e.n;
    cgLog('🟠 事件卡「' + e.n + '」→ ' + G.names[p]);
    var f = e.f;
    if (f === 'wheel') { var pool = [2, 3, 'again', -2, 'kill', 'skip', null]; f = pool[rnd(pool.length)]; }
    if (typeof f === 'number') {
      var v = G.planes[p][idx];
      if (v >= 0 && v <= 50) {
        var nv = Math.max(0, Math.min(50, v + f));
        G.planes[p][idx] = nv;
        flBounceAt(p, flRingCell(p, nv));
        G.msg = G.names[p] + ' 的艺人 ' + (f > 0 ? '前进' : '后退') + ' ' + Math.abs(f) + ' 格';
      }
    } else if (f === 'again') { G.againFlag = true; G.msg = G.names[p] + ' 开演唱会！立即再掷'; }
    else if (f === 'kill') { flKillEnemy(p); }
    else if (f === 'skip') { G.skipFlag[p] = true; G.msg = G.names[p] + ' 被狗仔盯梢，下回合停一轮'; }
    else if (f === null) { G.msg = e.n; }
  }
  function flApplyFate(p) {
    if (!G.fate.length) { cgLog('🔮 命运区 20 张翻完了，本局命运已定'); return; }
    var e = G.fate.pop();
    G.lastFate = e.n;
    cgLog('🔮 命运卡「' + e.n + '」全场广播！');
    var f = e.f;
    if (f === 'all1') {
      G.planes.forEach(function (ps, q) {
        ps.forEach(function (v, i) { if (v >= 0 && v <= 49) { ps[i] = v + 1; flBounceAt(q, flRingCell(q, v + 1)); } });
      });
      G.msg = '全场热搜！所有艺人前进 1 格';
    } else if (f === 'lead2' || f === 'last4') {
      var prog = G.planes.map(function (ps) { return ps.reduce(function (a, v) { return a + Math.max(v, 0); }, 0); });
      var t;
      if (f === 'lead2') t = prog.indexOf(Math.max.apply(null, prog));
      else {
        var pos = prog.filter(function (x) { return x > 0; });
        var mn = pos.length ? Math.min.apply(null, pos) : 0;
        t = prog.indexOf(mn);
      }
      if (t < 0) t = 0;
      var best = -1, bv = -1;
      G.planes[t].forEach(function (v, i) { if (v > bv && v <= 50) { bv = v; best = i; } });
      if (best >= 0) {
        G.planes[t][best] = Math.max(0, Math.min(50, bv + (f === 'lead2' ? -2 : 4)));
        flBounceAt(t, flRingCell(t, G.planes[t][best]));
      }
      G.msg = G.names[t] + (f === 'lead2' ? ' 被限薪令砍了 2 格' : ' 观众缘爆棚 +4');
    } else if (f === 'me3') {
      var best2 = -1, bv2 = -1;
      G.planes[p].forEach(function (v, i) { if (v > bv2 && v <= 50) { bv2 = v; best2 = i; } });
      if (best2 >= 0) { G.planes[p][best2] = Math.min(50, bv2 + 3); flBounceAt(p, flRingCell(p, G.planes[p][best2])); }
      G.msg = G.names[p] + ' 金牌经纪人加持 +3';
    } else if (f === 'kill') { flKillEnemy(p); }
    else if (f === 'reroll') {
      G.planes.forEach(function (ps) { ps.forEach(function (v, i) { if (v === -1 && Math.random() < 0.5) ps[i] = 0; }); });
      G.msg = '天命轮盘转动，一批未出道艺人直接站上出道格！';
    } else { G.msg = e.n; }
  }
  /* 落格结算（总纲 1.11.2 顺序）：撞子 → 航线+12 → 同色+4 → ★事件 / 命运 */
  function flLand(p, idx, v, depth) {
    if (v > FL_TOTAL) v = FL_TOTAL;
    if (v <= 50) {
      var ci = FL_CI[G.colors[p]];
      var cell = flRingCell(p, v);
      flBounceAt(p, cell);
      if (depth === 0 && FL_LINE[cell] !== undefined) {
        v = Math.min(50, v + 12);
        cgLog('✈ 航线冲刺 +12！' + G.names[p]);
        flBounceAt(p, flRingCell(p, v));
      }
      var cell2 = flRingCell(p, v);
      if (depth === 0 && cell2 % 4 === ci && cell2 !== cell) {
        v = Math.min(50, v + 4);
        cgLog('🚀 同色连跳 +4！' + G.names[p]);
        flBounceAt(p, flRingCell(p, v));
      }
      G.planes[p][idx] = v;
      var cellF = flRingCell(p, v);
      if (depth === 0 && FL_STAR.indexOf(cellF) >= 0) flApplyEvent(p, idx);
      if (depth === 0 && FL_LINE[cell] !== undefined) flApplyFate(p);
    } else {
      G.planes[p][idx] = v;
    }
    return G.planes[p][idx];
  }
  function flRoll() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    G.dice = 1 + rnd(6);
    G.pick = -1; G.options = null;
    G.lastPlay[0] = [{ kind: 'dice', n: G.dice }];
    var opts = flMoves(0, G.dice);
    if (!opts.length) { G.msg = me() + ' 掷了 ' + G.dice + '，没艺人可动'; flNext(0); drawGame(); scheduleAI(); return; }
    if (opts.length === 1) flMove(0, opts[0], G.dice);
    else { G.msg = me() + ' 掷了 ' + G.dice + '，点一架艺人出动'; G.options = opts; }
    drawGame();
    if (!G.options) scheduleAI();
  }
  function flMoves(p, dice) {
    var out = [], ps = G.planes[p];
    for (var i = 0; i < ps.length; i++) {
      var v = ps[i];
      if (v === FL_TOTAL) continue;
      if (v === -1) { if (dice === 6) out.push(i); continue; }
      if (v + dice <= FL_TOTAL) out.push(i);
    }
    return out;
  }
  function flNext(from) {
    var t = (from + 1) % G.seats;
    if (G.skipFlag && G.skipFlag[t]) { G.skipFlag[t] = false; cgLog('🐕 ' + G.names[t] + ' 被狗仔盯梢，停一回合'); t = (t + 1) % G.seats; }
    G.turn = t;
    G.round++;
  }
  function flMove(p, idx, dice) {
    var ps = G.planes[p];
    var v = ps[idx];
    if (v === -1) { if (dice !== 6) return; v = 0; cgLog('🎬 ' + G.names[p] + ' 的艺人在 ▶ 出道格出道！'); }
    else v += dice;
    G.options = null;
    flLand(p, idx, v, 0);
    G.msg = G.names[p] + ' 掷 ' + dice + '，艺人走到第 ' + Math.max(0, ps[idx]) + ' 步';
    if (ps.every(function (x) { return x === FL_TOTAL; })) {
      G.winSeat = p; G.over = G.names[p] + ' 的艺人全体登上永恒王座，番位之战大获全胜！♛🎉';
      settleBets(); drawGame(); return;
    }
    var again = G.againFlag || dice === 6;
    G.againFlag = false;
    if (!again) flNext(p);
    drawGame(); scheduleAI();
  }
  function flAI(t) {
    var dice = 1 + rnd(6); G.dice = dice;
    G.lastPlay[t] = [{ kind: 'dice', n: dice }];
    var opts = flMoves(t, dice);
    if (!opts.length) { G.msg = G.names[t] + ' 掷了 ' + dice + '，没艺人可动'; flNext(t); drawGame(); scheduleAI(); return; }
    flMove(t, opts[rnd(opts.length)], dice);
  }
  function drawFlight(c, W, H) {
    setActsBottom(96 + 46);
    var cs = Math.floor(Math.min(W * 0.98, (H - 60)) / 14);
    if (cs < 13) cs = 13;
    var bw = cs * 14, bx = Math.round((W - bw) / 2), by = Math.max(4, Math.round((H - bw) / 2) - 4);
    function rcxy(rc) { return [bx + rc[1] * cs, by + rc[0] * cs]; }
    /* 四社机库（中央田字格象限） */
    Object.keys(FL_QUAD).forEach(function (col) {
      var q = FL_QUAD[col];
      var x = bx + q[1] * cs, y = by + q[0] * cs, w = (q[3] - q[1] + 1) * cs, hh = (q[2] - q[0] + 1) * cs;
      var p = G.colors.indexOf(col);
      var active = p >= 0;
      c.fillStyle = active ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)';
      c.fillRect(x + 2, y + 2, w - 4, hh - 4);
      c.fillStyle = FL_COL[col];
      c.globalAlpha = active ? 0.6 : 0.22;
      c.font = 'bold ' + Math.max(9, cs * 0.42) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'left';
      c.fillText(FL_SOC[col] + '社' + (active ? '·' + G.names[p] : '（虚位）'), x + 7, y + cs * 0.95);
      c.globalAlpha = 1;
      if (!active) return;
      /* 停机位 */
      var sw2 = cs * 0.42, gap2 = sw2 * 1.9;
      var sx = x + w / 2 - 3 * gap2 / 2, sy = y + hh * 0.52;
      G.planes[p].forEach(function (v, i) {
        if (v !== -1) return;
        var px2 = sx + i * gap2, py2 = sy;
        c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(px2, py2, sw2 / 2, 0, 6.2832); c.stroke();
      });
      c.fillStyle = 'rgba(255,255,255,.4)';
      c.font = Math.max(8, cs * 0.36) + 'px sans-serif'; c.textAlign = 'center';
      c.fillText('出道 →', x + w / 2, y + hh - 6);
    });
    /* 归航臂 */
    Object.keys(FL_ENTRY).forEach(function (col) {
      for (var k = 0; k < 5; k++) {
        var rc = flArmRC(col, k), xy = rcxy(rc);
        c.fillStyle = FL_COL[col]; c.globalAlpha = 0.35;
        c.fillRect(xy[0] + 2, xy[1] + 2, cs - 4, cs - 4);
        c.globalAlpha = 1;
      }
    });
    /* 永恒王座（中心 2×2） */
    Object.keys(FL_THRONE).forEach(function (col) {
      var xy = rcxy(FL_THRONE[col]);
      c.fillStyle = FL_COL[col]; c.globalAlpha = 0.5;
      c.fillRect(xy[0] + 2, xy[1] + 2, cs - 4, cs - 4);
      c.globalAlpha = 1;
    });
    var txy = rcxy([6, 6]);
    c.fillStyle = '#ffd166'; c.font = 'bold ' + Math.max(12, cs * 0.8) + 'px sans-serif'; c.textAlign = 'center';
    c.fillText('♛', txy[0] + cs, txy[1] + cs * 1.4);
    /* 外环 52 格 */
    for (var i = 0; i < FL_RING; i++) {
      var xy2 = rcxy(flRC(i));
      var colName = ['r', 'y', 'g', 'b'][i % 4];
      c.fillStyle = FL_COL[colName]; c.globalAlpha = 0.3;
      c.fillRect(xy2[0] + 2, xy2[1] + 2, cs - 4, cs - 4);
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1;
      c.strokeRect(xy2[0] + 2, xy2[1] + 2, cs - 4, cs - 4);
      c.font = Math.max(7, cs * 0.36) + 'px sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.8)';
      var mark = null;
      Object.keys(FL_START).forEach(function (k) { if (FL_START[k] === i) mark = '▶'; });
      Object.keys(FL_ENTRY).forEach(function (k) { if (FL_ENTRY[k] === i) mark = '↵'; });
      if (FL_STAR.indexOf(i) >= 0) mark = '★';
      if (FL_LINE[i] !== undefined) mark = '✈';
      if (mark) c.fillText(mark, xy2[0] + cs / 2, xy2[1] + cs * 0.7);
    }
    /* 棋子（出道后上环 / 归航臂 / 王座） */
    var stack = {};
    G.colors.forEach(function (col, p) {
      G.planes[p].forEach(function (v, idx) {
        if (v === -1) return;
        var rc = flPieceRC(p, v), xy = rcxy(rc);
        var key = rc[0] + ',' + rc[1];
        var n = stack[key] || 0; stack[key] = n + 1;
        var r = Math.max(5, cs * 0.3);
        var ox = (n % 2) * r * 0.7, oy = Math.floor(n / 2) * r * 0.7;
        var cx2 = xy[0] + cs / 2 - r / 2 + ox, cy2 = xy[1] + cs / 2 - r / 2 + oy;
        c.beginPath(); c.arc(cx2, cy2, r / 1.7, 0, 6.2832);
        c.fillStyle = FL_COL[col]; c.fill();
        c.strokeStyle = (G.turn === p && !G.over) ? '#ffd166' : '#fff'; c.lineWidth = 1.4; c.stroke();
      });
    });
    /* 底栏：我的经纪人条（观战则显示提示） */
    var bh = 52, byy = H - bh;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, byy, W, bh);
    if (!G.spectate) {
      c.fillStyle = (G.turn === 0 && !G.over) ? '#ffd166' : 'rgba(255,255,255,.9)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'left';
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + me() + ' · ' + FL_SOC[G.colors[0]] + '社经纪人　骰:' + (G.dice || '—'), 14, byy + 18);
      var sw = 26, gap = 36, rowW = 4 * gap;
      var x0 = W / 2 - rowW / 2;
      G.planes[0].forEach(function (v, i) {
        var x = x0 + i * gap, y = byy + 24;
        var sel = G.options && G.options.indexOf(i) >= 0;
        c.beginPath(); c.arc(x + sw / 2, y + sw / 2, sw / 2, 0, 6.2832);
        c.fillStyle = FL_COL[G.colors[0]];
        c.globalAlpha = v === FL_TOTAL ? 0.45 : 1; c.fill(); c.globalAlpha = 1;
        if (sel) { c.strokeStyle = '#ffd166'; c.lineWidth = 3; c.stroke(); }
        c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center';
        c.fillText(v === -1 ? '待出道' : (v === FL_TOTAL ? '♛' : (v > 50 ? '归航' : v + '')), x + sw / 2, y + sw + 11);
      });
    } else {
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText('👁 观战席 · ' + G.names[G.turn] + ' 回合中 · 顶栏 💰 可押注', W / 2, byy + 30);
    }
  }

  /* ================= 押注系统（总纲 0.5） ================= */
  function initBet() {
    G.bet = {
      mode: G.game === 'doudizhu' ? 'fixed' : 'pot',
      cur: GAMES[G.game].cur,
      openUntil: Date.now() + BET_WINDOW_MS,
      closed: false, settled: false,
      plan: null, mineCnt: 0,
      bets: [],
      pool: new Array(G.seats).fill(0),
      poolPaid: new Array(G.seats).fill(0),
      ddPool: { 0: 0, 1: 0, 2: 0 }
    };
    G.specs = [];
    var names = ['吃瓜群众', '代拍小哥', '站姐小跑'];
    for (var i = 0; i < 3; i++) G.specs.push({ n: names[i], betAt: Date.now() + 3000 + rnd(9000), bet: false });
    G.allowPaid = false;
  }
  function placeBet(t, amt) {
    if (!G || !G.bet || !G.spectate || G.bet.closed || G.over) return;
    if (!G.bet.plan) { toast('🚫 先选「押 1 次」或「押 3 次」'); return; }
    if (G.bet.mineCnt >= 3) { toast('🚫 每桌限 3 注单（总纲硬规则）'); return; }
    amt = Math.max(BET_MIN, Math.min(BET_MAX, amt));
    var myTotal = G.bet.bets.filter(function (b) { return b.mine; }).reduce(function (a, b) { return a + b.amt; }, 0);
    if (myTotal + amt > BET_TABLE_MAX) { toast('🚫 超过桌上限 ' + fmt(BET_TABLE_MAX)); return; }
    var w = walletAll();
    if ((w[G.bet.cur] || 0) < amt) { toast('🚫 ' + CUR[G.bet.cur].n + '不够了，先去别处赚点'); return; }
    var tg = betTargets();
    var name = G.bet.mode === 'fixed' ? tg[t].name : tg[t];
    walletAdd(G.bet.cur, -amt);
    var a3 = G.bet.plan === 3 ? Math.round(amt / 3) : amt;
    var b = {
      mine: true, target: t, targetName: name, amt: amt, plan: G.bet.plan,
      segs: G.bet.plan === 3 ? [a3, a3, amt - 2 * a3] : [amt],
      segIdx: 0, paid: 0,
      segAt: G.bet.plan === 3 ? [Date.now(), G.bet.openUntil - 20000, G.bet.openUntil - 5000] : [Date.now()]
    };
    paySeg(b);
    G.bet.bets.push(b); G.bet.mineCnt++;
    cgLog('🎫 我押 ' + fmt(amt) + ' ' + CUR[G.bet.cur].n + ' → ' + name);
    renderRails();
  }
  function paySeg(b) {
    if (b.segIdx >= b.segs.length) return;
    var s = b.segs[b.segIdx++];
    b.paid += s;
    if (G.bet.mode === 'pot') { G.bet.pool[b.target] += s; G.bet.poolPaid[b.target] += s; }
    else { G.bet.ddPool[b.target] = (G.bet.ddPool[b.target] || 0) + s; }
  }
  function tickBets() {
    var B = G.bet; if (!B || B.settled) return;
    if (!B.closed && Date.now() >= B.openUntil) {
      B.closed = true;
      cgLog('🔒 封盘！注单锁定，坐等结算（押 3 次的尾段已自动入池）');
      B.bets.forEach(function (b) { while (b.segIdx < b.segs.length) paySeg(b); });
      renderRails();
    }
    if (!B.closed) {
      G.specs.forEach(function (s) {
        if (s.bet || Date.now() < s.betAt) return;
        s.bet = true;
        var nt = B.mode === 'fixed' ? 3 : G.seats;
        var t = rnd(nt);
        var amt = 100 * (1 + rnd(20));
        var tg = betTargets();
        var name = B.mode === 'fixed' ? tg[t].name : tg[t];
        var b = { mine: false, target: t, targetName: name, amt: amt, plan: 1, segs: [amt], segIdx: 0, paid: 0, segAt: [Date.now()] };
        paySeg(b); B.bets.push(b);
        cgLog('💰 观战·' + s.n + ' 押 ' + fmt(amt) + ' → ' + name);
        _leftKey = '';
      });
      B.bets.forEach(function (b) {
        if (b.plan !== 3) return;
        while (b.segIdx < b.segs.length && Date.now() >= b.segAt[b.segIdx]) {
          paySeg(b);
          if (b.mine) cgLog('💰 三段投入自动入池（' + b.segIdx + '/3 段）');
        }
      });
    }
  }
  function settleBets() {
    var B = G && G.bet;
    if (!B || B.settled) return;
    B.settled = true; B.closed = true;
    var cur = CUR[B.cur];
    function refund() {
      B.bets.forEach(function (b) { if (b.mine) walletAdd(B.cur, b.paid); });
      cgLog('📊 本局没有胜方（流局），押过的 ' + cur.n + ' 原路退还');
    }
    if (B.mode === 'pot') {
      var total = B.poolPaid.reduce(function (a, b) { return a + b; }, 0);
      if (total <= 0) { cgLog('📊 本局无人押注，彩池未开'); return; }
      if (typeof G.winSeat !== 'number') { refund(); return; }
      var w = G.winSeat;
      var poolW = B.poolPaid[w];
      if (poolW <= 0) { refund(); return; }
      B.bets.forEach(function (b) {
        if (!b.mine) return;
        if (b.target === w) {
          var pay = Math.floor(b.paid * 0.95 * total / poolW);
          walletAdd(B.cur, pay);
          cgLog('🎊 注单命中！' + esc(b.targetName) + ' 赔率 ×' + (0.95 * total / poolW).toFixed(2) + ' → 回款 ' + fmt(pay) + ' ' + cur.n);
        } else {
          cgLog('🧾 注单未中（' + fmt(b.paid) + ' ' + cur.n + ' 支持了 ' + esc(b.targetName) + '）');
        }
      });
    } else {
      if (typeof G.winSeat !== 'string') { refund(); return; }
      var oddsL = [1.9, 2.1, 1.8];
      B.bets.forEach(function (b) {
        if (!b.mine) return;
        var hit = (b.target === 0 && G.winSeat === 'z') || (b.target === 1 && G.winSeat === 's') || (b.target === 2 && G.winSeat === 'z');
        if (hit) {
          var pay = Math.floor(b.paid * oddsL[b.target]);
          walletAdd(B.cur, pay);
          cgLog('🎊 固定赔率命中 ×' + oddsL[b.target] + ' → 回款 ' + fmt(pay) + ' ' + cur.n);
        } else {
          cgLog('🧾 注单未中（' + fmt(b.paid) + ' ' + cur.n + '）');
        }
      });
    }
    renderRails();
  }
  /* 观战津贴：满 3 分钟 +200 本桌币，每日 3 次 */
  function tickAllow() {
    if (!G.spectate || G.allowPaid || !G.bet) return;
    if (Date.now() - G.t0 < 180000) return;
    G.allowPaid = true;
    var k = 'card_allow_v1', d = null;
    try { d = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { }
    if (!d || d.date !== todayStr()) d = { date: todayStr(), n: 0 };
    if (d.n >= 3) { cgLog('🎁 观战津贴今日 3 次已领完'); return; }
    d.n++;
    try { localStorage.setItem(k, JSON.stringify(d)); } catch (e) { }
    walletAdd(G.bet.cur, 200);
    cgLog('🎁 观战满 3 分钟，津贴 +200 ' + CUR[G.bet.cur].n + '（今日第 ' + d.n + ' 次）');
    toast('🎁 观战津贴 +200 ' + CUR[G.bet.cur].n);
  }
  function startTick() {
    stopTick();
    _tickTimer = setInterval(function () {
      if (!G) { stopTick(); return; }
      tickBets(); tickAllow();
      /* 押注条目节流刷新：秒数或彩池变了才重画 */
      var key = betLeftSec() + '|' + G.bet.poolPaid.join(',') + '|' + G.bet.mineCnt + '|' + (G.bet.closed ? 1 : 0);
      if (key !== _leftKey) { _leftKey = key; renderLeft(); renderHud(); }
    }, 500);
  }
  function stopTick() { clearInterval(_tickTimer); _tickTimer = null; }

  /* ================= 点击分发 ================= */
  function onCanvasClick(ev) {
    if (!G || G.over) return;
    var cv = $('cg-canvas'), r = cv.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    var W = r.width, H = r.height;
    if (G.spectate) return;   /* 观战席只看不摸 */
    if (G.game === 'uno') {
      var cw = cardW(W, H, 8.5), ch = cw * 1.42;
      var i = hitHand(x, y, G.hands[0].length, W, H, cw, ch, H - ch - 16);
      if (i >= 0) unoPlay(i);
    } else if (G.game === 'mahjong') {
      var tw = cardW(W, H, 11), th = tw * 1.36;
      var n = G.hands[0].length;
      var j = hitHand(x, y, n, W, H, tw, th, H - th - 20);
      if (j >= 0) mjDiscard(j);
      else if (G.drawn) {
        var gmj = handGeom(n, tw, W);
        var gx = Math.min(gmj.x0 + gmj.step * (n - 1) + tw + 14, W - tw - 10);
        if (x >= gx && x <= gx + tw && y >= H - th - 34 && y <= H - 34) mjDiscard(n);
      }
    } else if (G.game === 'flight') {
      if (G.turn !== 0 || !G.options) return;
      var sw = 26, gap = 36, rowW = 4 * gap, x0 = W / 2 - rowW / 2, y0 = H - 52 + 24;
      for (var k = 0; k < G.planes[0].length; k++) {
        var px = x0 + k * gap, py = y0;
        if (x >= px && x <= px + sw && y >= py && y <= py + sw && G.options.indexOf(k) >= 0) { flMove(0, k, G.dice); return; }
      }
    } else if (G.game === 'doudizhu') {
      var dw = cardW(W, H, 12), dh = dw * 1.42;
      var m = hitHand(x, y, G.hands[0].length, W, H, dw, dh, H - dh - 16);
      if (m >= 0) {
        var at = G.sel.indexOf(m);
        if (at >= 0) G.sel.splice(at, 1); else G.sel.push(m);
        drawGame();
      }
    }
  }

  /* ---------- hash 直达（#cards-uno 等） ---------- */
  function tryHash() {
    var h = String(location.hash || '').replace('#', '').trim();
    if (!h) return;
    var id = h.indexOf('cards-') === 0 ? h.slice(6) : h;
    if (!GAMES[id]) return;
    if (!curUser()) return;
    openHall(id);
  }
  window.addEventListener('hashchange', tryHash);
  window.addEventListener('load', function () { setTimeout(tryHash, 1200); });

  global.CardGames = {
    open: openHall, close: closeHall, GAMES: GAMES, buildSetup: buildSetup,
    /* 无头测试调试口（不改任何玩法逻辑） */
    _state: function () { return G; },
    _anchors: seatAnchors,
    _geom: handGeom,
    _bet: function () { return G && G.bet; },
    _wallet: walletAll,
    _fl: { RC: flRC, pieceRC: flPieceRC, START: FL_START, LINE: FL_LINE, STAR: FL_STAR, TOTAL: FL_TOTAL }
  };
})(window);
