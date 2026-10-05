/* ============================================================
   卡牌皮肤 · 共享模块（card-skin.js）
   ------------------------------------------------------------
   四套棋牌（UNO / 川麻 / 斗地主 / 飞行棋）共用一套「皮肤」数据，
   陛下想换素材只在这一个地方换，四个玩法同时生效。

   分层（陛下钦定 2026-10-02）：
     ① 牌背 back      —— 一张整图（没有就用纯色 + 中心标记占位）
     ② 牌面·底纹 pattern —— 铺满整张牌（可平铺）
     ③ 牌面·边框 frame   —— 覆盖在底纹之上的外框
     ④ 牌面·通用符号 glyph —— 花色 / 一万 / 数字 / 功能符号…
        这些是「通用件」：同一套牌里很多张共用（比如一万~九万共用「萬」，
        1~9 共用数字形状），所以按 key 单独换，换一次全牌生效。

   素材缺失 = 矢量占位（纯色 + 文字），随时可换图，绝不因为没图就开天窗。
   数据键 card_skin_v1，走云端 misc 槽（人人可见，玩家本机也能改）。
   ============================================================= */
(function (global) {
  'use strict';

  var KEY = 'card_skin_v1';
  var DECKS = ['uno', 'mahjong', 'doudizhu', 'flight'];

  /* ---- 四套牌的「通用符号」表：key → 占位文字 + 配色 ---- */
  var GLYPH_DEF = {
    uno: {
      name: '锋线速演 · UNO', em: '🟥',
      colors: { r: '#e5484d', y: '#f5c518', g: '#3fa34d', b: '#3b82f6', k: '#2b2140' },
      items: [
        { k: 's0', t: '0', g: '数字' }, { k: 's1', t: '1', g: '数字' }, { k: 's2', t: '2', g: '数字' }, { k: 's3', t: '3', g: '数字' },
        { k: 's4', t: '4', g: '数字' }, { k: 's5', t: '5', g: '数字' }, { k: 's6', t: '6', g: '数字' }, { k: 's7', t: '7', g: '数字' },
        { k: 's8', t: '8', g: '数字' }, { k: 's9', t: '9', g: '数字' },
        { k: 'skip', t: '⊘', d: '跳过', g: '功能牌' }, { k: 'rev', t: '⇄', d: '反转', g: '功能牌' },
        { k: 'd2', t: '+2', d: '罚两张', g: '功能牌' }, { k: 'wild', t: 'W', d: '万能', g: '功能牌' },
        { k: 'wild4', t: '+4', d: '万能罚四张', g: '功能牌' }
      ]
    },
    mahjong: {
      name: '防线长议 · 川麻', em: '🀄',
      colors: { wan: '#c0392b', tiao: '#2e7d32', tong: '#1565c0', feng: '#37474f', jian: '#6a1b9a' },
      items: [
        { k: 'n1', t: '一', g: '数字' }, { k: 'n2', t: '二', g: '数字' }, { k: 'n3', t: '三', g: '数字' }, { k: 'n4', t: '四', g: '数字' },
        { k: 'n5', t: '五', g: '数字' }, { k: 'n6', t: '六', g: '数字' }, { k: 'n7', t: '七', g: '数字' }, { k: 'n8', t: '八', g: '数字' },
        { k: 'n9', t: '九', g: '数字' },
        { k: 'wan', t: '萬', g: '花色' }, { k: 'tiao', t: '條', g: '花色' }, { k: 'tong', t: '筒', g: '花色' },
        { k: 'e', t: '東', g: '风牌' }, { k: 's', t: '南', g: '风牌' }, { k: 'w', t: '西', g: '风牌' }, { k: 'n', t: '北', g: '风牌' },
        { k: 'zh', t: '中', c: '#c62828', g: '箭牌' }, { k: 'fa', t: '發', c: '#2e7d32', g: '箭牌' }, { k: 'bb', t: '白', g: '箭牌' }
      ]
    },
    doudizhu: {
      name: '地下赌场 · 斗地主', em: '🃏',
      colors: { spade: '#21262d', heart: '#e5484d', club: '#21262d', diamond: '#e5484d', joker: '#8e24aa' },
      items: [
        { k: 'spade', t: '♠', g: '花色' }, { k: 'heart', t: '♥', c: '#e5484d', g: '花色' },
        { k: 'club', t: '♣', g: '花色' }, { k: 'diamond', t: '♦', c: '#e5484d', g: '花色' },
        { k: 'r3', t: '3', g: '点数' }, { k: 'r4', t: '4', g: '点数' }, { k: 'r5', t: '5', g: '点数' }, { k: 'r6', t: '6', g: '点数' },
        { k: 'r7', t: '7', g: '点数' }, { k: 'r8', t: '8', g: '点数' }, { k: 'r9', t: '9', g: '点数' }, { k: 'r10', t: '10', g: '点数' },
        { k: 'rJ', t: 'J', g: '点数' }, { k: 'rQ', t: 'Q', g: '点数' }, { k: 'rK', t: 'K', g: '点数' },
        { k: 'rA', t: 'A', g: '点数' }, { k: 'r2', t: '2', g: '点数' },
        { k: 'jk_s', t: '小王', c: '#5c6bc0', g: '大小王' }, { k: 'jk_b', t: '大王', c: '#e5484d', g: '大小王' }
      ]
    },
    flight: {
      name: '经纪人办公室 · 飞行棋', em: '🎲',
      colors: { r: '#e5484d', y: '#f5c518', g: '#3fa34d', b: '#3b82f6', n: '#8d6e63' },
      items: [
        { k: 'plane_r', t: '✈', c: '#e5484d', d: '红机', g: '棋子' }, { k: 'plane_y', t: '✈', c: '#f5c518', d: '黄机', g: '棋子' },
        { k: 'plane_g', t: '✈', c: '#3fa34d', d: '绿机', g: '棋子' }, { k: 'plane_b', t: '✈', c: '#3b82f6', d: '蓝机', g: '棋子' },
        { k: 'cell', t: '◻', d: '普通格', g: '格子' }, { k: 'cell_r', t: '◻', c: '#e5484d', d: '红格', g: '格子' },
        { k: 'cell_y', t: '◻', c: '#f5c518', d: '黄格', g: '格子' }, { k: 'cell_g', t: '◻', c: '#3fa34d', d: '绿格', g: '格子' },
        { k: 'cell_b', t: '◻', c: '#3b82f6', d: '蓝格', g: '格子' },
        { k: 'd1', t: '⚀', g: '骰子' }, { k: 'd2', t: '⚁', g: '骰子' }, { k: 'd3', t: '⚂', g: '骰子' },
        { k: 'd4', t: '⚃', g: '骰子' }, { k: 'd5', t: '⚄', g: '骰子' }, { k: 'd6', t: '⚅', g: '骰子' },
        { k: 'star', t: '★', c: '#f5c518', d: '起飞/终点', g: '标记' }
      ]
    }
  };

  /* ---- 默认皮肤（全占位，没一张外来图） ---- */
  function defaultSkin() {
    var out = { version: 1, decks: {} };
    DECKS.forEach(function (d) {
      var g = {};
      GLYPH_DEF[d].items.forEach(function (it) {
        g[it.k] = { img: '', t: it.t, c: it.c || '', fs: (String(it.t).length > 1 ? 0.62 : 1) };
      });
      out.decks[d] = {
        name: GLYPH_DEF[d].name,
        back: { img: '', bg: '#2b2140', fg: '#f5c518', mark: '✦' },
        base: '#fffdf7',
        pattern: { img: '', alpha: 0.30, tile: false, ph: 'grid' },
        frame: { img: '', c: '#2b2140', w: 6, r: 16 },
        glyphs: g
      };
    });
    return out;
  }

  var _cache = null;
  function data() {
    if (_cache) return _cache;
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
    if (!d || !d.decks) d = defaultSkin();
    /* 老数据补全新牌组/新符号，别让引擎开天窗 */
    var def = defaultSkin();
    DECKS.forEach(function (k) {
      if (!d.decks[k]) d.decks[k] = def.decks[k];
      var dd = d.decks[k], dl = def.decks[k];
      if (!dd.back) dd.back = dl.back;
      if (!dd.pattern) dd.pattern = dl.pattern;
      if (!dd.frame) dd.frame = dl.frame;
      dd.glyphs = dd.glyphs || {};
      Object.keys(dl.glyphs).forEach(function (gk) { if (!dd.glyphs[gk]) dd.glyphs[gk] = dl.glyphs[gk]; });
    });
    _cache = d; return _cache;
  }
  function save(d) {
    _cache = d || _cache;
    try { localStorage.setItem(KEY, JSON.stringify(_cache)); }
    catch (e) { if (global.toast) global.toast('⚠️ 卡牌皮肤写不进去，浏览器存储可能满了'); }
  }
  function deck(d) { return data().decks[d] || defaultSkin().decks[d]; }
  function glyph(d, k) { var s = deck(d); return (s.glyphs || {})[k] || null; }
  function deckName(d) { return (GLYPH_DEF[d] && GLYPH_DEF[d].name) || d; }
  function glyphList(d) { return (GLYPH_DEF[d] && GLYPH_DEF[d].items) || []; }
  /* 素材分类是**各牌组独立**的（陛下钦定）：川麻分 数字/花色/风牌/箭牌，
     UNO 分 数字/功能牌，斗地主分 花色/点数/大小王，飞行棋分 棋子/格子/骰子/标记。 */
  function glyphGroups(d) {
    var out = [], seen = {};
    glyphList(d).forEach(function (it) {
      var g = it.g || '其它';
      if (!seen[g]) { seen[g] = { name: g, items: [] }; out.push(seen[g]); }
      seen[g].items.push(it);
    });
    return out;
  }

  /* ---- 图片缓存：素材换完立刻生效靠每帧重画 ---- */
  var _imgs = {};
  function img(src) {
    if (!src) return null;
    if (_imgs[src]) return _imgs[src];
    var im = new Image();
    im.onload = function () { if (global.CardSkin && global.CardSkin._dirty) global.CardSkin._dirty(); };
    im.src = src; _imgs[src] = im;
    return im.complete && im.naturalWidth ? im : im;
  }
  function ready(im) { return !!(im && im.complete && im.naturalWidth); }

  /* ---- 小工具 ---- */
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  /* 占位底纹：斜纹 / 网点 / 格纹，认不出是"缺素材"的那种丑，是干净的装饰纹 */
  function placeholderPattern(ctx, x, y, w, h, kind, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    if (kind === 'dot') {
      var step = Math.max(8, Math.round(w / 9));
      for (var iy = y + step / 2; iy < y + h; iy += step)
        for (var ix = x + step / 2; ix < x + w; ix += step) { ctx.beginPath(); ctx.arc(ix, iy, 1.2, 0, 6.2832); ctx.fill(); }
    } else if (kind === 'grid') {
      var s2 = Math.max(10, Math.round(w / 7));
      ctx.beginPath();
      for (var gx = x; gx <= x + w; gx += s2) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); }
      for (var gy = y; gy <= y + h; gy += s2) { ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); }
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (var d2 = -h; d2 < w; d2 += Math.max(8, Math.round(w / 8))) { ctx.moveTo(x + d2, y + h); ctx.lineTo(x + d2 + h, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  /* 画一个符号：有图用图（居中、不拉伸），没图矢量占位 */
  function drawGlyph(ctx, d, key, cx, cy, box, color) {
    var g = glyph(d, key);
    if (!g) return;
    var im = g.img ? img(g.img) : null;
    if (ready(im)) {
      var s = Math.min(box / im.naturalWidth, box / im.naturalHeight);
      var w = im.naturalWidth * s, h = im.naturalHeight * s;
      ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
      return;
    }
    var txt = g.t || '?';
    var fs = box * 0.86 * (g.fs || 1);
    if (String(txt).length > 1) fs = box * (g.fs || 0.62);
    ctx.save();
    ctx.fillStyle = color || g.c || '#333';
    ctx.font = 'bold ' + Math.max(8, Math.round(fs)) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx, cy);
    ctx.restore();
  }
  function drawGlyphAt(ctx, d, key, x, y, box, color) { drawGlyph(ctx, d, key, x + box / 2, y + box / 2, box, color); }

  /* ---- 牌面：底纹 → 边框 → 牌组专属布局 ---- */
  var LAYOUT = {
    uno: function (ctx, sk, card, x, y, w, h) {
      var col = (GLYPH_DEF.uno.colors[card.color] || '#888');
      ctx.save();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.36, h * 0.34, -0.42, 0, 6.2832);
      ctx.fill();
      ctx.restore();
      drawGlyph(ctx, 'uno', card.shape, x + w / 2, y + h / 2, Math.min(w, h) * 0.52, '#fff');
      /* 角标小字 */
      drawGlyph(ctx, 'uno', card.shape, x + w * 0.17, y + h * 0.16, Math.min(w, h) * 0.20, '#fff');
      drawGlyph(ctx, 'uno', card.shape, x + w * 0.83, y + h * 0.86, Math.min(w, h) * 0.20, '#fff');
    },
    mahjong: function (ctx, sk, card, x, y, w, h) {
      var c = GLYPH_DEF.mahjong.colors[card.suit] || '#455a64';
      /* ══ 三十四更 · 陛下钦定：牌面不再套那圈内框 ══
         原先这里画了一个缩到 72%×80% 的白色圆角框（fill + stroke），把符号框在中间一小块：
         手牌一叠起来，框与框之间全是留白 → 看着「又挤又有缝」，牌面还显小。
         现在直接去掉内框，符号铺满整张牌，牌与牌紧挨时像一整排。 */
      var box = Math.min(w, h);
      if (card.kind === 'honor') {                       /* 风牌 / 箭牌：一个字占满 */
        drawGlyph(ctx, 'mahjong', card.rank, x + w / 2, y + h / 2, box * 0.86, c);
      } else {                                            /* 数牌：上数字下花色（一万 = 一 + 萬） */
        drawGlyph(ctx, 'mahjong', 'n' + card.rank, x + w / 2, y + h * 0.300, box * 0.54, c);
        drawGlyph(ctx, 'mahjong', card.suit, x + w / 2, y + h * 0.720, box * 0.54, c);
      }
    },
    doudizhu: function (ctx, sk, card, x, y, w, h) {
      var c = GLYPH_DEF.doudizhu.colors[card.suit] || '#21262d';
      if (card.rank === 'JOKER') {
        drawGlyph(ctx, 'doudizhu', card.joker || 'jk_b', x + w / 2, y + h * 0.46, Math.min(w, h) * 0.42, c);
        drawGlyph(ctx, 'doudizhu', card.joker || 'jk_b', x + w * 0.18, y + h * 0.15, Math.min(w, h) * 0.18, c);
        return;
      }
      var rk = 'r' + card.rank;
      drawGlyph(ctx, 'doudizhu', rk, x + w * 0.20, y + h * 0.18, Math.min(w, h) * 0.26, c);
      drawGlyph(ctx, 'doudizhu', card.suit, x + w * 0.20, y + h * 0.36, Math.min(w, h) * 0.18, c);
      drawGlyph(ctx, 'doudizhu', card.suit, x + w / 2, y + h * 0.58, Math.min(w, h) * 0.46, c);
      ctx.save(); ctx.scale(-1, -1);                       /* 右下角镜像角标（扑克的老规矩） */
      drawGlyph(ctx, 'doudizhu', rk, -(x + w * 0.80), -(y + h * 0.82), Math.min(w, h) * 0.26, c);
      drawGlyph(ctx, 'doudizhu', card.suit, -(x + w * 0.80), -(y + h * 0.64), Math.min(w, h) * 0.18, c);
      ctx.restore();
    },
    flight: function (ctx, sk, card, x, y, w, h) {
      var key = card.kind === 'dice' ? ('d' + card.n) : (card.kind === 'cell' ? 'cell' : ('plane_' + card.color));
      if (card.kind === 'cell' && card.color) key = 'cell_' + card.color;
      if (card.kind === 'star') key = 'star';
      drawGlyph(ctx, 'flight', key, x + w / 2, y + h / 2, Math.min(w, h) * 0.62,
        GLYPH_DEF.flight.colors[card.color] || '#8d6e63');
    }
  };

  function drawCard(ctx, d, card, x, y, w, h, opt) {
    opt = opt || {};
    var sk = deck(d);
    if (opt.flip) { drawBack(ctx, d, x, y, w, h); return; }
    /* ⚠️ 三十四更 · 陛下钦定：川麻将牌面【不套牌卡边框】。
       每张牌各自一圈圆角框 + 粗描边，就算把手牌排成紧挨的一排，
       看着依然是一张张分开的卡片（框线就是"缝"）。
       去掉框之后牌面直接连成一整排，字也能放到最大。
       ⚠️ 只作用于【牌面】—— 牌背（drawBack）该有的框一个不少。 */
    var noFace = (d === 'mahjong');
    var rad = noFace ? Math.min(3, w * 0.08) : ((sk.frame && sk.frame.r) || 14);
    /* 牌底 */
    ctx.save();
    rrect(ctx, x, y, w, h, rad);
    ctx.fillStyle = sk.base || '#fffdf7'; ctx.fill();
    ctx.save(); ctx.clip();
    /* ① 底纹 */
    var pi = sk.pattern && sk.pattern.img ? img(sk.pattern.img) : null;
    if (ready(pi)) {
      ctx.globalAlpha = (sk.pattern && sk.pattern.alpha != null) ? sk.pattern.alpha : 1;
      if (sk.pattern && sk.pattern.tile) {
        var tw = Math.max(24, w / 3), th = tw * (pi.naturalHeight / pi.naturalWidth);
        for (var ty = y; ty < y + h; ty += th) for (var tx = x; tx < x + w; tx += tw) ctx.drawImage(pi, tx, ty, tw, th);
      } else ctx.drawImage(pi, x, y, w, h);
      ctx.globalAlpha = 1;
    } else if (!noFace) {
      placeholderPattern(ctx, x, y, w, h, (sk.pattern && sk.pattern.ph) || 'grid', '#8d6e63', (sk.pattern && sk.pattern.alpha) || 0.3);
    }
    ctx.restore();
    /* ② 边框（麻将牌面跳过） */
    var fi = (!noFace && sk.frame && sk.frame.img) ? img(sk.frame.img) : null;
    if (ready(fi)) ctx.drawImage(fi, x, y, w, h);
    else if (!noFace) {
      ctx.save();
      ctx.strokeStyle = (sk.frame && sk.frame.c) || '#2b2140';
      ctx.lineWidth = (sk.frame && sk.frame.w) || 5;
      rrect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, (sk.frame && sk.frame.r) || 14);
      ctx.stroke(); ctx.restore();
    }
    /* ③ 通用符号（各牌组自己的摆法） */
    var lay = LAYOUT[d];
    if (lay && card) lay(ctx, sk, card, x, y, w, h);
    ctx.restore();
    if (opt.dim) {
      ctx.save(); ctx.globalAlpha = 0.42; ctx.fillStyle = '#0b0714';
      rrect(ctx, x, y, w, h, rad); ctx.fill(); ctx.restore();
    }
    if (opt.hi) {
      ctx.save(); ctx.strokeStyle = opt.hi; ctx.lineWidth = 4;
      rrect(ctx, x + 2, y + 2, w - 4, h - 4, rad); ctx.stroke(); ctx.restore();
    }
  }
  function drawBack(ctx, d, x, y, w, h) {
    var sk = deck(d), b = sk.back || {};
    ctx.save();
    rrect(ctx, x, y, w, h, (sk.frame && sk.frame.r) || 14);
    ctx.fillStyle = b.bg || '#2b2140'; ctx.fill();
    ctx.save(); ctx.clip();
    var bi = b.img ? img(b.img) : null;
    if (ready(bi)) ctx.drawImage(bi, x, y, w, h);
    else {
      placeholderPattern(ctx, x, y, w, h, 'slash', b.fg || '#f5c518', 0.35);
      ctx.fillStyle = b.fg || '#f5c518';
      ctx.font = 'bold ' + Math.round(Math.min(w, h) * 0.46) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.mark || '✦', x + w / 2, y + h / 2);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    rrect(ctx, x + 1, y + 1, w - 2, h - 2, (sk.frame && sk.frame.r) || 14); ctx.stroke();
    ctx.restore();
  }

  /* ---- 导出 / 导入（给引擎之间互相倒腾） ---- */
  function exportJSON() { return JSON.stringify(data(), null, 1); }
  function importJSON(txt) {
    var o = null;
    try { o = JSON.parse(txt); } catch (e) { return false; }
    if (!o || !o.decks) return false;
    _cache = null; save(o); return true;
  }
  function resetDeck(d) {
    var s = data(); s.decks[d] = defaultSkin().decks[d]; save(s);
  }

  /* ---- 素材快换面板（UNO/川麻/飞行棋/斗地主 四个引擎内嵌这一段，不用各写一遍） ----
     host: 容器 DOM；d: 牌组 key；onChange: 换完回调（重画预览） */
  function buildEditorPanel(host, d, onChange) {
    if (!host) return;
    var sk = deck(d);
    host.innerHTML = '';
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

    var row = function (label, sub) {
      var el = document.createElement('div');
      el.className = 'cs-row';
      el.innerHTML = '<div class="cs-lab">' + label + (sub ? '<span class="cs-sub">' + sub + '</span>' : '') + '</div>';
      host.appendChild(el); return el;
    };
    /* 通用：一个「选图」按钮 + 「清空」按钮 */
    var pick = function (label, sub, get, set) {
      var el = row(label, sub);
      var box = document.createElement('div'); box.className = 'cs-act';
      var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.style.display = 'none';
      var btn = document.createElement('button'); btn.className = 'cs-btn'; btn.textContent = '📁 换图';
      var clr = document.createElement('button'); clr.className = 'cs-btn ghost'; clr.textContent = '✕ 用占位';
      var pre = document.createElement('img'); pre.className = 'cs-pre'; pre.src = get() || ''; pre.style.display = get() ? '' : 'none';
      btn.onclick = function () { f.click(); };
      clr.onclick = function () { set(''); pre.src = ''; pre.style.display = 'none'; onChange && onChange(); };
      f.onchange = function () {
        var file = f.files && f.files[0]; if (!file) return;
        var fr = new FileReader();
        fr.onload = function () { set(String(fr.result)); pre.src = String(fr.result); pre.style.display = ''; onChange && onChange(); };
        fr.readAsDataURL(file);
      };
      box.appendChild(pre); box.appendChild(btn); box.appendChild(clr); el.appendChild(box);
    };
    /* ① 牌背 */
    row('① 牌背', '整张一图；没图就是纯色 + 中心标记');
    pick('牌背图', '', function () { return deck(d).back.img; }, function (v) { deck(d).back.img = v; save(); });
    var bRow = row('牌背底色 / 标记色 / 标记字', '占位时用的三件套');
    var bBox = document.createElement('div'); bBox.className = 'cs-act';
    ['bg', 'fg', 'mark'].forEach(function (k) {
      var i = document.createElement('input');
      i.className = 'cs-in' + (k === 'mark' ? '' : ' cs-color');
      if (k !== 'mark') i.type = 'color';
      i.value = deck(d).back[k] || '#2b2140';
      i.oninput = function () { deck(d).back[k] = i.value; save(); onChange && onChange(); };
      bBox.appendChild(i);
    });
    bRow.appendChild(bBox);
    /* ② 底纹 */
    row('② 牌面 · 底纹', '铺满整张，可选平铺');
    pick('底纹图', '', function () { return deck(d).pattern.img; }, function (v) { deck(d).pattern.img = v; save(); });
    var pRow = row('底纹不透明度 / 平铺 / 占位样式', '');
    var pBox = document.createElement('div'); pBox.className = 'cs-act';
    var al = document.createElement('input'); al.type = 'range'; al.min = '0.05'; al.max = '1'; al.step = '0.05'; al.value = deck(d).pattern.alpha;
    al.oninput = function () { deck(d).pattern.alpha = parseFloat(al.value); save(); onChange && onChange(); };
    var tl = document.createElement('label'); tl.className = 'cs-chk';
    var tc = document.createElement('input'); tc.type = 'checkbox'; tc.checked = !!deck(d).pattern.tile;
    tc.onchange = function () { deck(d).pattern.tile = tc.checked; save(); onChange && onChange(); };
    tl.appendChild(tc); tl.appendChild(document.createTextNode('平铺'));
    var sel = document.createElement('select'); sel.className = 'cs-in';
    ['grid', 'dot', 'slash'].forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = ({ grid: '格纹', dot: '网点', slash: '斜纹' })[v];
      if (deck(d).pattern.ph === v) o.selected = true; sel.appendChild(o);
    });
    sel.onchange = function () { deck(d).pattern.ph = sel.value; save(); onChange && onChange(); };
    pBox.appendChild(al); pBox.appendChild(tl); pBox.appendChild(sel); pRow.appendChild(pBox);
    /* ③ 边框 */
    row('③ 牌面 · 边框', '覆盖在底纹之上；没图就是一圈描边');
    pick('边框图', '', function () { return deck(d).frame.img; }, function (v) { deck(d).frame.img = v; save(); });
    var fRow = row('边框色 / 粗细 / 圆角', '');
    var fBox = document.createElement('div'); fBox.className = 'cs-act';
    var fc = document.createElement('input'); fc.type = 'color'; fc.className = 'cs-color'; fc.value = deck(d).frame.c;
    fc.oninput = function () { deck(d).frame.c = fc.value; save(); onChange && onChange(); };
    var fw = document.createElement('input'); fw.type = 'range'; fw.min = '2'; fw.max = '20'; fw.step = '1'; fw.value = deck(d).frame.w;
    fw.oninput = function () { deck(d).frame.w = parseInt(fw.value, 10); save(); onChange && onChange(); };
    var fr2 = document.createElement('input'); fr2.type = 'range'; fr2.min = '0'; fr2.max = '40'; fr2.step = '2'; fr2.value = deck(d).frame.r;
    fr2.oninput = function () { deck(d).frame.r = parseInt(fr2.value, 10); save(); onChange && onChange(); };
    fBox.appendChild(fc); fBox.appendChild(fw); fBox.appendChild(fr2); fRow.appendChild(fBox);
    /* ④ 通用符号（按分类分组，分类各牌组独立） */
    row('④ 牌面 · 通用符号', '花色 / 一万 / 数字…换一次，用到它的牌全变');
    var wrap = document.createElement('div'); wrap.className = 'cs-groups';
    glyphGroups(d).forEach(function (grp) {
    var gh = document.createElement('div'); gh.className = 'cs-grp-head';
    gh.textContent = '▸ ' + grp.name + '（' + grp.items.length + '）';
    wrap.appendChild(gh);
    var grid = document.createElement('div'); grid.className = 'cs-grid';
    grp.items.forEach(function (it) {
      var cell = document.createElement('div'); cell.className = 'cs-cell';
      var nm = document.createElement('div'); nm.className = 'cs-nm'; nm.textContent = it.t + (it.d ? ' ' + it.d : '');
      var cv = document.createElement('canvas'); cv.className = 'cs-cv'; cv.width = 96; cv.height = 96;
      var cc = cv.getContext('2d');
      cc.fillStyle = '#fffdf7'; rrect(cc, 4, 4, 88, 88, 12); cc.fill();
      cc.strokeStyle = '#2b2140'; cc.lineWidth = 3; rrect(cc, 4, 4, 88, 88, 12); cc.stroke();
      drawGlyph(cc, d, it.k, 48, 48, 66, it.c || '#333');
      var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.style.display = 'none';
      f.onchange = function () {
        var file = f.files && f.files[0]; if (!file) return;
        var r2 = new FileReader();
        r2.onload = function () { glyph(d, it.k).img = String(r2.result); save(); onChange && onChange(); buildEditorPanel(host, d, onChange); };
        r2.readAsDataURL(file);
      };
      var b1 = document.createElement('button'); b1.className = 'cs-btn tiny'; b1.textContent = '换';
      b1.onclick = function () { f.click(); };
      var b2 = document.createElement('button'); b2.className = 'cs-btn tiny ghost'; b2.textContent = '✕';
      b2.onclick = function () { glyph(d, it.k).img = ''; save(); onChange && onChange(); buildEditorPanel(host, d, onChange); };
      var bar = document.createElement('div'); bar.className = 'cs-bar';
      bar.appendChild(b1); bar.appendChild(b2);
      cell.appendChild(nm); cell.appendChild(cv); cell.appendChild(bar);
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    });
    host.appendChild(wrap);
    var rst = document.createElement('button'); rst.className = 'cs-btn ghost wide'; rst.textContent = '↩️ 这套牌恢复默认占位';
    rst.onclick = function () { resetDeck(d); buildEditorPanel(host, d, onChange); onChange && onChange(); };
    host.appendChild(rst);
  }

  global.CardSkin = {
    KEY: KEY, DECKS: DECKS, GLYPH_DEF: GLYPH_DEF,
    data: data, save: save, deck: deck, glyph: glyph, glyphList: glyphList, glyphGroups: glyphGroups, deckName: deckName,
    drawCard: drawCard, drawBack: drawBack, drawGlyph: drawGlyph, img: img, rrect: rrect,
    exportJSON: exportJSON, importJSON: importJSON, resetDeck: resetDeck,
    buildEditorPanel: buildEditorPanel, _dirty: null
  };
})(window);
