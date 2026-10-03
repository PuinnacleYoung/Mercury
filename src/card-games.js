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
    uno:      { name: '锋线速演',          em: '🟥', deck: 'uno',      seats: [2, 3, 4], def: 3, place: '血旗部队 · 演武厅',      cur: 'diamond' },
    mahjong:  { name: '防线长议',          em: '🀄', deck: 'mahjong',  seats: [3, 4],    def: 4, place: '血旗部队 · 二层血旗堂',  cur: 'diamond' },
    flight:   { name: '永恒王座·番位之战', em: '🎲', deck: 'flight',   seats: [2, 3, 4], def: 4, place: '风皇娱乐 · 经纪人办公室', cur: 'coin' },
    doudizhu: { name: '坐庄',              em: '🃏', deck: 'doudizhu', seats: [3],       def: 3, place: '地下帝国 · 地下赌坊',    cur: 'pearl' }
  };
  var AI_NAMES = ['五宝', '仓鼠甲', '仓鼠乙', '仓鼠丙'];
  /* ⚠️ 十七更续：key 必须和主游戏的 profile.currency 对齐（coin/diamond/pearl），
     名字还是星坠 / 流萤 / 长庚——牌桌上花的钱就是档案里的钱。 */
  var CUR = {
    coin:    { n: '星坠', em: '🌟' },
    diamond: { n: '流萤', em: '✨' },
    pearl:   { n: '长庚', em: '🌙' }
  };
  var BET_MIN = 100, BET_MAX = 5000, BET_TABLE_MAX = 50000, BET_WINDOW_MS = 60000;
  /* AI 补位五段位（陛下钦定）：新手 / 简单 / 普通 / 困难 / 大师——段位越高越接近最优手 */
  var AI_LEVELS = ['新手', '简单', '普通', '困难', '大师'];
  function aiSharp() { return [0, 0.3, 0.55, 0.8, 1][(G && G.aiLevel) || 3] || 0.55; }
  function aiPick(cands) {
    if (!cands || !cands.length) return null;
    if (Math.random() < aiSharp()) return cands[0];
    return cands[rnd(cands.length)];
  }

  /* ---------- 飞行棋棋盘几何（二十一更：按传统飞行棋重排） ----------
     传统飞行棋 = 十字形：外圈 52 格 + 四角机库 + 四条归航道直通中心王座。
     ① 每家的 ▶ 出道格【紧贴自家机库的顺时针出口】——出基地一脚就踏上赛道；
     ② 每家的归航道在自己机库的【另一侧】，绕完一整圈才从那边的边中点拐进来；
     ③ 四家起点等距 13 格，起点格与归航入口格【同为自家颜色】（因为外圈走 44 步 = 4 的倍数）。
     外圈步数 v=0..44（45 个位置，含起点与入口）→ 归航臂 5 格 v=45..49 → 王座 v=50。 */
  var FL_RING = 52;                                       // 环上格子总数
  var FL_OUT = 45;                                        // 外圈步数：v=0(起点) … v=44(归航入口)
  var FL_TOTAL = 50;                                      // 45..49 归航臂 · 50 王座
  var FL_START = { r: 1, y: 14, g: 27, b: 40 };           // ▶ 出道格（自家机库顺时针出口）
  var FL_ENTRY = { r: 45, y: 6, g: 19, b: 32 };           // ↵ 归航入口（=(START+44)%52，自家另一条边中点）
  var FL_STAR = [8, 11, 21, 24, 34, 37, 47, 50];          // ★ 事件格（避开起点/入口/航线）
  var FL_LINE = { 17: 12, 30: 12, 43: 12, 4: 12 };        // ✈ 航线格（自家色）→ 直飞 +12 步
  var FL_COL = { r: '#e8b23a', y: '#2fa8a0', g: '#3fa34d', b: '#3b82f6' };
  var FL_SOC = { r: '星幕', y: '潮声', g: '拾光', b: '云顶' };
  var FL_CI = { r: 1, y: 2, g: 3, b: 0 };                 // 自家色号 = 起点格号 mod 4
  /* 环格号 → 网格(行,列)：顶14 + 右13 + 底13 + 左12（四角共享） */
  function flRC(i) {
    if (i <= 13) return [0, i];
    if (i <= 26) return [i - 13, 13];
    if (i <= 39) return [13, 12 - (i - 27)];
    return [12 - (i - 40), 0];
  }
  /* 归航臂第 k 格（k=0..4）：从自家归航入口一路通到中心王座 */
  function flArmRC(c, k) {
    if (c === 'r') return [7, 1 + k];        // 左边中点 → 向右
    if (c === 'y') return [1 + k, 6];        // 顶边中点 → 向下
    if (c === 'g') return [6, 12 - k];       // 右边中点 → 向左
    return [12 - k, 7];                      // 底边中点 → 向上
  }
  var FL_THRONE = { r: [7, 6], y: [6, 6], g: [6, 7], b: [7, 7] };
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

  /* ================= 钱包（星坠 / 流萤 / 长庚） =================
     ⚠️ 十七更续·重大修正：以前棋牌自己攒了一个 card_wallet_v1 小金库，
        跟主游戏的档案资产（profile.currency）根本不是一个账本——
        陛下在主界面看到的钱，和牌桌上花的钱，是两笔互不相干的钱。
        现在统一走主账本：牌桌上花的每一枚，都从档案资产里真扣、真回。
        老的小金库余额一次性并入主账本，不浪费陛下攒过的家底。 */
  var WAL_KEY = 'card_wallet_v1';
  var CURS = ['coin', 'diamond', 'pearl'];
  /* profile 是 index.html 里的顶层 let，不在 window 上——跟 currentUser 一个坑，必须双查 */
  function profileOf() {
    try { if (typeof profile !== 'undefined' && profile) return profile; } catch (e) { }
    try { if (global.profile) return global.profile; } catch (e) { }
    return null;
  }
  function walletAll() {
    var p = profileOf();
    var w = { coin: 0, diamond: 0, pearl: 0 };
    if (p && p.currency) {
      CURS.forEach(function (k) { if (typeof p.currency[k] === 'number') w[k] = p.currency[k]; });
      return w;
    }
    /* 兜底：没档案（比如在引擎页单开棋牌）时退回小金库，至少不炸 */
    try {
      var o = JSON.parse(localStorage.getItem(WAL_KEY) || 'null');
      if (o && typeof o.coin === 'number') return { coin: o.coin, diamond: o.diamond || 0, pearl: o.pearl || 0 };
    } catch (e) { }
    return w;
  }
  function walletSave(w) {
    var p = profileOf();
    if (p) {
      p.currency = p.currency || { coin: 0, diamond: 0, pearl: 0 };
      CURS.forEach(function (k) { p.currency[k] = w[k]; });
      try { if (global.saveProfile) global.saveProfile(p); } catch (e) {
        try { localStorage.setItem('card_wallet_v1', JSON.stringify(w)); } catch (e2) { }
      }
      /* 顶栏金币实时刷新 + 把这版资产同步给服务器，换设备也不会丢 */
      try { if (global.renderCoins) global.renderCoins(); } catch (e) { }
      try { if (global.Net && Net.self && Net.self()) Net.self().currency = p.currency; } catch (e) { }
      try { if (global.Net && Net.connected && Net.connected()) Net.send({ t: 'syncProfile', profile: p }); } catch (e) { }
      return;
    }
    try { localStorage.setItem(WAL_KEY, JSON.stringify(w)); } catch (e) { }
  }
  function walletAdd(cur, delta) {
    var w = walletAll();
    w[cur] = Math.max(0, Math.round((w[cur] || 0) + delta));
    walletSave(w);
    renderHud();
    return w[cur];
  }
  /* 一次性把老的小金库（card_wallet_v1，旧 key star/firefly/evening）并入主账本 */
  function migrateWallet() {
    var old = null;
    try { old = JSON.parse(localStorage.getItem(WAL_KEY) || 'null'); } catch (e) { }
    if (!old) return;
    var p = profileOf();
    var map = { star: 'coin', firefly: 'diamond', evening: 'pearl', coin: 'coin', diamond: 'diamond', pearl: 'pearl' };
    var got = 0;
    Object.keys(map).forEach(function (k) {
      var v = Number(old[k] || 0); if (v > 0) got += v;
    });
    if (p && p.currency && got > 0) {
      Object.keys(map).forEach(function (k) {
        var v = Number(old[k] || 0); if (v > 0) p.currency[map[k]] = (p.currency[map[k]] || 0) + v;
      });
      try { if (global.saveProfile) global.saveProfile(p); } catch (e) { }
    }
    try { localStorage.removeItem(WAL_KEY); } catch (e) { }
  }

  /* 侧栏按钮高亮同步（十七更续：两条栏独立开关，谁开谁亮） */
  function syncRailBtns() {
    if (!$ || !$('cg-left')) return;
    var l = $('cg-left'), r = $('cg-right');
    if ($('cg-lbtn')) $('cg-lbtn').classList.toggle('on', l.classList.contains('open'));
    if ($('cg-rbtn')) $('cg-rbtn').classList.toggle('on', r.classList.contains('open'));
  }
  global.syncRailBtns = syncRailBtns;

  /* ================= 状态 ================= */
  var el = null;
  var hall = { open: false, game: null, seats: 3, code: '', players: [], isHost: false, joined: false,
               entry: null, fillAi: false, aiLevel: 3, rooms: null, watchMode: false, watchCode: '' };
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
      /* 十七更：聊天钮带文字+高亮，让陛下一眼看见 */
      '.cg-tbtn.wide{width:auto;padding:0 12px;font-size:13px;letter-spacing:1px;border-color:rgba(255,209,102,.55);' +
      'color:#ffd166;background:rgba(255,209,102,.14);}' +
      '.cg-tbtn.wake{animation:cgWake 1.2s ease-in-out infinite;}' +
      '@keyframes cgWake{0%,100%{box-shadow:0 0 0 0 rgba(255,209,102,.0);}50%{box-shadow:0 0 12px 3px rgba(255,209,102,.55);}}' +
      /* 主区：左栏 21% / 中央 / 右栏 18%（总纲 1.11） */
      '#cg-main{flex:1;min-height:0;display:flex;position:relative;}' +
      '.cg-rail{flex:0 0 21%;min-width:0;display:none;flex-direction:column;gap:8px;padding:8px;' +
      'background:rgba(0,0,0,.22);overflow-y:auto;}' +
      '.cg-rail.rl{border-right:1px solid rgba(255,255,255,.1);}' +
      '.cg-rail.rr{flex-basis:18%;border-left:1px solid rgba(255,255,255,.1);}' +
      '.cg-rail.open{display:flex;}' +
      '#cg-center{flex:1;min-width:0;position:relative;display:flex;flex-direction:column;}' +
      '#cg-canvas{width:100%;flex:1;min-height:0;display:block;background:radial-gradient(ellipse at 50% 40%,#3d2c63,#241a3d);}' +
      /* 十七更：主动作竖排居中（陛下钦定：别横排）；退出单独右下角 */
      '.cg-acts{position:absolute;left:50%;transform:translateX(-50%);bottom:var(--cg-acts-b,150px);display:flex;' +
      'flex-direction:column;gap:7px;align-items:stretch;width:max-content;max-width:42%;pointer-events:none;z-index:5;}' +
      '.cg-acts .cg-btn{pointer-events:auto;background:rgba(18,10,38,.82);border-color:rgba(255,255,255,.3);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.4);text-align:center;padding:9px 18px;font-size:13px;}' +
      '.cg-acts .cg-btn.pri{background:linear-gradient(135deg,#e5484d,#f0834a);border-color:transparent;}' +
      '#cg-quit{position:absolute;right:10px;bottom:8px;z-index:6;border:1px solid rgba(255,255,255,.3);' +
      'background:rgba(18,10,38,.82);color:#fff;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '#cg-quit:hover{border-color:#f0834a;color:#ffd166;}' +
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
      /* 玩法说明抽屉（陛下钦定：规矩要写得人看得懂） */
      '#cg-help{position:absolute;top:0;right:0;bottom:0;width:min(380px,94%);z-index:24;display:none;flex-direction:column;' +
      'background:rgba(14,8,30,.98);border-left:1px solid rgba(255,255,255,.2);box-shadow:-8px 0 26px rgba(0,0,0,.55);}' +
      '#cg-help.open{display:flex;}' +
      '.cg-htabs{display:flex;gap:5px;padding:8px;flex-wrap:wrap;flex:0 0 auto;}' +
      '.cg-htab{flex:1 1 auto;text-align:center;font-size:11px;font-weight:800;padding:6px 4px;border-radius:9px;cursor:pointer;' +
      'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);white-space:nowrap;}' +
      '.cg-htab.on{background:linear-gradient(135deg,#8b6fd6,#b49ae0);border-color:transparent;}' +
      '#cg-helpbody{flex:1;min-height:0;overflow-y:auto;padding:2px 12px 16px;font-size:11.5px;line-height:1.75;}' +
      '.cg-h1{font-size:15px;font-weight:900;margin:12px 0 3px;color:#ffd166;}' +
      '.cg-h2{font-size:12px;font-weight:800;margin:10px 0 3px;color:#c9b6f5;border-left:3px solid #8b6fd6;padding-left:7px;}' +
      '.cg-hp{margin:3px 0;opacity:.93;}' +
      '.cg-hp b{color:#ffd166;}' +
      '.cg-htb{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0 8px;}' +
      '.cg-htb td{padding:2px 6px 2px 0;vertical-align:top;border-bottom:1px dashed rgba(255,255,255,.09);}' +
      '.cg-htb td:first-child{color:#ffd166;font-weight:800;white-space:nowrap;width:78px;}' +
      '.cg-hk{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:7px 10px;margin:5px 0;}' +
      '.cg-hk .t{font-weight:900;color:#ffd166;font-size:12px;}' +
      '.cg-hwarn{background:rgba(229,72,77,.16);border:1px solid rgba(229,72,77,.45);border-radius:10px;padding:7px 10px;margin:6px 0;}' +
      '.cg-hwarn .t{font-weight:900;color:#ff9aa0;font-size:12px;}' +
      /* 二十一更：结算面板；二十二更：四玩法通用——打完必弹「入场费 / 名次分账 / 牌桌输赢 / 押注 / 净收 / 余额」总账 */
      '#cg-mjres{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(430px,94%);max-height:88%;' +
      'z-index:28;display:none;flex-direction:column;background:rgba(14,8,30,.985);border:1px solid rgba(255,209,102,.5);' +
      'border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.7);overflow:hidden;}' +
      '#cg-mjres.open{display:flex;}' +
      '#cg-mjres .rh{padding:12px 14px 8px;background:linear-gradient(135deg,rgba(139,111,214,.35),rgba(255,209,102,.18));}' +
      '#cg-mjres .rt{font-size:15px;font-weight:900;color:#ffd166;line-height:1.4;}' +
      '#cg-mjres .rs{font-size:11px;opacity:.8;margin-top:3px;}' +
      '#cg-mjres .rb{flex:1;min-height:0;overflow-y:auto;padding:8px 12px 12px;}' +
      '.cg-rcard{border:1px solid rgba(255,255,255,.16);border-radius:11px;padding:8px 10px;margin:6px 0;background:rgba(255,255,255,.05);}' +
      '.cg-rcard.win{border-color:rgba(255,209,102,.6);background:rgba(255,209,102,.11);}' +
      '.cg-rcard .n{font-size:12.5px;font-weight:900;}' +
      '.cg-rcard .r{float:right;font-size:13px;font-weight:900;}' +
      '.cg-rcard .up{color:#ff6b6b;}' +
      '.cg-rcard .dn{color:#4ade80;}' +
      '.cg-rcard .m{font-size:11px;opacity:.85;margin-top:3px;line-height:1.5;}' +
      '.cg-rcard .tag{display:inline-block;font-size:10px;font-weight:800;padding:1px 7px;border-radius:99px;margin-right:4px;' +
      'background:rgba(255,209,102,.2);border:1px solid rgba(255,209,102,.45);color:#ffd166;}' +
      /* 二十二更：账本明细行（一行一项，红=赚 绿=亏） */
      '.cg-rrow{display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 0;border-top:1px dashed rgba(255,255,255,.09);}' +
      '.cg-rrow .k{opacity:.78;}' +
      '.cg-rrow .k b{color:#ffd166;}' +
      '.cg-rrow .v{margin-left:auto;font-weight:900;font-variant-numeric:tabular-nums;}' +
      '.cg-rbig{display:flex;align-items:baseline;gap:8px;margin-top:9px;padding:9px 11px;border-radius:11px;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);}' +
      '.cg-rbig .k{font-size:12.5px;font-weight:900;}' +
      '.cg-rbig .v{margin-left:auto;font-size:21px;font-weight:900;line-height:1.1;}' +
      '.cg-rsec{font-size:11px;font-weight:900;color:#c9b6f5;margin:12px 0 3px;padding-left:7px;border-left:3px solid #8b6fd6;}' +
      '.cg-rup{color:#ff6b6b;}' +
      '.cg-rdn{color:#4ade80;}' +
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
      '  <button class="cg-tbtn wide" id="cg-cbtn" title="聊天频道">💬 聊天</button>' +
      '  <div><div class="tt" id="cg-tt">棋牌</div><div class="st" id="cg-st"></div></div>' +
      '  <div id="cg-hud"></div>' +
      '  <button class="cg-tbtn wide" id="cg-hbtn" title="玩法说明" style="border-color:rgba(201,182,245,.55);color:#c9b6f5;background:rgba(139,111,214,.14);">❓ 玩法</button>' +
      '  <button class="cg-tbtn" id="cg-lbtn" title="押注区">💰</button>' +
      '  <button class="cg-tbtn" id="cg-rbtn" title="观战席/战报">👥</button>' +
      '  <button class="cg-tbtn" id="cg-x" title="退出">✕</button>' +
      '</div>' +
      '<div id="cg-main">' +
      '  <div class="cg-rail rl" id="cg-left"></div>' +
      '  <div id="cg-center">' +
      '    <canvas id="cg-canvas" style="display:none"></canvas>' +
      '    <div class="cg-acts" id="cg-acts"></div>' +
      '    <button id="cg-quit" style="display:none">🚪 退出</button>' +
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
      '  <div id="cg-help">' +
      '    <div class="cg-htabs" id="cg-htabs"></div>' +
      '    <div id="cg-helpbody"></div>' +
      '  </div>' +
      '  <div id="cg-mjres">' +
      '    <div class="rh"><div class="rt" id="cg-rtitle">结算</div><div class="rs" id="cg-rsub"></div></div>' +
      '    <div class="rb" id="cg-rbody"></div>' +
      '    <div style="padding:8px 12px 12px;display:flex;gap:8px;">' +
      '      <button class="cg-btn pri" id="cg-ragain" style="flex:1;padding:9px 0;font-size:13px;font-weight:900;">🔄 再来一局</button>' +
      '      <button class="cg-btn" id="cg-rclose" style="padding:9px 14px;">看看牌桌</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(el);
    $('cg-x').onclick = closeHall;
    $('cg-canvas').addEventListener('click', onCanvasClick);
    /* 飞行棋：悬停任意格子都有说明（陛下钦定：点哪都告诉你这格干嘛的） */
    $('cg-canvas').addEventListener('mousemove', function (ev) {
      if (!G || G.game !== 'flight' || G.draw) return;
      var cv = $('cg-canvas'), r = cv.getBoundingClientRect();
      var info = flCellAt(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
      showCellTip(ev.clientX - r.left, ev.clientY - r.top, info);
    });
    $('cg-canvas').addEventListener('mouseleave', function () { showCellTip(0, 0, null); });
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
    /* 十七更续：两条侧栏各自独立开关——点哪个开/关哪个，不许再把另一条关掉。
       默认（大屏）两条都开，手机上两条都收起当抽屉用。 */
    $('cg-lbtn').onclick = function () {
      $('cg-left').classList.toggle('open'); syncRailBtns();
      if (G) { resizeCanvas(); drawGame(); }
    };
    $('cg-rbtn').onclick = function () {
      $('cg-right').classList.toggle('open'); syncRailBtns();
      if (G) { resizeCanvas(); drawGame(); }
    };
    syncRailBtns();
    $('cg-cbtn').onclick = function () { toggleChat(); };
    /* 二十一更：结算面板按钮 */
    var rg = $('cg-ragain');
    if (rg) rg.onclick = function () {
      closeMjResult();
      if (G) startGame(buildSetup(G.game, G.seats, G.entry ? { amt: G.entry.amt, cur: G.entry.cur } : null), { spectate: G.spectate });
    };
    var rc = $('cg-rclose');
    if (rc) rc.onclick = closeMjResult;
    $('cg-hbtn').onclick = function () { openHelp(hall.game || (G && G.game) || 'uno'); };
    $('cg-quit').onclick = closeHall;
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

  /* ================= 玩法说明（陛下钦定：规矩要让人看得懂） ================= */
  /* 每个玩法：goal 一句话胜负 / terms 黑话对照 / secs 分段正文（warn 单独高亮块） */
  var CG_HELP = {
    uno: {
      title: '🟥 锋线速演（UNO）',
      goal: '谁先把手里通告单全部出完，谁就「杀青」赢下这局。',
      terms: [
        ['通告单', '就是你的手牌。分红 / 黄 / 绿 / 蓝 四门 + 黑牌'],
        ['通告池', '摸牌堆。抽牌从这儿来，抽空了会把打过的牌洗回去继续抽'],
        ['官宣', '手里只剩 1 张时大喊一声（系统自动喊）。不喊被抓到要罚抽 2 张'],
        ['杀青', '手牌出完 = 获胜']
      ],
      secs: [
        {
          h: '怎么出牌',
          p: ['轮到你时，打出一张跟桌上<b>同门颜色</b>、或<b>同一个数字 / 符号</b>的牌。',
            '出不了的牌点了会提示「这张出不了」——那就看下面一条。']
        },
        {
          h: '功能牌都干嘛的',
          p: ['<b>⊘ 封杀</b>：下家停一轮，不能出牌。',
            '<b>⇄ 舆论反转</b>：出牌方向掉头（顺时针↔逆时针）。',
            '<b>+2 轧戏</b>：下家罚抽 2 张，并且停一轮。']
        },
        {
          h: '⚫ 黑牌到底是什么？（重点）',
          p: ['黑牌<b>不属于红黄蓝绿任何一门</b>，所以它是「万能牌」——<b>不管桌上现在是什么颜色，任何时候都能出</b>。',
            '但黑牌自己没有颜色，所以出完以后要<b>由你来指定</b>下一家得跟哪一门：点下方四个「◯色」按钮选一门即可。',
            '一共两种黑牌：',
            '<b>W 换赛道</b>：只改颜色，不罚牌。',
            '<b>+4 黑天鹅</b>：改颜色，<b>外加下家罚抽 4 张</b>并停一轮。这是全场最凶的一张，留着救急或补刀。']
        },
        {
          h: '⏭ 「过」到底是什么？（重点）',
          warn: '正统 UNO 里<b>没有「过」这个动作</b>——手里一张都出不了时，<b>必须抽一张</b>，不存在白嫖一轮直接跳过。',
          p: ['正确流程是这样的：',
            '① 轮到你，手里有能出的牌 → 直接点手牌打出去；',
            '② 一张都出不了 → 点「🂠 抽一张」（<b>这一步没法跳过</b>）；',
            '③ 抽到的这张<b>如果正好能出</b> → 点「✋ 打出刚抽的」立刻打出去；',
            '④ 抽到的<b>还是出不了</b> → 这时才点「⏭ 过」交给下家。',
            '所以「过」按钮平时是<b>灰的</b>，只在你抽完牌之后才亮起来。要是你发现它按不动，说明你还没抽牌——先抽！']
        }
      ]
    },
    mahjong: {
      title: '🀄 防线长议（川麻）',
      goal: '凑齐 4 组面子 + 1 对将（或七对），先「结案」的人赢。',
      terms: [
        ['接令', '从牌墙摸一张牌'],
        ['传令', '打出一张牌到牌河'],
        ['结案', '胡牌，赢'],
        ['定缺', '开局先选一门（万 / 条 / 筒）不要，这门不打光不许胡'],
        ['牌河', '所有人打出去的牌，摆在自己面前，全场可见'],
        ['自摸', '自己摸到那张胡牌'],
        ['接炮', '别人打出的牌正好让你胡']
      ],
      secs: [
        {
          h: '① 定缺（开局必做）',
          p: ['开局先点「✂️ 定缺 万 / 条 / 筒」选一门<b>不要</b>的。',
            '<b>这门牌没打光之前，你不能胡牌</b>——这是川麻的灵魂规矩，也是为什么叫「血战到底」的底子。',
            'AI 会自动定缺，你只需要选自己的那门。']
        },
        {
          h: '② 摸打',
          p: ['庄家先打，然后逆时针一家一家来：接令一张 → 传令一张。',
            '胡牌型 = <b>4 组面子 + 1 对将</b>。面子可以是顺子（一万二万三万）或刻子（三张一样）。',
            '另外还能凑<b>连环计（七对）</b>：七个对子也能结案。']
        },
        {
          h: '③ 碰 / 杠 / 胡（别人打牌时弹出来）',
          p: ['别人打出一张牌，如果你能用得上，底部会冒出按钮：',
            '<b>碰</b>：你手里有<b>两张一样的</b> → 碰过来凑成刻子，亮在面前，然后<b>你必须再打一张</b>（不能摸牌）。',
            '<b>杠</b>：你手里有<b>三张一样的</b> → 杠过来凑四张，然后<b>从墙尾补摸一张</b>再打。',
            '<b>胡</b>：这张牌正好让你凑齐胡牌型 → 直接结案！',
            '用不上就点「🙅 过」放弃这一张。']
        },
        {
          h: '④ 杠的三种',
          p: ['<b>明杠</b>：别人打的牌，你手里有三张一样的 → 杠。',
            '<b>暗杠</b>：自己摸到第四张 → 可以不亮，直接扣下。',
            '<b>补杠</b>：已经碰过的刻子，又摸到第四张 → 补上去。',
            '三种杠完都要从墙尾补摸一张。']
        }
      ]
    },
    flight: {
      title: '✈️ 永恒王座 · 番位之战（飞行棋）',
      goal: '把自家四架艺人全部送上 ♛ 永恒王座，先到齐的社赢。',
      terms: [
        ['机巢', '出发区。艺人停在里面时是待命状态'],
        ['出道', '掷出 6 才能把一架艺人从机巢送上起飞点'],
        ['归航臂 ↵', '绕完一圈后拐进自己颜色那条 5 格通道'],
        ['永恒王座 ♛', '自家机库终点，要掷出<b>精确点数</b>才能登顶']
      ],
      secs: [
        {
          h: '怎么操作（重点）',
          p: ['先掷骰，然后<b>直接点棋盘上的棋子</b>：',
            '• 棋子还在<b>机巢</b>里 → 点机巢里那个闪金圈的圈，它就出道；',
            '• 棋子已经<b>在路上</b> → 点棋盘格上那架艺人，它就往前走。',
            '能动的棋子会带<b>呼吸金环 + ▼ 箭头</b>高亮，点它就行，不用去底下找按钮。']
        },
        {
          h: '走位规则',
          p: ['<b>掷出 6 才能出道</b>，出道后还能再掷一次。',
            '沿外环 52 格顺时针绕行，绕满一圈从 ↵ 归航臂进机库。',
            '<b>必须掷出精确点数</b>才能登上 ♛ —— 点多了要原地等下一轮。']
        },
        {
          h: '特殊格',
          p: ['<b>★ 事件格</b>：翻一张事件卡（32 张），好事坏事都有。',
            '<b>✈ 航线</b>：落到自己颜色的航线口，<b>直飞 +12 格</b>；落到同色格还能<b>连跳 +4</b>。',
            '<b>命运区</b>：20 张命运卡，翻出来会全场广播。']
        }
      ]
    },
    doudizhu: {
      title: '🃏 坐庄（斗地主）',
      goal: '庄家一人对两家散户，谁先出完手里的牌谁那方赢。',
      terms: [
        ['抢筹', '开局抢庄，抢到的人当庄家'],
        ['暗料', '3 张底牌，庄家独吞'],
        ['散户', '另外两家，联手对抗庄家'],
        ['炸弹', '四张一样，能压过任何普通牌型'],
        ['王炸', '双王（大小王），全场最大']
      ],
      secs: [
        {
          h: '① 坐庄',
          p: ['开局抢筹，谁抢到谁当<b>庄家</b>，拿走 3 张<b>暗料</b>（底牌）。',
            '庄家 20 张，两家散户各 17 张。庄家先出牌。']
        },
        {
          h: '② 出牌与压牌',
          p: ['轮到你，要么打一手<b>比上家大</b>的<b>同牌型</b>，要么点「过」不要。',
            '牌型：单张 / 对子 / 三张 / 三带一 / 顺子（5 连起）/ 连对 / 飞机 / 炸弹 / 王炸。',
            '两家都「过」的话，出牌权回到你手里，可以重新起一手。']
        },
        {
          h: '⚠️ 这里的「过」是合法的！',
          warn: '<b>斗地主有「过」，UNO 没有。</b>两家玩法别混——斗地主里你不想压、或压不起，直接点「过」是完全合规的，不用抽牌。',
          p: ['区别在于：斗地主是「<b>要不要压</b>」，UNO 是「<b>有没有牌出</b>」。',
            '斗地主的过 = 战略性放弃这一手，留着大牌后面用。']
        },
        {
          h: '③ 胜负',
          p: ['庄家先出完 → <b>庄家赢</b>，两家散户都输。',
            '任意一家散户先出完 → <b>散户方赢</b>，庄家输。']
        }
      ]
    }
  };
  var _helpGame = 'uno';
  function openHelp(gameId) {
    ensureEl();
    if (CG_HELP[gameId]) _helpGame = gameId;
    var box = $('cg-help');
    box.classList.add('open');
    $('cg-chat').classList.remove('open');   /* 两个抽屉不同时开，免得叠一起 */
    renderHelp();
  }
  function renderHelp() {
    var tabs = $('cg-htabs'), body = $('cg-helpbody');
    if (!tabs || !body) return;
    tabs.innerHTML = '';
    Object.keys(CG_HELP).forEach(function (k) {
      var d = document.createElement('div');
      d.className = 'cg-htab' + (k === _helpGame ? ' on' : '');
      d.textContent = GAMES[k] ? (GAMES[k].em + GAMES[k].name) : k;
      d.onclick = function () { _helpGame = k; renderHelp(); };
      tabs.appendChild(d);
    });
    var H = CG_HELP[_helpGame] || CG_HELP.uno;
    var h = '<div class="cg-h1">' + H.title + '</div>';
    h += '<div class="cg-hk"><span class="t">🎯 胜负</span><div class="cg-hp">' + H.goal + '</div></div>';
    h += '<div class="cg-h2">黑话对照</div><table class="cg-htb">';
    H.terms.forEach(function (t) { h += '<tr><td>' + t[0] + '</td><td>' + t[1] + '</td></tr>'; });
    h += '</table>';
    H.secs.forEach(function (s) {
      h += '<div class="cg-h2">' + s.h + '</div>';
      if (s.warn) h += '<div class="cg-hwarn"><span class="t">⚠️ 注意</span><div class="cg-hp">' + s.warn + '</div></div>';
      s.p.forEach(function (x) { h += '<div class="cg-hp">· ' + x + '</div>'; });
    });
    h += '<div class="cg-hp" style="margin-top:14px;opacity:.55;text-align:center;">— 看完点右上角 ❓ 收起 —</div>';
    body.innerHTML = h;
    body.scrollTop = 0;
  }

  /* ================= 二十二更：四玩法通用结算面板 =================
     陛下钦定：打完必须看见「赢了多少 / 亏了多少 / 入场费多少 / 最后到手多少」。
     账本来源 G.settle：开局前余额 + 入场费 + 名次分账 + 牌桌输赢 + 押注本金/回款，
     三项玩法（UNO / 飞行棋 / 斗地主）只有入场费与押注，川麻额外有番位账本。
     红=赚 绿=亏（中国习惯：涨红跌绿）。 */
  /* 每一笔收支记进 G.settle.by[币]，结算面板照它算总账 */
  function stAcc(cur, field, v) {
    if (!G) return 0;
    var S = G.settle = G.settle || { bal0: null, by: {}, rankPay: [] };
    var b = S.by[cur] = S.by[cur] || { entryPaid: 0, entryBack: 0, tableNet: 0, betStake: 0, betBack: 0 };
    b[field] = (b[field] || 0) + v;
    return b[field];
  }
  function rrow(k, v, cls) {
    return '<div class="cg-rrow"><span class="k">' + k + '</span><span class="v ' +
      (cls ? (cls === 'up' ? 'cg-rup' : 'cg-rdn') : '') + '">' + v + '</span></div>';
  }
  function safeRank() {
    try { return entryRank(); } catch (e) {
      var a = []; for (var i = 0; i < (G ? G.seats : 0); i++) a.push(i); return a;
    }
  }
  function showResult() {
    var box = $('cg-mjres');
    if (!box || !G) return;
    var g = GAMES[G.game] || { name: '棋牌', em: '🎴' };
    var S = G.settle || { bal0: null, by: {}, rankPay: [] };
    var wal = walletAll();
    var rank = (S.rankPay && S.rankPay.length) ? S.rankPay.map(function (x) { return x.p; }) : safeRank();
    var myRank = G.spectate ? -1 : (rank.indexOf(0) + 1);
    $('cg-rtitle').textContent = '🏁 ' + g.em + ' ' + g.name + ' · 本局结算';
    $('cg-rsub').textContent = (G.over || '本局结束') +
      (myRank > 0 ? ('　·　我第 ' + myRank + ' 名 / ' + G.seats + ' 人') : (G.spectate ? '　·　观战席（只有押注账）' : ''));
    var h = '';
    /* ── ① 我的账本：一个币一张卡，逐项摊开 ── */
    h += '<div class="cg-rsec">🧾 我的账本</div>';
    var mainCur = (G.entry && G.entry.cur) || (GAMES[G.game] && GAMES[G.game].cur) || 'diamond';
    var changed = Object.keys(S.by || {}).filter(function (k) {
      var b = S.by[k];
      return b && (b.entryPaid || b.entryBack || b.tableNet || b.betStake || b.betBack);
    });
    if (changed.indexOf(mainCur) < 0) changed.unshift(mainCur);
    changed.forEach(function (cur) {
      var b = (S.by && S.by[cur]) || {};
      var ep = b.entryPaid || 0, eb = b.entryBack || 0, tn = b.tableNet || 0, bs = b.betStake || 0, bb = b.betBack || 0;
      var net = eb - ep + tn + (bb - bs);
      var bal0 = (S.bal0 && typeof S.bal0[cur] === 'number') ? S.bal0[cur] : null;
      h += '<div class="cg-rcard">';
      h += '<div class="n">' + CUR[cur].em + ' ' + CUR[cur].n +
        '<span class="r ' + (net >= 0 ? 'up' : 'dn') + '">' + (net >= 0 ? '+' : '−') + fmt(Math.abs(net)) + '</span></div>';
      if (bal0 !== null) h += rrow('开局前余额', fmt(bal0), '');
      if (ep) h += rrow('🎟 入场费（开局交出去）', '−' + fmt(ep), 'dn');
      if (eb) h += rrow('🏆 名次分账（第 ' + (myRank > 0 ? myRank : '—') + ' 名）', '+' + fmt(eb), 'up');
      if (tn) h += rrow((G.game === 'mahjong' ? '🀄 牌桌输赢（番位账本）' : '🎴 牌桌输赢'),
        (tn >= 0 ? '+' : '−') + fmt(Math.abs(tn)), tn >= 0 ? 'up' : 'dn');
      if (bs) h += rrow('💰 押注本金', '−' + fmt(bs), 'dn');
      if (bb) h += rrow('🎊 押注回款（含未中退还）', '+' + fmt(bb), 'up');
      if (!ep && !eb && !tn && !bs && !bb) h += '<div class="m">这一局没有动到 ' + CUR[cur].n + '（没付入场费也没押注）。</div>';
      h += '<div class="cg-rbig"><span class="k">本局净收</span><span class="v ' +
        (net >= 0 ? 'cg-rup' : 'cg-rdn') + '">' + (net >= 0 ? '+' : '−') + fmt(Math.abs(net)) + ' ' + CUR[cur].em + '</span></div>';
      h += '<div class="m" style="margin-top:6px">最后到手：<b>' + fmt(wal[cur] || 0) + '</b> ' + CUR[cur].em + CUR[cur].n +
        (bal0 !== null ? ('（开局 ' + fmt(bal0) + ' → 现在 ' + fmt(wal[cur] || 0) + '）') : '') + '</div>';
      h += '</div>';
    });
    /* ── ② 名次与分账：谁吃肉谁喝汤 ── */
    h += '<div class="cg-rsec">🏆 名次与分账</div><div class="cg-rcard">';
    var medal = ['🥇', '🥈', '🥉', '🏅'];
    var ce0 = CUR[mainCur].em;
    rank.forEach(function (p, i) {
      var get = 0;
      (S.rankPay || []).forEach(function (x) { if (x.p === p) get = x.get; });
      h += '<div class="cg-rrow"><span class="k">' + (medal[i] || '🏅') + ' ' + esc(realName(p)) +
        (p === 0 && !G.spectate ? ' <b>（我）</b>' : '') + '</span>' +
        '<span class="v ' + (get ? 'cg-rup' : '') + '">' + (get ? '+' + fmt(get) + ' ' + ce0 : '—') + '</span></div>';
    });
    if (G.entry) h += '<div class="m">入场池 ' + fmt(G.entry.amt * G.seats) + '（' + CUR[mainCur].em + fmt(G.entry.amt) +
      ' × ' + G.seats + ' 人），池子 95% 按名次分（2 人 70/30，3–4 人 50/30/20），5% 归荷官。</div>';
    h += '</div>';
    /* ── ③ 本局战况：一眼看见这局是怎么打完的 ── */
    h += '<div class="cg-rsec">📊 本局战况</div><div class="cg-rcard">';
    if (G.game === 'uno') {
      for (var u = 0; u < G.seats; u++) {
        h += rrow(esc(realName(u)) + ' 剩通告', ((G.hands[u] || []).length) + ' 张', (G.hands[u] || []).length === 0 ? 'up' : '');
      }
    } else if (G.game === 'flight') {
      for (var f = 0; f < G.seats; f++) {
        var ps = G.planes[f] || [], top = ps.filter(function (v) { return v === FL_TOTAL; }).length;
        h += rrow(esc(realName(f)) + ' 登顶艺人', top + '/4 架', top === 4 ? 'up' : '');
      }
    } else if (G.game === 'doudizhu') {
      h += rrow('本局倍数', '×' + (G.mult || 1), '');
      for (var d = 0; d < G.seats; d++) {
        h += rrow(esc(realName(d)) + (G.landlord === d ? ' 👑庄家' : ' 散户') + ' 剩牌',
          ((G.hands[d] || []).length) + ' 张', (G.hands[d] || []).length === 0 ? 'up' : '');
      }
    } else if (G.game === 'mahjong') {
      h += rrow('血战到底 · 胡牌顺序', G.huOrder.length ? G.huOrder.map(function (p) { return realName(p); }).join(' → ') : '流局（无人结案）', G.huOrder.length ? 'up' : '');
      h += rrow('底注', fmt(mjBase()) + ' ' + ce0, '');
    }
    h += '</div>';
    /* ── ④ 川麻专属：各家的牌型与番数 ── */
    if (G.game === 'mahjong') h += mjResultCards();
    h += '<div class="m" style="text-align:center;opacity:.62;margin-top:9px;">📒 钱已写回主账本（档案资产）· 红=赚 绿=亏</div>';
    $('cg-rbody').innerHTML = h;
    box.classList.add('open');
    /* 二十二更：打完要让人知道结账了——尤其 UNO 以前赢完啥提示都没有 */
    toast('🏁 ' + g.em + g.name + ' 本局结束，账本已出（点结算面板看收支）');
  }
  function realName(p) { return (G.real && G.real[p]) || (G.names && G.names[p]) || ('P' + p); }

  /* 川麻结算卡（二十二更：并入通用面板，牌型/番数/此把进账照旧） */
  function renderMjResult() { showResult(); }
  function mjResultCards() {
    var cur = (G.entry && G.entry.cur) || 'diamond';
    var cn = CUR[cur].n, ce = CUR[cur].em;
    var order = {};
    (G.huOrder || []).forEach(function (p, i) { order[p] = i + 1; });
    var h = '<div class="cg-rsec">🀄 各家牌型（川麻专属）</div>';
    for (var p = 0; p < G.seats; p++) {
      var s = (G.score && G.score[p]) || 0, hu = (G.hu && G.hu[p]) || null;
      h += '<div class="cg-rcard' + (hu ? ' win' : '') + '">';
      h += '<div class="n">' + esc(realName(p)) +
        (hu ? '<span class="tag">第 ' + order[p] + ' 个胡</span>' : '<span class="tag" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#ccc;">未胡</span>') +
        '<span class="r ' + (s >= 0 ? 'up' : 'dn') + '">' + (s >= 0 ? '+' : '−') + fmt(Math.abs(s)) + ' ' + ce + '</span></div>';
      if (hu) {
        h += '<div class="m">' + esc(hu.name) + ' · <b>' + hu.fan + ' 番</b> ×' + (hu.mult || 1).toFixed(1) +
          ' → 此把 <b>' + (hu.pts >= 0 ? '+' : '') + fmt(hu.pts) + '</b> ' + cn + '（' + (hu.ziMo ? '自摸' : '接炮') + '）· 右侧是含杠钱的总盈亏';
        if (hu.detail && hu.detail.length) h += '<br><span style="opacity:.78">' + hu.detail.map(esc).join('、') + '</span>';
        h += '</div>';
      } else {
        var kk = ((G.melds && G.melds[p]) || []).filter(function (m) { return m.type === 'kong' || m.type === 'ankong'; }).length;
        h += '<div class="m">没能结案' + (kk ? '（途中杠了 ' + kk + ' 副，收过杠钱）' : '') + '</div>';
      }
      h += '</div>';
    }
    return h;
  }
  function closeMjResult() { var b = $('cg-mjres'); if (b) b.classList.remove('open'); }

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
      /* ⚠️ 十七更护栏：renderHud 可能被 walletAdd 在 G 还没建完时调用（入场费扣款），
         这里每一局的数据都要先判存在，否则一个 undefined.length 能把整局开局掐死。 */
      if (G.game === 'uno') out += '<span class="cg-hi">通告池 ' + (G.stock ? G.stock.length : 0) + '</span>' +
        '<span class="cg-hi">方向 ' + (G.dir === 1 ? '顺' : '逆') + '</span>';
      else if (G.game === 'mahjong') {
        out += '<span class="cg-hi">牌墙 ' + (G.wall ? G.wall.length : 0) + '</span>';
        /* 二十一更：番位账本——杠了吃三家、胡了按牌型收钱，全程实时看得见 */
        if (G.score) {
          var cur0 = (G.entry && G.entry.cur) || 'diamond';
          var sc = [];
          for (var sp = 0; sp < G.seats; sp++) {
            var nm = (G.real && G.real[sp]) || (G.names && G.names[sp]) || ('P' + sp);
            var v = G.score[sp] || 0;
            sc.push('<b style="color:' + (v > 0 ? '#ff6b6b' : (v < 0 ? '#4ade80' : '#ddd')) + '">' + esc(nm) + (v >= 0 ? ' +' : ' ') + fmt(v) + '</b>' + (G.hu && G.hu[sp] ? '✓' : ''));
          }
          out += '<span class="cg-hi cur">📒 ' + sc.join('　') + ' ' + CUR[cur0].em + '</span>';
        }
      }
      else if (G.game === 'doudizhu') out += '<span class="cg-hi">倍数 ×' + (G.mult || 1) + '</span>';
      else if (G.game === 'flight') {
        out += '<span class="cg-hi">第 ' + G.round + ' 回合</span>';
        if (G.colors && G.planes) {
          var prog = [];
          G.colors.forEach(function (c, p) {
            var pl = G.planes[p] || [];
            var top = pl.filter(function (v) { return v === FL_TOTAL; }).length;
            prog.push(FL_SOC[c] + ' ' + top + '/4');
          });
          out += '<span class="cg-hi">登顶 ' + esc(prog.join('·')) + '</span>';
        }
      }
      if (G.bet) out += '<span class="cg-hi' + (G.bet.closed ? '' : ' cur') + '">' + (G.bet.closed ? '🔒 封盘' : '💰 押注窗 ' + betLeftSec() + 's') + '</span>';
    }
    var w = walletAll(), parts = [];
    Object.keys(CUR).forEach(function (k) {
      var on = G && GAMES[G.game] && GAMES[G.game].cur === k;
      parts.push('<span class="cg-hi' + (on ? ' cur' : '') + '">' + CUR[k].em + CUR[k].n + ' ' + fmt(w[k] || 0) + '</span>');
    });
    out += parts.join('');
    if (G) out += '<span class="cg-hi">👥 观战 ' + ((G.specs ? G.specs.length : 0) + (G.spectate ? 1 : 0)) + '</span>';
    if (G && G.entry) out += '<span class="cg-hi">🎟 入场 ' + CUR[G.entry.cur].em + fmt(G.entry.amt) + '</span>';
    hud.innerHTML = out;
  }
  function betLeftSec() { return Math.max(0, Math.ceil((G.bet.openUntil - Date.now()) / 1000)); }

  function renderLeft() {
    var box = $('cg-left'); if (!box || !G || !G.bet) return;
    var g = GAMES[G.game];
    var h = '<div class="cg-card"><div class="cg-lab">💰 押注区</div>';
    if (!G.spectate) {
      h += '<div class="cg-betline">对局者不能押注（总纲铁律）。<br>想押？回大厅桌列表点「观战」，<br>坐上观战席就能押 + 递纸条 + 领津贴。</div>';
    } else if (G.bet.closed) {
      h += '<div class="cg-betline">🔒 已封盘，注单等结算。</div>';
    } else {
      /* 十七更续：我的余额先摆出来——押得起多少一眼看见，别让人盲押 */
      var wal = walletAll();
      h += '<div class="cg-row" style="margin-bottom:5px;flex-wrap:wrap;">' + Object.keys(CUR).map(function (k) {
        var on = G.bet.myCur === k;
        return '<button class="cg-btn' + (on ? ' on' : '') + '" data-cur="' + k + '" style="padding:5px 9px;font-size:11px;">' +
          CUR[k].em + CUR[k].n + ' <b>' + fmt(wal[k] || 0) + '</b></button>';
      }).join('') + '</div>';
      h += '<div class="cg-betline">本注用 <b style="color:#ffd166;">' + CUR[G.bet.myCur].em + CUR[G.bet.myCur].n + '</b>（余额 ' + fmt(wal[G.bet.myCur] || 0) +
        '）· 单注 ' + fmt(BET_MIN) + '–' + fmt(BET_MAX) + ' · 每桌限 3 注 · 剩 ' + betLeftSec() + ' 秒</div>';
      /* 十七更续：方案改成「两个显式按钮」——以前是一个 toggle 小字，看不出当前选的是哪个，
         陛下要的「下注按钮非常明显」也包括这里：押 1 次 / 押 3 次，选中的那个高亮。 */
      h += '<div class="cg-row" style="margin-top:4px;flex-wrap:wrap;align-items:center;">' +
        '<span style="font-size:10.5px;opacity:.75;margin-right:4px;">方案</span>' +
        [1, 3].map(function (v) {
          return '<button class="cg-btn' + (G.bet.plan === v ? ' on' : '') + '" data-plan="' + v + '" style="padding:3px 9px;font-size:10.5px;">押 ' + v + ' 次' + (v === 3 ? '（三段）' : '') + '</button>';
        }).join('') +
        '<span style="font-size:10.5px;opacity:.75;margin-left:6px;">已下 ' + G.bet.mineCnt + '/3 注</span></div>';
      var myCur = G.bet.myCur, myPool = G.bet.mode === 'pot' ? (G.bet.pool[myCur] || betPool(myCur)) : null;
      var tg = betTargets();
      var sel = G.bet.selAmt || (G.bet.selAmt = {});
      tg.forEach(function (t, i) {
        var tname = G.bet.mode === 'fixed' ? t.name : t;
        var odds, share = 0;
        if (G.bet.mode === 'pot') {
          var total = myPool.reduce(function (a, b) { return a + b; }, 0);
          odds = myPool[i] > 0 ? (0.95 * total / myPool[i]) : 0;
          share = total > 0 ? myPool[i] / total : 0;
        } else odds = t.odds;
        var amt = sel[i] || 500;
        /* 陛下钦定：一位选手一块，币种+金额+下注按钮全在这一块里 */
        h += '<div class="cg-card" style="margin-top:7px;padding:8px;background:rgba(255,255,255,.05);">';
        h += '<div class="cg-odds"><span style="min-width:70px;">' + esc(tname) + '</span>' +
          '<span class="bar"><i style="width:' + Math.round(share * 100) + '%"></i></span>' +
          '<span class="q">' + (odds ? '×' + (G.bet.mode === 'fixed' ? odds.toFixed(1) : odds.toFixed(2)) : '—') + '</span></div>';
        /* 币种按钮也带余额——陛下要「余额可见」，每一块里都得看得见自己还剩多少 */
        h += '<div class="cg-row" style="margin-top:5px;flex-wrap:wrap;">' + Object.keys(CUR).map(function (k) {
          return '<button class="cg-btn' + (G.bet.myCur === k ? ' on' : '') + '" data-cur="' + k + '" style="padding:3px 7px;font-size:10.5px;">' +
            CUR[k].em + CUR[k].n + ' <b>' + fmt(wal[k] || 0) + '</b></button>';
        }).join('') + '</div>';
        h += '<div class="cg-row" style="margin-top:5px;flex-wrap:wrap;">' +
          [100, 500, 1000, 5000].map(function (v) {
            return '<button class="cg-chip' + (amt === v ? ' on' : '') + '" data-amt="' + v + '" data-i="' + i + '">' + fmt(v) + '</button>';
          }).join('') + '</div>';
        h += '<button class="cg-btn pri" data-bet="' + i + '" style="margin-top:6px;width:100%;padding:7px 0;font-size:12.5px;">' +
          '✅ 下注 ' + fmt(amt) + ' ' + CUR[G.bet.myCur].n + ' → ' + esc(tname) + '</button>';
        h += '</div>';
      });
    }
    var mine = G.bet.bets.filter(function (b) { return b.mine; });
    if (mine.length) {
      h += '<div class="cg-lab" style="margin-top:9px;">我的注单（实时赔率）</div>';
      mine.forEach(function (b) {
        var q = betOddsOf(b);
        h += '<div class="cg-betline">🎫 ' + esc(b.targetName) + ' · 押 ' + fmt(b.amt) + ' ' + CUR[b.cur].n +
          ' · 赔率 <b style="color:#ffd166;">×' + q.toFixed(2) + '</b>' +
          ' · 命中可得 <b style="color:#ffd166;">' + fmt(Math.floor(b.paid * q)) + '</b> ' + CUR[b.cur].n + '</div>';
      });
    }
    h += '<div class="cg-sub">三币任意押：押什么币赢什么币，各币独立彩池。赔率 = 0.95 × 该币总池 ÷ 该家池，实时滚动。抽水 5% 归荷官（六顺喵）。</div></div>';
    box.innerHTML = h;
    /* chip 只选金额，点「✅ 下注」才真扣钱（陛下要的：下注按钮得明显、别手滑就扣） */
    Array.prototype.forEach.call(box.querySelectorAll('[data-amt]'), function (b) {
      b.onclick = function () {
        G.bet.selAmt = G.bet.selAmt || {};
        G.bet.selAmt[parseInt(b.dataset.i, 10)] = parseInt(b.dataset.amt, 10);
        renderLeft();
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-bet]'), function (b) {
      b.onclick = function () {
        var i = parseInt(b.dataset.bet, 10);
        placeBet(i, (G.bet.selAmt && G.bet.selAmt[i]) || 500);
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-plan]'), function (b) {
      b.onclick = function () { G.bet.plan = parseInt(b.dataset.plan, 10); cgLog('📋 选定押 ' + G.bet.plan + ' 次方案'); renderLeft(); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-cur]'), function (b) {
      b.onclick = function () { G.bet.myCur = b.dataset.cur; renderLeft(); };
    });
  }
  /* 某张注单的实时赔率：pot=0.95×该币总池÷该家池；fixed=固定盘口 */
  function betOddsOf(b) {
    var B = G.bet;
    if (B.mode === 'fixed') return [1.9, 2.1, 1.8][b.target] || 0;
    var pool = B.pool[b.cur];
    if (!pool) return 0;
    var total = pool.reduce(function (a, x) { return a + x; }, 0);
    return pool[b.target] > 0 ? 0.95 * total / pool[b.target] : 0;
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
      /* 陛下要「押谁一目了然」：真名（位置称呼），飞行棋带社名 */
      var nm = (G.real && G.real[p]) || G.names[p];
      out.push(G.game === 'flight'
        ? (FL_SOC[G.colors[p]] + '社·' + nm)
        : nm + '（' + (G.labels[p] || '？') + '）');
    }
    return out;
  }

  function renderRight() {
    var box = $('cg-right'); if (!box || !G) return;
    var h = '';
    if (G.game === 'flight') {
      h += '<div class="cg-card"><div class="cg-lab">🔮 命运区（紫 · 全场广播）</div><div class="cg-betline">剩 ' + G.fate.length + '/20 张 · 冲 ✈ 航线当场抽一张</div>' +
        (G.lastFate ? '<div class="cg-betline" style="color:#c9b6f5;">' + esc(G.lastFate) + '</div>' : '') +
        '<button class="cg-btn" data-deck="fate" style="margin-top:6px;padding:4px 10px;font-size:11px;">📖 翻看整堆（20 张）</button></div>';
      h += '<div class="cg-card"><div class="cg-lab">🟠 事件区（琥珀 · 落 ★ 自动抽）</div><div class="cg-betline">弃牌回收循环 · 余 ' + G.evdeck.length + ' 张</div>' +
        (G.lastEvent ? '<div class="cg-betline" style="color:#ffd166;">' + esc(G.lastEvent) + '</div>' : '') +
        '<button class="cg-btn" data-deck="event" style="margin-top:6px;padding:4px 10px;font-size:11px;">📖 翻看整堆（32 张）</button></div>';
    }
    /* 十七更：虚拟观战删光——观战席只认真人 */
    var specs = (G.specs || []).map(function (s) { return s.n; });
    if (G.spectate) specs.unshift(me() + '（我）');
    h += '<div class="cg-card"><div class="cg-lab">👥 观战席（' + specs.length + '）</div><div>' +
      (specs.length ? specs.map(function (n) { return '<span class="cg-spec">🐹 ' + esc(n) + '</span>'; }).join('')
        : '<span class="cg-betline" style="opacity:.5;">虚位以待——大厅桌列表里点「观战」就能坐上来</span>') + '</div>' +
      '<div class="cg-sub">观战满 3 分钟 +200 ' + CUR[GAMES[G.game].cur].n + '（每日 3 次）。看不到任何人手牌——观战硬规矩。</div></div>';
    h += '<div class="cg-card" style="flex:1;min-height:90px;"><div class="cg-lab">📜 战报</div>' +
      (G.log || []).slice(-14).reverse().map(function (l) { return '<div class="cg-logline">' + esc(l) + '</div>'; }).join('') + '</div>';
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll('[data-deck]'), function (btn) {
      btn.onclick = function () { openDeckViewer(btn.dataset.deck); };
    });
  }
  function renderRails() { renderLeft(); renderRight(); renderHud(); }

  /* ================= 聊天渠道（本桌 / 世界 / 关卡） ================= */
  var _chatBound = false;
  function bindChatNet() {
    if (_chatBound || !global.Net || !Net.on) return; _chatBound = true;
    Net.on('chat', function (m) {
      if (!m) return;
      /* ⚠️ 十七更续修：服务端 tableChat 转发回来的是 channel:'dm'（桌内纸条），
         以前 dm 被判成「不是频道」直接 return——所以别人递的纸条桌上一个人都看不到。
         现在 dm 归到本桌频道，还要在他头像旁边冒 5 秒气泡。 */
      var ch = m.channel === 'level' ? 'level' : (m.channel === 'dm' ? 'table' : 'world');
      var nm = m.name || m.from || '??';
      cgLogs[ch].push({ n: nm, text: m.text || '' });
      if (cgLogs[ch].length > 60) cgLogs[ch].shift();
      if (el && $('cg-chat').classList.contains('open') && cgCh === ch) renderChat();
      if (ch === 'table') cgBubble(cgSeatOfName(nm), m.text || '');
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
      /* 十七更续：我自己说完也要冒泡（陛下钦定：自己也冒），不然说完了不知道冒在哪 */
      cgBubble(cgSeatOfName(me()), text);
      /* 十七更：走 tableChat——服务端转发给同桌+全体观战者（观战递纸条大家都看得见）
         ⚠️ 别自己再拼「昵称：」前缀——服务端回包已经带 name 了，拼了就变成两层名字。 */
      if (hall.code && global.Net && Net.connected()) {
        Net.send({ t: 'tableChat', code: hall.code, text: text });
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
    /* 十七更续：每次开棋牌厅，先把老的小金库（card_wallet_v1 / star·firefly·evening）
       一次性并入主账本 profile.currency——不调用就永远并不过来，陛下攒的家底会凭空消失。 */
    try { migrateWallet(); } catch (e) { }
    hall.open = true; hall.game = gameId; hall.seats = g.def;
    hall.code = ''; hall.isHost = false; hall.joined = false;
    hall.players = [{ u: meName(), n: me(), me: true }];
    if (!hall.entry || GAMES[hall.game].cur !== hall.entry.cur) {
      var fees = ENTRY_FEES;
      hall.entry = { amt: fees[0], cur: GAMES[hall.game].cur };
    }
    hall.watchMode = false; hall.watchCode = '';
    G = null;
    el.classList.add('on');
    $('cg-canvas').style.display = 'none';
    $('cg-tip').style.display = 'none';
    $('cg-acts').style.display = 'none';
    $('cg-quit').style.display = 'none';
    $('cg-body').style.display = '';
    $('cg-left').classList.remove('open'); $('cg-right').classList.remove('open');
    $('cg-chat').classList.remove('open');
    $('cg-tt').textContent = g.em + ' ' + g.name + ' · 等待位面';
    $('cg-st').textContent = g.place;
    renderHud();
    bindRoomEvents();
    fetchTableList();
    renderHall();
  }
  /* 十七更：大厅桌列表——进来先看全场有几桌（陛下钦定） */
  function fetchTableList() {
    if (global.Net && Net.connected()) Net.send({ t: 'roomList' });
    else hall.rooms = null;
  }
  function watchRoom(code) {
    hall.watchMode = true; hall.watchCode = code;
    joinRoom(code, true);
    toast('👀 正在围观 ' + code + '，房主开局自动进观战席');
  }
  function closeHall() {
    if (hall.code && global.Net && Net.connected()) Net.send({ t: 'roomLeave', code: hall.code });
    hall.open = false; hall.code = ''; hall.watchMode = false; hall.watchCode = ''; G = null;
    clearTimeout(_aiTimer); clearInterval(_tickTimer); _tickTimer = null;
    stopBubbleTimer();                    /* 厅都关了，气泡的清理定时器别留着空转 */
    if (el) {
      el.classList.remove('on');
      var q = $('cg-quit'); if (q) q.style.display = 'none';
      var hp = $('cg-help'); if (hp) hp.classList.remove('open');
      closeMjResult();                  /* 二十一更：收摊时把结算面板一起收掉 */
    }
  }

  function renderHall() {
    var g = GAMES[hall.game];
    $('cg-tt').textContent = g.em + ' ' + g.name + ' · 等待位面';
    $('cg-st').textContent = g.place + ' · ' + (hall.code ? ('房号 ' + hall.code) : '还没开房') +
      ' · 在线 ' + hall.players.length + '/' + hall.seats;
    var b = $('cg-body');
    b.innerHTML = '';
    /* 玩法说明入口（陛下钦定：规矩要查得到）——开局前就能翻 */
    var hbar = document.createElement('div');
    hbar.style.cssText = 'flex:1 1 100%;display:flex;align-items:center;gap:10px;margin-bottom:10px;';
    hbar.innerHTML = '<span style="font-size:12px;opacity:.75;">第一次玩？</span>';
    var hBtn = document.createElement('button');
    hBtn.className = 'cg-btn pri';
    hBtn.style.cssText = 'padding:8px 18px;font-size:13px;';
    hBtn.textContent = '📖 看 ' + g.em + g.name + ' 怎么玩';
    hBtn.onclick = function () { openHelp(hall.game); };
    hbar.appendChild(hBtn);
    b.appendChild(hbar);
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
    function mkBtn(cls, txt, fn) { var x = document.createElement('button'); x.className = 'cg-btn ' + cls; x.textContent = txt; x.onclick = fn; return x; }

    /* ⓪ 大厅桌列表（十七更：只列联机真实房） */
    if (global.Net && Net.connected()) {
      var c0 = document.createElement('div'); c0.style.cssText = 'flex:1 1 100%;';
      var card0 = document.createElement('div'); card0.className = 'cg-card';
      card0.innerHTML = '<div class="cg-lab">🌐 大厅 · 现在的牌桌（' + g.em + g.name + '）</div>';
      var rooms = (hall.rooms || []).filter(function (r) { return r.game === hall.game; });
      if (!rooms.length) {
        var empty = document.createElement('div'); empty.className = 'cg-betline';
        empty.style.opacity = '.6';
        empty.textContent = '暂时没有开着的 ' + g.name + ' 桌——拉到下面自己开一桌，全服都能在列表里看到。';
        card0.appendChild(empty);
      } else {
        rooms.forEach(function (r) {
          var line = document.createElement('div');
          line.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px dashed rgba(255,255,255,.08);font-size:12px;font-weight:700;flex-wrap:wrap;';
          line.innerHTML = '<span class="cg-code" style="font-size:16px;letter-spacing:3px;margin:0;">' + esc(r.code) + '</span>' +
            '<span style="opacity:.75;">' + r.n + '/' + r.seats + ' 人' + (r.started ? ' · 🟢 局中' : ' · ⏳ 待开局') + (r.watchers ? ' · 👥' + r.watchers : '') + '</span>';
          var bJoin = mkBtn('pri', '坐下', function () { joinRoom(r.code); });
          bJoin.style.padding = '4px 12px';
          bJoin.disabled = r.started || r.n >= r.seats;
          var bWatch = mkBtn('', '👥 观战', function () { watchRoom(r.code); toast('👀 正在围观 ' + r.code + '，房主开局自动进观战席'); });
          bWatch.style.padding = '4px 12px';
          line.appendChild(bJoin); line.appendChild(bWatch);
          card0.appendChild(line);
        });
      }
      var sub0 = document.createElement('div'); sub0.className = 'cg-sub';
      sub0.textContent = '每 4 秒自动刷新。局中的桌也能进观战席围观（看不到手牌，能押注+递纸条）；空位开局可补 AI。';
      card0.appendChild(sub0);
      c0.appendChild(card0);
      cols.appendChild(c0);
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

    /* ② 座位（AI 补位可勾选） */
    var c2 = col('② 座位');
    var r2 = document.createElement('div'); r2.className = 'cg-row';
    for (var i = 0; i < hall.seats; i++) {
      var p = hall.players[i];
      var d = document.createElement('div');
      d.className = 'seat' + (p ? (p.me ? ' me' : '') : ' empty');
      d.innerHTML = '<span class="em">' + (p ? (p.me ? '🙋' : '🐹') : (hall.fillAi ? '🤖' : '➕')) + '</span>' +
        '<span>' + (p ? esc(p.n) : (hall.fillAi ? '空位（AI 补）' : '空位')) + '</span>';
      r2.appendChild(d);
    }
    c2.appendChild(r2);
    var fillRow = document.createElement('label');
    fillRow.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;margin-top:7px;cursor:pointer;';
    fillRow.innerHTML = '<input type="checkbox" id="cg-fillai" ' + (hall.fillAi ? 'checked' : '') + '> 开局时空位自动补 AI';
    c2.appendChild(fillRow);
    if (hall.fillAi) {
      var lvRow = document.createElement('div'); lvRow.className = 'cg-row';
      lvRow.style.marginTop = '6px';
      AI_LEVELS.forEach(function (lv, li) {
        var lb = document.createElement('button');
        lb.className = 'cg-btn' + (hall.aiLevel === li + 1 ? ' on' : '');
        lb.style.cssText = 'padding:4px 9px;font-size:11px;';
        lb.textContent = lv;
        lb.onclick = function () { hall.aiLevel = li + 1; renderHall(); };
        lvRow.appendChild(lb);
      });
      c2.appendChild(lvRow);
    }
    var sub2 = document.createElement('div'); sub2.className = 'cg-sub';
    sub2.textContent = '真联机：好友输同一个房号入座。补 AI 可选五档段位：新手乱打、大师逼近最优手。';
    c2.appendChild(sub2);

    /* ③ 入场费（十七更：三档 · 三币任选 · 冠亚分账） */
    var cE = col('③ 入场费（打完按名次分账）');
    var rE = document.createElement('div'); rE.className = 'cg-row';
    ENTRY_FEES.forEach(function (v) {
      var btn = document.createElement('button');
      btn.className = 'cg-btn' + (hall.entry.amt === v ? ' on' : '');
      btn.textContent = fmt(v);
      btn.onclick = function () { hall.entry.amt = v; renderHall(); };
      rE.appendChild(btn);
    });
    cE.appendChild(rE);
    var rEc = document.createElement('div'); rEc.className = 'cg-row';
    Object.keys(CUR).forEach(function (k) {
      var btn = document.createElement('button');
      btn.className = 'cg-btn' + (hall.entry.cur === k ? ' on' : '');
      btn.style.padding = '5px 10px'; btn.style.fontSize = '11px';
      btn.textContent = CUR[k].em + CUR[k].n;
      btn.onclick = function () { hall.entry.cur = k; renderHall(); };
      rEc.appendChild(btn);
    });
    cE.appendChild(rEc);
    var subE = document.createElement('div'); subE.className = 'cg-sub';
    subE.textContent = '开局每人都付一份进池（AI 补位也照付）：冠军 50% · 亚军 30% · 季军 20%（2 人局 70/30），抽水 5%。付什么币、赢什么币。';
    cE.appendChild(subE);

    /* ④ 开房 / 观战 / 加入 */
    var c3 = col('④ 开房 · 观战 · 单机');
    var r3 = document.createElement('div'); r3.className = 'cg-row';
    if (!hall.code) {
      r3.appendChild(mkBtn('pri', '🏠 开个房间', createRoom));
      r3.appendChild(mkBtn('', '🔑 加入房间', function () { var c = prompt('输入房号（4 位）'); if (c) joinRoom(String(c).trim().toUpperCase()); }));
      r3.appendChild(mkBtn('', '🎲 下场玩（单机直开）', function () { startGame(buildSetup(hall.game, hall.seats, hall.entry)); }));
    } else {
      r3.appendChild(mkBtn('', '📨 邀请好友', inviteFriend));
      r3.appendChild(mkBtn('', '🚪 离开房间', function () { if (global.Net && Net.connected()) Net.send({ t: 'roomLeave', code: hall.code }); hall.code = ''; hall.players = [{ u: meName(), n: me(), me: true }]; renderHall(); }));
      var startTxt = '▶️ 开始（我是房主）';
      if (!hall.isHost) startTxt = '⏳ 等房主开始';
      else if (hall.players.length < hall.seats) startTxt = '▶️ 开始（空位补 AI）';
      var b7 = mkBtn(hall.isHost ? 'pri' : '', startTxt, function () {
        if (hall.isHost && !hall.fillAi && hall.players.length < hall.seats) { toast('🚫 没勾「补 AI」就得等人坐满'); return; }
        var w = walletAll();
        if (!hall.players.slice(1).some(function (x) { return !x.u; }) && (w[hall.entry.cur] || 0) < hall.entry.amt) {
          toast('🚫 ' + CUR[hall.entry.cur].n + '不够付入场费，换个档位或币种'); return;
        }
        var st = buildSetup(hall.game, hall.seats, hall.entry);
        if (global.Net && Net.connected()) Net.send({ t: 'roomStart', code: hall.code, setup: st });
        startGame(st);
      });
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
    sub3.textContent = '本桌货币：' + CUR[g.cur].em + CUR[g.cur].n + '（押注三币通用，各币独立彩池）。观战席能押注、递纸条、领观战津贴；对局者专心打牌，不能押。';
    c3.appendChild(sub3);

    var fillCb = $('cg-fillai');
    if (fillCb) fillCb.onchange = function () { hall.fillAi = fillCb.checked; renderHall(); };

    renderActs([]);
  }

  function syncSeats() {
    hall.players = hall.players.slice(0, hall.seats);
    if (hall.code && global.Net && Net.connected()) Net.send({ t: 'roomSeats', code: hall.code, seats: hall.seats });
  }
  function createRoom() {
    if (global.Net && Net.connected()) {
      var u0 = curUser();
      Net.send({ t: 'roomCreate', game: hall.game, seats: hall.seats, outfit: (u0 && u0.outfit) || null });
      toast('🏠 正在开房…');
    } else {
      hall.code = 'LOCAL'; hall.isHost = true;
      toast('⚠️ 没连服务器，先单机开一局（AI 陪你）');
      renderHall();
    }
  }
  function joinRoom(code, watch) {
    if (!code) return;
    if (global.Net && Net.connected()) {
      var u1 = curUser();
      Net.send({ t: 'roomJoin', code: code, watch: watch ? 1 : 0, outfit: (u1 && u1.outfit) || null });
    } else toast('⚠️ 没连服务器，只能单机');
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
    Net.on('roomListRes', function (m) {
      if (!m) return;
      hall.rooms = m.rooms || [];
      if (hall.open && !G) renderHall();
    });
    Net.on('roomInfo', function (m) {
      if (!m || !m.room || m.room.game !== hall.game) { if (m && m.room) { hall.game = m.room.game; } else return; }
      var r = m.room;
      hall.code = r.code; hall.seats = r.seats || hall.seats;
      /* 服务端 roomPublic 一律给 me:false，客户端自己认领「哪一格是我」 */
      hall.players = (r.players || []).map(function (p) {
        return { u: p.u, n: p.n, me: p.u === meName(), outfit: p.outfit || null };
      });
      hall.isHost = r.host === meName();
      hall.game = r.game;
      if (hall.open) renderHall();
    });
    Net.on('roomStart', function (m) {
      if (!m || !m.setup) return;
      hall.game = m.game || hall.game; hall.seats = m.setup.seats || hall.seats;
      /* 十七更：观战者走观战席进场——看不到手牌，能押注能递纸条 */
      var asWatch = hall.watchMode && hall.watchCode === m.code;
      if (asWatch) { startGame(m.setup, { spectate: true }); return; }
      if (hall.open) startGame(m.setup);
      else { openHall(hall.game); startGame(m.setup); }
    });
    Net.on('roomErr', function (m) { toast('❌ ' + (m.msg || '房间操作失败')); });
  }

  /* ================= 发牌（UNO / 川麻 / 斗地主） ================= */
  function buildSetup(gameId, seats, entry) {
    var s = { game: gameId, seats: seats, seat: 0, seed: Date.now() };
    if (entry) s.entryFee = { amt: entry.amt, cur: entry.cur };
    s.aiLevel = hall.aiLevel || 3;
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
    G.bubbles = []; G._avBox = {};        /* 聊天气泡 + 头像框位置（气泡错位用） */
    G.unoDrew = false; G.unoDrewIdx = -1; /* UNO：本回合是否已抽过牌（没抽不许「过」） */
    startBubbleTimer();
    G.lastPlay = []; for (var lp = 0; lp < setup.seats; lp++) G.lastPlay.push(null);
    G.passed = []; for (var pp = 0; pp < setup.seats; pp++) G.passed.push(false);
    var LVN = AI_LEVELS[Math.max(0, Math.min(4, (setup.aiLevel || 3) - 1))];
    /* 陛下十七更钦定：牌桌上要「真名（位置称呼）」——得让人知道是谁；
       真人用昵称/账号名，AI 补位显示「AI·段位」，一眼分得清人机。 */
    G.names = []; G.real = []; G.ai = []; G.ailv = [];
    G.outfits = [];
    for (var i = 0; i < setup.seats; i++) {
      var hp = (hall.players || [])[i];
      var real = null, outfit = null, isAi = true;
      /* ⚠️ 「我自己」这一格必须走 curUser()：房间座位对象里 outfit 是 null，
         直接拿 hp.outfit 会把陛下的立绘抹成仓鼠（十七更踩过）。 */
      var mine = (i === 0 && !spectate) || !!(hp && hp.me);
      if (mine) { real = (hp && hp.n) || me(); outfit = (curUser() || {}).outfit || null; isAi = false; }
      else if (hp && hp.u) { real = hp.n || hp.u; outfit = hp.outfit || null; isAi = false; }
      if (isAi) { real = 'AI·' + LVN; outfit = null; }
      G.real.push(real);
      G.outfits.push(outfit);
      G.ai.push(isAi);
      G.ailv.push(isAi ? (setup.aiLevel || 3) : 0);
      G.names.push(AI_NAMES[i % AI_NAMES.length]);
    }
    var _pos = seatLabels(setup.seats, !spectate);
    /* 战报/提示语继续用位置称呼（「左上家 摸了一张」），牌桌名牌用真名 */
    if (setup.game !== 'flight') G.names = _pos.slice();
    G.labels = _pos.slice();
    G.aiLevel = setup.aiLevel || 3;
    touchTurn();
    if (setup.game === 'uno') {
      G.hands = setup.hands.map(function (h) { return h.slice(); });
      G.stock = (G_uno_stock || []).slice();
      G.pile = [G_uno_first || { color: 'r', shape: 's5' }];
      G.cur = G.pile[0].color; G.dir = 1;
    } else if (setup.game === 'mahjong') {
      var wall = setup.wall.slice();
      /* 十七更：开局就要理顺（万/条/筒 + 点数），不能等摸到第一张才顺 */
      G.hands = []; for (var i2 = 0; i2 < setup.seats; i2++) G.hands.push(mjSortHand(wall.splice(0, 13)));
      G.wall = wall; G.drawn = null; G.win = -1;
      /* 十七更：各家门口牌墙（视觉）——开局均分，谁摸牌谁家门前少一张 */
      var per = Math.ceil(wall.length / setup.seats);
      G.wallPer = []; for (var wp = 0; wp < setup.seats; wp++) G.wallPer.push(Math.min(per, wall.length - wp * per > 0 ? per : 0));
      /* 十七更续·川麻基础规则模板：
         lack=定缺那一门（手里这门打完了才能胡）
         melds=碰/杠的副露组   river=各家打出去的全部牌（牌河，按顺序摆在各家面前）
         pending=刚打出来的那张，等人碰/杠/胡   claimMine=我能做的事   mustDiscard=碰/杠后必须打一张 */
      G.phase = 'lack';
      G.lack = []; G.melds = []; G.river = [];
      for (var mj = 0; mj < setup.seats; mj++) { G.lack.push(null); G.melds.push([]); G.river.push([]); }
      G.pending = null; G.claimMine = []; G.mustDiscard = false; G.canKong = [];
      /* 二十一更：血战到底 + 番位账本
         hu[p]=已胡的结算信息（没胡是 null）  huOrder=胡牌先后顺序
         score[p]=实时盈亏（币）  mjBase=底注（杠/胡都按它翻番） */
      G.hu = []; G.huOrder = []; G.score = [];
      for (var hs = 0; hs < setup.seats; hs++) { G.hu.push(null); G.score.push(0); }
      G.mjBase = Math.max(20, Math.round((G.entry ? G.entry.amt : 500) * 0.1));
      /* AI 立刻定缺（选手里最少的那一门），玩家自己点按钮选 */
      for (var al = 1; al < setup.seats; al++) G.lack[al] = mjAiLack(G.hands[al]);
      cgLog('🀄 川麻开局：先定缺（手里那一门打光了才能胡）· 血战到底（胡了不退场，打到只剩一家）· 底注 ' + fmt(G.mjBase));
    } else if (setup.game === 'flight') {
      G.colors = setup.colors;
      G.planes = setup.colors.map(function () { return [-1, -1, -1, -1]; });
      G.dice = 0; G.turn = 0; G.pick = -1; G.skipFlag = {}; G.againFlag = false;
      G.fate = flDeck20(); G.evdeck = shuffle(flDeck32());
      G.lastFate = ''; G.lastEvent = '';
      /* 飞行棋：社名 + 真名（陛下要「知道是谁」） */
      G.names = G.colors.map(function (c, p) {
        return FL_SOC[c] + '社·' + (G.real[p] || '？');
      });
    } else if (setup.game === 'doudizhu') {
      G.hands = setup.deal.hands.map(function (h) { return h.slice(); });
      G.bottom = setup.deal.bottom.slice();
      G.landlord = -1; G.last = null; G.lastBy = -1; G.bidPass = 0; G.phase = 'bid'; G.mult = 1;
      G.hands[0] = G.hands[0].sort(function (a, b) { return b.v - a.v; });
    }
    /* 十七更：入场费——开局每座一份进池（AI 照付），打完按名次分账
       ⚠️ 必须放在各局数据建完之后：walletAdd() 会调 renderHud()，
       那时 renderHud 要读 G.stock/G.wall/G.colors——早一步就是 undefined，
       一抛异常后面 initBet/drawGame 全被吞掉，整张牌桌画不出来（十七更踩过）。 */
    /* 二十二更：本局账本先建好——开局前余额留底，打完结算面板照它算「赢了多少/亏了多少」 */
    G.settle = { bal0: walletAll(), by: {}, rankPay: [] };
    if (setup.entryFee && setup.entryFee.amt > 0) {
      var ef = setup.entryFee;
      G.entry = { amt: ef.amt, cur: ef.cur, mine: !spectate };
      if (!spectate) {
        var w0 = walletAll();
        if ((w0[ef.cur] || 0) >= ef.amt) { walletAdd(ef.cur, -ef.amt); stAcc(ef.cur, 'entryPaid', ef.amt); }
        else { G.entry.mine = false; cgLog('⚠️ 入场费没付上（' + CUR[ef.cur].n + '不够），这局赢不了分账'); }
      }
      cgLog('🎟 入场费 ' + CUR[ef.cur].em + fmt(ef.amt) + ' × ' + setup.seats + ' 人入池（95% 按名次分）');
    } else G.entry = null;
    initBet();
    $('cg-body').style.display = 'none';
    $('cg-canvas').style.display = '';
    $('cg-tip').style.display = '';
    $('cg-acts').style.display = '';
    $('cg-quit').style.display = '';
    _actsKey = '';
    closeMjResult();                    /* 二十一更：开新局把上一局的结算面板收掉 */
    /* 十九更续：开局标题切到「对局中」——别再挂着「等待位面 · 还没开房」 */
    var gTop = GAMES[setup.game];
    $('cg-tt').textContent = gTop.em + ' ' + gTop.name + (spectate ? ' · 观战中' : ' · 对局中');
    $('cg-st').textContent = gTop.place + (hall.code ? ' · 房号 ' + hall.code : ' · 单机快局');
    resizeCanvas();
    /* 大屏展开左右栏（openHall 里收起过），手机保持抽屉（机型适配） */
    var wide2 = window.innerWidth > 880;
    /* 十七更续：大屏两条侧栏一起开（陛下钦定默认两个都开） */
    $('cg-left').classList.toggle('open', wide2);
    $('cg-right').classList.toggle('open', wide2);
    if (global.syncRailBtns) global.syncRailBtns();
    _leftKey = '';
    cgLog('🎬 开局' + (spectate ? '（观战席视角）' : '') + ' · 押注窗 ' + Math.round(BET_WINDOW_MS / 1000) + ' 秒');
    drawGame();
    renderRails();
    scheduleAI();
    startTick();
  }
  function resizeCanvas() {
    var cv = $('cg-canvas'); if (!cv) return;
    var w = cv.clientWidth, h = cv.clientHeight;
    /* ⚠️ 十七更拉伸根因：量不到（display:none 刚切回来 / 布局没刷）绝不能 fallback 到
       window.innerWidth——位图 1103 塞进 673 的盒子，整张牌桌横向压扁。量不到就等下一帧。 */
    if (!w || !h) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cv._dpr = dpr;
  }
  /* 每帧自愈：位图尺寸和 CSS 盒子对不上就立刻重设（谁错谁改不纠结） */
  function syncCanvas() {
    var cv = $('cg-canvas'); if (!cv) return false;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.round((cv.clientWidth || 0) * dpr), H = Math.round((cv.clientHeight || 0) * dpr);
    if (W && H && (cv.width !== W || cv.height !== H)) { cv.width = W; cv.height = H; cv._dpr = dpr; }
    return true;
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
    _seatHits = [];
    syncCanvas();
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
    /* 十七更：当前回合指针 + 倒计时条（陛下要的：中间有指针指着谁在出牌 + 高亮 + 倒计时） */
    if (!G.over && !G.spectate) drawTurnBar(c, W, H);
    var turnTxt = G.over ? ('🏁 ' + G.over) : (G.msg || ('轮到：' + (G.names[G.turn] || '—')));
    $('cg-tip').textContent = turnTxt + '　' + (G.over ? ('（结算面板已弹出 · 点「再来一局」重开）') : tipText());
    renderActs(actionDefs());
    /* 聊天气泡画在最后一层：泡是浮在最上面的，谁都压不住它 */
    drawBubbles(c, W, H);
    renderHud();
  }
  /* 回合倒计时：20 秒想不完就替你出（自动摸/自动传/自动压/自动掷） */
  var TURN_MS = 20000;
  /* 换人就清：UNO 的「抽过牌」标记每回合只能有一次（标准规则：没得出→抽一张→还出不了才过） */
  function touchTurn() { if (G) { G.turnAt = Date.now(); G.unoDrew = false; G.unoDrewIdx = -1; } }
  function turnLeftSec() { return Math.max(0, Math.ceil((TURN_MS - (Date.now() - (G.turnAt || Date.now()))) / 1000)); }
  function drawTurnBar(c, W, H) {
    var myTurn = G.turn === 0;
    var frac = Math.max(0, Math.min(1, 1 - (Date.now() - (G.turnAt || Date.now())) / TURN_MS));
    var name = G.names[G.turn] || '';
    var pu = pulse();
    var label = myTurn ? '⏱ 你的回合 ' + turnLeftSec() + 's' : '▶ ' + name + ' 回合中';
    var bw2 = 300, bx2 = W / 2 - bw2 / 2;
    /* 呼吸底色：谁回合谁的条亮 */
    c.fillStyle = 'rgba(0,0,0,' + (0.42 + 0.12 * pu) + ')';
    c.fillRect(bx2, 6, bw2, 24);
    c.strokeStyle = myTurn ? 'rgba(255,209,102,' + (0.5 + 0.5 * pu) + ')' : 'rgba(255,255,255,.25)';
    c.lineWidth = 1.6;
    c.strokeRect(bx2, 6, bw2, 24);
    c.fillStyle = myTurn ? '#ffd166' : 'rgba(255,255,255,.85)';
    c.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center';
    c.fillText(label, W / 2, 23);
    c.fillStyle = myTurn ? 'rgba(255,209,102,.9)' : 'rgba(255,255,255,.35)';
    c.fillRect(bx2, 31, bw2 * frac, 3.5);
    /* 大指针：指着当前回合那位（左箭头=逆时针那侧，右箭头=顺时针那侧，按座位方向） */
    if (!myTurn) {
      c.fillStyle = 'rgba(255,209,102,' + (0.45 + 0.55 * pu) + ')';
      c.font = 'bold 17px sans-serif'; c.textAlign = 'left';
      c.fillText('➤', bx2 - 26, 24);
      c.textAlign = 'right'; c.fillText('◀', bx2 + bw2 + 26, 24);
    }
  }
  /* 超时托管：轮到真人但 20 秒没动静 → 替他打 */
  function autoPlayFor() {
    if (!G || G.over || G.spectate || G.ai[G.turn]) return;
    var t = G.turn;
    cgLog('⏰ ' + (t === 0 ? '你' : G.names[t]) + ' 超时，系统代打一手');
    if (G.game === 'uno') { unoDraw(); if (G.turn === t && !G.over) { advance(1); drawGame(); scheduleAI(); } }
    else if (G.game === 'mahjong') { if (!G.drawn) mjDraw(); if (G.drawn) mjDiscard(rnd(G.hands[0].length + 1)); }
    else if (G.game === 'flight') { flRollAuto(); }
    else if (G.game === 'doudizhu') {
      if (G.phase === 'bid') { G.bidPass++; if (G.bidPass >= G.seats) { G.landlord = rnd(G.seats); ddTakeBottom(); } else { G.turn = (t + 1) % G.seats; touchTurn(); scheduleAI(); } drawGame(); }
      else {
        var hit = G.lastBy === 0 || !G.last ? null : ddFindBeat(G.hands[0], G.last);
        if (hit) ddDoPlay(0, hit.cards, hit.cb);
        else if (G.lastBy === 0 || !G.last) { var h = G.hands[0]; ddDoPlay(0, [h[h.length - 1]], ddCombo([h[h.length - 1]])); }
        else ddPass();
      }
    }
    touchTurn();
  }
  /* 飞行棋托管掷骰：掷完自动选第一架可动的 */
  function flRollAuto() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    G.dice = 1 + rnd(6);
    G.pick = -1; G.options = null;
    G.lastPlay[0] = [{ kind: 'dice', n: G.dice }];
    var opts = flMoves(0, G.dice);
    if (!opts.length) { G.msg = '我 掷了 ' + G.dice + '，没艺人可动'; flNext(0); drawGame(); scheduleAI(); return; }
    flMove(0, opts[0], G.dice);
  }
  function tipText() {
    if (G.game === 'uno') {
      if (G.pendingWild) return '⚫ 黑牌！由你指定下一家要跟的颜色——点下面四个「◯色」按钮选一门。';
      if (G.unoDrew) return '🂠 抽完一张了：抽到的能出就点「✋ 打出刚抽的」，出不了就点「⏭ 过」交给下家。';
      return '锋线速演：点通告单出牌（同色/同数字/功能牌）；一张都出不了就「🂠 抽一张」——UNO 没有"过"，必须抽！剩 1 张记得官宣！';
    }
    if (G.game === 'mahjong') return '防线长议：接令一张传令一张，凑 4 组面子 + 1 对将就能结案，也能凑连环计（七对）。';
    if (G.game === 'flight') return '永恒王座：掷 6 才能出道，绕外环一圈从 ↵ 归航、精确点数登上 ♛。落 ★ 翻事件卡，落 ✈ 冲航线翻命运卡。';
    return '坐庄：先抢筹坐庄（吃 3 张暗料），再轮流出牌压上家（顺子/连对/黑天鹅…），庄家 vs 两家散户，谁先出完谁赢。';
  }
  /* ⚠️ 按钮每帧都会被调用重建——陛下要「当前回合闪烁」就得高频重绘，
     若每次都 innerHTML='' 会把陛下正要按的按钮抽走（点击丢失）。签名没变就不重建。 */
  var _actsKey = '';
  function renderActs(defs) {
    var box = $('cg-acts'); if (!box) return;
    var key = (defs || []).map(function (d) { return d.label + (d.disabled ? '!' : '') + (d.pri ? '*' : ''); }).join('|');
    if (key === _actsKey && box.children.length) return;
    _actsKey = key;
    box.innerHTML = '';
    (defs || []).forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'cg-btn' + (d.pri ? ' pri' : '');
      b.textContent = d.label; b.disabled = !!d.disabled;
      b.onclick = d.fn;
      box.appendChild(b);
    });
  }
  /* 当前回合的呼吸脉冲（0..1），全场共用同一节拍，看着才统一 */
  function pulse() { return 0.5 + 0.5 * Math.sin((Date.now() % 1100) / 1100 * 6.2832); }
  function actionDefs() {
    var out = [];
    if (G.over) {
      out.push({ label: '🔄 再来一局', pri: true, fn: function () { var sp = G.spectate; var en = G.entry ? { amt: G.entry.amt, cur: G.entry.cur } : null; startGame(buildSetup(G.game, G.seats, en), { spectate: sp }); } });
      return out;
    }
    if (G.spectate) return out;   /* 观战席：只看不摸 */
    if (G.game === 'uno') {
      /* ⚠️ UNO 没有「过」这个动作——手里出不了就必须抽一张。
         只有抽完牌之后「过」才合法（抽到的也出不了，才交给下家）。 */
      if (!G.unoDrew) {
        out.push({ label: '🂠 抽一张（没得出就抽）', pri: true, fn: unoDraw });
        out.push({
          label: '⏭ 过（要先抽牌）', disabled: true,
          fn: function () { toast('🚫 UNO 里没牌出是「必须抽一张」，不是「过」——先抽！'); }
        });
      } else {
        var dc = G.hands[0][G.unoDrewIdx];
        if (dc && unoPlayable(dc)) {
          out.push({ label: '✋ 打出刚抽的「' + unoCardName(dc) + '」', pri: true, fn: function () { unoPlay(G.unoDrewIdx); } });
        }
        out.push({ label: '⏭ 过（抽完也出不了，交给下家）', fn: unoPass });
      }
      if (G.pendingWild) {
        ['r', 'y', 'g', 'b'].forEach(function (col) {
          out.push({ label: FL_SOC[col] + '色', pri: true, fn: function () { unoPickColor(col); } });
        });
      }
    } else if (G.game === 'mahjong') {
      if (G.phase === 'lack') {
        /* ① 定缺：先选一门不要，手里这门打光了才能胡 */
        ['wan', 'tiao', 'tong'].forEach(function (s) {
          out.push({ label: '✂️ 定缺 ' + MJ_SUIT_N[s], pri: true, fn: function () { mjSetLack(0, s); } });
        });
      } else if (G.pending && G.claimMine.length) {
        /* ② 别人打牌，我能碰 / 杠 / 胡 */
        if (G.claimMine.indexOf('win') >= 0) out.push({ label: '🀄 胡！', pri: true, fn: function () { mjDoClaim(0, 'win', G.pending.tile, G.pending.from); } });
        if (G.claimMine.indexOf('kong') >= 0) out.push({ label: '🀄 杠！', pri: true, fn: function () { mjDoClaim(0, 'kong', G.pending.tile, G.pending.from); } });
        if (G.claimMine.indexOf('pong') >= 0) out.push({ label: '🀄 碰！', pri: true, fn: function () { mjDoClaim(0, 'pong', G.pending.tile, G.pending.from); } });
        out.push({ label: '🙅 过', fn: mjPass });
      } else {
        /* ③ 自己摸牌：能自摸就自摸，能暗杠/补杠就杠，否则打一张 */
        if (G.canWin) out.push({ label: '🀄 自摸结案！', pri: true, fn: mjWinDo });
        (G.canKong || []).forEach(function (kk) {
          var t = mjTileOf(0, kk.k);
          out.push({
            label: '🀄 ' + (kk.type === 'bu' ? '补杠 ' : '暗杠 ') + (t ? MJ_SUIT_N[t.suit] + t.rank : ''),
            fn: function () { mjDoKong(kk); }
          });
        });
        /* 二十一更（陛下钦定）：底栏不再塞「接令」按钮——轮到我自动摸牌，
           按钮挡住手牌看得见摸不着。打牌直接点手牌那一张。 */
        if (!G.drawn && !G.mustDiscard) out.push({ label: '🎴 自动接令中…', disabled: true, fn: function () { } });
      }
    } else if (G.game === 'flight') {
      out.push({ label: '🎲 掷骰', pri: true, disabled: G.turn !== 0 || !!G.over, fn: flRoll });
    } else if (G.game === 'doudizhu') {
      if (G.phase === 'bid') {
        out.push({ label: '💰 满仓坐庄', pri: true, fn: function () { G.landlord = 0; ddTakeBottom(); } });
        out.push({ label: '🙅 不坐', fn: function () { G.bidPass++; if (G.bidPass >= G.seats) { G.landlord = rnd(G.seats); ddTakeBottom(); } else { G.turn = 1; touchTurn(); scheduleAI(); } drawGame(); } });
      } else {
        out.push({ label: '⬆️ 出牌', pri: true, fn: ddPlay });
        out.push({ label: '💡 提示', fn: ddHint });
        out.push({ label: '⏭ 过', fn: ddPass });
        out.push({ label: '🧹 清空选择', fn: function () { G.sel = []; drawGame(); } });
      }
    }
    /* 二十一更（陛下钦定）：「再来一局」只在对局结束后才出现——打牌过程中它挡手牌 */
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
    /* ⚠️ 十七更：手牌是叠着画的，右边的牌压在左边上面——必须从右往左命中，
       否则点到的永远是底下那张（陛下反馈：斗地主牌面点击不准确）。 */
    for (var i = n - 1; i >= 0; i--) {
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
  /* ---------- 座位头像（个人页面那身行头的小立绘，陛下钦定） ---------- */
  /* 座位头像命中区（点头像报身份用），每次 drawGame 前清空 */
  var _seatHits = [];
  /* 飞行棋棋盘上的棋子命中区（十七更续：点棋子出动 / 点棋子走，不再只有底栏那一排） */
  var _flHits = [];
  /* AI 补位没有行头 → 画仓鼠占位头像（陛下钦定），底下带段位小字 */
  var _aiAv = {};
  function aiAvatar(lv) {
    var L = Math.max(0, Math.min(4, (lv || 3) - 1));
    if (_aiAv[L]) return _aiAv[L];
    var cv = document.createElement('canvas'); cv.width = 40; cv.height = 54;
    var c = cv.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(0, 0, 40, 54);
    c.strokeStyle = 'rgba(255,209,102,.45)'; c.lineWidth = 1; c.strokeRect(.5, .5, 39, 53);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '26px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    c.fillText('🐹', 20, 23);
    c.font = 'bold 8px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = '#ffd166';
    c.fillText(lv > 0 ? AI_LEVELS[L] : '我', 20, 45);
    _aiAv[L] = cv;
    return cv;
  }
  var _avCache = {};
  function seatAvatar(outfit, lv) {
    if (!outfit || typeof outfit !== 'object' || !global.drawCharacter) return aiAvatar(lv || 3);
    var sig;
    try { sig = JSON.stringify(outfit); } catch (e) { return null; }
    if (_avCache[sig]) return _avCache[sig];
    var cv = document.createElement('canvas'); cv.width = 40; cv.height = 54;
    try { global.drawCharacter(cv.getContext('2d'), 20, 51, outfit, 1, 0, Math.min(40 / 120, 54 / 130) * 1.12); } catch (e) { return null; }
    _avCache[sig] = cv;
    if (Object.keys(_avCache).length > 40) _avCache = {};
    return cv;
  }
  function drawMyAvatar(c, W, H, textY) {
    if (!G || G.spectate) return;
    var av = seatAvatar((curUser() || {}).outfit, 0);
    if (!av) return;
    c.drawImage(av, W / 2 - 96, textY - 40, 30, 40);
  }
  /* 「过」标记（十七更续：过了就别再显示上一回合的牌，直接挂徽章） */
  function markPass(p) {
    if (!G) return;
    G.passed = G.passed || [];
    G.passed[p] = true;
    if (G.lastPlay) G.lastPlay[p] = null;
  }
  function clearPass() {
    if (!G || !G.passed) return;
    for (var i = 0; i < G.passed.length; i++) G.passed[i] = false;
  }
  /* 牌桌名牌：陛下十七更钦定——真名要看得见（知道是谁），位置称呼跟在括号里 */
  function seatTitle(p) {
    if (!G) return '';
    var r = (G.real && G.real[p]) || (G.names && G.names[p]) || '？';
    if (G.game === 'flight') return FL_SOC[G.colors[p]] + '社·' + r;
    return r + '（' + ((G.labels && G.labels[p]) || '？') + '）';
  }
  /* 陛下钦定：牌桌上绝不出现真人名——位置称呼（真名只在个人页面） */
  function seatLabels(n, hasMe) {
    var two = ['上家'], three = ['左上家', '右上家'], four = ['左上家', '上家', '右上家'];
    var rest = n === 2 ? two : (n === 3 ? three : four);
    var out = hasMe ? ['我'] : ['对面家'];
    return out.concat(rest).slice(0, n);
  }
  function seatAnchors(n) {
    if (n <= 2) return [{ x: .5, y: .05, a: 'c' }];
    if (n === 3) return [{ x: .17, y: .06, a: 'l' }, { x: .83, y: .06, a: 'r' }];
    return [{ x: .06, y: .15, a: 'l' }, { x: .5, y: .035, a: 'c' }, { x: .94, y: .15, a: 'r' }];
  }
  /* 座位布局（绘制与命中共用一份，十七更续重写）
     ⚠️ 陛下钦定：出牌一律摆在「朝牌桌中央」的一侧——
        左家的牌摆右边、右家的牌摆左边、正对家的牌摆手牌下方。 */
  function seatLayout(p, an, W, H, cw, ch, deck) {
    var hand = G.hands ? G.hands[p] : null;
    var cnt = hand ? Math.min(hand.length, 12) : 0;
    var mw = cw * 0.5, mh = ch * 0.5, gap = mw * 0.32;   /* 十七更续：对手的牌做大一号 */
    var fanW = cnt ? (cnt - 1) * gap + mw : 0;
    /* 川麻将：牌河是「这一家打出去的全部牌」，按顺序摆在自家面前（十七更续）
       十九更：牌河已改画到中央（drawMjRiver）——座位旁只放大「刚打的那一张」，
       所以 mahjong 路径只按最后一张算宽度，手牌行不再被整条牌河撑得漂移。 */
    var played = (G.river && G.river[p] && G.river[p].length) ? G.river[p].slice(-8) : ((G.lastPlay && G.lastPlay[p]) || []);
    if (deck === 'mahjong') played = played.length ? [played[played.length - 1]] : [];
    var pw = played.length ? Math.min(cw * (G.spectate ? 0.92 : 0.78), W * 0.34 / Math.max(played.length, 1)) : 0;
    var ph = pw * 1.42, pstep = pw * 0.78;
    var playW = played.length ? (played.length - 1) * pstep + pw : 0;
    var below = (an.a === 'c');                  /* 正对家：出牌摆手牌下方，直接怼到牌桌中央 */
    var playAtLeft = (an.a === 'r');             /* 右家：出牌摆手牌左边 */
    var rowW = below ? Math.max(fanW, playW) : fanW + (played.length ? 10 + playW : 0);
    var rowX = an.a === 'l' ? 14 : an.a === 'r' ? W - 14 - rowW : W * an.x - rowW / 2;
    var handX = below ? rowX + (rowW - fanW) / 2 : (playAtLeft ? rowX + rowW - fanW : rowX);
    var playX = below ? rowX + (rowW - playW) / 2 : (playAtLeft ? rowX : rowX + fanW + 10);
    var nameY = an.y * H + 12;
    var handY = nameY + 7;
    var playY = below ? handY + mh + 8 : handY - (ph - mh) / 2;
    return {
      hand: hand, cnt: cnt, played: played, mw: mw, mh: mh, gap: gap, fanW: fanW,
      pw: pw, ph: ph, pstep: pstep, playW: playW, rowW: rowW, rowX: rowX,
      handX: handX, playX: playX, handY: handY, playY: playY, nameY: nameY,
      below: below, playAtLeft: playAtLeft
    };
  }
  /* 第一趟：光框 + 头像 + 名牌 + 手牌背面（全部画完再画第二趟的出牌，出牌才压在最上面） */
  function drawSeat(c, p, an, W, H, deck, cw, ch, extra) {
    var L = seatLayout(p, an, W, H, cw, ch, deck);
    var played = L.played, mw = L.mw, mh = L.mh, gap = L.gap;
    var isTurn = (G.turn === p && !G.over);
    var pu = pulse();
    var boxH = mh + (L.below ? L.ph + 16 : 34);
    /* 十七更：当前回合座位呼吸光框（全场最亮的就是正在打牌的人） */
    if (isTurn) {
      c.save();
      c.strokeStyle = 'rgba(255,209,102,' + (0.35 + 0.55 * pu).toFixed(3) + ')';
      c.lineWidth = 2 + pu * 2;
      c.strokeRect(L.rowX - 8, an.y * H - 4, Math.max(L.rowW + 16, 120), boxH);
      c.restore();
    }
    /* 座位头像（联机房间带来的一身行头） */
    var av = seatAvatar(G.outfits && G.outfits[p], G.ailv && G.ailv[p]);
    var nameX = an.a === 'l' ? 14 : an.a === 'r' ? W - 14 : W * an.x;
    if (av) {
      var avW = 30, avH = 40, avx, avy = an.y * H - 4;
      if (an.a === 'l') { avx = 14; nameX = 14 + avW + 8; }
      else if (an.a === 'r') { avx = W - 14 - avW; nameX = W - 14 - avW - 8; }
      else { avx = W * an.x - avW - 18; }
      c.drawImage(av, avx, avy, avW, avH);
      _seatHits.push({ x: avx, y: avy, w: avW, h: avH, p: p });
      /* 头像框位置记一份：聊天气泡要挂在它旁边（错位用，不然泡会乱飘） */
      if (!G._avBox) G._avBox = {};
      G._avBox[p] = { x: avx, y: avy, w: avW, h: avH };
      if (isTurn) {
        c.strokeStyle = 'rgba(255,209,102,' + (0.4 + 0.5 * pu).toFixed(3) + ')'; c.lineWidth = 2;
        c.strokeRect(avx - 2, avy - 2, avW + 4, avH + 4);
      }
    }
    c.fillStyle = isTurn ? '#ffd166' : 'rgba(255,255,255,.88)';
    c.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = an.a === 'l' ? 'left' : an.a === 'r' ? 'right' : 'center';
    c.fillText((isTurn ? '▶ ' : '') + seatTitle(p) + (extra || '') + (L.hand ? ' · ' + L.hand.length + ' 张' : ''), nameX, L.nameY);
    for (var k = 0; k < L.cnt; k++) SK.drawBack(c, deck, L.handX + k * gap, L.handY, mw, mh);
    /* 十七更续：「过」要有明显文字提示——盖住旧牌，直接写大字 */
    if (G.passed && G.passed[p]) {
      var mk = L.below ? L.rowX + (L.rowW - 46) / 2 : (L.playAtLeft ? L.rowX : L.rowX + L.rowW - 46);
      drawPassMark(c, mk, L.handY - 4, 46, Math.max(22, mh * 0.62), pu);
    }
  }
  /* 第二趟：只画出牌——所有座位的手牌背面都画完之后再画，出牌永远压在最上层
     （十七更续：之前出牌被隔壁座位的牌背盖住，陛下直接点名了） */
  function drawSeatPlayed(c, p, an, W, H, deck, cw, ch) {
    if (!G || G.passed && G.passed[p]) return;
    var L = seatLayout(p, an, W, H, cw, ch);
    if (!L.played.length) return;
    for (var j = 0; j < L.played.length; j++) {
      SK.drawCard(c, deck, L.played[j], L.playX + j * L.pstep, L.playY, L.pw, L.ph, {});
    }
  }
  /* 「过」徽章：红灰圆角块 + 大字，谁都能一眼看见 */
  function drawPassMark(c, x, y, w, h, pu) {
    c.save();
    c.fillStyle = 'rgba(120,26,34,.92)';
    c.strokeStyle = 'rgba(255,120,120,' + (0.55 + 0.35 * pu).toFixed(3) + ')';
    c.lineWidth = 2;
    var r = 6;
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd9d9';
    c.font = 'bold ' + Math.round(Math.min(15, h * 0.62)) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('过', x + w / 2, y + h / 2 + 1);
    c.restore();
  }
  /* ---------- 聊天气泡（十七更续） ----------
     陛下钦定：除了右下悬浮聊天框，桌上的话还要在「说话那个人头像旁边」冒一个泡，
     显示 5 秒。关键是要错位——不许压住牌面。
     错位规则：左家的泡往右下飘、右家的泡往左下飘、正对家的泡顶在头像正上方、
     我自己的泡贴在手牌上方偏左。谁的泡都不许盖住谁的牌。 */
  var CG_BUB_MS = 5000;
  var _bubTimer = null;
  function cgSeatOfName(nm) {
    if (!G) return -1;
    nm = String(nm || '').trim(); if (!nm) return -1;
    for (var p = 0; p < G.seats; p++) {
      if (G.real && G.real[p] === nm) return p;
      if (G.names && G.names[p] && G.names[p].indexOf(nm) >= 0) return p;
    }
    return -1;
  }
  function cgBubble(p, text) {
    if (!G || p < 0) return;
    text = String(text || '').trim(); if (!text) return;
    G.bubbles = G.bubbles || [];
    G.bubbles.push({ p: p, text: text.slice(0, 22), until: Date.now() + CG_BUB_MS });
    while (G.bubbles.length > 6) G.bubbles.shift();
    drawGame();
  }
  /* 气泡过期要有东西去擦——不然 5 秒到了泡还赖在桌上不走 */
  function startBubbleTimer() {
    if (_bubTimer) return;
    _bubTimer = setInterval(function () {
      if (!G || !G.bubbles || !G.bubbles.length) return;
      var now = Date.now(), n = G.bubbles.length;
      G.bubbles = G.bubbles.filter(function (b) { return b.until > now; });
      if (G.bubbles.length !== n) drawGame();
    }, 260);
  }
  function stopBubbleTimer() { if (_bubTimer) { clearInterval(_bubTimer); _bubTimer = null; } }
  function drawBubbles(c, W, H) {
    if (!G || !G.bubbles || !G.bubbles.length) return;
    var now = Date.now(), ans = seatAnchors(G.seats);
    var fs = 12, pad = 8, lh = fs + pad * 2 - 2;
    c.save();
    for (var i = 0; i < G.bubbles.length; i++) {
      var b = G.bubbles[i];
      var life = b.until - now; if (life <= 0) continue;
      var al = Math.min(1, life / 600);          /* 最后 0.6 秒淡出，别硬消失 */
      var box = (G._avBox && G._avBox[b.p]) || null;
      var an = b.p > 0 ? ans[b.p - 1] : null;
      c.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      var bw = Math.min(c.measureText(b.text).width + pad * 2, W * 0.44);
      var bx, by, tail;
      if (box && an) {
        if (an.a === 'l') { bx = box.x + box.w + 10; by = box.y + box.h + 6; tail = 'tl'; }
        else if (an.a === 'r') { bx = box.x - 10 - bw; by = box.y + box.h + 6; tail = 'tr'; }
        else { bx = box.x + box.w / 2 - bw / 2; by = box.y - 8 - lh; tail = 'b'; }
      } else {
        /* 我自己（p=0）在底部手牌区：泡贴在手牌上方偏左，绝不压中间牌堆 */
        bx = W * 0.18; by = H - 138; tail = 'b';
      }
      if (bx < 6) bx = 6;
      if (bx + bw > W - 6) bx = W - 6 - bw;
      if (by < 4) by = 4;
      if (by + lh > H - 4) by = H - 4 - lh;
      /* 泡身 */
      c.globalAlpha = al;
      c.fillStyle = 'rgba(28,20,46,.94)';
      c.strokeStyle = 'rgba(255,209,102,.75)';
      c.lineWidth = 1.5;
      var r = 8;
      c.beginPath();
      c.moveTo(bx + r, by); c.lineTo(bx + bw - r, by); c.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
      c.lineTo(bx + bw, by + lh - r); c.quadraticCurveTo(bx + bw, by + lh, bx + bw - r, by + lh);
      c.lineTo(bx + r, by + lh); c.quadraticCurveTo(bx, by + lh, bx, by + lh - r);
      c.lineTo(bx, by + r); c.quadraticCurveTo(bx, by, bx + r, by);
      c.closePath(); c.fill(); c.stroke();
      /* 小尖角：指着说话那个人 */
      c.fillStyle = 'rgba(28,20,46,.94)';
      c.beginPath();
      if (tail === 'tl') { c.moveTo(bx, by + 3); c.lineTo(bx - 8, by - 3); c.lineTo(bx + 9, by + 1); }
      else if (tail === 'tr') { c.moveTo(bx + bw, by + 3); c.lineTo(bx + bw + 8, by - 3); c.lineTo(bx + bw - 9, by + 1); }
      else { c.moveTo(bx + bw / 2 - 6, by + lh); c.lineTo(bx + bw / 2 + 6, by + lh); c.lineTo(bx + bw / 2, by + lh + 7); }
      c.closePath(); c.fill();
      c.fillStyle = '#ffe9b8';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(b.text, bx + pad, by + lh / 2 + 0.5);
      c.globalAlpha = 1;
    }
    c.restore();
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
    for (var pu2 = 1; pu2 < G.seats; pu2++) drawSeatPlayed(c, pu2, ans[pu2 - 1], W, H, 'uno', cw, ch);
    var pw2 = Math.round(cw * 0.86), ph2 = Math.round(ch * 0.86);
    var px = W / 2 - pw2 / 2, py = H * 0.30;
    /* 十七更：通告池顶永远亮真实牌面（UNO 牌堆顶是公开信息，观战也看得见） */
    SK.drawCard(c, 'uno', G.pile[G.pile.length - 1], px, py, pw2, ph2, {});
    /* 方向指示（陛下要的：顺/逆一眼看清）——牌堆右侧画旋转箭头 */
    var dcx = px + pw2 + 34, dcy = py + ph2 * 0.42, dr = Math.max(12, cw * 0.16);
    c.strokeStyle = '#ffd166'; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath();
    if (G.dir === 1) c.arc(dcx, dcy, dr, -0.5, 3.6);
    else c.arc(dcx, dcy, dr, 3.64, 0.5 + 6.2832);
    c.stroke();
    { /* 箭头头 */
      var ea = G.dir === 1 ? 3.6 : 0.5;
      var hx = dcx + Math.cos(ea) * dr, hy = dcy + Math.sin(ea) * dr;
      var tang = ea + (G.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
      c.beginPath();
      c.moveTo(hx + Math.cos(tang) * 7, hy + Math.sin(tang) * 7);
      c.lineTo(hx + Math.cos(tang + 2.4) * 7, hy + Math.sin(tang + 2.4) * 7);
      c.lineTo(hx + Math.cos(tang - 2.4) * 7, hy + Math.sin(tang - 2.4) * 7);
      c.closePath(); c.fillStyle = '#ffd166'; c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,.82)'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
    c.fillText(G.dir === 1 ? '顺时针' : '逆时针', dcx, dcy + dr + 15);
    c.fillStyle = UNO_COL[G.cur] || '#fff';
    c.beginPath(); c.arc(dcx, dcy + dr + 32, 8, 0, 6.2832); c.fill();
    c.fillStyle = 'rgba(255,255,255,.82)'; c.font = '12px sans-serif';
    c.fillText('通告池 ' + G.stock.length, dcx, dcy + dr + 52);
    drawMyPlayed(c, 'uno', W, H, cw, ch, H - ch - 16);
    if (!G.spectate) {
      drawHandRow(c, G.hands[0], W, H, cw, ch, H - ch - 16, null, 'uno', null);
      drawMyAvatar(c, W, H, H - 6);
      c.fillStyle = (G.turn === 0 && !G.over) ? '#ffd166' : 'rgba(255,255,255,.88)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + seatTitle(0) + ' · ' + G.hands[0].length + ' 张通告', W / 2, H - 6);
    } else {
      var g0 = handGeom(Math.min(G.hands[0].length, 12), cw * 0.6, W);
      for (var k = 0; k < Math.min(G.hands[0].length, 12); k++) SK.drawBack(c, 'uno', g0.x0 + k * g0.step, H - ch * 0.6 - 14, cw * 0.6, ch * 0.6);
      c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(seatTitle(0) + ' · ' + G.hands[0].length + ' 张通告', W / 2, H - 6);
    }
  }
  function unoPlayable(card) {
    var top = G.pile[G.pile.length - 1];
    if (card.shape === 'wild' || card.shape === 'wild4') return true;
    if (card.color === G.cur) return true;
    return card.shape === top.shape;
  }
  function advance(n) { for (var i = 0; i < n; i++) G.turn = (G.turn + G.dir + G.seats) % G.seats; touchTurn(); }
  function unoPlay(i) {
    if (G.turn !== 0 || G.over || G.spectate) return;
    var card = G.hands[0][i];
    if (!card || !unoPlayable(card)) { toast('🚫 这张出不了（要同色 / 同数字 / 换赛道）'); return; }
    G.hands[0].splice(i, 1); G.pile.push(card); G.cur = card.color; G.lastPlay[0] = [card]; clearPass();
    G.unoDrew = false; G.unoDrewIdx = -1;   /* 出掉就不再是「抽完待决」状态 */
    if (card.shape === 'skip') cgLog('📸 ' + G.names[0] + ' 打出「封杀」——狗仔闪光灯糊脸！');
    if (card.shape === 'wild4') cgLog('🦢 ' + G.names[0] + ' 甩出「黑天鹅」！全场暗场 0.5 秒');
    if (G.hands[0].length === 0) { G.winSeat = 0; G.over = G.names[0] + ' 杀青！本局通告全部播完 🎉'; settleBets(); drawGame(); showResult(); return; }
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
  /* UNO 标准规则：手里没牌能出 → **必须抽一张**（没有"过"这个选项）。
     抽到的这张如果能出，可以立刻打出去；还是出不了，才轮到下家（这时才点「过」）。 */
  function unoDraw() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    if (G.unoDrew) { toast('🚫 这回合已经抽过一张了——打出它，或者点「过」交给下家'); return; }
    if (!G.stock.length) G.stock = shuffle(G.pile.splice(0, G.pile.length - 1));
    var cd = G.stock.pop(); if (cd) G.hands[0].push(cd);
    G.unoDrew = true; G.unoDrewIdx = G.hands[0].length - 1;
    G.msg = cd
      ? (unoPlayable(cd) ? ('抽到「' + unoCardName(cd) + '」——正好能出！点手牌打出去，或点「过」交给下家')
        : ('抽到「' + unoCardName(cd) + '」，还是出不了 —— 点「过」交给下家'))
      : '通告池空了';
    cgLog('🂠 ' + seatTitle(0) + ' 抽了一张新通告');
    drawGame();
  }
  /* 抽完牌之后才有的「过」：这回合我确实出不了，交给下家 */
  function unoPass() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    markPass(0);
    G.msg = seatTitle(0) + ' 抽完还是出不了，过';
    cgLog('⏭ ' + G.msg);
    G.unoDrew = false; G.unoDrewIdx = -1;
    advance(1); drawGame(); scheduleAI();
  }
  /* 牌面叫法（给陛下看得懂的中文名，黑牌单独标出来） */
  function unoCardName(card) {
    if (!card) return '？';
    var CN = { r: '红', y: '黄', g: '绿', b: '蓝', k: '黑' };
    var SN = { skip: '封杀 ⊘', rev: '舆论反转 ⇄', d2: '轧戏 +2', wild: '换赛道 W（黑牌）', wild4: '黑天鹅 +4（黑牌）' };
    if (SN[card.shape]) return (card.shape === 'wild' || card.shape === 'wild4') ? SN[card.shape] : (CN[card.color] + SN[card.shape]);
    return (CN[card.color] || '') + (String(card.shape).replace(/^s/, '') || '');
  }
  function nextTurn() {
    if (G.game === 'uno') G.turn = (G.turn + G.dir + G.seats) % G.seats;
    else G.turn = (G.turn + 1) % G.seats;
    touchTurn();
  }
  /* ---------- AI ---------- */
  function scheduleAI() {
    clearTimeout(_aiTimer);
    if (!G || G.over) return;
    if (G.game === 'uno' && G.pendingWild) return;
    /* 川麻：定缺没定完、或有人在等碰/杠/胡的时候，别让 AI 抢着摸牌 */
    if (G.game === 'mahjong' && (G.phase !== 'play' || G.pending)) return;
    if (!G.ai[G.turn]) return;
    _aiTimer = setTimeout(aiStep, 620);
  }
  function aiStep() {
    if (!G || G.over || !G.ai[G.turn]) return;
    var t = G.turn;
    if (G.game === 'uno') {
      var h = G.hands[t], idx = -1;
      var uc = [];
      for (var i = 0; i < h.length; i++) {
        if (!unoPlayable(h[i])) continue;
        var sc = h[i].shape === 'wild4' ? 1 : h[i].shape === 'wild' ? 2 :
          (h[i].shape === 'skip' || h[i].shape === 'rev' || h[i].shape === 'd2') ? 5 :
          10 + (parseInt(String(h[i].shape).slice(1), 10) || 0);
        uc.push({ i: i, v: sc });
      }
      uc.sort(function (a, b) { return b.v - a.v; });
      var pickU = aiPick(uc);
      idx = pickU ? pickU.i : -1;
      if (idx < 0) {
        if (!G.stock.length) G.stock = shuffle(G.pile.splice(0, G.pile.length - 1));
        var cd = G.stock.pop(); if (cd) h.push(cd);
        G.msg = G.names[t] + ' 抽了一张新通告';
        advance(1); drawGame(); scheduleAI(); return;
      }
      var card = h.splice(idx, 1)[0]; G.pile.push(card); G.cur = card.color; G.lastPlay[t] = [card]; clearPass();
      if (card.shape === 'skip') cgLog('📸 ' + G.names[t] + ' 封杀！');
      if (card.shape === 'wild4') cgLog('🦢 ' + G.names[t] + ' 甩出黑天鹅！');
      if (h.length === 0) { G.winSeat = t; G.over = G.names[t] + ' 杀青！'; settleBets(); drawGame(); showResult(); return; }
      if (h.length === 1) cgLog('📣 ' + G.names[t] + ' 官宣！');
      if (card.shape === 'wild' || card.shape === 'wild4') {
        G.cur = ['r', 'y', 'g', 'b'][rnd(4)];
        /* 黑牌要喊出换成了哪门，不然看不懂桌上为啥突然换色 */
        cgLog('⚫ ' + G.names[t] + ' 把赛道换成「' + FL_SOC[G.cur] + '色」');
      }
      G.msg = G.names[t] + ' 打出一张';
      applyUno(card);
      return;
    }
    if (G.game === 'mahjong') mjAI(t);
    else if (G.game === 'flight') flAI(t);
    else if (G.game === 'doudizhu') ddAI(t);
  }

  /* ---------- 川麻（防线长议） ---------- */
  /* ============ 川麻基础规则（十七更续）：定缺 / 碰 / 明杠 / 暗杠 / 补杠 / 自摸 / 接炮 ============ */
  var MJ_SUIT_N = { wan: '万', tiao: '条', tong: '筒' };
  function mjAiLack(hand) {
    var n = { wan: 0, tiao: 0, tong: 0 };
    hand.forEach(function (t) { n[t.suit] = (n[t.suit] || 0) + 1; });
    var best = 'wan', bv = 1e9;
    ['wan', 'tiao', 'tong'].forEach(function (s) { if ((n[s] || 0) < bv) { bv = (n[s] || 0); best = s; } });
    return best;
  }
  function mjSetLack(p, suit) {
    if (!G || G.game !== 'mahjong' || G.phase !== 'lack' || G.lack[p]) return;
    G.lack[p] = suit;
    cgLog('✂️ ' + G.names[p] + ' 定缺：' + MJ_SUIT_N[suit]);
    if (G.lack.every(function (x) { return !!x; })) {
      G.phase = 'play';
      cgLog('🀄 四家定缺完毕——手里这门打光了才能胡');
    }
    touchTurn(); drawGame();
    if (G.phase === 'play') {
      /* 二十一更：定缺完毕 → 轮到我自动摸牌，不用点「接令」 */
      if (!mjAutoDraw()) scheduleAI();
      else drawGame();
    }
  }
  /* 缺门清了没：手里（含副露）还有自己定缺那门就不许胡 */
  function mjLackOk(p, tiles) {
    var lk = G.lack && G.lack[p];
    if (!lk) return true;
    for (var i = 0; i < tiles.length; i++) if (tiles[i].suit === lk) return false;
    var ms = (G.melds && G.melds[p]) || [];
    for (var j = 0; j < ms.length; j++) if (ms[j].tile && ms[j].tile.suit === lk) return false;
    return true;
  }
  function mjCanWin(p, tiles) {
    if (!mjLackOk(p, tiles)) return null;
    return mjWinShape(mjCounts(tiles));
  }
  function mjTileOf(p, k) {
    var h = G.hands[p] || [];
    for (var i = 0; i < h.length; i++) if (mjKey(h[i]) === k) return h[i];
    var ms = (G.melds && G.melds[p]) || [];
    for (var j = 0; j < ms.length; j++) if (ms[j].tile && mjKey(ms[j].tile) === k) return ms[j].tile;
    return null;
  }
  /* 别人打出一张后我能干嘛：胡 > 杠 > 碰 */
  function mjClaimOpts(p, tile) {
    if (!tile || G.phase !== 'play') return [];
    if (G.hu && G.hu[p]) return [];      /* 血战到底：已经胡了的人不再碰杠胡 */
    var out = [], hand = G.hands[p] || [];
    if (mjCanWin(p, hand.concat([tile]))) out.push('win');
    var same = hand.filter(function (t) { return t.suit === tile.suit && t.rank === tile.rank; });
    if (same.length >= 3) out.push('kong');
    if (same.length >= 2) out.push('pong');
    return out;
  }
  function mjDoClaim(p, kind, tile, from) {
    if (!tile) return;
    if (kind === 'win') { mjWin(p, tile, from, false); return; }
    var hand = G.hands[p], need = (kind === 'kong' ? 3 : 2), got = [];
    for (var i = hand.length - 1; i >= 0 && got.length < need; i--) {
      if (hand[i].suit === tile.suit && hand[i].rank === tile.rank) { got.push(hand[i]); hand.splice(i, 1); }
    }
    G.melds[p].push({ type: kind === 'kong' ? 'kong' : 'pong', tile: tile, from: from, tiles: got.concat([tile]) });
    cgLog('🀄 ' + (kind === 'kong' ? '杠！' : '碰！') + G.names[p] + ' ' + MJ_SUIT_N[tile.suit] + tile.rank);
    G.pending = null; G.claimMine = [];
    G.turn = p; touchTurn();
    if (kind === 'kong') { mjKongScore(p, 'ming', from); mjKongDraw(p); return; }
    G.drawn = null; G.mustDiscard = true;    /* 碰完必须打一张，不能再摸 */
    mjSortHand(hand); drawGame();
    if (p !== 0) scheduleAI();
  }
  /* 二十一更：杠了立刻收钱——暗杠吃三家（每家 2 底）、补杠每家 1 底、明杠点杠者包 3 底 */
  function mjKongScore(p, type, from) {
    var b = mjBase();
    if (type === 'ming') {
      if (typeof from === 'number' && from >= 0 && from !== p && !G.hu[from]) mjPay(from, p, b * 3, '明杠');
      return;
    }
    var each = (type === 'an' ? b * 2 : b);
    mjAliveList().forEach(function (q) {
      if (q !== p) mjPay(q, p, each, type === 'an' ? '暗杠' : '补杠');
    });
  }
  /* 杠完从牌墙尾补一张 */
  function mjKongDraw(p) {
    if (!G.wall.length) { mjFinish(mjAliveList()); return; }
    G._kongDrawFlag = true;              /* 杠上开花判定用 */
    var t = G.wall.pop();
    if (G.wallPer) G.wallPer[p] = Math.max(0, G.wallPer[p] - 1);
    if (p === 0) { G.drawn = t; G.mustDiscard = false; mjSortHand(G.hands[0]); mjAfterDraw(0); touchTurn(); drawGame(); return; }
    var all = G.hands[p].concat([t]);
    var sh = mjCanWin(p, all);
    if (sh) { mjWin(p, t, p, true); return; }
    G.hands[p].push(t); mjSortHand(G.hands[p]);
    mjAiDiscard(p);
  }
  /* 摸完/碰完算一遍：能不能自摸、能不能暗杠 / 补杠 */
  function mjAfterDraw(p) {
    var hand = G.hands[p] || [];
    var all = hand.concat(G.drawn ? [G.drawn] : []);
    G.winShape = mjCanWin(p, all);
    G.canWin = !!G.winShape;
    G.canKong = [];
    var cnt = mjCounts(all);
    Object.keys(cnt).forEach(function (k) { if (cnt[k] >= 4) G.canKong.push({ k: k, type: 'an' }); });
    ((G.melds && G.melds[p]) || []).forEach(function (m) {
      if (m.type === 'pong' && (cnt[mjKey(m.tile)] || 0) >= 1) G.canKong.push({ k: mjKey(m.tile), type: 'bu' });
    });
  }
  function mjDoKong(kk) {
    if (!kk || G.turn !== 0 || G.spectate) return;
    var hand = G.hands[0];
    if (G.drawn) { hand.push(G.drawn); G.drawn = null; }
    var got = [];
    for (var i = hand.length - 1; i >= 0 && got.length < 4; i--) {
      if (mjKey(hand[i]) === kk.k) { got.push(hand[i]); hand.splice(i, 1); }
    }
    if (kk.type === 'bu') {
      for (var m = 0; m < G.melds[0].length; m++) {
        var mm = G.melds[0][m];
        if (mm.type === 'pong' && mjKey(mm.tile) === kk.k) { mm.type = 'kong'; mm.tiles = got.slice(); break; }
      }
    } else G.melds[0].push({ type: 'ankong', tile: got[0], from: 0, tiles: got.slice() });
    cgLog('🀄 ' + (kk.type === 'bu' ? '补杠！' : '暗杠！') + G.names[0]);
    mjKongScore(0, kk.type === 'bu' ? 'bu' : 'an', -1);
    G.canKong = []; G.canWin = false; G.drawn = null;
    mjSortHand(hand);
    mjKongDraw(0);
  }
  /* ============ 二十一更（陛下钦定）：血战到底 + 实时番位账本 ============
     ① 一家胡了不退场，牌桌继续打，一直打到只剩一家没胡（或牌墙摸完）；
     ② 杠了立刻吃三家、胡了立刻按牌型收钱——G.score[] 全程实时起伏，
        牌桌顶栏与结算面板都能看见每家赚了多少；
     ③ 一局打完把 G.score 一次性写回主账本（真钱）。 */
  function mjBase() { return G.mjBase || 50; }
  function mjPay(from, to, amt, why) {
    if (!amt || from === to || G.score[from] === undefined || G.score[to] === undefined) return;
    G.score[from] -= amt; G.score[to] += amt;
    cgLog('💸 ' + G.names[from] + ' → ' + G.names[to] + ' ' + fmt(amt) + ' ' + CUR[G.entry ? G.entry.cur : 'diamond'].n + '（' + why + '）');
  }
  /* 牌型 → 番数（牌桌黑话） */
  function mjFanOf(p, all, ziMo, afterKong) {
    var cnt = mjCounts(all), keys = Object.keys(cnt);
    var suits = {}; keys.forEach(function (k) { suits[String(k).split('_')[0]] = 1; });
    var nsuit = Object.keys(suits).length;
    var melds = (G.melds && G.melds[p]) || [];
    var is7 = mjWinShape(mjCounts(all)) === '连环计（七对）';
    var triAll = keys.length > 0;
    keys.forEach(function (k) { if (cnt[k] % 3 !== 0) triAll = false; });
    var name = '小捷（平胡）', fan = 1;
    if (is7) { name = '连环计（七对）'; fan = 2; }
    else if (nsuit === 1 && melds.length >= 0) { name = '清一色'; fan = 3; }
    else if (triAll) { name = '碰碰胡（对对胡）'; fan = 2; }
    var det = [];
    if (G.lack && G.lack[p]) { fan += 1; det.push('定缺 ' + MJ_SUIT_N[G.lack[p]] + ' +1'); }
    if (ziMo) { fan += 1; det.push('自摸 +1'); }
    if (afterKong) { fan += 1; det.push('杠上开花 +1'); }
    var kongs = melds.filter(function (m) { return m.type === 'kong' || m.type === 'ankong'; }).length;
    if (kongs) { fan += kongs; det.push('杠 ' + kongs + ' 副 +' + kongs); }
    return { name: name, fan: fan, detail: det };
  }
  /* 还有几家没胡（血战到底的继续条件） */
  function mjAliveList() {
    var a = [];
    for (var i = 0; i < G.seats; i++) if (!G.hu[i]) a.push(i);
    return a;
  }
  /* 从 from 往下找第一个还没胡的人（已胡的直接跳过，不再摸打） */
  function mjNextAlive(from) {
    for (var n = 1; n <= G.seats; n++) {
      var t = (from + n) % G.seats;
      if (!G.hu[t]) return t;
    }
    return -1;
  }
  function mjWin(p, tile, from, ziMo) {
    var all = (G.hands[p] || []).concat(tile ? [tile] : []);
    var afterKong = !!G._kongDrawFlag; G._kongDrawFlag = false;
    var F = mjFanOf(p, all, ziMo, afterKong);
    /* 血战加成：越晚胡赚得越狠（第 1 家 ×1、第 2 家 ×1.5、第 3 家 ×2） */
    var mult = 1 + 0.5 * G.huOrder.length;
    var pts = Math.round(mjBase() * F.fan * mult);
    /* 收钱：自摸 = 所有没胡的人各出一份；接炮 = 点炮的一家包圆 ×3 */
    var gain = 0;
    if (ziMo) {
      mjAliveList().forEach(function (q) {
        if (q === p) return;
        mjPay(q, p, pts, F.name + ' 自摸 ' + F.fan + ' 番');
        gain += pts;
      });
    } else {
      var src = (typeof from === 'number' && from >= 0 && from !== p) ? from : mjNextAlive(p);
      if (src >= 0 && src !== p) { mjPay(src, p, pts * 3, F.name + ' 接炮 ' + F.fan + ' 番'); gain += pts * 3; }
      else mjAliveList().forEach(function (q) { if (q !== p) { mjPay(q, p, pts, F.name); gain += pts; } });
    }
    G.hu[p] = { name: F.name, fan: F.fan, detail: F.detail, pts: gain, ziMo: !!ziMo, from: from, mult: mult };
    G.huOrder.push(p);
    G.pending = null; G.claimMine = []; G.drawn = null; G.mustDiscard = false;
    if (typeof G.winSeat !== 'number') G.winSeat = p;   /* 押注结算认第一个胡的人 */
    cgLog('🀄🎉 ' + G.names[p] + (ziMo ? ' 自摸' : ' 接炮') + ' · ' + F.name + ' · ' + F.fan + ' 番 ×' + mult.toFixed(1) +
      ' → 进账 ' + fmt(gain) + (F.detail.length ? '（' + F.detail.join('、') + '）' : ''));
    var left = mjAliveList();
    if (left.length <= 1) { mjFinish(left); return; }
    /* 血战到底：胡了的人退出摸打，牌桌继续 */
    cgLog('🩸 血战到底！' + G.names[p] + ' 已胡牌退场，牌桌继续——还剩 ' + left.length + ' 家厮杀');
    G.msg = '🩸 血战到底：' + G.names[p] + ' 已胡，剩 ' + left.length + ' 家继续';
    var nt = mjNextAlive(p);
    if (nt < 0) { mjFinish([]); return; }
    G.turn = nt; touchTurn();
    mjAutoDraw(); drawGame(); scheduleAI();
  }
  /* 一局打完：写回主账本 + 弹结算 */
  function mjFinish(left) {
    var un = left && left.length ? left[0] : -1;
    G.over = G.huOrder.length
      ? ('🀄 血战到底结束！' + G.huOrder.map(function (p) { return G.names[p]; }).join(' → ') + ' 依次胡牌' + (un >= 0 ? '，' + G.names[un] + ' 没能胡' : ''))
      : '牌墙摸完了，流局';
    if (un >= 0) G.msg = '😵 ' + G.names[un] + ' 本局没能结案';
    G.winSeat = G.huOrder.length ? G.huOrder[0] : G.winSeat;
    /* 真钱落账：把局内番位账本一次写回主账本（赢家收钱、输家扣钱） */
    var cur = (G.entry && G.entry.cur) || 'diamond';
    G.score.forEach(function (s, p) {
      if (!s) return;
      if (p === 0 && !G.spectate) { walletAdd(cur, s); stAcc(cur, 'tableNet', s); cgLog('💰 本局结算：我 ' + (s >= 0 ? '+' : '') + fmt(s) + ' ' + CUR[cur].n); }
      else cgLog('📒 ' + G.names[p] + ' 本局 ' + (s >= 0 ? '+' : '') + fmt(s) + ' ' + CUR[cur].n);
    });
    settleBets();
    drawGame();
    showResult();
  }
  /* 轮到我自动摸牌（不再需要点「接令」按钮） */
  function mjAutoDraw() {
    if (!G || G.game !== 'mahjong' || G.over || G.spectate) return false;
    if (G.phase !== 'play' || G.turn !== 0) return false;
    if (G.hu[0] || G.pending || G.drawn || G.mustDiscard) return false;
    mjDraw();
    return true;
  }
  /* 打出一张 → 进牌河 → 谁响应（胡>杠>碰）→ 没人要就下家摸 */
  function mjEmit(from, tile) {
    G.river[from].push(tile);
    G.lastPlay[from] = [tile]; clearPass();
    /* 二十三更：记录出牌时间，刚打的那张放大只亮 3 秒（修鬼牌/二筒一直挂着的问题） */
    if (!G._mjLastAt) G._mjLastAt = {};
    G._mjLastAt[from] = Date.now();
    G.discard = tile;
    cgLog(G.names[from] + ' 传令 ' + MJ_SUIT_N[tile.suit] + tile.rank);
    var plz = [];
    for (var p = 0; p < G.seats; p++) {
      if (p === from || G.hu[p]) continue;    /* 打牌的人自己 & 已胡的人不响应 */
      var o = mjClaimOpts(p, tile);
      if (o.length) plz.push({ p: p, o: o });
    }
    G.pending = { tile: tile, from: from };
    var mine = null, aiPicks = [];
    plz.forEach(function (x) { if (x.p === 0) mine = x; else aiPicks.push(x); });
    G.claimMine = mine ? mine.o : [];
    if (G.claimMine.length) { drawGame(); return; }   /* 玩家优先决定 */
    if (aiPicks.length) { mjAiClaim(aiPicks, tile, from); return; }
    mjNext(from);
  }
  function mjPass() {
    if (!G.pending) return;
    var tile = G.pending.tile, from = G.pending.from;
    G.claimMine = [];
    var aiPicks = [];
    for (var p = 1; p < G.seats; p++) {
      if (p === from || G.hu[p]) continue;
      var o = mjClaimOpts(p, tile);
      if (o.length) aiPicks.push({ p: p, o: o });
    }
    if (aiPicks.length) { mjAiClaim(aiPicks, tile, from); return; }
    mjNext(from);
  }
  function mjAiClaim(aiPicks, tile, from) {
    var order = { win: 3, kong: 2, pong: 1 };
    aiPicks.sort(function (a, b) { return order[b.o[0]] - order[a.o[0]]; });
    var top = aiPicks[0], want = top.o[0];
    if (want !== 'win' && Math.random() > (aiSharp() + 0.35)) { mjNext(from); return; }
    setTimeout(function () { if (G && G.pending && G.pending.tile === tile) mjDoClaim(top.p, want, tile, from); }, 640);
  }
  function mjNext(from) {
    G.pending = null; G.claimMine = [];
    var nt = mjNextAlive(from);          /* 血战到底：已胡的人跳过，不再摸打 */
    if (nt < 0) { mjFinish([]); return; }
    G.turn = nt;
    touchTurn(); drawGame();
    if (!mjAutoDraw()) scheduleAI(); else drawGame();
  }
  function mjDraw() {
    if (G.turn !== 0 || G.drawn || G.mustDiscard || G.spectate) return;
    if (G.phase !== 'play') return;
    if (!G.wall.length) { mjFinish(mjAliveList()); return; }
    G._kongDrawFlag = false;
    G.drawn = G.wall.pop();
    if (G.wallPer) G.wallPer[0] = Math.max(0, G.wallPer[0] - 1);
    mjSortHand(G.hands[0]);   /* 十七更：摸完自动理牌 */
    mjAfterDraw(0);
    touchTurn();
    drawGame();
  }
  /* 十七更：麻将理牌——万/条/筒分组、点数升序（摸牌/传令后自动排） */
  function mjSortHand(hand) {
    var ord = { wan: 0, tiao: 1, tong: 2 };
    hand.sort(function (a, b) {
      var d = (ord[a.suit] - ord[b.suit]) || (a.rank - b.rank);
      return d;
    });
    return hand;
  }
  function mjDiscard(i) {
    if (G.turn !== 0 || G.spectate) return;
    if (!G.drawn && !G.mustDiscard) return;      /* 碰完之后没摸牌，也得打一张 */
    var hand = G.hands[0];
    var tile = (i === hand.length && G.drawn) ? G.drawn : hand.splice(i, 1)[0];
    if (G.drawn && i !== hand.length) hand.push(G.drawn);
    G.drawn = null; G.canWin = false; G.canKong = []; G.mustDiscard = false;
    mjSortHand(hand);   /* 传令后自动理牌 */
    mjEmit(0, tile);
  }
  function mjWinDo() {
    if (G.turn !== 0 || G.spectate) return;
    mjWin(0, G.drawn, 0, true);
  }
  function mjAiDiscard(t) {
    var hand = G.hands[t];
    mjSortHand(hand);
    var lk = G.lack[t], cntH = mjCounts(hand), mc = [];
    for (var mi = 0; mi < hand.length; mi++) {
      var mt = hand[mi], mk = mjKey(mt), msc = 0;
      if (lk && mt.suit === lk) msc += 40;                  /* 先打缺门，这是川麻的基本功 */
      if (mt.rank === 1 || mt.rank === 9) msc += 6;
      else if (mt.rank === 2 || mt.rank === 8) msc += 3;
      if ((cntH[mk] || 0) >= 2) msc -= 8;
      mc.push({ i: mi, v: msc });
    }
    mc.sort(function (a, b) { return b.v - a.v; });
    var pickM = aiPick(mc);
    var drop = pickM ? pickM.i : rnd(hand.length);
    var tile = hand.splice(drop, 1)[0];
    G.mustDiscard = false; G.msg = G.names[t] + ' 接令传令';
    mjEmit(t, tile);
  }
  function mjAI(t) {
    if (G.hu && G.hu[t]) return;             /* 血战到底：已胡的人不再摸打 */
    if (G.mustDiscard) { mjAiDiscard(t); return; }
    if (!G.wall.length) { mjFinish(mjAliveList()); return; }
    G._kongDrawFlag = false;
    var tile = G.wall.pop();
    if (G.wallPer) G.wallPer[t] = Math.max(0, G.wallPer[t] - 1);
    var all = G.hands[t].concat([tile]);
    var shape = mjCanWin(t, all);
    if (shape) { mjWin(t, tile, t, true); return; }
    /* 暗杠：摸到第 4 张就杠（段位低的 AI 不一定反应过来） */
    var cntAll = mjCounts(all), kk = null;
    Object.keys(cntAll).forEach(function (k) { if (cntAll[k] >= 4) kk = k; });
    if (kk && Math.random() < aiSharp() + 0.35) {
      G.hands[t].push(tile); mjSortHand(G.hands[t]);
      var got = [];
      for (var q = G.hands[t].length - 1; q >= 0 && got.length < 4; q--) {
        if (mjKey(G.hands[t][q]) === kk) { got.push(G.hands[t][q]); G.hands[t].splice(q, 1); }
      }
      G.melds[t].push({ type: 'ankong', tile: got[0], from: t, tiles: got.slice() });
      cgLog('🀄 ' + G.names[t] + ' 暗杠！');
      mjKongScore(t, 'an', -1);
      mjKongDraw(t); return;
    }
    G.hands[t].push(tile);
    mjSortHand(G.hands[t]);
    mjAiDiscard(t);
  }
  /* ================= 十九更：欢乐麻将式牌河 =================
     陛下钦定（对照欢乐麻将）：① 打出去的牌【全部】缩小平铺在牌桌中央，
     每家占一方（上家顶行 / 我底行 / 左右家两侧块）；② 刚打出来的那一张
     才放大摆在座位旁（带金光）；③ 碰 / 杠的副露缩小摆在各家手牌边上。 */
  function mjRiverGeom(W, H, tw, th) {
    var baseY = H - th - 20;
    var rw = Math.max(17, Math.min(tw * 0.32, W * 0.032));
    var rh = rw * 1.36, rstep = rw * 1.12;
    var per = Math.max(10, Math.floor((W * 0.42) / rstep));   /* 中央每行张数 */
    var x0 = W / 2 - per * rstep / 2;
    var ans = seatAnchors(G.seats);
    var top = H * 0.30;
    /* 正对家的出牌大牌摆手牌下方——牌河顶行要让它一等 */
    for (var p = 1; p < G.seats; p++) {
      if (ans[p - 1].a === 'c') {
        var L = seatLayout(p, ans[p - 1], W, H, tw, th);
        top = Math.max(top, L.playY + L.ph + 8);
      }
    }
    return { rw: rw, rh: rh, rstep: rstep, per: per, x0: x0, top: top, bot: baseY - 8 - rh };
  }
  function mjRiverRows(c, tiles, cx, y0, dir, per, rw, rh, rstep) {
    var R = Math.ceil(tiles.length / per);
    for (var i = 0; i < tiles.length; i++) {
      var r = Math.floor(i / per), col = i % per;
      var nRow = Math.min(tiles.length - r * per, per);
      var xL = cx - nRow * rstep / 2;   /* 每行独立居中（最后一行不满也居中） */
      var yy = dir > 0 ? y0 + r * (rh + 4) : y0 - (R - 1 - r) * (rh + 4);
      SK.drawCard(c, 'mahjong', tiles[i], xL + col * rstep, yy, rw, rh, {});
    }
  }
  /* 二十三更：牌河竖排（左右家）/ 横排（上家/我）——不重叠 */
  function mjRiverCol(c, tiles, x0, y0, dir, perCol, rw, rh) {
    /* 竖排：一列 perCol 张，列从 x0 向 dir 方向增长 */
    var cols = Math.ceil(tiles.length / perCol);
    for (var i = 0; i < tiles.length; i++) {
      var col = Math.floor(i / perCol), row = i % perCol;
      var x = x0 + dir * col * (rw + 3);
      var y = y0 + row * (rh + 2);
      SK.drawCard(c, 'mahjong', tiles[i], x, y, rw, rh, {});
    }
  }
  function drawMjRiver(c, W, H, tw, th) {
    var g = mjRiverGeom(W, H, tw, th);
    /* 牌河尺寸再缩小一点避免重叠 */
    var rw = Math.max(12, Math.min(g.rw, tw * 0.28));
    var rh = rw * 1.36;
    var rstep = rw * 1.1;
    var ans = seatAnchors(G.seats);
    /* 计算中央安全区域（不叠到手牌区）：上缘 ~ 下缘 */
    var topY = H * 0.16, botY = H - th - 70;
    var leftX = 8, rightX = W - 8;
    for (var p = 0; p < G.seats; p++) {
      var rv = (G.river && G.river[p]) || [];
      if (!rv.length) continue;
      if (p === 0) {
        /* 我：中央底部横排，行向上叠 */
        mjRiverRows(c, rv.slice(-2 * g.per), W / 2, botY, -1, g.per, rw, rh, rstep);
      } else {
        var an = ans[p - 1];
        if (an.a === 'c') {
          /* 上家：中央顶部横排，行向下叠 */
          mjRiverRows(c, rv.slice(-2 * g.per), W / 2, topY, 1, g.per, rw, rh, rstep);
        } else if (an.a === 'l') {
          /* 左家：竖排，从左边向右延伸 */
          mjRiverCol(c, rv.slice(-18), leftX, topY + rh + 8, 1, 6, rw, rh);
        } else {
          /* 右家：竖排，从右边向左延伸 */
          mjRiverCol(c, rv.slice(-18), rightX - rw, topY + rh + 8, -1, 6, rw, rh);
        }
      }
    }
  }
  /* 二十三更：刚打出来的最后一张只亮 3 秒然后自动隐藏（避免一直挂着像鬼牌）。
     用 G._mjLastAt[p] 记录最后出牌时间，超过 3 秒就不画了。 */
  function drawMjLast(c, p, an, W, H, tw, th) {
    if (!G || (G.passed && G.passed[p])) return;
    var rv = (G.river && G.river[p]) || [];
    if (!rv.length) return;
    if (G._mjLastAt && G._mjLastAt[p] && Date.now() - G._mjLastAt[p] > 3000) return;
    var L = seatLayout(p, an, W, H, tw, th, 'mahjong');
    var pw = Math.min(L.pw, tw * 0.65), ph = pw * 1.36, x, y;
    if (an.a === 'c') { x = L.handX + L.fanW / 2 - pw / 2; y = L.handY + L.mh + 8; }
    else if (an.a === 'l') { x = L.handX + L.fanW + 12; y = L.handY + L.mh / 2 - ph / 2 + 4; }
    else { x = L.handX - pw - 12; y = L.handY + L.mh / 2 - ph / 2 + 4; }
    SK.drawCard(c, 'mahjong', rv[rv.length - 1], x, y, pw, ph, { hi: '#ffd166' });
  }
  /* 我刚打的最后一张：也只亮 3 秒（二十三更：修鬼牌二筒问题） */
  function drawMjMyLast(c, W, H, tw, th) {
    if (G._mjLastAt && G._mjLastAt[0] && Date.now() - G._mjLastAt[0] > 3000) return;
    var played = (G.lastPlay && G.lastPlay[0]) || [];
    if (!played.length) return;
    var baseY = H - th - 20;
    var pw = Math.min(tw * 0.72, W * 0.14), ph = pw * 1.42;
    SK.drawCard(c, 'mahjong', played[played.length - 1], W - 14 - pw, baseY - ph - 8, pw, ph, { hi: '#ffd166' });
  }
  /* 副露（碰/杠）：缩小摆在各家手牌边上——mini 尺寸，几副排开 */
  function mjMeldsRow(c, ms, x, y, kw, kh, kstep) {
    var unitW = 4 * kstep + 8, cx = x;
    for (var m = 0; m < ms.length; m++) {
      var ts = ms[m].tiles || [];
      for (var i = 0; i < ts.length; i++) SK.drawCard(c, 'mahjong', ts[i], cx + i * kstep, y, kw, kh, {});
      cx += unitW;
    }
  }
  function drawMjMelds(c, p, an, W, H, tw, th) {
    var ms = (G.melds && G.melds[p]) || [];
    if (!ms.length) return;
    var L = seatLayout(p, an, W, H, tw, th, 'mahjong');
    var kw = Math.max(13, tw * 0.3), kh = kw * 1.36, kstep = kw * 1.1;
    var totalW = ms.length * (4 * kstep + 8) - 8;
    var x, y;
    if (an.a === 'c') { x = L.playX + L.pw + 12; y = L.playY + 6; }          /* 上家：大牌右侧 */
    else if (an.a === 'l') { x = 14; y = L.playY + L.ph + 10; }              /* 左家：大牌下方 */
    else { x = W - 14 - totalW; y = L.playY + L.ph + 10; }                   /* 右家：大牌下方右对齐 */
    mjMeldsRow(c, ms, Math.max(8, Math.min(x, W - 8 - totalW)), y, kw, kh, kstep);
  }
  /* 我的副露：手牌行上方左侧一排 mini */
  function drawMyMelds(c, W, H, tw, th) {
    var ms = (G.melds && G.melds[0]) || [];
    if (!ms.length) return;
    var baseY = H - th - 20;
    var kw = Math.max(13, tw * 0.3), kh = kw * 1.36, kstep = kw * 1.1;
    mjMeldsRow(c, ms, 12, baseY - kh - 8, kw, kh, kstep);
  }
  function drawMj(c, W, H) {
    var tw = cardW(W, H, 11), th = tw * 1.36;
    setActsBottom(th + 20 + 46);
    var ans = seatAnchors(G.seats);
    for (var p = 1; p < G.seats; p++) {
      drawSeat(c, p, ans[p - 1], W, H, 'mahjong', tw, th, G.lack && G.lack[p] ? ' 缺' + MJ_SUIT_N[G.lack[p]] : '');
    }
    /* 十九更：欢乐麻将式——①牌河全量缩小平铺中央；②刚打的放大亮座位旁；③副露 mini 缩手牌边 */
    drawMjRiver(c, W, H, tw, th);
    for (var pm2 = 1; pm2 < G.seats; pm2++) drawMjLast(c, pm2, ans[pm2 - 1], W, H, tw, th);
    for (var md2 = 1; md2 < G.seats; md2++) drawMjMelds(c, md2, ans[md2 - 1], W, H, tw, th);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'left'; c.font = '12px sans-serif';
    c.fillText('牌墙 ' + G.wall.length, 14, H * 0.52);
    /* 十七更：各家门口的牌墙——一排小牌背摆在座位名牌下方 */
    if (G.wallPer) {
      for (var wp2 = 0; wp2 < G.seats; wp2++) {
        var nWall = Math.min(G.wallPer[wp2], 21);
        if (wp2 === 0 || !nWall) continue;
        var anw = ans[wp2 - 1];
        var bxw = anw.a === 'l' ? 16 : anw.a === 'r' ? W - 16 : W * anw.x;
        var byw = anw.y * H + 26;
        var mw2 = tw * 0.26, gapw = mw2 * 0.5;
        c.fillStyle = 'rgba(255,255,255,.35)';
        c.font = '10px sans-serif';
        c.textAlign = anw.a === 'l' ? 'left' : anw.a === 'r' ? 'right' : 'center';
        c.fillText('门前牌墙 ' + G.wallPer[wp2], bxw + (anw.a === 'c' ? 0 : (anw.a === 'l' ? 46 : -46)), byw - 3);
        for (var wi = 0; wi < nWall; wi++) {
          var wx = anw.a === 'l' ? bxw + 46 + wi * gapw : anw.a === 'r' ? bxw - 46 - wi * gapw : bxw - (nWall * gapw) / 2 + wi * gapw;
          SK.drawBack(c, 'mahjong', wx, byw, mw2, mw2 * 1.3);
        }
      }
    }
    /* 十九更：我的最后一张大牌亮在手牌右上角（不压中央牌河）；副露 mini 摆手牌上方左侧 */
    drawMyMelds(c, W, H, tw, th);
    drawMjMyLast(c, W, H, tw, th);
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
      drawMyAvatar(c, W, H, H - 6);
      c.fillStyle = (G.turn === 0 && !G.over) ? '#ffd166' : 'rgba(255,255,255,.88)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + '我 · ' + hand.length + ' 张' +
        (G.drawn ? '（点一张传令出去 · 右边那张是刚接的）' : (G.mustDiscard ? '（碰/杠完了，打一张）' : '（自动接令中…）')), W / 2, H - 6);
    } else {
      var g0 = handGeom(Math.min(G.hands[0].length, 13), tw * 0.6, W);
      for (var k = 0; k < Math.min(G.hands[0].length, 13); k++) SK.drawBack(c, 'mahjong', g0.x0 + k * g0.step, H - th * 0.6 - 16, tw * 0.6, th * 0.6);
      c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(seatTitle(0) + ' · ' + G.hands[0].length + ' 张', W / 2, H - 6);
    }
  }

  /* ---------- 斗地主（坐庄） ---------- */
  function ddTakeBottom() {
    G.hands[G.landlord] = G.hands[G.landlord].concat(G.bottom);
    G.hands[G.landlord].sort(function (a, b) { return b.v - a.v; });
    G.phase = 'play'; G.turn = G.landlord; G.last = null; G.lastBy = -1;
    G.msg = G.names[G.landlord] + ' 满仓坐庄（吃进 3 张暗料）';
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
  /* ---------- 斗地主提示（陛下钦定）：单/对/三/三带一/三带二/顺子/连对/炸弹/王炸都能推，
     按从小到大排，连点「提示」在候选间轮换；压不动就明说只能过 ---------- */
  function ddHints() {
    var hand = G.hands[0], out = [];
    var byV = {}, jk = [];
    hand.forEach(function (cc, i) { (byV[cc.v] = byV[cc.v] || []).push(i); if (cc.v >= 16) jk.push(i); });
    var vs = Object.keys(byV).map(Number).sort(function (a, b) { return a - b; });
    var lead = (G.lastBy === 0 || !G.last);
    function ok(cb) { return lead || ddBeats(G.last, cb); }
    function add(idxs) {
      var cards = idxs.map(function (i) { return hand[i]; });
      var cb = ddCombo(cards);
      if (cb && ok(cb)) out.push({ idxs: idxs, cb: cb });
    }
    if (lead) {
      vs.forEach(function (v) {
        var g = byV[v];
        if (g.length >= 1) add([g[0]]);
        if (g.length >= 2) add(g.slice(0, 2));
        if (g.length >= 3) add(g.slice(0, 3));
        if (g.length === 4) add(g.slice(0, 4));
      });
      vs.forEach(function (v) {   /* 三带一 / 三带二（带最小的） */
        if (byV[v].length < 3) return;
        var trio = byV[v].slice(0, 3);
        for (var k = 0; k < vs.length; k++) { var w = vs[k]; if (w !== v && byV[w].length >= 1) { add(trio.concat([byV[w][0]])); break; } }
        for (var k2 = 0; k2 < vs.length; k2++) { var w2 = vs[k2]; if (w2 !== v && byV[w2].length >= 2) { add(trio.concat(byV[w2].slice(0, 2))); break; } }
      });
      for (var s = 0; s < vs.length; s++) {   /* 顺子 5+ */
        if (vs[s] >= 15) break;
        var run = [byV[vs[s]][0]];
        for (var e = s + 1; e < vs.length; e++) {
          if (vs[e] === vs[e - 1] + 1 && vs[e] < 15) { run.push(byV[vs[e]][0]); if (run.length >= 5) add(run.slice()); } else break;
        }
      }
      for (var s2 = 0; s2 < vs.length; s2++) {   /* 连对 3+ */
        if (byV[vs[s2]].length < 2 || vs[s2] >= 15) continue;
        var run2 = byV[vs[s2]].slice(0, 2);
        for (var e2 = s2 + 1; e2 < vs.length; e2++) {
          if (vs[e2] === vs[e2 - 1] + 1 && vs[e2] < 15 && byV[vs[e2]].length >= 2) { run2 = run2.concat(byV[vs[e2]].slice(0, 2)); if (run2.length >= 6) add(run2.slice()); } else break;
        }
      }
    } else {
      var L = G.last;
      if (L.type === 'single' || L.type === 'pair' || L.type === 'trio') {
        var want = { single: 1, pair: 2, trio: 3 }[L.type];
        vs.forEach(function (v) { if (v > L.v && byV[v].length >= want) add(byV[v].slice(0, want)); });
      } else if (L.type === 'trio1' || L.type === 'trio2') {
        var need = L.type === 'trio1' ? 1 : 2;
        vs.forEach(function (v) {
          if (v <= L.v || byV[v].length < 3) return;
          var trio = byV[v].slice(0, 3);
          for (var k = 0; k < vs.length; k++) { var w = vs[k]; if (w !== v && byV[w].length >= need) { add(trio.concat(byV[w].slice(0, need))); break; } }
        });
      } else if (L.type === 'straight' || L.type === 'pairSeq' || L.type === 'plane') {
        var per = L.type === 'straight' ? 1 : (L.type === 'pairSeq' ? 2 : 3);
        for (var st = 0; st + L.len <= vs.length; st++) {
          if (vs[st] <= L.v || vs[st + L.len - 1] >= 15) continue;
          var okSeq = true, idxs = [];
          for (var q = 0; q < L.len; q++) {
            if (byV[vs[st + q]] && byV[vs[st + q]].length >= per) idxs = idxs.concat(byV[vs[st + q]].slice(0, per));
            else { okSeq = false; break; }
          }
          if (okSeq) add(idxs);
        }
      }
      vs.forEach(function (v) { if (byV[v].length === 4 && !(L.type === 'bomb' && v <= L.v)) add(byV[v].slice(0, 4)); });   /* 炸弹兜底 */
    }
    if (jk.length === 2 && (!G.last || G.last.type !== 'rocket')) add(jk.slice(0, 2));   /* 王炸兜底 */
    out.sort(function (a, b) { return a.idxs.length - b.idxs.length || a.cb.v - b.cb.v; });
    return out;
  }
  function ddTypeName(cb) {
    return { single: '单张', pair: '对子', trio: '三张', trio1: '三带一', trio2: '三带二', straight: '顺子', pairSeq: '连对', plane: '飞机', four2: '四带二', bomb: '黑天鹅（炸弹）', rocket: '双黑天鹅（王炸）' }[cb.type] || cb.type;
  }
  function ddHint() {
    if (G.turn !== 0 || G.over || G.spectate || G.phase === 'bid') return;
    var sig = G.last ? (G.last.type + G.last.v + '|' + G.hands[0].length) : 'lead';
    if (!G._hints || G._hintSig !== sig) { G._hints = ddHints(); G._hintIdx = -1; G._hintSig = sig; }
    if (!G._hints.length) { toast('💡 没有能压过的牌型——点「过」吧'); return; }
    G._hintIdx = (G._hintIdx + 1) % G._hints.length;
    var hit = G._hints[G._hintIdx];
    G.sel = hit.idxs.slice();
    G.msg = '💡 提示：' + ddTypeName(hit.cb) + '（再点「提示」换一手）';
    drawGame();
  }
  function ddDoPlay(p, cards, cb) {
    var ids = {}; cards.forEach(function (c) { ids[c.id] = 1; });
    G.hands[p] = G.hands[p].filter(function (c) { return !ids[c.id]; });
    G.last = cb; G.lastBy = p; G.table = cards.slice(); G.lastPlay[p] = cards.slice(); clearPass();
    G.sel = []; G._hints = null;   /* 出完牌清选择，不然旧索引会点到别人的牌 */
    if (cb.type === 'bomb') { G.mult = Math.min(8, (G.mult || 1) * 2); cgLog('🦢 ' + G.names[p] + ' 甩黑天鹅！倍数 ×' + G.mult); }
    if (cb.type === 'rocket') { G.mult = Math.min(8, (G.mult || 1) * 4); cgLog('🦢🦢 双黑天鹅！倍数 ×' + G.mult); }
    touchTurn();
    if (!G.hands[p].length) {
      var zWin = (p === G.landlord);
      G.winSeat = zWin ? 'z' : 's';
      G.winSeatNum = p;   /* 入场费结算按具体座位排名 */
      G.over = (zWin ? '庄家 ' : '散户 ') + G.names[p] + (zWin ? ' 通吃！👑' : ' 反杀！🎉');
      settleBets(); drawGame(); showResult(); return;
    }
    G.turn = (p + 1) % G.seats;
    drawGame(); scheduleAI();
  }
  function ddPass() {
    if (G.turn !== 0 || G.over || G.spectate) return;
    if (G.lastBy === 0 || !G.last) { toast('🚫 你是先手，必须出牌'); return; }
    G.sel = []; G._hints = null;
    /* 十七更续：过要看得见——清掉这一家上回合的牌，改挂「过」徽章 */
    markPass(0);
    G.msg = seatTitle(0) + ' 过';
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
        else { G.turn = (t + 1) % G.seats; touchTurn(); scheduleAI(); }
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
    if (!hit) {
      markPass(t);
      G.turn = (t + 1) % G.seats; G.msg = seatTitle(t) + ' 过'; touchTurn(); drawGame(); scheduleAI(); return;
    }
    ddDoPlay(t, hit.cards, hit.cb);
  }
  function drawDd(c, W, H) {
    var cw = cardW(W, H, 12), ch = cw * 1.42;
    setActsBottom(ch + 16 + 46);
    var ans = seatAnchors(G.seats);
    for (var p = 1; p < G.seats; p++) drawSeat(c, p, ans[p - 1], W, H, 'doudizhu', cw, ch, G.landlord === p ? ' 👑庄家' : '');
    for (var pd2 = 1; pd2 < G.seats; pd2++) drawSeatPlayed(c, pd2, ans[pd2 - 1], W, H, 'doudizhu', cw, ch);
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
      drawMyAvatar(c, W, H, H - 6);
      c.fillText((G.turn === 0 && !G.over ? '▶ ' : '') + '我' + (G.landlord === 0 ? ' 👑庄家' : ' 散户') + ' · ' + G.hands[0].length + ' 张（点牌选中）', W / 2, H - 6);
    } else {
      var g0 = handGeom(Math.min(G.hands[0].length, 17), cw * 0.55, W);
      for (var k = 0; k < Math.min(G.hands[0].length, 17); k++) SK.drawBack(c, 'doudizhu', g0.x0 + k * g0.step, H - ch * 0.55 - 14, cw * 0.55, ch * 0.55);
      c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(seatTitle(0) + (G.landlord === 0 ? ' 👑庄家' : ' 散户') + ' · ' + G.hands[0].length + ' 张', W / 2, H - 6);
    }
  }

  /* ================= 飞行棋 v5 / 押注 / 观战引擎 见下半 ================= */
  /* ---------- 飞行棋 v5（永恒王座 · 番位之战） ---------- */
  var FL_FATE = [
    { n: '黑天鹅 · 赔率重算', f: 'odds', d: '全场赔率当场重算——观战席的注全跟着抖三抖。' },
    { n: '全场热搜 · 所有人前进 1', f: 'all1', d: '所有人前进 1 格，谁也别想掉队。' },
    { n: '限薪令 · 领先者后退 2', f: 'lead2', d: '当前领跑的经纪人被砍 2 格，高处不胜寒。' },
    { n: '金牌经纪人 · 己方最前的艺人 +3', f: 'me3', d: '抽卡者最靠前的艺人直接 +3 格。' },
    { n: '封杀令 · 指定一家机库返航', f: 'kill', d: '随机一家的在场艺人被打回机库。' },
    { n: '观众缘 · 垫底经纪人 +4', f: 'last4', d: '垫底的那位被观众捞一把，+4 格。' },
    { n: '资本入场 · 掌声雷动（气氛组）', f: null, d: '纯气氛卡：全场掌声雷动，但谁也没动。' },
    { n: '天命轮盘 · 所有未出道艺人重掷出道', f: 'reroll', d: '一半未出道的艺人当场站上 ▶ 出道格。' }
  ];
  var FL_EV = [
    { n: '试镜成功 +2', f: 2, d: '这位艺人试镜过了，前进 2 格。' },
    { n: '喜提热搜 +3', f: 3, d: '热搜挂了一整天，前进 3 格。' },
    { n: '演唱会 · 立即再掷', f: 'again', d: '开完演唱会再摇一次骰子。' },
    { n: '绯闻缠身 −2', f: -2, d: '绯闻缠身，后退 2 格。' },
    { n: '被封杀 · 敌机回机库', f: 'kill', d: '把对面一架在场艺人打回机库。' },
    { n: '狗仔盯梢 · 停一回合', f: 'skip', d: '被狗仔盯上，下回合停一轮。' },
    { n: '拿下代言（资源卡系统后补）', f: null, d: '代言到手——资源卡系统上线后会有额外效果。' },
    { n: '五宝转盘 · 随机效果', f: 'wheel', d: '🐹 五宝转盘：+2/+3/再掷/−2/封杀/停一轮 随机一个。' }
  ];
  function flCardDesc(n) {
    var all = FL_FATE.concat(FL_EV);
    for (var i = 0; i < all.length; i++) if (all[i].n === n) return all[i].d || '';
    return '';
  }
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
    if (v < FL_OUT) return flRC((FL_START[col] + v) % FL_RING);
    if (v < FL_OUT + 5) return flArmRC(col, v - FL_OUT);
    return FL_THRONE[col];
  }
  function flRingCell(p, v) { return (v >= 0 && v < FL_OUT) ? (FL_START[G.colors[p]] + v) % FL_RING : -1; }
  /* 撞子（二十一更：整叠一起撞飞 + 醒目提示）：
     落点格上有敌方的艺人 → 那一格上敌方【整摞】全部回机库（叠子就是这么没的） */
  function flBounceAt(p, cell) {
    if (cell < 0) return;
    var hitMap = {};
    G.planes.forEach(function (other, q) {
      if (q === p) return;
      other.forEach(function (ov, oi) {
        if (ov >= 0 && ov < FL_OUT && flRingCell(q, ov) === cell) {
          other[oi] = -1;
          hitMap[q] = (hitMap[q] || 0) + 1;
        }
      });
    });
    var ks = Object.keys(hitMap);
    if (!ks.length) return;
    var total = 0;
    ks.forEach(function (k) {
      var q = parseInt(k, 10), n = hitMap[k];
      total += n;
      cgLog('📸 撞机！' + FL_SOC[G.colors[q]] + '社·' + G.real[q] + ' 的 ' + n + ' 架艺人被撞回机库（狗仔闪光灯+头条）');
    });
    G.msg = '📸 撞机！' + G.names[p] + ' 一口气撞飞 ' + total + ' 架，全部回机库！';
    G.flash = { cell: cell, t0: Date.now(), n: total };   /* 棋盘上闪一下 + 大字，看得见发生了啥 */
    if (p === 0) toast('📸 撞机！撞飞 ' + total + ' 架——回机库反省！');
  }
  function flKillEnemy(p) {
    var cands = [];
    G.planes.forEach(function (ps, q) {
      if (q === p) return;
      ps.forEach(function (v, i) { if (v >= 0 && v < FL_OUT) cands.push([q, i]); });
    });
    if (!cands.length) return;
    var hit = cands[rnd(cands.length)];
    G.planes[hit[0]][hit[1]] = -1;
    cgLog('🚫 ' + G.names[hit[0]] + ' 的艺人被封杀，回机库反省');
  }
  function flApplyEvent(p, idx) {
    if (!G.evdeck.length) G.evdeck = shuffle(flDeck32());
    flApplyEventCard(p, idx, G.evdeck.pop());
  }
  function flApplyEventCard(p, idx, e) {
    G.lastEvent = e.n;
    cgLog('🟠 事件卡「' + e.n + '」→ ' + G.names[p] + (e.d ? '｜' + e.d : ''));
    var f = e.f;
    if (f === 'wheel') { var pool = [2, 3, 'again', -2, 'kill', 'skip', null]; f = pool[rnd(pool.length)]; }
    if (typeof f === 'number') {
      var v = G.planes[p][idx];
      if (v >= 0 && v < FL_OUT) {
        var nv = Math.max(0, Math.min(FL_OUT - 1, v + f));
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
    flApplyFateCard(p, G.fate.pop());
  }
  function flApplyFateCard(p, e) {
    G.lastFate = e.n;
    cgLog('🔮 命运卡「' + e.n + '」全场广播！' + (e.d ? '｜' + e.d : ''));
    var f = e.f;
    if (f === 'all1') {
      G.planes.forEach(function (ps, q) {
        ps.forEach(function (v, i) { if (v >= 0 && v < FL_OUT - 1) { ps[i] = v + 1; flBounceAt(q, flRingCell(q, v + 1)); } });
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
      G.planes[t].forEach(function (v, i) { if (v > bv && v < FL_OUT) { bv = v; best = i; } });
      if (best >= 0) {
        G.planes[t][best] = Math.max(0, Math.min(FL_OUT - 1, bv + (f === 'lead2' ? -2 : 4)));
        flBounceAt(t, flRingCell(t, G.planes[t][best]));
      }
      G.msg = G.names[t] + (f === 'lead2' ? ' 被限薪令砍了 2 格' : ' 观众缘爆棚 +4');
    } else if (f === 'me3') {
      var best2 = -1, bv2 = -1;
      G.planes[p].forEach(function (v, i) { if (v > bv2 && v < FL_OUT) { bv2 = v; best2 = i; } });
      if (best2 >= 0) { G.planes[p][best2] = Math.min(FL_OUT - 1, bv2 + 3); flBounceAt(p, flRingCell(p, G.planes[p][best2])); }
      G.msg = G.names[p] + ' 金牌经纪人加持 +3';
    } else if (f === 'kill') { flKillEnemy(p); }
    else if (f === 'reroll') {
      G.planes.forEach(function (ps) { ps.forEach(function (v, i) { if (v === -1 && Math.random() < 0.5) ps[i] = 0; }); });
      G.msg = '天命轮盘转动，一批未出道艺人直接站上出道格！';
    } else { G.msg = e.n; }
  }
  /* 落格结算（二十一更：按传统飞行棋修正顺序与条件）
     撞子 → ✈ 航线直飞（只有落在本社色格才起飞）→ 🚀 同色连跳（+4，可连跳）→ ★ 事件 / 命运
     ⚠️ 老实现的三个错：① 航线格不判颜色，谁落上去都能飞；② 同色跳只跳一次，不连跳；
        ③ 连跳/直飞之后不再撞子，敌机白捡一条命。 */
  function flLand(p, idx, v, depth) {
    if (v > FL_TOTAL) v = FL_TOTAL;
    if (v >= FL_OUT) { G.planes[p][idx] = v; return G.planes[p][idx]; }
    var ci = FL_CI[G.colors[p]];
    var cell0 = flRingCell(p, v);
    flBounceAt(p, cell0);
    var flew = false;
    /* ① ✈ 航线：落在本社颜色的航线格 → 一次直飞 12 步（跨越 1/4 圈） */
    if (depth === 0 && FL_LINE[cell0] !== undefined && cell0 % 4 === ci) {
      v = Math.min(FL_TOTAL, v + FL_LINE[cell0]);
      flew = true;
      cgLog('✈ 航线直飞 +' + FL_LINE[cell0] + '！' + G.names[p] + ' 的艺人搭上包机');
      G.msg = '✈ ' + G.names[p] + ' 冲上航线，直飞 ' + FL_LINE[cell0] + ' 格！';
      if (v < FL_OUT) flBounceAt(p, flRingCell(p, v));
    }
    /* ② 🚀 同色跳：停在本社颜色的格子上 → 往前跳 4 格（跳到下一个本社色格）
       ⚠️ 只能跳一次！外圈每 4 格一循环，+4 之后【必定又是本社色】，
          要是写「跳到不是本社色为止」就会无限跳（臣试过，直接跳到王座）。 */
    var c2 = flRingCell(p, v);
    if (depth === 0 && v < FL_OUT && c2 % 4 === ci) {
      v = Math.min(FL_TOTAL, v + 4);
      cgLog('🚀 同色跳 +4！' + G.names[p] + ' 踩中本社色格，往前蹿一格');
      G.msg = '🚀 ' + G.names[p] + ' 踩中本社色格，同色跳 +4！';
      if (v < FL_OUT) flBounceAt(p, flRingCell(p, v));
    }
    G.planes[p][idx] = v;
    var cellF = flRingCell(p, v);
    /* 十七更：抽卡仪式——落 ★ 抽事件卡、冲 ✈ 航线抽命运卡，塔罗式三选一 */
    if (depth === 0 && v < FL_OUT && FL_STAR.indexOf(cellF) >= 0) startDraw(p, 'event', idx);
    else if (depth === 0 && flew) startDraw(p, 'fate', idx);
    return G.planes[p][idx];
  }
  /* ================= 抽卡仪式（塔罗式三选一 · 十七更） ================= */
  function startDraw(p, kind, idx) {
    var deck = kind === 'event' ? G.evdeck : G.fate;
    var n = Math.min(3, deck.length);
    if (!n) { cgLog('（' + (kind === 'event' ? '事件区' : '命运区') + '空了，跳过抽卡）'); return; }
    var picks = [];
    for (var i = 0; i < n; i++) picks.push(deck.pop());
    G.draw = { kind: kind, p: p, idx: idx, cards: picks, picked: -1, done: false, revealAt: 0 };
    cgLog(kind === 'event'
      ? '🟠 ' + G.names[p] + ' 落在 ★ 事件格——铺开三张背面牌，抽一张！'
      : '✈ ' + G.names[p] + ' 冲上航线——铺开三张背面牌，抽一张命运卡！');
    if (G.ai[p]) setTimeout(function () { if (G && G.draw && !G.draw.done) pickDrawCard(rnd(G.draw.cards.length)); }, 1100);
  }
  function pickDrawCard(i) {
    var D = G && G.draw; if (!D || D.picked >= 0 || i < 0 || i >= D.cards.length) return;
    D.picked = i; D.revealAt = Date.now();
    /* 没被选中的洗回牌堆底（unshift 回去，不打乱顶上顺序太多） */
    var deck = D.kind === 'event' ? G.evdeck : G.fate;
    D.cards.forEach(function (cd, k) { if (k !== i) deck.unshift(cd); });
    cgLog('🎴 ' + G.names[D.p] + ' 抽走了第 ' + (i + 1) + ' 张……');
    var iv = setInterval(function () { if (G) drawGame(); }, 50);
    /* 二十一更（陛下钦定）：翻牌别一闪而过——停留 2.4 秒，看得清抽中了什么再走 */
    setTimeout(function () { clearInterval(iv); applyDrawCard(); }, 2400);
    drawGame();
  }
  function applyDrawCard() {
    var D = G && G.draw; if (!D) return;
    D.done = true;
    var card = D.cards[D.picked];
    if (D.kind === 'event') flApplyEventCard(D.p, D.idx, card);
    else flApplyFateCard(D.p, card);
    /* 二十一更：抽中什么要有醒目横幅——牌桌中央大字停 2.6 秒 */
    G.cardBanner = {
      kind: D.kind, name: card.n, desc: flCardDesc(card.n),
      who: G.names[D.p], t0: Date.now(), ms: 2600
    };
    var iv2 = setInterval(function () {
      if (!G) { clearInterval(iv2); return; }
      drawGame();
      if (Date.now() - G.cardBanner.t0 > G.cardBanner.ms + 500) clearInterval(iv2);
    }, 220);
    G.draw = null;
    var after = G._afterDraw; G._afterDraw = null;
    if (after) after();
    else { drawGame(); scheduleAI(); }
  }
  /* 二十三更：骰子旋转动画（1.5 秒快速滚数→慢停→定格+弹跳）增强赌狗刺激感 */
  var _diceAnim = null;
  function flRoll() {
    if (G.turn !== 0 || G.over || G.spectate || _diceAnim) return;
    var finalDice = 1 + rnd(6);
    var dur = 1500;
    var t0 = Date.now();
    G.msg = '🎲 摇骰子中……';
    _diceAnim = { t0: t0, dur: dur, final: finalDice };
    function animStep() {
      if (!G || !_diceAnim) return;
      var elapsed = Date.now() - t0;
      if (elapsed >= dur) {
        /* 定格 */
        _diceAnim = null;
        G.dice = finalDice;
        G.pick = -1; G.options = null;
        G.lastPlay[0] = [{ kind: 'dice', n: finalDice }];
        var opts = flMoves(0, finalDice);
        touchTurn();
        if (!opts.length) { G.msg = '我 掷了 ' + finalDice + '，没艺人可动'; flNext(0); touchTurn(); drawGame(); scheduleAI(); return; }
        if (opts.length === 1) flMove(0, opts[0], finalDice);
        else { G.msg = '我 掷了 ' + finalDice + '，点一架艺人出动'; G.options = opts; }
        drawGame();
        if (!G.options) scheduleAI();
        return;
      }
      /* 滚动中：数字快速变化（前 70% 快、后 30% 慢） */
      var frac = elapsed / dur;
      var interval = frac < 0.7 ? 60 : (frac < 0.9 ? 150 : 300);
      G.dice = 1 + Math.floor(Math.random() * 6);
      drawGame();
      setTimeout(animStep, interval);
    }
    animStep();
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
    G.dice = 0;   /* 二十三更：重置骰子，这样下一回合点画布才能掷骰 */
    touchTurn();
  }
  /* 十七更续：逐格走路动画——走 3 步就一格一格挪，不许「嗖」地瞬移 */
  var FL_STEP_MS = 230;
  function flStartAnim(p, idx, from, to, dice, finish) {
    G.anim = { p: p, idx: idx, from: from, to: to, dice: dice, t0: Date.now(), finish: finish };
    G.planes[p][idx] = from;
    flAnimLoop();
  }
  function flAnimLoop() {
    if (!G || !G.anim) return;
    var a = G.anim;
    var k = Math.floor((Date.now() - a.t0) / FL_STEP_MS);
    var v = Math.min(a.to, a.from + k);
    if (a.from === -1 && k <= 0) v = -1;      /* 出道第一帧还停在机库里 */
    G.planes[a.p][a.idx] = v;
    if (v >= a.to) {
      var f = a.finish; G.anim = null;
      drawGame();
      if (f) f();
      return;
    }
    drawGame();
    requestAnimationFrame(flAnimLoop);
  }
  /* 二十一更·叠子：同一格上本社的几架艺人算「一叠」，一起走、一起被撞回机库 */
  function flStackOf(p, v) {
    var out = [];
    if (v === -1 || v === undefined || v === null) return out;
    G.planes[p].forEach(function (ov, i) { if (ov === v) out.push(i); });
    return out;
  }
  function flMove(p, idx, dice) {
    if (G.anim) return;
    var ps = G.planes[p];
    var v0 = ps[idx];
    if (v0 === FL_TOTAL) return;
    if (v0 === -1 && dice !== 6) return;
    var from = v0, to = v0 === -1 ? 0 : v0 + dice;
    if (to > FL_TOTAL) return;
    G.options = null;
    G.sel = [];
    /* 跟这一架叠在同一格的兄弟姐妹（不含自己）——整叠一起挪 */
    var mates = v0 >= 0 ? flStackOf(p, v0).filter(function (i) { return i !== idx; }) : [];
    if (mates.length) cgLog('🗼 叠子起飞：' + G.names[p] + ' 的 ' + (mates.length + 1) + ' 架艺人叠成一摞一起走！');
    var wasDepart = v0 === -1;
    if (wasDepart) cgLog('🎬 ' + G.names[p] + ' 的艺人在 ▶ 出道格出道！');
    /* 走到位之后的收尾（原 flMove 下半段，原样保留） */
    var finish = function () {
      var v = ps[idx];
      /* 二十三更修：出道只停在起点格，不触发同色跳/航线/撞子（传统飞行棋规矩）
         depth=99 让 flLand 跳过所有 depth===0 的分支 */
      flLand(p, idx, v, wasDepart ? 99 : 0);
      /* 叠子：整摞跟到同一个落点（撞机时 flBounceAt 会把整摞一起清掉） */
      mates.forEach(function (mi) { if (G.planes[p][mi] !== FL_TOTAL) G.planes[p][mi] = G.planes[p][idx]; });
      G.msg = G.names[p] + ' 掷 ' + dice + '，艺人走到第 ' + Math.max(0, ps[idx]) + ' 步';
      var after = function () {
        if (ps.every(function (x) { return x === FL_TOTAL; })) {
          G.winSeat = p; G.over = G.names[p] + ' 的艺人全体登上永恒王座，番位之战大获全胜！♛🎉';
          settleBets(); drawGame(); showResult(); return;
        }
        var again = G.againFlag || dice === 6;
        G.againFlag = false;
        if (!again) flNext(p);
        drawGame(); scheduleAI();
      };
      /* 抽卡仪式进行中 → 挂起后续，等牌翻开再走 */
      if (G.draw && !G.draw.done) { G._afterDraw = after; drawGame(); return; }
      after();
    };
    flStartAnim(p, idx, from, to, dice, finish);
  }
  function flAI(t) {
    var dice = 1 + rnd(6); G.dice = dice;
    G.lastPlay[t] = [{ kind: 'dice', n: dice }];
    var opts = flMoves(t, dice);
    if (!opts.length) { G.msg = G.names[t] + ' 掷了 ' + dice + '，没艺人可动'; flNext(t); touchTurn(); drawGame(); scheduleAI(); return; }
    var fc = opts.map(function (idx) {
      var v0 = G.planes[t][idx];
      var target = v0 === -1 ? 0 : v0 + dice;
      var cell = v0 === -1 ? FL_START[G.colors[t]] : flRingCell(t, Math.min(target, 50));
      var sc = v0 === -1 ? 8 : 0;
      if (FL_LINE[cell] !== undefined) sc += 6;
      if (FL_STAR.indexOf(cell) >= 0) sc += 4;
      for (var q = 0; q < G.seats; q++) {
        if (q === t) continue;
        G.planes[q].forEach(function (ov) { if (ov >= 0 && ov < FL_OUT && flRingCell(q, ov) === cell) sc += 10; });
      }
      sc += target * 0.05;
      return { i: idx, v: sc };
    }).sort(function (a, b) { return b.v - a.v; });
    var pickF = aiPick(fc);
    flMove(t, pickF ? pickF.i : opts[rnd(opts.length)], dice);
  }
  /* 二十三更：传统飞行棋棋盘几何（参考 bocaletto-luca/Ludo 的 15×15 Canvas）
     14×14 网格正方形棋盘，等比缩放居中，四角 5×5 色块机库 + 十字路径 + 中心 2×2 王座。 */
  function flGeom(W, H) {
    var topBar = Math.max(4, Math.round(H * 0.07));
    var botBar = 66;
    var avail = Math.min(W - 24, H - topBar - botBar);
    var cs = avail / 14;
    var bx = Math.round((W - cs * 14) / 2);
    var by = topBar + Math.round((H - topBar - botBar - cs * 14) / 2);
    return { bx: bx, by: by, csx: cs, csy: cs, cs: cs };
  }
  /* ============ 二十三更：传统飞行棋棋盘绘制（参考 bocaletto-luca/Ludo 的 15×15 Canvas） ============
     14×14 正方形棋盘，等比缩放居中。
     四角 5×5 色块机库（大色块里画 4 个圆形停机位）+ 十字形白底路径 + 归航道半透明色 + 中心 2×2 王座。
     路径格子画成圆角方块 + 深色描边，起点格大三角 ▶ + 粗描边。
     棋子用**圆形**（不是方块），叠子角标 ×N，当前回合金圈呼吸。 */
  function drawFlight(c, W, H) {
    setActsBottom(96 + 46);
    _flHits = [];
    var G0 = flGeom(W, H);
    var bx = G0.bx, by = G0.by, cs = G0.cs;
    function rcxy(rc) { return [bx + rc[1] * cs, by + rc[0] * cs]; }
    function rcCenter(rc) { return [bx + rc[1] * cs + cs / 2, by + rc[0] * cs + cs / 2]; }
    var FL_CI_REV = ['b', 'r', 'y', 'g'];
    var pu0 = pulse();

    /* ── ① 四角机库大色块（6×6 区域，传统飞行棋的标志性视觉） ── */
    var QUAD_DRAW = { r: [0, 0], y: [0, 8], g: [8, 8], b: [8, 0] };
    Object.keys(QUAD_DRAW).forEach(function (col) {
      var qr = QUAD_DRAW[col][0], qc = QUAD_DRAW[col][1];
      var p = G.colors.indexOf(col), active = p >= 0;
      var isCurTurn = active && G.turn === p && !G.over;
      /* 大色块底色 */
      c.fillStyle = FL_COL[col]; c.globalAlpha = active ? 0.22 : 0.08;
      c.fillRect(bx + qc * cs, by + qr * cs, 6 * cs, 6 * cs);
      c.globalAlpha = 1;
      /* 边框（当前回合呼吸） */
      if (isCurTurn) {
        c.strokeStyle = 'rgba(255,209,102,' + (0.5 + 0.5 * pu0).toFixed(3) + ')';
        c.lineWidth = 3 + pu0 * 2;
      } else {
        c.strokeStyle = FL_COL[col]; c.globalAlpha = active ? 0.6 : 0.2; c.lineWidth = 2;
      }
      c.strokeRect(bx + qc * cs + 1, by + qr * cs + 1, 6 * cs - 2, 6 * cs - 2);
      c.globalAlpha = 1;
      /* 机库内标题 */
      c.fillStyle = FL_COL[col]; c.globalAlpha = active ? 0.95 : 0.3;
      c.font = 'bold ' + Math.max(11, cs * 0.52) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.fillText(FL_SOC[col] + '社' + (active ? '·' + ((G.real && G.real[p]) || '?') : ''), bx + (qc + 3) * cs, by + (qr + 1.3) * cs);
      c.globalAlpha = 1;
      if (!active) return;
      /* 4 个圆形停机位（2×2 排列在机库中心） */
      var homeR = cs * 0.42;
      var positions = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]];
      var hcx = bx + (qc + 3) * cs, hcy = by + (qr + 3.4) * cs;
      G.planes[p].forEach(function (v, i) {
        if (v !== -1) return;
        var px2 = hcx + positions[i][0] * cs * 1.1, py2 = hcy + positions[i][1] * cs * 0.9;
        var canGo = p === 0 && G.options && G.options.indexOf(i) >= 0;
        /* 停机圈 */
        c.beginPath(); c.arc(px2, py2, homeR, 0, 6.2832);
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
        c.strokeStyle = canGo ? '#ffd166' : FL_COL[col]; c.lineWidth = canGo ? 2.5 : 1.5;
        c.globalAlpha = canGo ? 1 : 0.5; c.stroke(); c.globalAlpha = 1;
        /* 待出道棋子（圆形，自家色） */
        c.beginPath(); c.arc(px2, py2, homeR * 0.65, 0, 6.2832);
        c.fillStyle = FL_COL[col]; c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
        c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
        if (canGo) {
          c.beginPath(); c.arc(px2, py2, homeR + pu0 * 4, 0, 6.2832);
          c.strokeStyle = 'rgba(255,209,102,.9)'; c.lineWidth = 2.8; c.stroke();
        }
        if (p === 0) _flHits.push({ idx: i, x: px2, y: py2, r: homeR + 6 });
      });
      /* 战报（骰子数/当前回合/停一轮） */
      var lastDice = (G.lastPlay && G.lastPlay[p] && G.lastPlay[p][0] && G.lastPlay[p][0].kind === 'dice') ? G.lastPlay[p][0].n : null;
      var info = isCurTurn ? '🎲 当前回合' : (G.skipFlag && G.skipFlag[p]) ? '⏸ 停一轮' : (lastDice !== null ? '🎲 ' + lastDice : '');
      if (info) {
        c.fillStyle = isCurTurn ? '#ffd166' : 'rgba(255,255,255,.55)';
        c.font = 'bold ' + Math.max(10, cs * 0.42) + 'px sans-serif';
        c.fillText(info, hcx, by + (qr + 5.4) * cs);
      }
    });

    /* ── ② 十字路径：外环 52 格（白底 + 对应色标记） ── */
    for (var i = 0; i < FL_RING; i++) {
      var xy2 = rcxy(flRC(i));
      var colName = FL_CI_REV[i % 4];
      var isStart = false, startCol = null;
      Object.keys(FL_START).forEach(function (k) { if (FL_START[k] === i) { isStart = true; startCol = k; } });
      /* 格子底色：白底 + 角上一点自家色（传统飞行棋风格） */
      c.fillStyle = 'rgba(255,255,255,.12)';
      c.fillRect(xy2[0] + 1, xy2[1] + 1, cs - 2, cs - 2);
      /* 色条：底边一条窄色带标识这格属于哪家 */
      c.fillStyle = FL_COL[colName]; c.globalAlpha = 0.45;
      c.fillRect(xy2[0] + 1, xy2[1] + cs - 5, cs - 2, 4);
      c.globalAlpha = 1;
      /* 起点格特殊：大色块 + 粗描边 + ▶ */
      if (isStart) {
        c.fillStyle = FL_COL[startCol]; c.globalAlpha = 0.55;
        c.fillRect(xy2[0] + 1, xy2[1] + 1, cs - 2, cs - 2);
        c.globalAlpha = 1;
        c.strokeStyle = FL_COL[startCol]; c.lineWidth = 2.5;
        c.strokeRect(xy2[0] + 1, xy2[1] + 1, cs - 2, cs - 2);
      }
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 0.8;
      c.strokeRect(xy2[0] + 1, xy2[1] + 1, cs - 2, cs - 2);
      /* 格子标记 */
      c.font = Math.max(9, cs * 0.42) + 'px sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.9)';
      var mark = isStart ? '▶' : null;
      Object.keys(FL_ENTRY).forEach(function (k) { if (FL_ENTRY[k] === i) mark = '↵'; });
      if (FL_STAR.indexOf(i) >= 0) mark = '★';
      if (FL_LINE[i] !== undefined) mark = '✈';
      if (mark) c.fillText(mark, xy2[0] + cs / 2, xy2[1] + cs * 0.7);
    }

    /* ── ③ 归航臂（半透明色条） ── */
    Object.keys(FL_ENTRY).forEach(function (col) {
      for (var k = 0; k < 5; k++) {
        var rc = flArmRC(col, k), xy = rcxy(rc);
        c.fillStyle = FL_COL[col]; c.globalAlpha = 0.3;
        c.fillRect(xy[0] + 1, xy[1] + 1, cs - 2, cs - 2);
        c.globalAlpha = 1;
        c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 0.8;
        c.strokeRect(xy[0] + 1, xy[1] + 1, cs - 2, cs - 2);
        /* 归航格编号 */
        c.fillStyle = FL_COL[col]; c.globalAlpha = 0.7;
        c.font = Math.max(8, cs * 0.35) + 'px sans-serif'; c.textAlign = 'center';
        c.fillText(k + 1, xy[0] + cs / 2, xy[1] + cs * 0.7);
        c.globalAlpha = 1;
      }
    });

    /* ── ④ 永恒王座（中心 2×2，四色三角拼） ── */
    var tc = rcCenter([6.5, 6.5]); /* 中心点 */
    var tSize = cs;
    ['r', 'y', 'g', 'b'].forEach(function (col, qi) {
      var angle = qi * Math.PI / 2;
      c.beginPath();
      c.moveTo(tc[0], tc[1]);
      c.lineTo(tc[0] + Math.cos(angle - 0.78) * tSize, tc[1] + Math.sin(angle - 0.78) * tSize);
      c.lineTo(tc[0] + Math.cos(angle + 0.78) * tSize, tc[1] + Math.sin(angle + 0.78) * tSize);
      c.closePath();
      c.fillStyle = FL_COL[col]; c.globalAlpha = 0.55; c.fill();
      c.globalAlpha = 1;
    });
    c.fillStyle = '#ffd166'; c.font = 'bold ' + Math.max(16, cs * 0.9) + 'px sans-serif'; c.textAlign = 'center';
    c.fillText('♛', tc[0], tc[1] + cs * 0.3);
    /* ── ⑤ 棋子（圆形，传统飞行棋风格） ── */
    var stack = {}, stackN = {};
    G.colors.forEach(function (col, p) {
      G.planes[p].forEach(function (v) {
        if (v === -1) return;
        var rc0 = flPieceRC(p, v);
        var k0 = p + '|' + rc0[0] + ',' + rc0[1];
        stackN[k0] = (stackN[k0] || 0) + 1;
      });
    });
    G.colors.forEach(function (col, p) {
      G.planes[p].forEach(function (v, idx) {
        if (v === -1) return;
        var rc = flPieceRC(p, v), ctr = rcCenter(rc);
        var key = rc[0] + ',' + rc[1];
        var n = stack[key] || 0; stack[key] = n + 1;
        var myN = stackN[p + '|' + rc[0] + ',' + rc[1]] || 1;
        var r = Math.max(8, cs * 0.38);
        /* 多子偏移（最多 4 子堆在一格） */
        var ox = (n % 2 - 0.5) * r * 0.6, oy = (Math.floor(n / 2) - 0.5) * r * 0.6;
        if (myN <= 1) { ox = 0; oy = 0; }
        var cx2 = ctr[0] + ox, cy2 = ctr[1] + oy;
        var isTurn = (G.turn === p && !G.over);
        var canGo = p === 0 && G.options && G.options.indexOf(idx) >= 0;
        /* 可点高亮 */
        if (canGo) {
          c.beginPath(); c.arc(cx2, cy2, r + pu0 * 4, 0, 6.2832);
          c.strokeStyle = 'rgba(255,209,102,.95)'; c.lineWidth = 3; c.stroke();
          c.fillStyle = '#ffd166';
          c.font = 'bold ' + Math.max(10, cs * 0.42) + 'px sans-serif'; c.textAlign = 'center';
          c.fillText('▼', cx2, cy2 - r - 3);
        }
        /* 当前回合金圈 */
        if (isTurn) {
          c.beginPath(); c.arc(cx2, cy2, r * 0.9 + pu0 * 3, 0, 6.2832);
          c.strokeStyle = 'rgba(255,209,102,.85)'; c.lineWidth = 2; c.stroke();
        }
        if (p === 0) _flHits.push({ idx: idx, x: cx2, y: cy2, r: r + 5 });
        /* 棋子本体（圆形 + 白边 + 编号） */
        c.beginPath(); c.arc(cx2, cy2, r * 0.72, 0, 6.2832);
        c.fillStyle = FL_COL[col]; c.fill();
        c.strokeStyle = isTurn ? '#ffd166' : '#fff'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold ' + Math.max(9, r * 0.55) + 'px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(idx + 1, cx2, cy2 + 1);
        c.textBaseline = 'alphabetic';
        /* 叠子角标 */
        if (myN >= 2 && n === 0) {
          c.fillStyle = 'rgba(10,6,24,.92)';
          c.strokeStyle = '#ffd166'; c.lineWidth = 1.4;
          var bw3 = Math.max(16, r * 1.1), bh3 = Math.max(12, r * 0.6);
          var bx3 = cx2 + r * 0.4, by3 = cy2 - r - bh3 * 0.3;
          c.fillRect(bx3, by3, bw3, bh3); c.strokeRect(bx3, by3, bw3, bh3);
          c.fillStyle = '#ffd166'; c.font = 'bold ' + Math.max(9, r * 0.5) + 'px sans-serif';
          c.fillText('×' + myN, bx3 + bw3 / 2, by3 + bh3 * 0.78);
        }
      });
    });
    /* 撞机闪光 + 抽卡横幅 */
    drawFlFlash(c, W, H, cs, cs, bx, by);
    drawFlBanner(c, W, H);
    /* 二十三更·骰子大提示：掷骰动画中也要画——数字快速跳动增加刺激感 */
    var showDice = (G.dice > 0 || _diceAnim) && !G.over;
    if (showDice) {
      var ds = Math.max(46, cs * 1.5), dx = W / 2 - ds / 2, dy = by + cs * 5.6;
      /* 动画中的微旋转和弹跳效果 */
      if (_diceAnim) {
        var frac0 = Math.min(1, (Date.now() - _diceAnim.t0) / _diceAnim.dur);
        var bounce = Math.sin(frac0 * Math.PI * 6) * (1 - frac0) * 4;
        c.save();
        c.translate(dx + ds / 2, dy + ds / 2);
        c.rotate(Math.sin(frac0 * Math.PI * 8) * (1 - frac0) * 0.15);
        c.translate(-ds / 2, -ds / 2 + bounce);
        dx = 0; dy = 0;
      }
      c.fillStyle = '#fff';
      c.fillRect(dx, dy, ds, ds);
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.strokeRect(dx, dy, ds, ds);
      c.fillStyle = '#241a3d';
      var dn = G.dice, pts = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]], 6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]] }[dn];
      if (dn >= 1 && dn <= 6) {
        pts.forEach(function (pt) {
          c.beginPath(); c.arc(dx + pt[0] * ds, dy + pt[1] * ds, ds * 0.09, 0, 6.2832); c.fill();
        });
      }
      if (_diceAnim) c.restore();   /* 二十三更：骰子旋转动画结束后恢复坐标系 */
      c.font = 'bold ' + Math.max(12, cs * 0.48) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      if (_diceAnim) {
        c.fillStyle = '#ffd166';
        c.fillText('🎲 摇骰子中……', W / 2, dy + ds + 20);
      } else if (G.options && G.options.length) {
        c.fillStyle = '#ffd166';
        c.fillText('点棋盘上金圈里的艺人出动／走位！', W / 2, dy + ds + 20);
      } else if (G.dice === 6) {
        c.fillStyle = '#ffd166';
        c.fillText('掷到 6！再摇一次', W / 2, dy + ds + 20);
      }
    }
    /* 二十三更：没掷骰子时中央提示「点击屏幕摇骰子」——不再只靠底栏那个小按钮 */
    if (!showDice && G.turn === 0 && !G.over && !G.spectate && !G.anim && !G.draw && !_diceAnim) {
      c.fillStyle = 'rgba(255,209,102,.9)';
      c.font = 'bold ' + Math.max(16, cs * 0.8) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.fillText('👆 点击屏幕摇骰子', W / 2, by + cs * 6.8);
    }
    /* 底栏：我的经纪人条（观战则显示提示） */
    var bh2 = 52, byy = H - bh2;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, byy, W, bh2);
    if (!G.spectate) {
      var meTurn = (G.turn === 0 && !G.over);
      if (meTurn) {
        var pu3 = pulse();
        c.strokeStyle = 'rgba(255,209,102,' + (0.4 + 0.5 * pu3).toFixed(3) + ')'; c.lineWidth = 2.5;
        c.strokeRect(8, byy + 4, Math.min(240, W - 16), bh2 - 8);
      }
      c.fillStyle = meTurn ? '#ffd166' : 'rgba(255,255,255,.9)';
      c.font = 'bold 12px sans-serif'; c.textAlign = 'left';
      c.fillText((meTurn ? '▶ ' : '') + ((G.real && G.real[0]) || '我') + '（我）· ' + FL_SOC[G.colors[0]] + '社经纪人　骰:' + (G.dice || '—'), 14, byy + 18);
      var sw = 26, gap = 36, rowW = 4 * gap;
      var x0 = W / 2 - rowW / 2;
      G.planes[0].forEach(function (v, i) {
        var x = x0 + i * gap, y = byy + 24;
        var sel = G.options && G.options.indexOf(i) >= 0;
        if (sel) {
          c.beginPath(); c.arc(x + sw / 2, y + sw / 2, sw / 2 + 4 + pulse() * 2.5, 0, 6.2832);
          c.strokeStyle = 'rgba(255,209,102,.9)'; c.lineWidth = 2.5; c.stroke();
        }
        c.beginPath(); c.arc(x + sw / 2, y + sw / 2, sw / 2, 0, 6.2832);
        c.fillStyle = FL_COL[G.colors[0]];
        c.globalAlpha = v === FL_TOTAL ? 0.45 : 1; c.fill(); c.globalAlpha = 1;
        c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center';
        c.fillText(v === -1 ? '待出道' : (v === FL_TOTAL ? '♛' : (v > 50 ? '归航' : v + '')), x + sw / 2, y + sw + 11);
      });
    } else {
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText('👁 观战席 · ' + G.names[G.turn] + ' 回合中 · 顶栏 💰 可押注', W / 2, byy + 30);
    }
    /* 抽卡仪式层（压在最上面） */
    if (G.draw) drawDrawLayer(c, W, H);
  }
  /* ---------- 抽卡仪式绘制：遮罩 + 三张背面牌，点一张翻开 ---------- */
  /* 二十一更：撞机闪光——「谁把谁撞回机库了」要在棋盘上闪一下才看得见 */
  function drawFlFlash(c, W, H, csx, csy, bx, by) {
    var F = G && G.flash;
    if (!F) return;
    var age = Date.now() - F.t0;
    if (age > 1500) { G.flash = null; return; }
    var rc = flRC(F.cell), x = bx + rc[1] * csx, y = by + rc[0] * csy;
    var k = age / 1500, a = 1 - k;
    c.save();
    c.globalAlpha = a;
    var rr = Math.max(csx, csy) * (0.55 + k * 1.9);
    c.strokeStyle = '#ffffff'; c.lineWidth = 3 + 5 * a;
    c.beginPath(); c.arc(x + csx / 2, y + csy / 2, rr, 0, 6.2832); c.stroke();
    c.strokeStyle = '#ffd166'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(x + csx / 2, y + csy / 2, rr * 0.6, 0, 6.2832); c.stroke();
    c.fillStyle = '#ff9aa0';
    c.font = 'bold ' + Math.max(15, csy * 0.6) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'center';
    c.fillText('💥 撞飞 ×' + F.n + '！', x + csx / 2, y - 5);
    c.restore();
  }
  /* 二十一更：抽卡横幅——抽中了什么，牌桌中央大字报 2.6 秒（陛下：太快看不出来） */
  function drawFlBanner(c, W, H) {
    var B = G && G.cardBanner;
    if (!B) return;
    var age = Date.now() - B.t0;
    if (age > B.ms + 500) { G.cardBanner = null; return; }
    var a = age < 220 ? age / 220 : (age > B.ms ? Math.max(0, 1 - (age - B.ms) / 500) : 1);
    var bw = Math.min(W - 24, 430), bh = 78;
    var x = W / 2 - bw / 2, y = H * 0.46 - bh / 2;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = 'rgba(10,6,24,.95)';
    c.strokeStyle = B.kind === 'event' ? '#ffd166' : '#c9b6f5'; c.lineWidth = 2.5;
    c.fillRect(x, y, bw, bh); c.strokeRect(x, y, bw, bh);
    c.textAlign = 'center';
    c.fillStyle = B.kind === 'event' ? '#ffd166' : '#c9b6f5';
    c.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText((B.kind === 'event' ? '🟠 事件卡' : '🔮 命运卡') + ' · ' + B.who + ' 抽中', W / 2, y + 20);
    c.fillStyle = '#fff';
    c.font = 'bold 17.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText(B.name, W / 2, y + 45);
    if (B.desc) {
      c.fillStyle = 'rgba(255,255,255,.82)'; c.font = '11.5px sans-serif';
      c.fillText(B.desc, W / 2, y + 65);
    }
    c.restore();
  }
  function drawDrawLayer(c, W, H) {
    var D = G.draw;
    c.fillStyle = 'rgba(10,6,24,.8)'; c.fillRect(0, 0, W, H);
    var n = D.cards.length;
    /* 二十一更（陛下钦定「太快看不清」）：牌放大、翻牌慢一点、抽中后定住让人看清楚 */
    var cw2 = Math.min(122, W / (n + 1.2)), ch2 = cw2 * 1.5;
    var gap = cw2 * 1.14;
    var x0 = W / 2 - (n - 1) * gap / 2 - cw2 / 2, y0 = H / 2 - ch2 / 2 + 8;
    c.fillStyle = '#ffd166'; c.font = 'bold 17px "PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center';
    c.fillText(D.kind === 'event' ? '🟠 事件卡 · 落 ★ 抽一张' : '🔮 命运卡 · 航线加持抽一张', W / 2, y0 - 26);
    c.fillStyle = 'rgba(255,255,255,.78)'; c.font = '12.5px sans-serif';
    c.fillText(G.names[D.p] + (D.picked < 0 ? ' · 点一张牌揭开命运' : ' · 命运揭晓，稍等就生效……'), W / 2, y0 - 8);
    for (var i = 0; i < n; i++) {
      var x = x0 + i * gap, y = y0;
      var picked = D.picked === i;
      var dim = D.picked >= 0 && !picked;
      c.save();
      if (dim) c.globalAlpha = 0.25;
      if (picked && D.revealAt) {
        var t = Math.min(1, (Date.now() - D.revealAt) / 800);
        var s = 0.7 + 0.48 * t;
        /* 抽中的那张：金光外圈一圈一圈荡开 */
        if (t >= 1) {
          var gl = 0.5 + 0.5 * Math.sin((Date.now() % 900) / 900 * 6.2832);
          c.save();
          c.strokeStyle = 'rgba(255,209,102,' + (0.35 + 0.45 * gl) + ')'; c.lineWidth = 3 + gl * 3;
          c.strokeRect(x - 5 - gl * 3, y - 5 - gl * 3, cw2 + 10 + gl * 6, ch2 + 10 + gl * 6);
          c.restore();
        }
        c.translate(x + cw2 / 2, y + ch2 / 2);
        c.scale(s, s);
        c.translate(-(x + cw2 / 2), -(y + ch2 / 2));
        /* 卡面 */
        c.fillStyle = D.kind === 'event' ? '#3b2a5e' : '#241a3d';
        c.strokeStyle = D.kind === 'event' ? '#ffd166' : '#c9b6f5'; c.lineWidth = 2.5;
        c.fillRect(x, y, cw2, ch2); c.strokeRect(x, y, cw2, ch2);
        c.fillStyle = '#ffd166'; c.font = 'bold ' + Math.max(13, cw2 * 0.165) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        wrapText(c, D.cards[i].n, x + cw2 / 2, y + ch2 * 0.38, cw2 - 14, cw2 * 0.2);
        c.fillStyle = 'rgba(255,255,255,.86)'; c.font = Math.max(10, cw2 * 0.108) + 'px sans-serif';
        wrapText(c, flCardDesc(D.cards[i].n), x + cw2 / 2, y + ch2 * 0.72, cw2 - 16, cw2 * 0.145);
      } else {
        /* 背面牌（素材引擎的飞行棋牌背，没素材也有占位符） */
        if (global.SK && SK.drawBack) SK.drawBack(c, 'flight', x, y, cw2, ch2);
        else {
          c.fillStyle = '#3b2a5e'; c.fillRect(x, y, cw2, ch2);
          c.strokeStyle = '#c9b6f5'; c.strokeRect(x, y, cw2, ch2);
          c.fillStyle = '#ffd166'; c.font = 'bold ' + cw2 * 0.4 + 'px sans-serif'; c.textAlign = 'center';
          c.fillText('✦', x + cw2 / 2, y + ch2 / 2);
        }
      }
      c.restore();
    }
  }
  function wrapText(c, text, cx, y, maxW, lh) {
    var chars = String(text).split('');
    var line = '', lines = [];
    chars.forEach(function (ch) {
      if (c.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
      else line += ch;
    });
    if (line) lines.push(line);
    lines.slice(0, 3).forEach(function (l, i) { c.fillText(l, cx, y + i * lh); });
  }
  /* ---------- 地块说明：悬停/点按任何格子都告诉你它是干嘛的 ---------- */
  function flCellAt(x, y, W, H) {
    var g = flGeom(W, H);
    var col = Math.floor((x - g.bx) / g.csx), row = Math.floor((y - g.by) / g.csy);
    if (row < 0 || row > 13 || col < 0 || col > 13) return null;
    /* 王座 */
    var tk = Object.keys(FL_THRONE).find(function (k) { return FL_THRONE[k][0] === row && FL_THRONE[k][1] === col; });
    if (tk) return { t: '♛ 永恒王座', d: '四社艺人全员走到这里即登上王座——番位之战的终点。' };
    /* 归航臂 */
    var arm = null;
    Object.keys(FL_ENTRY).forEach(function (k) {
      for (var q = 0; q < 5; q++) if (flArmRC(k, q)[0] === row && flArmRC(k, q)[1] === col) arm = k;
    });
    if (arm) return { t: FL_SOC[arm] + '社 · 归航臂', d: '绕完外环从这里拐进来，再走 5 格就能登顶 ♛。' };
    /* 机库象限 */
    var quad = null;
    Object.keys(FL_QUAD).forEach(function (k) {
      var q2 = FL_QUAD[k];
      if (row >= q2[0] && row <= q2[2] && col >= q2[1] && col <= q2[3]) quad = k;
    });
    if (quad) return { t: FL_SOC[quad] + '社 · 机库', d: '待出道艺人的停机位。掷到 6 才能出道，站上该社的 ▶ 出道格。' };
    /* 外环格 */
    for (var i = 0; i < FL_RING; i++) {
      var rc = flRC(i);
      if (rc[0] === row && rc[1] === col) {
        var cname = ['星幕', '潮声', '拾光', '云顶'][i % 4] + '色格';
        var st = Object.keys(FL_START).find(function (k) { return FL_START[k] === i; });
        if (st) return { t: '▶ ' + FL_SOC[st] + '社 · 出道格', d: '该社艺人掷到 6 后第一个落脚点（全程 56 步的起点）。' };
        var en = Object.keys(FL_ENTRY).find(function (k) { return FL_ENTRY[k] === i; });
        if (en) return { t: '↵ ' + FL_SOC[en] + '社 · 归航入口', d: '该社艺人绕完一圈从这里拐进归航臂（不再受撞子影响）。' };
        if (FL_STAR.indexOf(i) >= 0) return { t: '★ 事件格（' + cname + '）', d: '落上去自动进入事件卡抽卡仪式——32 张事件区，三选一。' };
        if (FL_LINE[i] !== undefined) return { t: '✈ 航线（' + cname + '）', d: '踩中直接冲到第 ' + FL_LINE[i] + ' 格（+12），再抽一张命运卡（20 张命运区）。' };
        var ci2 = i % 4;
        return { t: '普通格 · ' + cname, d: '普通环格。恰好落在 ' + ['星幕', '潮声', '拾光', '云顶'][ci2] + '色格上会触发同色连跳 +4。' };
      }
    }
    return null;
  }
  var _tipEl = null;
  function showCellTip(x, y, info) {
    if (!_tipEl) {
      _tipEl = document.createElement('div');
      _tipEl.id = 'cg-celltip';
      _tipEl.style.cssText = 'position:absolute;z-index:12;pointer-events:none;max-width:230px;background:rgba(16,9,34,.95);' +
        'border:1px solid rgba(255,209,102,.5);border-radius:10px;padding:8px 10px;font-size:11px;line-height:1.55;color:#f5f1fc;display:none;box-shadow:0 6px 18px rgba(0,0,0,.5);';
      $('cg-center').appendChild(_tipEl);
    }
    if (!info) { _tipEl.style.display = 'none'; return; }
    _tipEl.innerHTML = '<b style="color:#ffd166;">' + esc(info.t) + '</b><br>' + esc(info.d);
    _tipEl.style.display = 'block';
    var box = $('cg-center').getBoundingClientRect();
    var lx = Math.min(x + 14, box.width - 244), ly = Math.max(4, y - 10);
    _tipEl.style.left = lx + 'px'; _tipEl.style.top = ly + 'px';
  }

  /* ================= 押注系统（总纲 0.5 · 十七更三币版） =================
     彩池按币种分池：押什么币、赢什么币，赔率公式不变（0.95×该币总池÷该家池）。
     对局者绝不押注（总纲硬规则）；观战者可押。 */
  function initBet() {
    G.bet = {
      mode: G.game === 'doudizhu' ? 'fixed' : 'pot',
      myCur: GAMES[G.game].cur,          /* 我这一桌押注用的币（可切） */
      openUntil: Date.now() + BET_WINDOW_MS,
      closed: false, settled: false,
      /* ⚠️ 十七更续修：plan 以前是 null，而 placeBet 开头就 `if (!G.bet.plan) return`——
         于是「✅ 下注」永远被挡在门外，陛下点烂了也扣不了一分钱（还弹一句看不懂的提示）。
         默认给「押 1 次」，面板上再切成押 3 次。 */
      plan: 1, mineCnt: 0,
      bets: [],                          /* 注单各带 b.cur，结算各回各的币 */
      pool: { coin: null, diamond: null, pearl: null },   /* 每币种一个彩池（懒建） */
      ddPool: { coin: {}, diamond: {}, pearl: {} }
    };
    G.specs = [];                        /* 十七更：虚拟观战删光，观战席只认真人 */
    G.allowPaid = false;
  }
  function betPool(cur) {
    var B = G.bet;
    if (!B.pool[cur]) B.pool[cur] = new Array(G.seats).fill(0);
    return B.pool[cur];
  }
  function placeBet(t, amt) {
    if (!G || !G.bet || !G.spectate || G.bet.closed || G.over) return;
    if (!G.bet.plan) { toast('🚫 先选「押 1 次」或「押 3 次」'); return; }
    if (G.bet.mineCnt >= 3) { toast('🚫 每桌限 3 注单（总纲硬规则）'); return; }
    amt = Math.max(BET_MIN, Math.min(BET_MAX, amt));
    var cur = G.bet.myCur;
    var myTotal = G.bet.bets.filter(function (b) { return b.mine && b.cur === cur; }).reduce(function (a, b) { return a + b.amt; }, 0);
    if (myTotal + amt > BET_TABLE_MAX) { toast('🚫 超过桌上限 ' + fmt(BET_TABLE_MAX)); return; }
    var w = walletAll();
    if ((w[cur] || 0) < amt) { toast('🚫 ' + CUR[cur].n + '不够了，换个币种或先去赚点'); return; }
    var tg = betTargets();
    var name = G.bet.mode === 'fixed' ? tg[t].name : tg[t];
    walletAdd(cur, -amt);
    var a3 = G.bet.plan === 3 ? Math.round(amt / 3) : amt;
    var b = {
      mine: true, target: t, targetName: name, amt: amt, cur: cur, plan: G.bet.plan,
      segs: G.bet.plan === 3 ? [a3, a3, amt - 2 * a3] : [amt],
      segIdx: 0, paid: 0,
      segAt: G.bet.plan === 3 ? [Date.now(), G.bet.openUntil - 20000, G.bet.openUntil - 5000] : [Date.now()]
    };
    paySeg(b);
    G.bet.bets.push(b); G.bet.mineCnt++;
    cgLog('🎫 我押 ' + fmt(amt) + ' ' + CUR[cur].n + ' → ' + name);
    renderRails();
  }
  function paySeg(b) {
    if (b.segIdx >= b.segs.length) return;
    var s = b.segs[b.segIdx++];
    b.paid += s;
    if (G.bet.mode === 'pot') { betPool(b.cur)[b.target] += s; }
    else { G.bet.ddPool[b.cur][b.target] = (G.bet.ddPool[b.cur][b.target] || 0) + s; }
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
    /* 二十二更：我的押注本金先记进账本——结算面板要算「最后到手多少」 */
    (B.bets || []).forEach(function (b0) { if (b0.mine) stAcc(b0.cur, 'betStake', b0.paid); });
    function refund(b) {
      walletAdd(b.cur, b.paid);
      stAcc(b.cur, 'betBack', b.paid);
      cgLog('🧾 押注原路退还（' + fmt(b.paid) + ' ' + CUR[b.cur].n + '）');
    }
    if (B.mode === 'pot') {
      /* 各币种各自开彩：该币总池 vs 该家池 */
      Object.keys(CUR).forEach(function (cur) {
        var pool = B.pool[cur]; if (!pool) return;
        var total = pool.reduce(function (a, b2) { return a + b2; }, 0);
        if (total <= 0) return;
        if (typeof G.winSeat !== 'number') { B.bets.forEach(function (b) { if (b.mine && b.cur === cur) refund(b); }); return; }
        var poolW = pool[G.winSeat];
        B.bets.forEach(function (b) {
          if (!b.mine || b.cur !== cur) return;
          if (b.target === G.winSeat && poolW > 0) {
            var pay = Math.floor(b.paid * 0.95 * total / poolW);
            walletAdd(cur, pay);
            stAcc(cur, 'betBack', pay);
            cgLog('🎊 注单命中！' + esc(b.targetName) + ' 赔率 ×' + (0.95 * total / poolW).toFixed(2) + ' → 回款 ' + fmt(pay) + ' ' + CUR[cur].n);
          } else {
            cgLog('🧾 注单未中（' + fmt(b.paid) + ' ' + CUR[cur].n + ' 支持了 ' + esc(b.targetName) + '）');
          }
        });
      });
    } else {
      var oddsL = [1.9, 2.1, 1.8];
      B.bets.forEach(function (b) {
        if (!b.mine) return;
        if (typeof G.winSeat !== 'string') { refund(b); return; }
        var hit = (b.target === 0 && G.winSeat === 'z') || (b.target === 1 && G.winSeat === 's') || (b.target === 2 && G.winSeat === 'z');
        if (hit) {
          var pay2 = Math.floor(b.paid * oddsL[b.target]);
          walletAdd(b.cur, pay2);
          stAcc(b.cur, 'betBack', pay2);
          cgLog('🎊 固定赔率命中 ×' + oddsL[b.target] + ' → 回款 ' + fmt(pay2) + ' ' + CUR[b.cur].n);
        } else {
          cgLog('🧾 注单未中（' + fmt(b.paid) + ' ' + CUR[b.cur].n + '）');
        }
      });
    }
    settleEntry();
    renderRails();
  }

  /* ================= 入场费（陛下钦定：三档 · 冠亚分账） =================
     小场 500 / 中场 2,000 / 大场 10,000，三币任选其一付；
     池子 95% 按名次分（2 人局 70/30，3-4 人局 50/30/20），5% 归荷官。
     AI 补位也照付——池子才够肥。 */
  var ENTRY_FEES = [500, 2000, 10000];
  function entryRank() {
    /* 各玩法名次（数组 [第一名, 第二名, ...]，按座位号） */
    var n = G.seats, rank = [];
    if (G.game === 'uno') {
      var rest = [];
      for (var p = 0; p < n; p++) rest.push({ p: p, cnt: G.hands[p].length });
      rest.sort(function (a, b) { return a.cnt - b.cnt; });
      rest.forEach(function (x) { rank.push(x.p); });
    } else if (G.game === 'mahjong') {
      /* 二十二更：别再认 G.winSeat（流局时它是 -1，名次会冒出个「P-1」）——
         按「胡没胡 → 胡的顺序 → 番位账本高低」排，稳。 */
      var mjr = [];
      for (var q = 0; q < n; q++) mjr.push(q);
      mjr.sort(function (a, b) {
        var ha = (G.hu && G.hu[a]) || null, hb = (G.hu && G.hu[b]) || null;
        if (ha && hb) return (G.huOrder.indexOf(a) - G.huOrder.indexOf(b));
        if (ha) return -1;
        if (hb) return 1;
        return ((G.score && G.score[b]) || 0) - ((G.score && G.score[a]) || 0);
      });
      rank = mjr;
    } else if (G.game === 'doudizhu') {
      /* 庄赢：庄第一，两散按剩牌少在前；散赢：先走的第一，另一散第二，庄第三 */
      var others = [];
      for (var d = 0; d < n; d++) if (d !== G.winSeatNum) others.push({ p: d, cnt: G.hands[d].length });
      others.sort(function (a, b) { return a.cnt - b.cnt; });
      rank = [G.winSeatNum]; others.forEach(function (x) { rank.push(x.p); });
    } else {   /* flight：按全体进度排 */
      var prog = G.planes.map(function (ps) { return ps.reduce(function (a, v) { return a + Math.max(v, 0); }, 0); });
      var idx = [];
      for (var f = 0; f < n; f++) idx.push(f);
      idx.sort(function (a, b) { return prog[b] - prog[a]; });
      rank = idx;
    }
    return rank;
  }
  function settleEntry() {
    if (!G || !G.entry || G.entryDone) return;
    G.entryDone = true;
    var E = G.entry, total = E.amt * G.seats;
    var pot = Math.floor(total * 0.95);
    if (G.seats < 2 || pot < E.amt) {
      cgLog('📊 入场费不满一档，原路退还');
      if (E.mine) { walletAdd(E.cur, E.amt); stAcc(E.cur, 'entryBack', E.amt); }
      return;
    }
    var rank = entryRank();
    var shares = G.seats === 2 ? [0.7, 0.3] : [0.5, 0.3, 0.2];
    var lines = [];
    for (var i = 0; i < rank.length && i < shares.length; i++) {
      var p = rank[i], get = Math.floor(pot * shares[i]);
      /* 二十二更：名次分账留档——结算面板要按它摆「谁分了多少」 */
      if (G.settle) G.settle.rankPay.push({ p: p, get: get });
      if (p === 0 && E.mine) { walletAdd(E.cur, get); stAcc(E.cur, 'entryBack', get); }
      lines.push(GAMES[G.game].em + ' ' + (p === 0 ? '🥇' : p === 1 ? '🥈' : '🥉') + ' ' + G.names[p] + ' ' + fmt(get) + ' ' + CUR[E.cur].n);
    }
    cgLog('🏆 入场费结算（' + fmt(E.amt) + '×' + G.seats + '，抽水 5%）：' + lines.join('　'));
    if (E.mine && rank[0] === 0) toast('🏆 冠军！入场费分回 ' + fmt(Math.floor(pot * shares[0])) + ' ' + CUR[E.cur].n);
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
    walletAdd(G.bet.myCur, 200);
    cgLog('🎁 观战满 3 分钟，津贴 +200 ' + CUR[G.bet.myCur].n + '（今日第 ' + d.n + ' 次）');
    toast('🎁 观战津贴 +200 ' + CUR[G.bet.myCur].n);
  }
  function startTick() {
    stopTick();
    /* 十七更：250ms 一拍——脉冲高亮/倒计时条要动起来；按钮有签名缓存不会误伤点击 */
    _tickTimer = setInterval(function () {
      if (!G) { stopTick(); return; }
      tickBets(); tickAllow();
      if (!G.over && !G.ai[G.turn] && !G.spectate && Date.now() - (G.turnAt || Date.now()) > TURN_MS) autoPlayFor();
      /* 押注条目节流刷新：秒数或彩池变了才重画左栏 */
      var poolKey = '';
      Object.keys(G.bet.pool).forEach(function (k) { var p = G.bet.pool[k]; if (p) poolKey += p.join(','); });
      var key = turnLeftSec() + '|' + poolKey + '|' + G.bet.mineCnt + '|' + (G.bet.closed ? 1 : 0) + '|' + (G.bet.myCur || '');
      if (key !== _leftKey) { _leftKey = key; renderLeft(); renderHud(); }
      if (!G.over) drawGame();
    }, 250);
  }
  function stopTick() { clearInterval(_tickTimer); _tickTimer = null; }

  /* ================= 点击分发 ================= */
  function onCanvasClick(ev) {
    if (!G) return;
    var cv = $('cg-canvas'), r = cv.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    var W = r.width, H = r.height;
    /* 点头像 → 告诉我是谁（陛下钦定：真名要看得见） */
    for (var sh = 0; sh < _seatHits.length; sh++) {
      var s2 = _seatHits[sh];
      if (x >= s2.x - 4 && x <= s2.x + s2.w + 4 && y >= s2.y - 4 && y <= s2.y + s2.h + 4) {
        var who = (G.real && G.real[s2.p]) || '？';
        var pos = (G.labels && G.labels[s2.p]) || '？';
        var lv = (G.ailv && G.ailv[s2.p]) || 0;
        toast('🎭 ' + who + '　' + pos + (lv ? '　AI·' + AI_LEVELS[Math.max(0, Math.min(4, lv - 1))] : '　真人玩家'));
        return;
      }
    }
    if (G.over) return;
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
      /* 抽卡仪式进行中：只响应选牌 */
      if (G.draw) { var dl = drawLayerHit(x, y, W, H); if (dl >= 0) pickDrawCard(dl); return; }
      /* 二十三更·陛下钦定：我的回合点画布任意位置 → 掷骰子（除了点到棋子命中区） */
      if (G.turn === 0 && !G.over && !G.spectate && !G.options && !G.anim && !_diceAnim && G.dice === 0) {
        /* 先检查是不是点到了棋子/头像等可交互区域 */
        var hitAnything = false;
        for (var fch = 0; fch < _flHits.length; fch++) {
          var fc2 = _flHits[fch];
          var dcx2 = x - fc2.x, dcy2 = y - fc2.y;
          if (dcx2 * dcx2 + dcy2 * dcy2 <= fc2.r * fc2.r) { hitAnything = true; break; }
        }
        if (!hitAnything) { flRoll(); return; }
      }
      if (G.turn !== 0 || !G.options) {
        var info0 = flCellAt(x, y, W, H);
        if (info0) showCellTip(x, y, info0);
        return;
      }
      /* 十七更续·陛下钦定：点「棋盘上的棋子」，不是点底栏那一排。
         ① 机巢等待位上的那一架 → 出道；② 已经上环/归航的那一架 → 往前走。
         底栏那排保留作兜底（万一小屏点不准还能点），但主入口是棋盘。 */
      for (var fh = 0; fh < _flHits.length; fh++) {
        var f = _flHits[fh];
        if (G.options.indexOf(f.idx) < 0) continue;
        var ddx = x - f.x, ddy = y - f.y;
        if (ddx * ddx + ddy * ddy <= f.r * f.r) { flMove(0, f.idx, G.dice); return; }
      }
      var sw = 26, gap = 36, rowW = 4 * gap, x0 = W / 2 - rowW / 2, y0 = H - 52 + 24;
      for (var k = 0; k < G.planes[0].length; k++) {
        var px = x0 + k * gap, py = y0;
        if (x >= px && x <= px + sw && y >= py && y <= py + sw && G.options.indexOf(k) >= 0) { flMove(0, k, G.dice); return; }
      }
      var info = flCellAt(x, y, W, H);
      if (info) showCellTip(x, y, info);
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

  /* 抽卡仪式的三张牌命中检测（几何与 drawDrawLayer 保持一致） */
  function drawLayerHit(x, y, W, H) {
    var D = G.draw; if (!D || D.picked >= 0) return -1;
    var n = D.cards.length;
    var cw2 = Math.min(96, W / (n + 1.4)), ch2 = cw2 * 1.5;
    var gap = cw2 * 1.16;
    var x0 = W / 2 - (n - 1) * gap / 2 - cw2 / 2, y0 = H / 2 - ch2 / 2 + 8;
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * gap;
      if (x >= cx && x <= cx + cw2 && y >= y0 && y <= y0 + ch2) return i;
    }
    return -1;
  }
  /* ---------- 卡堆查看：命运区 / 事件区一键翻遍 ---------- */
  function openDeckViewer(kind) {
    var old = $('cg-decks'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'cg-decks';
    ov.style.cssText = 'position:absolute;inset:0;z-index:18;background:rgba(10,6,24,.93);overflow-y:auto;padding:14px;';
    var list = kind === 'fate' ? FL_FATE : FL_EV;
    var deck = kind === 'fate' ? G.fate : G.evdeck;
    var cnt = {}; (deck || []).forEach(function (cd) { cnt[cd.n] = (cnt[cd.n] || 0) + 1; });
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<b style="font-size:15px;color:#ffd166;">' + (kind === 'fate' ? '🔮 命运区（剩 ' + (deck ? deck.length : 0) + '/20 张）' : '🟠 事件区（剩 ' + (deck ? deck.length : 0) + '/32 张）') + '</b>' +
      '<button class="cg-btn" id="cg-decks-x">✕ 关闭</button></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:8px;">';
    list.forEach(function (cd) {
      h += '<div class="cg-card" style="padding:8px;"><b style="color:' + (kind === 'fate' ? '#c9b6f5' : '#ffd166') + ';">' + esc(cd.n) + '</b>' +
        '<div class="cg-betline">' + esc(cd.d || '') + '</div>' +
        '<div class="cg-betline" style="opacity:.55;">牌堆里剩 ' + (cnt[cd.n] || 0) + ' 张</div></div>';
    });
    h += '</div>';
    ov.innerHTML = h;
    $('cg-center').appendChild(ov);
    $('cg-decks-x').onclick = function () { ov.remove(); };
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
    _spectate: function () { startGame(buildSetup(hall.game, hall.seats, hall.entry), { spectate: true }); },
    _state: function () { return G; },
    _anchors: seatAnchors,
    _geom: handGeom,
    _bet: function () { return G && G.bet; },
    _turnLeft: function () { return turnLeftSec(); },
    _seatTitle: seatTitle,
    _wallet: walletAll,
    _bubble: function (p, text) { cgBubble(p, text); },
    _bubbles: function () { return G && G.bubbles; },
    _seatOf: cgSeatOfName,
    /* 川麻规则调试口（只往外递状态/调用，不改任何规则） */
    _mj: function () {
      if (!G || G.game !== 'mahjong') return null;
      return {
        phase: G.phase, lack: (G.lack || []).slice(),
        melds: (G.melds || []).map(function (m) { return m.slice(); }),
        river: (G.river || []).map(function (r) { return r.length; }),
        handN: (G.hands || []).map(function (h) { return h.length; }),
        pending: G.pending || null, drawn: !!G.drawn,
        /* 二十一更：血战到底 + 番位账本 */
        hu: (G.hu || []).map(function (x) { return x ? { name: x.name, fan: x.fan, pts: x.pts, ziMo: x.ziMo } : null; }),
        huOrder: (G.huOrder || []).slice(), score: (G.score || []).slice(), base: G.mjBase,
        over: G.over || null, mustDiscard: !!G.mustDiscard
      };
    },
    _mjAuto: function () { return mjAutoDraw(); },
    _mjWin: function (p, tile, from, ziMo) { mjWin(p, tile, from, ziMo); },
    _mjResult: function () { var b = $('cg-mjres'); return b ? { open: b.classList.contains('open'), text: b.textContent } : null; },
    /* 二十二更：通用结算面板调试口（四玩法同款） */
    _result: function () {
      var b = $('cg-mjres');
      return b ? {
        open: b.classList.contains('open'),
        title: ($('cg-rtitle') || {}).textContent || '',
        text: b.textContent || '',
        settle: G ? JSON.parse(JSON.stringify(G.settle || null)) : null,
        wal: walletAll()
      } : null;
    },
    _closeResult: closeMjResult,
    _showResult: function () { showResult(); },
    /* 无头测试：把某一家直接推到胜利（只改状态，不碰规则） */
    _forceWin: function (p) {
      if (!G) return null;
      if (G.game === 'uno') { G.hands[p].length = 0; G.winSeat = p; G.over = G.names[p] + ' 杀青！'; settleBets(); drawGame(); showResult(); return G.over; }
      if (G.game === 'doudizhu') { G.winSeatNum = p; G.winSeat = (p === G.landlord) ? 'z' : 's'; G.over = G.names[p] + ' 通吃！'; G.hands[p].length = 0; settleBets(); drawGame(); showResult(); return G.over; }
      if (G.game === 'flight') { G.winSeat = p; G.over = G.names[p] + ' 登顶！'; settleBets(); drawGame(); showResult(); return G.over; }
      if (G.game === 'mahjong') { mjFinish([p]); return G.over; }
      return null;
    },
    _mjCloseResult: closeMjResult,
    _mjOpts: function (p, tile) { return mjClaimOpts(p, tile); },
    _mjClaim: function (p, kind, tile, from) { mjDoClaim(p, kind, tile, from); },
    _mjDiscard: function (i) { mjDiscard(i); },
    _help: function (g) { openHelp(g || 'uno'); },
    _helpOpen: function () { var b = $('cg-help'); return !!(b && b.classList.contains('open')); },
    _helpText: function () { var b = $('cg-helpbody'); return b ? b.textContent : ''; },
    _helpTab: function () { return _helpGame; },
    _unoDrew: function () { return G ? !!G.unoDrew : null; },
    _mjRiverGeom: function (w, h) {
      if (!G || G.game !== 'mahjong') return null;
      var W = w || 1103, H = h || 557, tw = cardW(W, H, 11);
      return mjRiverGeom(W, H, tw, tw * 1.36);
    },
    _mjDraw: function () { mjDraw(); },
    _mjKey: function (t) { return mjKey(t); },
    _mjHand: function (p) { return (G && G.hands[p]) ? G.hands[p].slice() : []; },
    _fl: {
      RC: flRC, pieceRC: flPieceRC, armRC: flArmRC, THRONE: FL_THRONE, QUAD: FL_QUAD,
      START: FL_START, ENTRY: FL_ENTRY, LINE: FL_LINE, STAR: FL_STAR, CI: FL_CI,
      TOTAL: FL_TOTAL, OUT: FL_OUT, RING: FL_RING
    },
    _flStack: function (p, v) { return flStackOf(p, v); },
    _flMove: function (p, idx, dice) { flMove(p, idx, dice); },
    _flStartDraw: function (p, kind, idx) { startDraw(p, kind, idx); },
    _flPick: function (i) { pickDrawCard(i); },
    _flBanner: function () { return G && G.cardBanner ? { name: G.cardBanner.name, kind: G.cardBanner.kind } : null; },
    _flFlash: function () { return G && G.flash ? { n: G.flash.n } : null; },
    /* 棋盘棋子命中区（验证「点棋子出动」用；只读，不改玩法） */
    _flHits: function () { return _flHits.map(function (h) { return { idx: h.idx, x: Math.round(h.x), y: Math.round(h.y), r: Math.round(h.r) }; }); },
    _flOptions: function () { return G && G.options ? G.options.slice() : null; },
    _flDice: function () { return G && G.dice; },
    _flAnim: function () { return G && G.anim; }
  };
})(window);
