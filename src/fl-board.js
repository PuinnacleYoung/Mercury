/* 拾光·澈屿 — 飞行棋棋盘【地块表】（二十七更）
 *
 * 陛下原话：「我希望你能够从这张图去拆分出每一个地块，并且让每一个地块的颜色
 * 也是我后续可以编辑的。比如说，有的地块是三角形，有地方是长方形。这些我希望
 * 你可以用自己的方式画出来，而不是直接用这一整张图。」
 *
 * 这份数据由 outputs/_27_gen_tiles.js 从原图 img/background.png 的轮廓自动归类生成：
 *   36 个矩形 + 16 个三角形 + 20 个多边形 + 73 个圆孔 = 145 块地块。
 * 游戏侧（card-games.js）与棋牌引擎的配色编辑器共用这一份；换素材就重跑生成脚本。
 *
 * 每一块的形状语义：
 *   rect 矩形   → r:[x, y, 宽, 高]
 *   tri  三角形 → p:[x1,y1, x2,y2, x3,y3]
 *   poly 多边形 → p:[x1,y1, …]（首尾自动闭合）
 *   disc 圆孔   → r:[圆心x, 圆心y, 半径]（露出底色；排在数组最后＝画最上层）
 * 坐标全在参考源码的 985×985 体系里。
 *
 * 颜色怎么改（两级）：
 *   ① 按调色键批量 —— SKIN_DEF 的 9 个键：g/r/b/y（四社色）+ gl/rl/bl/yl（四社停机位浅色）
 *      + bg（淡紫底）。比如把 g 改成靛蓝，所有用拾光社色的地块一起变。
 *   ② 按地块单块 —— TILE_COL（id → 颜色），优先级最高，想单独改一格就用它。
 * 自定义值分别存 localStorage 的 fl_board_skin_v1 / fl_board_tiles_v1。
 * 改配色的入口在【棋牌引擎】的飞行棋页签（管理员系统），游戏侧不放入口。 */
(function (w) {
  'use strict';

  /* ── 地块表（145 块）────────────────────────────────────────────── */
      var FL_TILES = [
        { id:"T01", kind:"rect", tint:"g", r:[40,40,206,206] },
        { id:"T02", kind:"rect", tint:"r", r:[739,40,205,206] },
        { id:"T03", kind:"rect", tint:"y", r:[364,41,49,105] },
        { id:"T04", kind:"rect", tint:"g", r:[415,41,50,105] },
        { id:"T05", kind:"rect", tint:"y", r:[573,41,50,105] },
        { id:"T06", kind:"poly", tint:"r", p:[469,42,467,405,420,407,495,480,568,407,519,406,518,403,518,42] },
        { id:"T07", kind:"rect", tint:"b", r:[521,42,48,104] },
        { id:"T08", kind:"tri", tint:"g", p:[625,43,624,144,726,146] },
        { id:"T09", kind:"tri", tint:"b", p:[360,44,259,144,359,145] },
        { id:"T10", kind:"poly", tint:"gl", p:[90,61,75,67,65,77,60,88,59,103,63,115,73,127,84,133,95,135,110,132,119,127,129,115,133,101,131,85,124,73,114,65,103,61] },
        { id:"T11", kind:"poly", tint:"gl", p:[184,61,169,67,160,76,153,94,154,107,159,118,167,127,182,134,197,134,210,129,219,121,226,107,227,92,217,72,206,64,196,61] },
        { id:"T12", kind:"poly", tint:"rl", p:[789,61,770,70,762,80,758,92,759,107,765,120,775,129,789,134,801,134,814,129,823,121,831,105,831,91,827,80,818,69,799,61] },
        { id:"T13", kind:"poly", tint:"rl", p:[884,61,868,67,858,77,852,93,853,107,860,121,869,129,883,134,896,134,907,130,919,119,925,105,925,90,920,78,911,68,893,61] },
        { id:"T14", kind:"rect", tint:"r", r:[257,148,103,51] },
        { id:"T15", kind:"rect", tint:"r", r:[625,148,104,51] },
        { id:"T16", kind:"poly", tint:"gl", p:[91,152,75,158,65,168,60,179,59,194,64,208,73,218,83,224,92,226,99,226,109,224,119,218,129,206,133,193,132,180,126,167,115,157,101,152] },
        { id:"T17", kind:"poly", tint:"gl", p:[186,152,168,159,158,170,153,185,154,198,160,211,173,222,186,226,194,226,213,218,221,210,227,194,226,179,221,168,209,157,195,152] },
        { id:"T18", kind:"poly", tint:"rl", p:[792,152,776,157,764,168,759,179,758,194,763,208,773,219,794,226,815,220,827,207,831,196,831,182,822,164,807,154,797,152] },
        { id:"T19", kind:"poly", tint:"rl", p:[886,152,867,159,856,172,852,185,854,202,860,212,872,222,880,225,897,225,911,218,921,207,925,196,925,181,921,171,912,160,901,154,891,152] },
        { id:"T20", kind:"rect", tint:"g", r:[256,202,105,54] },
        { id:"T21", kind:"rect", tint:"b", r:[625,202,104,52] },
        { id:"T22", kind:"rect", tint:"g", r:[148,256,52,105] },
        { id:"T23", kind:"rect", tint:"r", r:[203,256,51,105] },
        { id:"T24", kind:"tri", tint:"y", p:[261,257,360,357,360,256] },
        { id:"T25", kind:"rect", tint:"r", r:[733,256,49,105] },
        { id:"T26", kind:"rect", tint:"b", r:[787,256,49,105] },
        { id:"T27", kind:"tri", tint:"y", p:[625,257,625,359,727,257] },
        { id:"T28", kind:"tri", tint:"y", p:[146,258,44,360,146,360] },
        { id:"T29", kind:"tri", tint:"g", p:[728,259,627,361,728,361] },
        { id:"T30", kind:"tri", tint:"y", p:[840,259,841,361,941,361] },
        { id:"T31", kind:"tri", tint:"b", p:[257,260,257,359,356,361] },
        { id:"T32", kind:"rect", tint:"g", r:[840,362,104,51] },
        { id:"T33", kind:"rect", tint:"b", r:[42,363,105,50] },
        { id:"T34", kind:"rect", tint:"r", r:[42,416,104,49] },
        { id:"T35", kind:"poly", tint:"g", p:[412,416,412,466,42,468,42,517,411,519,412,567,487,489] },
        { id:"T36", kind:"rect", tint:"r", r:[840,416,104,48] },
        { id:"T37", kind:"poly", tint:"b", p:[576,418,504,491,577,565,579,520,943,517,944,468,579,466] },
        { id:"T38", kind:"poly", tint:"y", p:[495,500,419,575,467,576,468,943,472,944,516,944,519,836,519,576,568,573] },
        { id:"T39", kind:"rect", tint:"y", r:[42,519,105,51] },
        { id:"T40", kind:"rect", tint:"y", r:[839,520,105,51] },
        { id:"T41", kind:"rect", tint:"b", r:[42,573,105,49] },
        { id:"T42", kind:"rect", tint:"g", r:[839,573,105,50] },
        { id:"T43", kind:"rect", tint:"g", r:[148,624,52,105] },
        { id:"T44", kind:"rect", tint:"y", r:[202,624,52,105] },
        { id:"T45", kind:"tri", tint:"b", p:[258,624,257,725,358,624] },
        { id:"T46", kind:"tri", tint:"g", p:[628,624,728,726,729,624] },
        { id:"T47", kind:"rect", tint:"y", r:[730,624,52,105] },
        { id:"T48", kind:"rect", tint:"b", r:[786,624,51,105] },
        { id:"T49", kind:"tri", tint:"r", p:[45,625,143,725,144,625] },
        { id:"T50", kind:"tri", tint:"r", p:[841,625,841,726,941,625] },
        { id:"T51", kind:"tri", tint:"r", p:[360,628,261,728,360,728] },
        { id:"T52", kind:"tri", tint:"r", p:[625,628,626,728,726,728] },
        { id:"T53", kind:"rect", tint:"g", r:[256,731,105,52] },
        { id:"T54", kind:"rect", tint:"b", r:[624,732,105,51] },
        { id:"T55", kind:"rect", tint:"y", r:[40,738,205,207] },
        { id:"T56", kind:"rect", tint:"b", r:[739,738,206,207] },
        { id:"T57", kind:"poly", tint:"yl", p:[92,759,79,763,66,774,60,787,60,804,64,814,72,824,84,831,94,833,98,833,114,828,124,820,131,808,133,798,131,784,123,771,111,762,100,759] },
        { id:"T58", kind:"poly", tint:"yl", p:[187,759,172,764,162,772,154,787,154,804,165,823,178,831,188,833,202,831,215,823,223,813,227,799,225,784,217,771,205,762,193,759] },
        { id:"T59", kind:"poly", tint:"bl", p:[790,759,774,765,766,772,759,785,758,802,763,815,769,823,782,831,791,833,799,833,818,825,826,816,831,804,831,789,826,776,818,767,799,759] },
        { id:"T60", kind:"poly", tint:"bl", p:[884,759,870,764,858,775,852,790,852,802,858,817,867,826,885,833,892,833,909,827,917,820,924,808,926,799,924,784,917,772,908,764,894,759] },
        { id:"T61", kind:"rect", tint:"y", r:[256,785,105,52] },
        { id:"T62", kind:"rect", tint:"y", r:[624,785,106,53] },
        { id:"T63", kind:"rect", tint:"r", r:[364,839,48,105] },
        { id:"T64", kind:"rect", tint:"g", r:[416,839,50,105] },
        { id:"T65", kind:"rect", tint:"b", r:[522,839,49,105] },
        { id:"T66", kind:"rect", tint:"r", r:[574,839,48,104] },
        { id:"T67", kind:"tri", tint:"g", p:[625,840,625,941,727,840] },
        { id:"T68", kind:"tri", tint:"b", p:[260,841,360,941,360,841] },
        { id:"T69", kind:"poly", tint:"yl", p:[95,850,84,852,72,859,62,872,59,886,61,899,68,911,81,921,94,924,98,924,111,921,122,913,131,899,133,884,127,867,121,860,108,852] },
        { id:"T70", kind:"poly", tint:"yl", p:[189,850,178,852,169,857,160,866,154,879,154,895,162,911,171,919,188,924,193,924,205,921,220,909,225,899,227,884,221,867,215,860,204,853] },
        { id:"T71", kind:"poly", tint:"bl", p:[791,850,773,857,762,869,758,881,759,898,764,908,775,919,790,924,800,924,817,917,826,907,831,895,831,879,827,869,819,859,799,850] },
        { id:"T72", kind:"poly", tint:"bl", p:[887,850,867,857,858,866,852,882,853,897,858,908,868,918,884,924,894,924,908,919,918,910,924,899,926,886,923,873,918,864,911,857,892,850] },
        { id:"D01", kind:"disc", tint:"bg", r:[440,94,18] },
        { id:"D02", kind:"disc", tint:"bg", r:[388,94,17] },
        { id:"D03", kind:"disc", tint:"bg", r:[545,94,17] },
        { id:"D04", kind:"disc", tint:"bg", r:[598,94,18] },
        { id:"D05", kind:"disc", tint:"bg", r:[330,117,17] },
        { id:"D06", kind:"disc", tint:"bg", r:[309,174,18] },
        { id:"D07", kind:"disc", tint:"bg", r:[677,174,17] },
        { id:"D08", kind:"disc", tint:"bg", r:[493,178,18] },
        { id:"D09", kind:"disc", tint:"bg", r:[309,228,18] },
        { id:"D10", kind:"disc", tint:"bg", r:[677,230,17] },
        { id:"D11", kind:"disc", tint:"bg", r:[493,230,18] },
        { id:"D12", kind:"disc", tint:"bg", r:[493,282,18] },
        { id:"D13", kind:"disc", tint:"bg", r:[331,285,17] },
        { id:"D14", kind:"disc", tint:"bg", r:[655,287,18] },
        { id:"D15", kind:"disc", tint:"bg", r:[229,309,18] },
        { id:"D16", kind:"disc", tint:"bg", r:[174,309,17] },
        { id:"D17", kind:"disc", tint:"bg", r:[757,309,18] },
        { id:"D18", kind:"disc", tint:"bg", r:[812,309,17] },
        { id:"D19", kind:"disc", tint:"bg", r:[118,329,18] },
        { id:"D20", kind:"disc", tint:"bg", r:[867,329,17] },
        { id:"D21", kind:"disc", tint:"bg", r:[287,331,18] },
        { id:"D22", kind:"disc", tint:"bg", r:[699,331,17] },
        { id:"D23", kind:"disc", tint:"bg", r:[493,334,18] },
        { id:"D24", kind:"disc", tint:"bg", r:[493,386,18] },
        { id:"D25", kind:"disc", tint:"bg", r:[94,388,17] },
        { id:"D26", kind:"disc", tint:"bg", r:[892,388,17] },
        { id:"D27", kind:"disc", tint:"bg", r:[493,438,18] },
        { id:"D28", kind:"disc", tint:"bg", r:[94,440,18] },
        { id:"D29", kind:"disc", tint:"bg", r:[892,440,17] },
        { id:"D30", kind:"disc", tint:"bg", r:[93,492,17] },
        { id:"D31", kind:"disc", tint:"bg", r:[892,492,17] },
        { id:"D32", kind:"disc", tint:"bg", r:[178,493,18] },
        { id:"D33", kind:"disc", tint:"bg", r:[230,493,18] },
        { id:"D34", kind:"disc", tint:"bg", r:[282,493,17] },
        { id:"D35", kind:"disc", tint:"bg", r:[335,493,18] },
        { id:"D36", kind:"disc", tint:"bg", r:[387,493,18] },
        { id:"D37", kind:"disc", tint:"bg", r:[439,493,17] },
        { id:"D38", kind:"disc", tint:"bg", r:[547,493,17] },
        { id:"D39", kind:"disc", tint:"bg", r:[599,493,17] },
        { id:"D40", kind:"disc", tint:"bg", r:[651,493,17] },
        { id:"D41", kind:"disc", tint:"bg", r:[703,493,17] },
        { id:"D42", kind:"disc", tint:"bg", r:[755,492,17] },
        { id:"D43", kind:"disc", tint:"bg", r:[807,493,17] },
        { id:"D44", kind:"disc", tint:"bg", r:[94,545,18] },
        { id:"D45", kind:"disc", tint:"bg", r:[892,545,17] },
        { id:"D46", kind:"disc", tint:"bg", r:[493,547,18] },
        { id:"D47", kind:"disc", tint:"bg", r:[94,598,17] },
        { id:"D48", kind:"disc", tint:"bg", r:[892,597,17] },
        { id:"D49", kind:"disc", tint:"bg", r:[493,599,18] },
        { id:"D50", kind:"disc", tint:"bg", r:[493,651,18] },
        { id:"D51", kind:"disc", tint:"bg", r:[286,654,17] },
        { id:"D52", kind:"disc", tint:"bg", r:[868,656,18] },
        { id:"D53", kind:"disc", tint:"bg", r:[695,658,18] },
        { id:"D54", kind:"disc", tint:"bg", r:[174,677,17] },
        { id:"D55", kind:"disc", tint:"bg", r:[229,677,18] },
        { id:"D56", kind:"disc", tint:"bg", r:[756,676,18] },
        { id:"D57", kind:"disc", tint:"bg", r:[811,677,17] },
        { id:"D58", kind:"disc", tint:"bg", r:[331,699,18] },
        { id:"D59", kind:"disc", tint:"bg", r:[655,700,18] },
        { id:"D60", kind:"disc", tint:"bg", r:[493,703,18] },
        { id:"D61", kind:"disc", tint:"bg", r:[493,755,18] },
        { id:"D62", kind:"disc", tint:"bg", r:[309,757,18] },
        { id:"D63", kind:"disc", tint:"bg", r:[677,757,17] },
        { id:"D64", kind:"disc", tint:"bg", r:[493,807,18] },
        { id:"D65", kind:"disc", tint:"bg", r:[309,811,18] },
        { id:"D66", kind:"disc", tint:"bg", r:[677,811,18] },
        { id:"D67", kind:"disc", tint:"bg", r:[329,868,17] },
        { id:"D68", kind:"disc", tint:"bg", r:[656,868,18] },
        { id:"D69", kind:"disc", tint:"bg", r:[388,891,18] },
        { id:"D70", kind:"disc", tint:"bg", r:[494,892,18] },
        { id:"D71", kind:"disc", tint:"bg", r:[440,891,17] },
        { id:"D72", kind:"disc", tint:"bg", r:[546,891,17] },
        { id:"D73", kind:"disc", tint:"bg", r:[598,891,17] },
      ];

  /* ── 默认调色板＝四社色 + 淡紫底（三十更 · 陛下钦定）───────────────────
     每个键就 = 一家社的颜色，棋盘直接穿自家配色，不再是原图那套印刷色。
     ⚠️ 键名三十更换过（旧：G/O/C/M/Y/l/k/p → 新：g/r/b/y/gl/rl/bl/yl）。
        旧 localStorage 存档里的键名在新表里找不到，loadSkin 会自动忽略、回落到
        下面的新默认值 —— 所以换配色不会把老用户卡在旧色上。 */
      var FL_SKIN_DEF = {
        g:  '#3fa34d',  /* 拾光社（绿）· 外环格 + 左上机巢 */
        r:  '#e05050',  /* 星幕社（红）· 右上机巢 */
        b:  '#3b82f6',  /* 云顶社（蓝）· 右下机巢 */
        y:  '#e8b23a',  /* 潮声社（黄）· 左下机巢 */
        gl: '#a9d6ae',  /* 拾光 · 停机位（浅） */
        rl: '#f4b3b3',  /* 星幕 · 停机位 */
        bl: '#a8c8fb',  /* 云顶 · 停机位 */
        yl: '#f5d99a',  /* 潮声 · 停机位 */
        bg: '#ece3fa'   /* 淡紫底（圆孔露出来的颜色） */
      };

  var TINT_LABEL = {
    g: '拾光社 · 绿',
    r: '星幕社 · 红',
    b: '云顶社 · 蓝',
    y: '潮声社 · 黄',
    gl: '拾光 · 机巢停机位',
    rl: '星幕 · 机巢停机位',
    bl: '云顶 · 机巢停机位',
    yl: '潮声 · 机巢停机位',
    bg: '淡紫底 · 圆孔露出来的颜色'
  };
  /* ── 调色键分组（三十一更 · 陛下钦定「引擎要能调四社颜色」）─────────────────
     ⚠️ 以前 9 个键平铺成一列，陛下根本看不出「哪个是四社色」。
     更要命的是：改 g/r/b/y 时只有【地块】跟着变，棋子 / 机巢圆点 / 航线虚线 /
     飞行光带 全写死在 card-games.js 里 —— 现在那四处也派生了，改这里五处一起变。 */
  var TINT_GROUPS = [
    { t: '① 四社品牌色', hint: '改这里 → 棋盘格 + 棋子 + 机巢圆点 + 航线虚线 + 飞行光带 一起变',
      keys: ['g', 'r', 'b', 'y'] },
    { t: '② 机巢停机位（四社浅色）', hint: '机巢里 4 个站位圆盘的浅色底', keys: ['gl', 'rl', 'bl', 'yl'] },
    { t: '③ 棋盘底色', hint: '145 块之间的底色，圆孔里露出来的就是它', keys: ['bg'] }
  ];
  var K_SKIN = 'fl_board_skin_v1', K_TILE = 'fl_board_tiles_v1';

  function colorOk(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v); }
  function loadSkin() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(K_SKIN) || '{}') || {}; } catch (e) { }
    var out = {};
    Object.keys(FL_SKIN_DEF).forEach(function (k) { out[k] = colorOk(o[k]) ? o[k] : FL_SKIN_DEF[k]; });
    return out;
  }
  function loadTileCol() {
    try { return JSON.parse(localStorage.getItem(K_TILE) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(skin, tileCol) {
    try {
      localStorage.setItem(K_SKIN, JSON.stringify(skin || {}));
      localStorage.setItem(K_TILE, JSON.stringify(tileCol || {}));
    } catch (e) { }
  }
  /* 把一块地块描成路径（只建路径不填色，样式交给调用方）
     ⚠️ 三十二更：轮廓【唯一真源】是 FlDraw.tilePath（方形圆角 / 异形倒角）。
         以前这里自己写一套直角 rect，跟 FlDraw 画的圆角对不上 ——
         引擎点选高亮的描边会掐进圆角里。现在一律委托过去，这里只留兜底。 */
  function path(ctx, t, mx, my, sc) {
    if (w.FlDraw && w.FlDraw.tilePath) { w.FlDraw.tilePath(ctx, t, mx, my, sc); return; }
    var r = t.r;
    ctx.beginPath();
    if (t.kind === 'rect') {
      ctx.rect(mx(r[0]), my(r[1]), r[2] * sc, r[3] * sc);
    } else if (t.kind === 'disc') {
      ctx.arc(mx(r[0]), my(r[1]), Math.max(1.1, r[2] * sc), 0, 6.2832);
    } else {
      for (var k = 0; k < t.p.length; k += 2) {
        var x = mx(t.p[k]), y = my(t.p[k + 1]);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
  /* 地块最终颜色：单块覆盖 > 皮肤 tint 键 > 兜底灰 */
  function tileColor(t, skin, tileCol) {
    return (tileCol && tileCol[t.id]) || (skin || FL_SKIN_DEF)[t.tint] || '#ccc';
  }

  w.FL_BOARD = {
    TILES: FL_TILES, SKIN_DEF: FL_SKIN_DEF, TINT_LABEL: TINT_LABEL, TINT_GROUPS: TINT_GROUPS,
    KEYS: { skin: K_SKIN, tiles: K_TILE },
    colorOk: colorOk, loadSkin: loadSkin, loadTileCol: loadTileCol, save: save,
    path: path, tileColor: tileColor,
    stats: function () {
      var m = {};
      FL_TILES.forEach(function (t) { m[t.kind] = (m[t.kind] || 0) + 1; });
      return m;
    }
  };
})(window);
