/* 拾光·澈屿 — 飞行棋棋盘【共享绘制模块】（三十一更）
 *
 * 陛下原话：「我希望你可以重新开发一下引擎，让它跟现在真实的素材真实对齐。
 *   然后你现在的棋子和你的引擎里的那个 logo 也是没有对齐的。」
 *
 * ── 病根 ──────────────────────────────────────────────────────────────
 *   以前引擎的棋盘预览（棋牌引擎.html 里的 drawBoardPreview）是【另画一套】：
 *   520×520 满铺、只画 145 块地块，没有机巢、没有王座、没有出道位、没有棋子；
 *   而游戏端的 drawFlight 是 985 坐标系 + 上下留栏 + 一大堆运行时层。
 *   两套几何、两套绘制，必然对不齐 —— 这不是调参数能修的，得共用一份。
 *
 * ── 本模块 ────────────────────────────────────────────────────────────
 *   ① 承载所有 985 坐标系常量（外环坐标 / 归航道 / 机巢 / 出道位 / 航线 / 字母）；
 *   ② 承载【静态棋盘绘制】：底板 → 包机航线 → 145 块 → 字母 → 出道位三角徽章
 *      → 四社机巢 → 功能角标 → 永恒王座区；
 *   ③ 承载【棋子绘制】：圆形本色 + 编号，或换成艺人缩略图（圆形裁剪）；
 *   ④ 游戏端 card-games.js 与棋牌引擎.html 都调这里 —— 改一次，两边同时变。
 *
 * 坐标单位一律 = 985×985（对齐参考源码 AeroplaneChess-master 的棋盘图）。
 * 颜色一律从这里取：地块走 fl-board.js 的 SKIN_DEF / TILE_COL，品牌色走 brand()。
 */
(function (w) {
  'use strict';

  /* ═══════════ 一、几何常量（985 坐标系） ═══════════ */
  var U = 985;          /* 参考坐标系边长 */
  var RING = 52;        /* 外环 52 格 */
  var OUT = 50;         /* 自家在外环走 50 格（v = 0..49） */
  var HOME = 6;         /* 归航道 6 格（v = 50..55） */
  var TOTAL = 55;       /* 登顶（v = 0..55，出道 → 登顶共 56 步） */
  var HANGAR = -1;      /* 练习室（未出道） */
  var PAD = -2;         /* 出道位（源码 state='ready'） */

  /* 外环 52 格中心（下标 0 = 红家出道格 id=1，顺时针一圈） */
  var RC = [[655,115],[678,174],[678,229],[655,288],[700,331],[758,310],[812,310],[871,330],[891,389],[891,440],[891,493],[891,546],[891,598],[870,655],[813,677],[757,677],[699,658],[656,699],[678,758],[678,812],[656,869],[599,893],[546,893],[493,893],[441,893],[389,893],[332,870],[309,812],[309,757],[333,700],[287,656],[228,677],[174,677],[115,654],[94,598],[94,546],[94,493],[94,440],[94,388],[117,331],[174,310],[229,310],[288,330],[331,287],[309,229],[309,174],[332,117],[389,95],[441,95],[494,95],[546,95],[598,95]];
  var START = { r: 0, b: 13, y: 26, g: 39 };   /* 各家在 RC 里的起点下标 */
  var HOMER = [[494,179],[494,230],[494,283],[494,334],[494,386],[494,438]];
  var HOMEB = [[808,493],[756,493],[704,493],[652,493],[600,493],[548,493]];
  var HOMEY = [[493,808],[493,756],[493,704],[493,652],[493,600],[493,547]];
  var HOMEG = [[179,493],[231,493],[283,493],[335,493],[387,493],[437,493]];
  var CELLCOL = ['g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y','g','r','b','y'];
  var LINE = { 4: 12, 17: 12, 30: 12, 43: 12 };  /* 航线格 → 直飞 +N */
  var SAFE = { 10: 1, 23: 1, 36: 1, 49: 1 };     /* 安全格：踩上不触发同色跳 */
  var LETTER = { 0:'N', 2:'P', 4:'O', 7:'Q', 10:'R', 13:'S', 15:'A', 17:'T', 20:'B', 23:'C', 26:'D', 28:'F', 30:'E', 33:'G', 36:'H', 39:'I', 41:'K', 43:'J', 46:'L', 49:'W' };
  var ART = { r:'r', y:'y', b:'b', g:'g' };       /* 逻辑色 → 调色键（恒等，留作语义） */
  var HIT_K = 2;                                  /* 航线横跨打的是「归航道第 3 格」（下标 2） */
  var LINE_HIT = { r:'y', b:'g', y:'r', g:'b' };  /* 飞航线的人 → 撞谁家（对角社） */
  /* 四条包机航线：[起点格下标, 终点格下标, 两个航标位置(沿线 0~1)] */
  var LINE_RC = [
    { col:'y', a:43, b:3,  lab:[0.31, 0.80] },
    { col:'b', a:30, b:42, lab:[0.30, 0.83] },
    { col:'g', a:4,  b:16, lab:[0.21, 0.79] },
    { col:'r', a:17, b:29, lab:[0.27, 0.73] }
  ];
  /* 四角出道位徽章：[x, y, 旋转角]。上两家（左上拾光 / 右上星幕）原图是倒着印的。 */
  var READY = { g: [69, 288, 180], r: [716, 62, 180], y: [307, 927, 0], b: [925, 712, 0] };
  var QUAD  = { r: [739,40,945,246], b: [739,738,945,945], y: [40,738,246,945], g: [40,40,246,246] };
  var PADS  = { r: [[795,98],[890,98],[795,190],[890,190]], b: [[795,796],[890,796],[795,888],[890,888]], y: [[96,796],[191,796],[96,888],[191,888]], g: [[96,98],[191,98],[96,190],[191,190]] };
  var PAD_RC = { r: [678, 45], b: [896, 678], y: [258, 892], g: [45, 259] };   /* 出道位停靠点（源码 unTop/unLeft） */
  var HOMES = { r: HOMER, b: HOMEB, y: HOMEY, g: HOMEG };
  var SOC = { r: '星幕', y: '潮声', g: '拾光', b: '云顶' };
  var RANK = { r: 1, b: 2, y: 3, g: 4 };          /* 四社出场顺序（原图方位：绿左上 / 红右上 / 黄左下 / 蓝右下） */
  var FALLBACK = { r: '#e05050', y: '#e8b23a', b: '#3b82f6', g: '#3fa34d', gl:'#a9d6ae', rl:'#f4b3b3', bl:'#a8c8fb', yl:'#f5d99a', bg:'#ece3fa' };

  /* ═══════════ 二、工具 ═══════════ */
  function flRC(i) { return RC[(((i % RING) + RING) % RING)]; }
  function homeRC(col, k) { var a = HOMES[col]; return a[Math.max(0, Math.min(a.length - 1, k))]; }
  function brand(skin, col) { return (skin && skin[ART[col] || col]) || FALLBACK[col] || '#9aa0a6'; }
  function tileColor(t, skin, tileCol) { return (tileCol && tileCol[t.id]) || (skin || FALLBACK)[t.tint] || '#ccc'; }
  /* 棋盘几何：整体等比缩放到画布，上留回合条、下留底栏，四周留纸边 */
  function geom(W, H, topBar, botBar) {
    if (topBar === undefined || topBar === null) topBar = Math.round(H * 0.075) + 6;
    if (botBar === undefined || botBar === null) botBar = 64;
    var avail = Math.min(W - 20, H - topBar - botBar);
    var sc = Math.max(0.05, avail / U);
    var side = U * sc;
    var bx = Math.round((W - side) / 2);
    var by = Math.round(topBar + Math.max(0, (H - topBar - botBar - side) / 2));
    return { bx: bx, by: by, sc: sc, side: side, cs: 52 * sc, bw: side };
  }
  /* 棋盘底板路径（圆角矩形），drawFlight / 点击命中共用 */
  function panelPath(c, bx, by, side, r) {
    c.beginPath();
    var pad = Math.max(4, side * 0.016);
    var x0 = bx - pad, y0 = by - pad, w0 = side + pad * 2, p = Math.max(6, r || side * 0.032);
    c.moveTo(x0 + p, y0);
    c.lineTo(x0 + w0 - p, y0); c.quadraticCurveTo(x0 + w0, y0, x0 + w0, y0 + p);
    c.lineTo(x0 + w0, y0 + w0 - p); c.quadraticCurveTo(x0 + w0, y0 + w0, x0 + w0 - p, y0 + w0);
    c.lineTo(x0 + p, y0 + w0); c.quadraticCurveTo(x0, y0 + w0, x0, y0 + w0 - p);
    c.lineTo(x0, y0 + p); c.quadraticCurveTo(x0, y0, x0 + p, y0);
    c.closePath();
  }
  function roundRect(c, x, y, ww, hh, r) {
    r = Math.max(1, Math.min(r, ww / 2, hh / 2));
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + ww - r, y); c.quadraticCurveTo(x + ww, y, x + ww, y + r);
    c.lineTo(x + ww, y + hh - r); c.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
    c.lineTo(x + r, y + hh); c.quadraticCurveTo(x, y + hh, x, y + hh - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  /* 给任意多边形（含三角形）倒角：每个顶点沿相邻两边各内缩 r，再用二次曲线把角磨圆。
     r 自动收敛到【相邻较短边的 45%】以内 —— 凹凸顶点都安全，绝不会自交。
     ⚠️ 三十二更 · 陛下钦定：「拐弯儿，就是路线拐弯的地方也都改成圆角」「整体看起来钝钝的」。 */
  function roundPoly(c, xy, radius) {
    var n = xy.length;
    if (n < 3) return;
    c.beginPath();
    for (var i = 0; i < n; i++) {
      var p0 = xy[(i - 1 + n) % n], p1 = xy[i], p2 = xy[(i + 1) % n];
      var v1x = p0[0] - p1[0], v1y = p0[1] - p1[1];
      var v2x = p2[0] - p1[0], v2y = p2[1] - p1[1];
      var l1 = Math.sqrt(v1x * v1x + v1y * v1y), l2 = Math.sqrt(v2x * v2x + v2y * v2y);
      if (l1 < 0.001 || l2 < 0.001) { c.lineTo(p1[0], p1[1]); continue; }
      var r = Math.min(radius, l1 * 0.45, l2 * 0.45);
      /* ⚠️ 两个内缩点都必须从【顶点 p1】出发沿两边方向量 r ——
         写成 p2 + 方向×r 会让切点飞到顶点外侧，圆角会多切掉一大块（切歪）。 */
      var ax = p1[0] + v1x / l1 * r, ay = p1[1] + v1y / l1 * r;
      var bx = p1[0] + v2x / l2 * r, by = p1[1] + v2y / l2 * r;
      if (i === 0) c.moveTo(ax, ay); else c.lineTo(ax, ay);
      c.quadraticCurveTo(p1[0], p1[1], bx, by);
    }
    c.closePath();
  }
  /* 地块轮廓（★ 唯一真源）：游戏端绘制 / 引擎预览 / 引擎点选高亮 全走这一份。
     rect → 圆角矩形；poly / tri → 顶点倒角；disc 本来就是圆，不动。
     ⚠️ 圆角半径按【地块自身的短边】取比例，所以大方块（机巢）圆得明显、
        小条块（外环边条）只微微磨一下角 —— 不会把格子圆成豆子。 */
  var TILE_R_RECT = 0.22;      /* rect 圆角 = min(宽,高) × 22% */
  var TILE_R_CORNER = 0.26;    /* poly/tri 顶点倒角 = 格宽 × 26%（再被短边 45% 夹住） */
  function tilePath(c, t, mx, my, sc) {
    var r = t.r;
    c.beginPath();
    if (t.kind === 'rect') {
      var w = r[2] * sc, h = r[3] * sc;
      roundRect(c, mx(r[0]), my(r[1]), w, h, Math.max(2, Math.min(w, h) * TILE_R_RECT));
      return;
    }
    if (t.kind === 'disc') {
      c.arc(mx(r[0]), my(r[1]), Math.max(1.1, r[2] * sc), 0, 6.2832);
      return;
    }
    var xy = [];
    for (var k = 0; k < t.p.length; k += 2) xy.push([mx(t.p[k]), my(t.p[k + 1])]);
    roundPoly(c, xy, Math.max(2, 52 * sc * TILE_R_CORNER));
  }
  /* 颜色明暗微调：amt > 0 变亮、< 0 变暗（用来做渐变 / 高光，不用手写死色值） */
  function shade(hex, amt) {    var m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    function f(v) { return Math.max(0, Math.min(255, Math.round(v + 255 * amt))); }
    return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  /* 把 cfg 组装成像素换算器 */
  function mk(cfg) {
    var bx = cfg.bx, by = cfg.by, sc = cfg.sc;
    cfg.PX = function (x) { return bx + x * sc; };
    cfg.PY = function (y) { return by + y * sc; };
    return cfg;
  }

  /* ═══════════ 三、静态棋盘绘制 ═══════════ */

  /* ① 底板 + ①b 四条包机航线（虚线在色块【下面】，跟原图一致） */
  function paintBackdrop(cfg) {
    var c = cfg.c, bx = cfg.bx, by = cfg.by, sc = cfg.sc, side = cfg.side, cs = cfg.cs;
    var skin = cfg.skin || FALLBACK, PX = cfg.PX, PY = cfg.PY;
    /* 底板：淡紫纸板 + 投影 */
    c.save();
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = Math.max(8, side * 0.03); c.shadowOffsetY = 4;
    panelPath(c, bx, by, side, side * 0.032);
    c.fillStyle = skin.bg; c.fill();
    c.restore();
    c.save();
    panelPath(c, bx, by, side, side * 0.032);
    c.strokeStyle = 'rgba(122,100,62,.5)'; c.lineWidth = Math.max(1.5, side * 0.004); c.stroke();
    c.restore();

    /* 四条包机航线：各家用本社色双排虚线 + 箭头 + 航标（三十一更：原图「加油站」→ 包装词） */
    var K = side / U;
    LINE_RC.forEach(function (L) {
      var A = flRC(L.a), B = flRC(L.b);
      var x1 = PX(A[0]), y1 = PY(A[1]), x2 = PX(B[0]), y2 = PY(B[1]);
      var ang = Math.atan2(y2 - y1, x2 - x1);
      var e0 = cs * 0.52, e1 = cs * 0.62;
      var sx = x1 + Math.cos(ang) * e0, sy = y1 + Math.sin(ang) * e0;
      var ex = x2 - Math.cos(ang) * e1, ey = y2 - Math.sin(ang) * e1;
      var colr = brand(skin, L.col);
      var nx = -Math.sin(ang), ny = Math.cos(ang);
      c.save();
      c.strokeStyle = colr; c.fillStyle = colr;
      c.lineWidth = Math.max(1.2, side * 0.0045);
      c.setLineDash([Math.max(4, side * 0.016), Math.max(3, side * 0.012)]);
      [6.5, 19.5].forEach(function (off) {
        c.beginPath();
        c.moveTo(sx + nx * off * K, sy + ny * off * K);
        c.lineTo(ex + nx * off * K, ey + ny * off * K);
        c.stroke();
      });
      c.setLineDash([]);
      var ax2 = ex + nx * 19.5 * K, ay2 = ey + ny * 19.5 * K;
      var ah = Math.max(5, side * 0.019);
      c.beginPath();
      c.moveTo(ax2, ay2);
      c.lineTo(ax2 - Math.cos(ang - 0.42) * ah, ay2 - Math.sin(ang - 0.42) * ah);
      c.lineTo(ax2 - Math.cos(ang + 0.42) * ah, ay2 - Math.sin(ang + 0.42) * ah);
      c.closePath(); c.fill();
      /* 航标 ×2：原图写「加油站」，三十一更换成包装术语（跟「包机直飞」同一套词） */
      var tag = cfg.lineTag || '包机位';
      var horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
      var fs = Math.max(8, side * 0.0165);
      c.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      (L.lab || [0.30, 0.78]).forEach(function (t) {
        var mx = x1 + (x2 - x1) * t, my = y1 + (y2 - y1) * t;
        c.save();
        if (!horiz) { c.translate(mx, my); c.rotate(-Math.PI / 2); mx = 0; my = 0; }
        c.lineWidth = fs * 0.46; c.strokeStyle = skin.bg;
        c.strokeText(tag, mx, my);
        c.fillStyle = colr;
        c.fillText(tag, mx, my);
        c.restore();
      });
      c.restore();
    });
    c.textBaseline = 'alphabetic';
  }

  /* ② 145 块地块 + ③b 20 个字母标注 */
  function paintTiles(cfg) {
    var c = cfg.c, sc = cfg.sc, cs = cfg.cs, PX = cfg.PX, PY = cfg.PY;
    var skin = cfg.skin || FALLBACK, tileCol = cfg.tileCol || {}, tiles = cfg.tiles || [];
    tiles.forEach(function (t) {
      /* 三十二更：轮廓统一走 tilePath（方形 → 圆角、异形 → 顶点倒角） */
      tilePath(c, t, PX, PY, sc);
      c.fillStyle = tileColor(t, skin, tileCol);
      c.fill();
    });
    if (cfg.letters === false) { c.textBaseline = 'alphabetic'; return; }
    /* 字母：格中心圆盘上用【本格颜色】镂空一个字母（原图做法） */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    Object.keys(LETTER).forEach(function (k) {
      var i = parseInt(k, 10), rc = flRC(i);
      c.fillStyle = brand(skin, CELLCOL[i]);
      c.font = 'bold ' + Math.max(9, cs * 0.62) + 'px "Arial","Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText(LETTER[k], PX(rc[0]), PY(rc[1]) + cs * 0.03);
    });
    c.textBaseline = 'alphabetic';
  }

  /* ③c 四角「出道位」华丽三角徽章（三十一更 · 陛下钦定：用更华丽的三角形色块包装） */
  function paintPads(cfg) {
    var c = cfg.c, side = cfg.side, sc = cfg.sc, PX = cfg.PX, PY = cfg.PY;
    var skin = cfg.skin || FALLBACK, pu = cfg.pulse || 0;
    var cols = cfg.colors || ['r', 'y', 'g', 'b'];
    Object.keys(READY).forEach(function (col) {
      if (cols.indexOf(col) < 0) return;
      var rd = READY[col];
      var s = side * 0.066;                  /* 三角徽章边长（对齐四角三角地块） */
      var h = s * 0.88;
      c.save();
      c.translate(PX(rd[0]), PY(rd[1]));
      if (rd[2]) c.rotate(rd[2] * Math.PI / 180);
      var colr = brand(skin, col);
      /* 三角本体：顶点朝上，底边在下 */
      c.beginPath();
      c.moveTo(0, -h * 0.58);
      c.lineTo(-s / 2, h * 0.42);
      c.lineTo(s / 2, h * 0.42);
      c.closePath();
      /* 渐变：本社色亮一档 → 本社色 → 本社色暗一档（整块徽章就是这家社的颜色） */
      var grd = c.createLinearGradient(0, -h * 0.58, 0, h * 0.42);
      grd.addColorStop(0, shade(colr, 0.34));
      grd.addColorStop(0.44, colr);
      grd.addColorStop(1, shade(colr, -0.18));
      c.save();
      c.shadowColor = 'rgba(0,0,0,.42)'; c.shadowBlur = Math.max(4, s * 0.16); c.shadowOffsetY = s * 0.06;
      c.fillStyle = grd; c.fill();
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = Math.max(1.5, s * 0.055); c.stroke();
      /* 内嵌 ▶（出道标记）＋ 一圈呼吸金环 */
      c.fillStyle = 'rgba(255,255,255,.96)';
      c.beginPath();
      c.moveTo(-s * 0.075, -h * 0.03);
      c.lineTo(s * 0.115, h * 0.12);
      c.lineTo(-s * 0.075, h * 0.27);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,209,102,' + (0.45 + 0.4 * pu).toFixed(3) + ')';
      c.lineWidth = Math.max(1.2, s * 0.045);
      c.beginPath(); c.arc(0, h * 0.42 - s * 0.02, s * 0.72, 0, 6.2832); c.stroke();
      /* 徽章下方小字：对齐三角底边、字号按徽章自适应 */
      var fs2 = Math.max(8, side * 0.0185);
      c.font = 'bold ' + fs2 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      var ly = h * 0.42 + fs2 * 1.05;
      c.lineWidth = fs2 * 0.52; c.strokeStyle = skin.bg;
      c.strokeText('出道位', 0, ly);
      c.fillStyle = colr;
      c.fillText('出道位', 0, ly);
      c.restore();
    });
    c.textBaseline = 'alphabetic';
  }

  /* ④ 四社机巢：区块边框 + 社名 + 经纪人 + 4 个站位圆 + 待命棋子 */
  function paintGarrison(cfg) {
    var c = cfg.c, side = cfg.side, sc = cfg.sc, PX = cfg.PX, PY = cfg.PY;
    var skin = cfg.skin || FALLBACK, pu = cfg.pulse || 0;
    var cols = cfg.colors || [], names = cfg.names || [], real = cfg.real || [];
    var planes = cfg.planes || null, turn = (cfg.turn === undefined ? -1 : cfg.turn);
    var animXY = cfg.animXY || function () { return null; };
    Object.keys(QUAD).forEach(function (col) {
      var q = QUAD[col], p = cols.indexOf(col), active = p >= 0;
      var isCur = active && turn === p && !cfg.over;
      var x0 = PX(q[0]), y0 = PY(q[1]);
      var w0 = (q[2] - q[0]) * sc, h0 = (q[3] - q[1]) * sc;
      var cx0 = x0 + w0 / 2;
      if (isCur) {
        var ip = Math.max(2, side * 0.005);
        roundRect(c, x0 + ip, y0 + ip, w0 - ip * 2, h0 - ip * 2, side * 0.022);
        c.strokeStyle = 'rgba(255,209,102,' + (0.65 + 0.35 * pu).toFixed(3) + ')';
        c.lineWidth = Math.max(2.5, side * 0.008); c.stroke();
      }
      var cy0 = y0 + h0 / 2;
      var nmTxt = SOC[col] + '社';
      var realTxt = active ? (real[p] || '？') : '虚位';
      var f1 = Math.max(12, h0 * 0.125), f2 = Math.max(9, h0 * 0.085);
      c.font = 'bold ' + f1 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      var w1 = c.measureText(nmTxt).width;
      c.font = 'bold ' + f2 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      var w2 = c.measureText(realTxt).width;
      var bw = Math.max(w1, w2) + h0 * 0.12, bh = f1 + f2 + h0 * 0.06;
      var byy2 = cy0 - bh / 2;
      roundRect(c, cx0 - bw / 2, byy2, bw, bh, bh * 0.3);
      c.fillStyle = 'rgba(28,16,44,.42)'; c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(255,255,255,.98)';
      c.font = 'bold ' + f1 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText(nmTxt, cx0, byy2 + bh * 0.33);
      c.globalAlpha = 0.95;
      c.font = 'bold ' + f2 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText(realTxt, cx0, byy2 + bh * 0.72);
      c.globalAlpha = 1; c.textBaseline = 'alphabetic';
      if (!active) return;
      var pads = PADS[col], padR = side * 0.036, pr = side * 0.031;
      (planes ? planes[p] : [HANGAR, HANGAR, HANGAR, HANGAR]).forEach(function (v, i) {
        var pc = pads[i]; if (!pc) return;
        var pcx = PX(pc[0]), pcy = PY(pc[1]);
        var canGo = p === (cfg.meSeat === undefined ? 0 : cfg.meSeat) && cfg.options && cfg.options.indexOf(i) >= 0;
        c.beginPath(); c.arc(pcx, pcy, padR, 0, 6.2832);
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fill();
        c.strokeStyle = canGo ? '#ffd166' : 'rgba(255,255,255,.5)';
        c.lineWidth = canGo ? Math.max(2, padR * 0.34) : Math.max(1, padR * 0.2); c.stroke();
        if (v !== HANGAR) return;               /* 已出道的画在跑道上，机巢里不留影 */
        if (animXY(p, i)) return;               /* 正在滑出的那一架交给棋子层按插值坐标画 */
        c.beginPath(); c.arc(pcx, pcy, pr, 0, 6.2832);
        c.fillStyle = brand(skin, col); c.globalAlpha = 0.95; c.fill(); c.globalAlpha = 1;
        c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, pr * 0.16); c.stroke();
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = 'bold ' + Math.max(9, pr * 1.1) + 'px sans-serif';
        c.fillText(i + 1, pcx, pcy + pr * 0.06);
        c.textBaseline = 'alphabetic';
        if (canGo) {
          c.beginPath(); c.arc(pcx, pcy, padR + pu * side * 0.006, 0, 6.2832);
          c.strokeStyle = 'rgba(255,209,102,.95)'; c.lineWidth = Math.max(2, padR * 0.3); c.stroke();
          c.fillStyle = '#ffd166'; c.textAlign = 'center';
          c.font = 'bold ' + Math.max(10, pr * 1.05) + 'px sans-serif';
          c.fillText('▼', pcx, pcy - padR - pr * 0.35);
        }
        if (cfg.hits && p === (cfg.meSeat === undefined ? 0 : cfg.meSeat)) {
          cfg.hits.push({ idx: i, x: pcx, y: pcy, r: padR + Math.max(4, side * 0.01) });
        }
      });
      /* 战报胶囊：当前回合 / 停一轮 / 刚掷的点数 */
      var lastDice = null;
      if (cfg.lastPlay && cfg.lastPlay[p] && cfg.lastPlay[p][0] && cfg.lastPlay[p][0].kind === 'dice') lastDice = cfg.lastPlay[p][0].n;
      var info = isCur ? '🎲 当前回合' : (cfg.skipFlag && cfg.skipFlag[p]) ? '⏸ 停一轮' : (lastDice !== null ? '🎲 ' + lastDice : '');
      if (info && cfg.showStatus !== false) {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = 'bold ' + Math.max(10, side * 0.018) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        var iw = c.measureText(info).width + side * 0.02, ih = Math.max(14, side * 0.024);
        var ix = cx0 - iw / 2, iy = y0 + h0 * 0.775 - ih / 2;
        roundRect(c, ix, iy, iw, ih, ih / 2);
        c.fillStyle = isCur ? 'rgba(58,34,6,.72)' : 'rgba(0,0,0,.34)'; c.fill();
        c.strokeStyle = isCur ? 'rgba(255,209,102,.85)' : 'rgba(255,255,255,.28)';
        c.lineWidth = 1; c.stroke();
        c.fillStyle = isCur ? '#ffd166' : 'rgba(255,255,255,.95)';
        c.fillText(info, cx0, y0 + h0 * 0.775);
        c.textBaseline = 'alphabetic';
      }
    });
  }

  /* ⑤ 功能角标：出道格 ▶ / 航线格 ✈（只给当前回合那一家亮） */
  function paintFlags(cfg) {
    var c = cfg.c, cs = cfg.cs, PX = cfg.PX, PY = cfg.PY;
    var skin = cfg.skin || FALLBACK;
    var curCol = cfg.curCol;
    if (!curCol) return;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold ' + Math.max(9, cs * 0.42) + 'px sans-serif';
    var bd = [[flRC(START[curCol]), '▶', '#ffd166'], [flRC(LINE[START[curCol] + 17]), '✈', brand(skin, curCol)]];
    bd.forEach(function (b) {
      if (!b[0]) return;
      var bxx = PX(b[0][0]) - cs * 0.33, byy = PY(b[0][1]) + cs * 0.33;
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = Math.max(1.5, cs * 0.06);
      c.strokeText(b[1], bxx, byy);
      c.fillStyle = b[2]; c.fillText(b[1], bxx, byy);
    });
    c.textBaseline = 'alphabetic';
  }

  /* ⑥ 永恒王座区：四社色汇聚 + 中央王冠 + 四个登顶位（三十一更整体重绘）
     ⚠️ 原来这里是 4 个白色 ♛ 字符 + 两个 ✈ 白图形，陛下说「中心那个王冠很
        奇怪，希望对中心那一整个王座区进行整体的设计」。现在改成：
        ① 底色光晕盘 → ② 四社色四方环（本社色各占 90°）→ ③ 四瓣引线指向登顶格
        → ④ 四个登顶位圆盘（本社色 + 白冠）→ ⑤ 中央矢量金冠（画出 path，不用 emoji）
        → ⑥ 呼吸金环。所有颜色取自品牌色，跟着引擎的「四社品牌色」一起变。 */
  function paintThrone(cfg) {
    var c = cfg.c, sc = cfg.sc, side = cfg.side, cs = cfg.cs, PX = cfg.PX, PY = cfg.PY;
    var skin = cfg.skin || FALLBACK, pu = cfg.pulse || 0;
    var CX = 492.5, CY = 492.5;
    var x = PX(CX), y = PY(CY);
    var R = cs * 1.30;
    /* 四家方位：红上 / 蓝右 / 黄下 / 绿左（对应各自归航道末格的朝向） */
    var dirs = [{ col: 'r', a: -90 }, { col: 'b', a: 0 }, { col: 'y', a: 90 }, { col: 'g', a: 180 }];
    c.save();
    /* ① 底色光晕盘 */
    var g0 = c.createRadialGradient(x, y, R * 0.12, x, y, R);
    g0.addColorStop(0, 'rgba(255,252,240,.96)');
    g0.addColorStop(0.55, 'rgba(255,246,222,.72)');
    g0.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g0;
    c.beginPath(); c.arc(x, y, R, 0, 6.2832); c.fill();
    /* ② 四社色四方环（本社色各占 90°） */
    dirs.forEach(function (d) {
      var a1 = (d.a - 45) * Math.PI / 180, a2 = (d.a + 45) * Math.PI / 180;
      c.beginPath();
      c.arc(x, y, R * 0.94, a1, a2);
      c.strokeStyle = brand(skin, d.col); c.lineWidth = Math.max(3, R * 0.16);
      c.globalAlpha = 0.9; c.stroke(); c.globalAlpha = 1;
    });
    /* ③ 四瓣引线：从中心射向四个登顶格 */
    dirs.forEach(function (d) {
      var a = d.a * Math.PI / 180;
      c.beginPath();
      c.moveTo(x + Math.cos(a - 0.30) * R * 0.34, y + Math.sin(a - 0.30) * R * 0.34);
      c.lineTo(x + Math.cos(a) * R * 0.92, y + Math.sin(a) * R * 0.92);
      c.lineTo(x + Math.cos(a + 0.30) * R * 0.34, y + Math.sin(a + 0.30) * R * 0.34);
      c.closePath();
      c.fillStyle = brand(skin, d.col); c.globalAlpha = 0.30; c.fill(); c.globalAlpha = 1;
    });
    /* ④ 四个登顶位圆盘（= 各家归航道最后一格） */
    dirs.forEach(function (d) {
      var arr = HOMES[d.col], rc = arr[arr.length - 1];
      var px = PX(rc[0]), py = PY(rc[1]);
      var pr = cs * 0.40;
      c.beginPath(); c.arc(px, py, pr, 0, 6.2832);
      c.fillStyle = brand(skin, d.col); c.globalAlpha = 0.94; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = Math.max(1.2, pr * 0.16); c.stroke();
      crown(c, px, py, pr * 1.18, 'rgba(255,255,255,.97)');
    });
    /* ⑤ 中央矢量金冠 */
    c.shadowColor = 'rgba(140,90,10,.55)'; c.shadowBlur = Math.max(4, R * 0.12);
    crown(c, x, y - R * 0.02, R * 0.66, '#ffcf49');
    c.shadowBlur = 0;
    crown(c, x, y - R * 0.02, R * 0.66, 'rgba(255,235,170,.9)', true);
    /* ⑥ 呼吸金环 */
    c.strokeStyle = 'rgba(255,209,102,' + (0.30 + 0.42 * pu).toFixed(3) + ')';
    c.lineWidth = Math.max(2, R * 0.055);
    c.beginPath(); c.arc(x, y, R * (0.90 + 0.10 * pu), 0, 6.2832); c.stroke();
    c.restore();
  }
  /* 矢量王冠：以 (cx,cy) 为中心、宽 w。fill=true 只填不描边 */
  function crown(c, cx, cy, w, color, thin) {
    var h = w * 0.72, x0 = cx - w / 2, y0 = cy + h * 0.34;
    c.save();
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + w * 0.10, y0 - h * 0.78);
    c.lineTo(x0 + w * 0.30, y0 - h * 0.30);
    c.lineTo(x0 + w * 0.50, y0 - h * 1.00);
    c.lineTo(x0 + w * 0.70, y0 - h * 0.30);
    c.lineTo(x0 + w * 0.90, y0 - h * 0.78);
    c.lineTo(x0 + w * 1.00, y0);
    c.closePath();
    if (thin) { c.strokeStyle = color; c.lineWidth = Math.max(1, w * 0.045); c.stroke(); }
    else { c.fillStyle = color; c.fill(); }
    /* 冠底一颗宝石 */
    if (!thin) {
      c.beginPath();
      c.arc(x0 + w * 0.5, y0 - h * 0.10, w * 0.075, 0, 6.2832);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.fill();
    }
    c.restore();
  }

  /* ⑦ 赛道 / 出道位上的棋子（机巢里的由 paintGarrison 负责） */
  function paintPieces(cfg) {
    var c = cfg.c, side = cfg.side, PX = cfg.PX, PY = cfg.PY;
    var skin = cfg.skin || FALLBACK, pu = cfg.pulse || 0;
    var cols = cfg.colors || [], planes = cfg.planes || [];
    var animOf = cfg.animOf || function () { return null; };
    var animXY = cfg.animXY || function () { return null; };
    var pieceRC = cfg.pieceRC || function () { return null; };
    var meSeat = (cfg.meSeat === undefined ? 0 : cfg.meSeat);
    var turn = (cfg.turn === undefined ? -1 : cfg.turn);
    var groups = {};
    cols.forEach(function (col, p) {
      (planes[p] || []).forEach(function (v, idx) {
        var an = animOf(p, idx);
        var xy = an ? animXY(p, idx) : null;
        if (!xy && v === HANGAR) return;         /* 待命中的由机巢层画 */
        var rc = xy || pieceRC(p, v); if (!rc) return;
        var key = p + '|' + rc[0] + ',' + rc[1];
        if (!groups[key]) groups[key] = { p: p, col: col, rc: rc, list: [], fly: null };
        groups[key].list.push(idx);
        if (an) groups[key].fly = an;
      });
    });
    Object.keys(groups).forEach(function (key) {
      var gp = groups[key], p = gp.p, col = gp.col, list = gp.list;
      var cx = PX(gp.rc[0]), cy = PY(gp.rc[1]), n = list.length;
      var r = Math.max(6, side * 0.027);
      var colr = brand(skin, col);
      var isTurn = (turn === p && !cfg.over);
      var canGo = p === meSeat && cfg.options && list.some(function (i) { return cfg.options.indexOf(i) >= 0; });
      if (gp.fly) {                             /* 飞行中：拖尾 + 金圈 */
        var x0 = PX(gp.fly.fly[0][0]), y0 = PY(gp.fly.fly[0][1]);
        var dx = x0 - cx, dy = y0 - cy;
        for (var gi = 1; gi <= 3; gi++) {
          var g2 = gi / 4.2;
          c.beginPath(); c.arc(cx + dx * g2, cy + dy * g2, r * (0.8 - gi * 0.17), 0, 6.2832);
          c.globalAlpha = 0.30 - gi * 0.075;
          c.fillStyle = colr; c.fill();
        }
        c.globalAlpha = 1;
        c.beginPath(); c.arc(cx, cy, r + side * 0.016 + pu * side * 0.007, 0, 6.2832);
        c.strokeStyle = 'rgba(255,209,102,.95)'; c.lineWidth = Math.max(2.5, side * 0.008); c.stroke();
      }
      if (canGo) {
        c.beginPath(); c.arc(cx, cy, r + side * 0.010 + pu * side * 0.004, 0, 6.2832);
        c.strokeStyle = 'rgba(255,209,102,.95)'; c.lineWidth = Math.max(2, side * 0.007); c.stroke();
        c.fillStyle = '#ffb703'; c.textAlign = 'center';
        c.font = 'bold ' + Math.max(10, side * 0.030) + 'px sans-serif';
        c.fillText('▼', cx, cy - r - side * 0.011);
      }
      if (isTurn) {
        c.beginPath(); c.arc(cx, cy, r * 0.98, 0, 6.2832);
        c.strokeStyle = 'rgba(255,209,102,.8)'; c.lineWidth = Math.max(1.4, side * 0.004); c.stroke();
      }
      if (cfg.hits && p === meSeat) list.forEach(function (i) { cfg.hits.push({ idx: i, x: cx, y: cy, r: r + side * 0.012 }); });
      /* 棋子本体：有艺人立绘就圆形裁剪贴图，没有就用本色圆 + 编号 */
      var img = cfg.pieceImg ? cfg.pieceImg(p, list[0]) : null;
      var rr2 = r * 0.82;
      if (img) {
        c.save();
        c.beginPath(); c.arc(cx, cy, rr2, 0, 6.2832); c.closePath(); c.clip();
        try { c.drawImage(img, cx - rr2, cy - rr2, rr2 * 2, rr2 * 2); } catch (e) { }
        c.restore();
        c.beginPath(); c.arc(cx, cy, rr2, 0, 6.2832);
        c.strokeStyle = isTurn ? '#ffd166' : '#fff'; c.lineWidth = Math.max(1.4, side * 0.0045); c.stroke();
      } else {
        c.beginPath(); c.arc(cx, cy, rr2, 0, 6.2832);
        c.fillStyle = colr; c.fill();
        c.strokeStyle = isTurn ? '#ffd166' : '#fff'; c.lineWidth = Math.max(1.4, side * 0.0045); c.stroke();
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = 'bold ' + Math.max(9, r * (n >= 2 ? 0.72 : 0.86)) + 'px sans-serif';
        c.fillText(n >= 2 ? ('×' + n) : (list[0] + 1), cx, cy + 1);
        c.textBaseline = 'alphabetic';
      }
      if (n >= 2) {                            /* 同格多架：右上角再补一个 ×N 角标 */
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.font = 'bold ' + Math.max(8, r * 0.62) + 'px sans-serif';
        c.textAlign = 'right';
        c.fillText('×' + n, cx + r * 0.95, cy - r * 0.75);
      }
    });
  }

  /* ═══════════ 四、对外接口 ═══════════ */
  w.FlDraw = {
    U: U, RING: RING, OUT: OUT, HOME: HOME, TOTAL: TOTAL, HANGAR: HANGAR, PAD: PAD,
    RC: RC, START: START, HOMER: HOMER, HOMEB: HOMEB, HOMEY: HOMEY, HOMEG: HOMEG,
    CELLCOL: CELLCOL, LINE: LINE, SAFE: SAFE, LETTER: LETTER, ART: ART,
    LINE_RC: LINE_RC, READY: READY, QUAD: QUAD, PADS: PADS, PAD_RC: PAD_RC,
    LINE_HIT: LINE_HIT, HIT_K: HIT_K, HOMES: HOMES, SOC: SOC, RANK: RANK,
    FALLBACK: FALLBACK,
    flRC: flRC, homeRC: homeRC, brand: brand, tileColor: tileColor,
    tilePath: tilePath, roundPoly: roundPoly,
    geom: geom, panelPath: panelPath, roundRect: roundRect, mk: mk,
    paintBackdrop: paintBackdrop, paintTiles: paintTiles, paintPads: paintPads,
    paintGarrison: paintGarrison, paintFlags: paintFlags, paintThrone: paintThrone,
    paintPieces: paintPieces,
    /* 一次性画完静态棋盘（引擎预览 / 无状态场景用） */
    paintBoard: function (cfg) {
      mk(cfg);
      paintBackdrop(cfg); paintTiles(cfg); paintPads(cfg);
      paintGarrison(cfg); paintFlags(cfg); paintThrone(cfg);
      return cfg;
    }
  };
})(window);
