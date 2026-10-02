/* ============================================================
   棋牌玩法 · 游戏端（card-games.js）
   ------------------------------------------------------------
   四个地块入口（陛下 2026-10-02 新加）：
     🟥 锋线速演（血旗部队）   = UNO
     🀄 防线长议（血旗部队）   = 川麻
     🎲 经纪人办公室（风皇娱乐）= 飞行棋
     🃏 地下赌场（地下帝国）   = 斗地主

   流程：点地块 → **等待位面**（选人数 / 开房拿房号 / 邀请好友 / 输入房号加入）
        → 人齐点开始 → 房主生成牌局广播给全房（同一副牌，真同步）
        → 牌桌：手牌可点，AI 自动轮转，占位素材全走 CardSkin。

   素材与分类在各引擎/牌组里独立管，这里只负责「玩」。
   ============================================================= */
(function (global) {
  'use strict';

  var SK = global.CardSkin;
  var GAMES = {
    uno:      { name: '锋线速演',   em: '🟥', deck: 'uno',      seats: [2, 3, 4], def: 3, place: '血旗部队' },
    mahjong:  { name: '防线长议',   em: '🀄', deck: 'mahjong',  seats: [3, 4],    def: 4, place: '血旗部队' },
    flight:   { name: '经纪人办公室', em: '🎲', deck: 'flight',   seats: [2, 3, 4], def: 4, place: '风皇娱乐' },
    doudizhu: { name: '地下赌场',   em: '🃏', deck: 'doudizhu', seats: [3],       def: 3, place: '地下帝国' }
  };
  var AI_NAMES = ['五宝', '仓鼠甲', '仓鼠乙', '仓鼠丙'];

  var el = null;                 // 遮罩层 DOM
  var hall = { open: false, game: null, seats: 3, code: '', players: [], isHost: false, joined: false };
  var G = null;                  // 运行中的牌局
  var _aiTimer = null;

  function $(id) { return document.getElementById(id); }
  function me() { return (global.currentUser && (global.currentUser.nickname || global.currentUser.username)) || '我'; }
  function meName() { return (global.currentUser && global.currentUser.username) || 'me'; }
  function toast(m) { if (global.toast) global.toast(m); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rnd(n) { return Math.floor(Math.random() * n); }

  /* ================= 遮罩层外壳 ================= */
  function ensureEl() {
    if (el) return el;
    var s = document.createElement('style');
    s.textContent =
      '#cg-hall{position:fixed;inset:0;z-index:130;display:none;flex-direction:column;' +
      'background:linear-gradient(135deg,#241a3d,#3b2a5e 60%,#2a1f47);color:#f5f1fc;font-family:inherit;}' +
      '#cg-hall.on{display:flex;}' +
      '.cg-top{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 14px;' +
      'background:rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.12);}' +
      '.cg-top .tt{font-size:16px;font-weight:800;}' +
      '.cg-top .st{font-size:11px;opacity:.72;margin-top:2px;}' +
      '.cg-x{margin-left:auto;border:0;background:rgba(255,255,255,.14);color:#fff;width:32px;height:32px;' +
      'border-radius:10px;font-size:15px;cursor:pointer;font-weight:800;}' +
      '#cg-body{flex:1;min-height:0;overflow-y:auto;padding:14px;}' +
      '.cg-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);' +
      'border-radius:14px;padding:12px;margin-bottom:12px;}' +
      '.cg-lab{font-size:12px;font-weight:800;opacity:.85;margin-bottom:8px;}' +
      '.cg-sub{font-size:11px;opacity:.62;line-height:1.6;margin-top:6px;}' +
      '.cg-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}' +
      '.cg-btn{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;' +
      'padding:7px 13px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '.cg-btn:hover{border-color:#c9b6f5;}' +
      '.cg-btn.on{background:linear-gradient(135deg,#8b6fd6,#b49ae0);border-color:transparent;}' +
      '.cg-btn.pri{background:linear-gradient(135deg,#e5484d,#f0834a);border-color:transparent;}' +
      '.cg-btn:disabled{opacity:.4;cursor:not-allowed;}' +
      '.cg-in{border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.25);color:#fff;' +
      'border-radius:9px;padding:7px 10px;font-family:inherit;font-size:13px;width:120px;letter-spacing:2px;}' +
      '.seat{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border-radius:11px;' +
      'padding:8px 11px;font-size:13px;font-weight:700;min-width:150px;}' +
      '.seat .em{font-size:19px;}' +
      '.seat.me{border:1px solid #c9b6f5;}' +
      '.seat.empty{opacity:.5;}' +
      '#cg-canvas{width:100%;flex:1;min-height:0;display:block;background:radial-gradient(ellipse at 50% 40%,#3d2c63,#241a3d);}' +
      '.cg-acts{flex:0 0 auto;display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px;' +
      'background:rgba(255,255,255,.06);border-top:1px solid rgba(255,255,255,.12);}' +
      '.cg-tip{padding:8px 14px;font-size:12px;opacity:.85;background:rgba(0,0,0,.2);}';
    document.head.appendChild(s);

    el = document.createElement('div');
    el.id = 'cg-hall';
    el.innerHTML =
      '<div class="cg-top"><div><div class="tt" id="cg-tt">棋牌</div><div class="st" id="cg-st"></div></div>' +
      '<button class="cg-x" id="cg-x">✕</button></div>' +
      '<div id="cg-body"></div>' +
      '<canvas id="cg-canvas" style="display:none"></canvas>' +
      '<div class="cg-tip" id="cg-tip" style="display:none"></div>' +
      '<div class="cg-acts" id="cg-acts"></div>';
    document.body.appendChild(el);
    $('cg-x').onclick = closeHall;
    $('cg-canvas').addEventListener('click', onCanvasClick);
    window.addEventListener('resize', function () { if (G) drawGame(); });
    return el;
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
    $('cg-body').style.display = '';
    bindRoomEvents();
    renderHall();
  }
  function closeHall() {
    if (hall.code && global.Net && Net.connected()) Net.send({ t: 'roomLeave', code: hall.code });
    hall.open = false; hall.code = ''; G = null;
    clearTimeout(_aiTimer);
    if (el) el.classList.remove('on');
  }

  function renderHall() {
    var g = GAMES[hall.game];
    $('cg-tt').textContent = g.em + ' ' + g.name + ' · 等待位面';
    $('cg-st').textContent = g.place + ' · ' + (hall.code ? ('房号 ' + hall.code) : '还没开房') +
      ' · 在线 ' + hall.players.length + '/' + hall.seats;
    var b = $('cg-body');
    b.innerHTML = '';

    /* ① 人数 */
    var c1 = document.createElement('div'); c1.className = 'cg-card';
    c1.innerHTML = '<div class="cg-lab">① 这一桌几个人</div>';
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
    b.appendChild(c1);

    /* ② 座位 */
    var c2 = document.createElement('div'); c2.className = 'cg-card';
    c2.innerHTML = '<div class="cg-lab">② 座位（空位开局由 AI 补位）</div>';
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
    b.appendChild(c2);

    /* ③ 房间操作 */
    var c3 = document.createElement('div'); c3.className = 'cg-card';
    c3.innerHTML = '<div class="cg-lab">③ 开房 / 邀请 / 加入</div>';
    var r3 = document.createElement('div'); r3.className = 'cg-row';
    if (!hall.code) {
      var b1 = document.createElement('button'); b1.className = 'cg-btn pri'; b1.textContent = '🏠 开个房间';
      b1.onclick = createRoom;
      var b2 = document.createElement('button'); b2.className = 'cg-btn'; b2.textContent = '🔑 加入房间';
      b2.onclick = function () { var c = prompt('输入房号（4 位）'); if (c) joinRoom(String(c).trim().toUpperCase()); };
      var b4 = document.createElement('button'); b4.className = 'cg-btn'; b4.textContent = '🎲 单机直接开';
      b4.onclick = function () { startGame(buildSetup(hall.game, hall.seats)); };
      r3.appendChild(b1); r3.appendChild(b2); r3.appendChild(b4);
    } else {
      var b5 = document.createElement('button'); b5.className = 'cg-btn'; b5.textContent = '📨 邀请好友';
      b5.onclick = inviteFriend;
      var b6 = document.createElement('button'); b6.className = 'cg-btn'; b6.textContent = '🚪 离开房间';
      b6.onclick = function () { if (global.Net && Net.connected()) Net.send({ t: 'roomLeave', code: hall.code }); hall.code = ''; hall.players = [{ u: meName(), n: me(), me: true }]; renderHall(); };
      var b7 = document.createElement('button'); b7.className = 'cg-btn pri';
      b7.textContent = hall.isHost ? '▶️ 开始（我是房主）' : '⏳ 等房主开始';
      b7.disabled = !hall.isHost;
      b7.onclick = function () { var st = buildSetup(hall.game, hall.seats); if (global.Net && Net.connected()) Net.send({ t: 'roomStart', code: hall.code, setup: st }); startGame(st); };
      r3.appendChild(b5); r3.appendChild(b6); r3.appendChild(b7);
    }
    c3.appendChild(r3);
    if (hall.code) {
      var codeRow = document.createElement('div');
      codeRow.style.cssText = 'margin-top:10px;font-size:26px;font-weight:900;letter-spacing:6px;color:#ffd166;';
      codeRow.textContent = hall.code;
      c3.appendChild(codeRow);
    }
    var sub3 = document.createElement('div'); sub3.className = 'cg-sub';
    sub3.textContent = '联机走服务器房间协议：开房拿房号 → 私聊发邀请 → 好友输入房号入座 → 房主发同一副牌开局。没连服务器也能单机开（全是 AI）。';
    c3.appendChild(sub3);
    b.appendChild(c3);

    /* ④ 素材入口 */
    var c4 = document.createElement('div'); c4.className = 'cg-card';
    c4.innerHTML = '<div class="cg-lab">④ 牌面素材（在棋牌引擎里换）</div>';
    var r4 = document.createElement('div'); r4.className = 'cg-row';
    var b8 = document.createElement('button'); b8.className = 'cg-btn'; b8.textContent = '🎨 打开棋牌引擎（' + g.name + '）';
    b8.onclick = function () { location.href = './棋牌引擎.html#' + hall.game; };
    r4.appendChild(b8);
    c4.appendChild(r4);
    var sub4 = document.createElement('div'); sub4.className = 'cg-sub';
    sub4.textContent = '牌背 / 底纹 / 边框 / 通用符号（花色、一万…）四层各自可换，四个玩法素材互相独立。';
    c4.appendChild(sub4);
    b.appendChild(c4);

    renderActs([]);
  }

  function syncSeats() {
    /* 改人数：把自己的座位留下，其余清空 */
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
    /* 有好友就私聊发过去，没有就把房号抄给他 */
    var friends = (global.Net && Net.self && Net.self() && Net.self().friends) || [];
    if (global.Net && Net.connected() && friends.length) {
      friends.slice(0, 1).forEach(function (f) { Net.send({ t: 'chat', text: txt, channel: 'dm', to: f }); });
      toast('📨 已把房号私聊给好友（' + txt + '）');
    } else {
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(txt);
      } catch (e) { }
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

  /* ================= 牌局：发牌 ================= */
  function buildSetup(gameId, seats) {
    var s = { game: gameId, seats: seats, seat: 0, seed: Date.now() };
    if (gameId === 'uno') s.pile = [], s.hands = unoDeal(seats);
    else if (gameId === 'mahjong') s.wall = shuffle(mjWall()), s.hands = [];
    else if (gameId === 'flight') s.colors = ['r', 'y', 'g', 'b'].slice(0, seats);
    else if (gameId === 'doudizhu') s.deal = ddDeal();
    return s;
  }

  /* ---------- UNO ---------- */
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
    /* 第一张翻开：不能是万能牌 */
    var first = null;
    while (d.length && (!first || first.shape === 'wild' || first.shape === 'wild4')) first = d.pop();
    G_uno_first = first || { color: 'r', shape: 's5' };
    G_uno_stock = d;
    return hands;
  }
  var G_uno_stock = [], G_uno_first = null;

  /* ---------- 川麻 ---------- */
  function mjWall() {
    var w = [], suits = ['wan', 'tiao', 'tong'];
    suits.forEach(function (s) { for (var r = 1; r <= 9; r++) for (var k = 0; k < 4; k++) w.push({ id: s + r + '_' + k, kind: 'suit', suit: s, rank: r }); });
    return w;
  }
  function mjKey(t) { return t.suit + '_' + t.rank; }
  function mjCounts(hand) { var m = {}; hand.forEach(function (t) { var k = mjKey(t); m[k] = (m[k] || 0) + 1; }); return m; }
  /* 胡型判定：七对 / 标准（4 组刻子顺子 + 1 将） */
  function mjWin(counts) {
    var keys = Object.keys(counts);
    var total = 0; keys.forEach(function (k) { total += counts[k]; });
    if (total % 3 !== 2) return false;
    /* 七对 */
    var pairs = 0, ok = true;
    keys.forEach(function (k) { if (counts[k] % 2 !== 0) ok = false; pairs += counts[k] / 2; });
    if (ok && pairs === 7) return true;
    /* 标准型：枚举将 */
    function canForm(c) {
      var ks = Object.keys(c).filter(function (k) { return c[k] > 0; }).sort();
      if (!ks.length) return true;
      var k0 = ks[0];
      if (c[k0] >= 3) { c[k0] -= 3; if (canForm(c)) { c[k0] += 3; return true; } c[k0] += 3; }
      /* 顺子：同花色连续三张 */
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
        if (canForm(c)) return true;
      }
    }
    return false;
  }

  /* ---------- 斗地主 ---------- */
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
    /* 顺子 / 连对 / 飞机：所有点数出现次数一致且连续（2 与双王不算） */
    var times = cnt[ks[0]];
    var uniform = ks.every(function (k) { return cnt[k] === times; });
    var seq = ks.every(function (k, i) { return i === 0 || k === ks[i - 1] + 1; });
    var noHigh = ks[ks.length - 1] < 15;     // 不能含 2(15) 与王
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
  function startGame(setup) {
    G = { setup: setup, game: setup.game, seats: setup.seats, turn: 0, over: null, msg: '', sel: [], phase: 'play', log: [] };
    G.names = []; G.ai = [];
    for (var i = 0; i < setup.seats; i++) {
      if (i === 0) { G.names.push(me()); G.ai.push(false); }
      else { G.names.push(AI_NAMES[(i - 1) % AI_NAMES.length]); G.ai.push(true); }
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
      G.planes = setup.colors.map(function () { return [-1, -1, -1, -1]; });  // -1 待起飞，>=0 路程，-2 到家
      G.dice = 0; G.turn = 0; G.pick = -1;
    } else if (setup.game === 'doudizhu') {
      G.hands = setup.deal.hands.map(function (h) { return h.slice(); });
      G.bottom = setup.deal.bottom.slice();
      G.landlord = 0; G.last = null; G.lastBy = -1; G.bid = 0; G.phase = 'bid';
      G.hands[0] = G.hands[0].sort(function (a, b) { return b.v - a.v; });
    }
    $('cg-body').style.display = 'none';
    $('cg-canvas').style.display = '';
    $('cg-tip').style.display = '';
    resizeCanvas();
    drawGame();
    scheduleAI();
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
  function drawGame() {
    if (!G) return;
    var o = ctxOf(), c = o.c, W = o.W, H = o.H;
    c.clearRect(0, 0, W, H);
    /* 桌布 */
    c.save();
    var grd = c.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, Math.max(W, H) * 0.7);
    grd.addColorStop(0, '#463270'); grd.addColorStop(1, '#241a3d');
    c.fillStyle = grd; c.fillRect(0, 0, W, H);
    c.restore();
    if (G.game === 'uno') drawUno(c, W, H);
    else if (G.game === 'mahjong') drawMj(c, W, H);
    else if (G.game === 'flight') drawFlight(c, W, H);
    else if (G.game === 'doudizhu') drawDd(c, W, H);
    /* 回合提示 */
    c.save();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'left';
    var txt = G.over ? ('🏁 ' + G.over) : (G.msg || ('轮到：' + (G.names[G.turn] || '—')));
    c.fillText(txt, 14, 22);
    c.restore();
    $('cg-tip').textContent = G.over ? ('🏁 ' + G.over + '（点下面「再来一局」重开）') : tipText();
    renderActs(actionDefs());
  }
  function tipText() {
    if (G.game === 'uno') return 'UNO：点手牌出牌（同色/同数字/功能牌），没有就「摸一张」。剩 1 张记得喊 UNO！';
    if (G.game === 'mahjong') return '川麻（雏形）：摸一张打一张，凑成 4 组面子 + 1 对将就能胡，也可以凑七对。';
    if (G.game === 'flight') return '飞行棋：掷到 6 才能起飞，走满全程（52 格 + 6 格回家通道）到家，四架全到家就赢。';
    return '斗地主：先叫地主，再轮流出牌压上家（顺子/连对/炸弹…），谁先出完谁赢。';
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
      out.push({ label: '🔄 再来一局', pri: true, fn: function () { startGame(buildSetup(G.game, G.seats)); } });
      out.push({ label: '🚪 退出', fn: closeHall });
      return out;
    }
    if (G.game === 'uno') {
      out.push({ label: '🂠 摸一张', fn: unoDraw });
      out.push({ label: '⏭ 过', fn: function () { nextTurn(); drawGame(); scheduleAI(); } });
      if (G.pendingWild) {
        ['r', 'y', 'g', 'b'].forEach(function (col) {
          out.push({ label: ({ r: '🔴 红', y: '🟡 黄', g: '🟢 绿', b: '🔵 蓝' })[col], pri: true, fn: function () { unoPickColor(col); } });
        });
      }
    } else if (G.game === 'mahjong') {
      if (G.canWin) out.push({ label: '🀄 胡！', pri: true, fn: mjWinDo });
      out.push({ label: '🎴 摸一张', disabled: !!G.drawn || G.turn !== 0, fn: mjDraw });
    } else if (G.game === 'flight') {
      out.push({ label: '🎲 掷骰', pri: true, disabled: G.turn !== 0 || !!G.over, fn: flRoll });
    } else if (G.game === 'doudizhu') {
      if (G.phase === 'bid') {
        out.push({ label: '🙋 叫地主', pri: true, fn: function () { G.landlord = 0; ddTakeBottom(); } });
        out.push({ label: '🙅 不叫', fn: function () { G.landlord = 1; ddTakeBottom(); } });
      } else {
        out.push({ label: '⬆️ 出牌', pri: true, fn: ddPlay });
        out.push({ label: '⏭ 过', fn: ddPass });
        out.push({ label: '🧹 清空选择', fn: function () { G.sel = []; drawGame(); } });
      }
    }
    out.push({ label: '🚪 退出', fn: closeHall });
    return out;
  }

  /* ---------- 通用：手牌点击命中 ---------- */
  function hitHand(x, y, n, W, H, cw, ch, baseY) {
    var total = Math.min(n * (cw * 0.62), W - 40);
    var step = n > 1 ? Math.min(cw * 0.86, total / n) : 0;
    var x0 = W / 2 - (step * (n - 1) + cw) / 2;
    if (y < baseY - ch * 0.2 || y > baseY + ch) return -1;
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * step;
      if (x >= cx && x <= cx + cw) return i;
    }
    return -1;
  }
  function drawHandRow(c, hand, W, H, cw, ch, baseY, sel, deck, flipIdx) {
    var n = hand.length;
    var step = n > 1 ? Math.min(cw * 0.86, (W - 40 - cw) / (n - 1)) : 0;
    var x0 = W / 2 - (step * (n - 1) + cw) / 2;
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * step, cy = baseY - (sel && sel.indexOf(i) >= 0 ? 14 : 0);
      if (flipIdx && flipIdx.indexOf(i) >= 0) SK.drawBack(c, deck, cx, cy, cw, ch);
      else SK.drawCard(c, deck, hand[i], cx, cy, cw, ch, {});
    }
  }

  /* ---------- UNO 渲染 ---------- */
  var UNO_COL = { r: '#e5484d', y: '#f5c518', g: '#3fa34d', b: '#3b82f6', k: '#2b2140' };
  function drawUno(c, W, H) {
    var cw = Math.min(88, W / 9), ch = cw * 1.42;
    /* 对手：牌背横排 */
    for (var p = 1; p < G.seats; p++) {
      var yy = 42 + (p - 1) * (ch * 0.42 + 12);
      var xx = 16;
      for (var k = 0; k < Math.min(G.hands[p].length, 10); k++) { SK.drawBack(c, 'uno', xx + k * (cw * 0.26), yy, cw * 0.42, ch * 0.42); }
      c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'left';
      c.fillText((G.turn === p ? '▶ ' : '') + G.names[p] + ' · ' + G.hands[p].length + ' 张', xx, yy - 4);
    }
    /* 出牌堆 */
    var top = G.pile[G.pile.length - 1];
    var px = W / 2 - cw / 2, py = H * 0.36;
    SK.drawCard(c, 'uno', top, px, py, cw, ch, {});
    c.fillStyle = UNO_COL[G.cur] || '#fff';
    c.beginPath(); c.arc(px - 16, py + ch + 16, 9, 0, 6.2832); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '12px sans-serif'; c.textAlign = 'center';
    c.fillText('当前色 · 牌堆 ' + G.stock.length, px + cw / 2, py + ch + 20);
    /* 我的手牌 */
    drawHandRow(c, G.hands[0], W, H, cw, ch, H - ch - 16, null, 'uno', null);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
    c.fillText(me() + ' · ' + G.hands[0].length + ' 张', W / 2, H - 6);
  }
  function unoPlayable(card) {
    var top = G.pile[G.pile.length - 1];
    if (card.shape === 'wild' || card.shape === 'wild4') return true;
    if (card.color === G.cur) return true;
    return card.shape === top.shape;
  }
  function unoPlay(i) {
    if (G.turn !== 0 || G.over) return;
    var card = G.hands[0][i];
    if (!card || !unoPlayable(card)) { toast('🚫 这张出不了（要同色 / 同数字 / 万能牌）'); return; }
    G.hands[0].splice(i, 1); G.pile.push(card); G.cur = card.color;
    if (G.hands[0].length === 0) { G.over = me() + ' 赢了！🎉'; drawGame(); return; }
    if (card.shape === 'wild' || card.shape === 'wild4') { G.pendingWild = card; drawGame(); return; }
    applyUno(card, 0);
  }
  function unoPickColor(col) {
    var card = G.pendingWild; G.pendingWild = null; G.cur = col;
    if (card) applyUno(card, 0);
    drawGame(); scheduleAI();
  }
  function applyUno(card, by) {
    if (card.shape === 'skip') nextTurn();
    else if (card.shape === 'rev') { G.dir *= -1; nextTurn(); }
    else if (card.shape === 'd2') { drawN(1, 2); nextTurn(); }
    else if (card.shape === 'wild4') { drawN(1, 4); nextTurn(); }
    else nextTurn();
    drawGame(); scheduleAI();
  }
  function drawN(seat, n) {
    var s = (G.turn + G.dir + G.seats) % G.seats;
    for (var i = 0; i < n; i++) {
      if (!G.stock.length) { G.stock = shuffle(G.pile.splice(0, G.pile.length - 1)); }
      if (G.stock.length) G.hands[s].push(G.stock.pop());
    }
    G.msg = G.names[s] + ' 被罚摸 ' + n + ' 张';
  }
  function unoDraw() {
    if (G.turn !== 0 || G.over) return;
    if (!G.stock.length) G.stock = shuffle(G.pile.splice(0, G.pile.length - 1));
    var cd = G.stock.pop(); if (cd) G.hands[0].push(cd);
    G.msg = '摸了一张';
    if (cd && !unoPlayable(cd)) { nextTurn(); scheduleAI(); }
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
    if (G.turn === 0) return;
    _aiTimer = setTimeout(aiStep, 620);
  }
  function aiStep() {
    if (!G || G.over || G.turn === 0) return;
    var t = G.turn;
    if (G.game === 'uno') {
      var h = G.hands[t], idx = -1;
      for (var i = 0; i < h.length; i++) { if (unoPlayable(h[i])) { idx = i; break; } }
      if (idx < 0) {
        if (!G.stock.length) G.stock = shuffle(G.pile.splice(0, G.pile.length - 1));
        var cd = G.stock.pop(); if (cd) h.push(cd);
        nextTurn(); drawGame(); scheduleAI(); return;
      }
      var card = h.splice(idx, 1)[0]; G.pile.push(card); G.cur = card.color;
      if (h.length === 0) { G.over = G.names[t] + ' 赢了！'; drawGame(); return; }
      if (card.shape === 'wild' || card.shape === 'wild4') { G.cur = ['r', 'y', 'g', 'b'][rnd(4)]; }
      applyUno(card, t);
      return;
    }
    if (G.game === 'mahjong') mjAI(t);
    else if (G.game === 'flight') flAI(t);
    else if (G.game === 'doudizhu') ddAI(t);
  }

  /* ---------- 川麻 ---------- */
  function mjDraw() {
    if (G.turn !== 0 || G.drawn) return;
    if (!G.wall.length) { G.over = '牌墙摸完了，流局'; drawGame(); return; }
    G.drawn = G.wall.pop();
    G.canWin = mjWin(mjCounts(G.hands[0].concat([G.drawn])));
    drawGame();
  }
  function mjDiscard(i) {
    if (G.turn !== 0 || !G.drawn) return;
    var hand = G.hands[0];
    var tile = (i === hand.length) ? G.drawn : hand.splice(i, 1)[0];
    if (i === hand.length) { } else { hand.push(G.drawn); }
    G.drawn = null; G.canWin = false;
    G.discard = tile;
    nextTurn(); drawGame(); scheduleAI();
  }
  function mjWinDo() {
    G.over = me() + ' 自摸胡了！🀄🎉';
    drawGame();
  }
  function mjAI(t) {
    if (!G.wall.length) { G.over = '牌墙摸完了，流局'; drawGame(); return; }
    var tile = G.wall.pop();
    var all = G.hands[t].concat([tile]);
    if (mjWin(mjCounts(all))) { G.over = G.names[t] + ' 胡了！🀄'; drawGame(); return; }
    G.hands[t].push(tile);
    var drop = rnd(G.hands[t].length);
    G.hands[t].splice(drop, 1);
    G.msg = G.names[t] + ' 摸打';
    nextTurn(); drawGame(); scheduleAI();
  }
  function drawMj(c, W, H) {
    var tw = Math.min(54, W / 12), th = tw * 1.36;
    /* 对手：牌背 */
    for (var p = 1; p < G.seats; p++) {
      var yy = 40 + (p - 1) * (th * 0.4 + 14);
      for (var k = 0; k < Math.min(G.hands[p].length, 13); k++) SK.drawBack(c, 'mahjong', 16 + k * (tw * 0.3), yy, tw * 0.44, th * 0.44);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'left';
      c.fillText((G.turn === p ? '▶ ' : '') + G.names[p] + ' · ' + G.hands[p].length, 16, yy - 4);
    }
    c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'right'; c.font = '12px sans-serif';
    c.fillText('牌墙 ' + G.wall.length, W - 16, 22);
    if (G.discard) SK.drawCard(c, 'mahjong', G.discard, W / 2 - tw / 2, H * 0.34, tw, th, {});
    /* 我的手牌 + 摸到的那张单独放右边 */
    var hand = G.hands[0];
    drawHandRow(c, hand, W, H, tw, th, H - th - 20, null, 'mahjong', null);
    if (G.drawn) {
      var gx = W / 2 + Math.min(hand.length * tw * 0.86, W - 40) / 2 + 14;
      SK.drawCard(c, 'mahjong', G.drawn, Math.min(gx, W - tw - 10), H - th - 34, tw, th, { hi: G.canWin ? '#ffd166' : null });
      if (G.canWin) {
        c.fillStyle = '#ffd166'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center';
        c.fillText('可以胡！', Math.min(gx, W - tw - 10) + tw / 2, H - th - 40);
      }
    }
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
    c.fillText(me() + ' · ' + hand.length + ' 张' + (G.drawn ? '（含摸牌先打一张）' : '（点「摸一张」）'), W / 2, H - 6);
  }

  /* ---------- 飞行棋 ---------- */
  var FL_COL = { r: '#e5484d', y: '#f5c518', g: '#3fa34d', b: '#3b82f6' };
  var FL_PATH = 52, FL_HOME = 6, FL_TOTAL = FL_PATH + FL_HOME;
  function flRoll() {
    if (G.turn !== 0 || G.over) return;
    G.dice = 1 + rnd(6);
    G.pick = -1;
    var opts = flMoves(0, G.dice);
    if (!opts.length) { G.msg = me() + ' 掷了 ' + G.dice + '，没棋可走'; nextTurn(); drawGame(); scheduleAI(); return; }
    if (opts.length === 1) flMove(0, opts[0], G.dice);
    else { G.msg = me() + ' 掷了 ' + G.dice + '，点一架飞机走'; G.options = opts; }
    drawGame();
    if (!G.options) scheduleAI();
  }
  function flMoves(p, dice) {
    var out = [], ps = G.planes[p];
    for (var i = 0; i < ps.length; i++) {
      var v = ps[i];
      if (v === -2) continue;                 // 已到家
      if (v === -1) { if (dice === 6) out.push(i); continue; }
      if (v + dice <= FL_TOTAL) out.push(i);
    }
    return out;
  }
  function flMove(p, idx, dice) {
    var ps = G.planes[p];
    var v = ps[idx];
    if (v === -1) v = 0;                      // 起飞
    else v += dice;
    if (v > FL_TOTAL) return;
    /* 撞子：把落在同一格的敌机赶回停机坪（终点通道不撞） */
    if (v <= FL_PATH) {
      var cell = (v + p * 13) % FL_PATH;      // 各家起点错开
      G.planes.forEach(function (other, q) {
        if (q === p) return;
        other.forEach(function (ov, oi) {
          if (ov >= 0 && ov <= FL_PATH && (ov + q * 13) % FL_PATH === cell) other[oi] = -1;
        });
      });
    }
    ps[idx] = (v === FL_TOTAL) ? -2 : v;
    G.msg = G.names[p] + ' 掷 ' + dice + '，走了一架';
    if (ps.every(function (x) { return x === -2; })) { G.over = G.names[p] + ' 四架全部到家，赢了！✈️🎉'; drawGame(); return; }
    var again = (dice === 6);
    if (!again) nextTurn();
    G.options = null;
    drawGame(); scheduleAI();
  }
  function flAI(t) {
    var dice = 1 + rnd(6); G.dice = dice;
    var opts = flMoves(t, dice);
    if (!opts.length) { nextTurn(); drawGame(); scheduleAI(); return; }
    flMove(t, opts[rnd(opts.length)], dice);
  }
  function drawFlight(c, W, H) {
    /* 简化棋盘：一圈格子 + 中间骰子 */
    var cx = W / 2, cy = H * 0.34, R = Math.min(W, H) * 0.26;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.stroke();
    for (var i = 0; i < FL_PATH; i++) {
      var a = i / FL_PATH * 6.2832 - 1.5708;
      var x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      c.fillStyle = FL_COL[['r', 'y', 'g', 'b'][i % 4]] || '#fff';
      c.globalAlpha = 0.35;
      c.beginPath(); c.arc(x, y, 4, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1; c.restore();
    /* 各家的飞机 */
    G.colors.forEach(function (col, p) {
      var bx = 16 + p * (Math.min(110, W / 5)), by = H - 150;
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'left';
      c.fillText((G.turn === p ? '▶ ' : '') + G.names[p], bx, by - 6);
      G.planes[p].forEach(function (v, i) {
        var x = bx + i * 26, y = by + 8;
        SK.drawCard(c, 'flight', { kind: 'plane', color: col }, x, y, 22, 22, { dim: v === -1 || v === -2 });
        c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.textAlign = 'center';
        c.fillText(v === -1 ? '停机' : (v === -2 ? '到' : v), x + 11, y + 34);
      });
      /* 在圈上的位置 */
      G.planes[p].forEach(function (v) {
        if (v < 0 || v > FL_PATH) return;
        var cell = (v + p * 13) % FL_PATH;
        var a = cell / FL_PATH * 6.2832 - 1.5708;
        var x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        SK.drawCard(c, 'flight', { kind: 'plane', color: col }, x - 12, y - 12, 24, 24, {});
      });
    });
    /* 骰子 */
    SK.drawCard(c, 'flight', { kind: 'dice', n: G.dice || 1 }, cx - 30, cy - 30, 60, 60, {});
    c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
    c.fillText(G.dice ? ('掷出 ' + G.dice) : '点「掷骰」开始', cx, cy + 52);
  }

  /* ---------- 斗地主 ---------- */
  function ddTakeBottom() {
    G.hands[G.landlord] = G.hands[G.landlord].concat(G.bottom);
    G.hands[G.landlord].sort(function (a, b) { return b.v - a.v; });
    G.phase = 'play'; G.turn = G.landlord; G.last = null; G.lastBy = -1;
    G.msg = '地主是 ' + G.names[G.landlord] + '（拿了 3 张底牌）';
    drawGame(); scheduleAI();
  }
  function ddPlay() {
    if (G.turn !== 0 || !G.sel.length || G.over) return;
    var cards = G.sel.map(function (i) { return G.hands[0][i]; });
    var cb = ddCombo(cards);
    if (!cb) { toast('🚫 牌型不合法（单/对/三/三带/顺子5+/连对/飞机/炸弹/王炸）'); return; }
    if (G.lastBy !== 0 && G.last && !ddBeats(G.last, cb)) { toast('🚫 压不过上家'); return; }
    ddDoPlay(0, cards, cb);
  }
  function ddDoPlay(p, cards, cb) {
    var ids = {}; cards.forEach(function (c) { ids[c.id] = 1; });
    G.hands[p] = G.hands[p].filter(function (c) { return !ids[c.id]; });
    G.last = cb; G.lastBy = p; G.table = cards.slice();
    if (!G.hands[p].length) {
      var win = (p === G.landlord);
      G.over = (win ? '地主 ' : '农民 ') + G.names[p] + (win ? ' 赢了！👑' : ' 赢了！🎉');
      drawGame(); return;
    }
    G.turn = (p + 1) % G.seats;
    drawGame(); scheduleAI();
  }
  function ddPass() {
    if (G.turn !== 0 || G.over) return;
    if (G.lastBy === 0 || !G.last) { toast('🚫 你是先手，必须出牌'); return; }
    G.turn = (G.turn + 1) % G.seats;
    drawGame(); scheduleAI();
  }
  function ddFindBeat(hand, last) {
    /* 占位 AI：找同型更大的；找不到就找炸弹/王炸 */
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
    /* 炸弹兜底 */
    for (var j = 0; j < vs.length; j++) if (byV[vs[j]].length === 4) {
      var cs = byV[vs[j]].slice(0, 4).map(function (k) { return hand[k]; });
      return { cards: cs, cb: ddCombo(cs) };
    }
    return null;
  }
  function ddAI(t) {
    if (G.phase === 'bid') { G.landlord = t; ddTakeBottom(); return; }
    var hand = G.hands[t];
    var mustLead = (G.lastBy === t || !G.last);
    if (mustLead) {
      /* 先手：出最小的一张（或一对） */
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
    var cw = Math.min(64, W / 14), ch = cw * 1.42;
    for (var p = 1; p < G.seats; p++) {
      var yy = 40 + (p - 1) * (ch * 0.42 + 16);
      for (var k = 0; k < Math.min(G.hands[p].length, 16); k++) SK.drawBack(c, 'doudizhu', 16 + k * (cw * 0.3), yy, cw * 0.44, ch * 0.44);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'left';
      c.fillText((G.turn === p ? '▶ ' : '') + G.names[p] + (G.landlord === p ? ' 👑地主' : '') + ' · ' + G.hands[p].length, 16, yy - 4);
    }
    if (G.table && G.table.length) {
      var tw = cw * 0.8, th = tw * 1.42;
      var tx = W / 2 - (G.table.length * (tw * 0.6) + tw) / 2;
      G.table.forEach(function (cd, i) { SK.drawCard(c, 'doudizhu', cd, tx + i * tw * 0.6, H * 0.34, tw, th, {}); });
      c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '12px sans-serif'; c.textAlign = 'center';
      c.fillText('上家：' + (G.names[G.lastBy] || '—') + '（' + (G.last ? G.last.type : '') + '）', W / 2, H * 0.34 + th + 18);
    }
    if (G.phase === 'bid') {
      c.fillStyle = '#ffd166'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
      c.fillText('叫地主阶段：底牌 ' + G.bottom.map(function (x) { return x.rank; }).join(' '), W / 2, H * 0.5);
    }
    drawHandRow(c, G.hands[0], W, H, cw, ch, H - ch - 16, G.sel, 'doudizhu', null);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
    c.fillText(me() + (G.landlord === 0 ? ' 👑地主' : '') + ' · ' + G.hands[0].length + ' 张（点牌选中）', W / 2, H - 6);
  }

  /* ---------- 点击分发 ---------- */
  function onCanvasClick(ev) {
    if (!G) return;
    var cv = $('cg-canvas'), r = cv.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    var W = r.width, H = r.height;
    if (G.over) return;
    if (G.game === 'uno') {
      var cw = Math.min(88, W / 9), ch = cw * 1.42;
      var i = hitHand(x, y, G.hands[0].length, W, H, cw, ch, H - ch - 16);
      if (i >= 0) unoPlay(i);
    } else if (G.game === 'mahjong') {
      var tw = Math.min(54, W / 12), th = tw * 1.36;
      var n = G.hands[0].length;
      var j = hitHand(x, y, n, W, H, tw, th, H - th - 20);
      if (j >= 0) mjDiscard(j);
      else if (G.drawn) {
        var gx = Math.min(W / 2 + Math.min(n * tw * 0.86, W - 40) / 2 + 14, W - tw - 10);
        if (x >= gx && x <= gx + tw && y >= H - th - 34 && y <= H - 34) mjDiscard(n);
      }
    } else if (G.game === 'flight') {
      if (G.turn !== 0 || !G.options) return;
      for (var p = 0; p < G.colors.length; p++) {
        if (p !== 0) continue;
        var bx = 16 + p * (Math.min(110, W / 5)), by = H - 150;
        for (var k = 0; k < G.planes[p].length; k++) {
          var px = bx + k * 26, py = by + 8;
          if (x >= px && x <= px + 22 && y >= py && y <= py + 22 && G.options.indexOf(k) >= 0) { flMove(0, k, G.dice); return; }
        }
      }
    } else if (G.game === 'doudizhu') {
      var dw = Math.min(64, W / 14), dh = dw * 1.42;
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
    if (typeof global.currentUser === 'undefined' || !global.currentUser) return;
    openHall(id);
  }
  window.addEventListener('hashchange', tryHash);
  window.addEventListener('load', function () { setTimeout(tryHash, 1200); });

  global.CardGames = { open: openHall, close: closeHall, GAMES: GAMES, buildSetup: buildSetup };
})(window);
