/* ============================================================
   拾光·澈屿 · 内置初始素体模板（body-template.js）
   ------------------------------------------------------------
   干什么用：
     游戏 / 服装编辑引擎在「本地还没有保存过素体」时，不再显示火柴人，
     而是直接用这份代码画出来的初始小人当主角：
        头 / 身体 / 左臂 / 右臂 / 左腿 / 右腿
     与《服装编辑引擎 → 素体工坊 → ✨ 示例小人》同一套坐标与关节，
     所以陛下在服装引擎里打开就能直接接着调，位置不会跳。

   怎么用：
     const parts = BodyTemplate.build();                  // 默认配色
     const parts = BodyTemplate.build({hair:'#5a3b2b'});  // 指定配色
     const pal   = BodyTemplate.paletteFromOutfit(旧outfit);

   返回结构与 localStorage['engine_body_v4'] 完全一致，可直接存档。
   ============================================================ */
(function (global) {
  'use strict';

  const DEFAULTS = {
    skin:   '#ffd9b8',   // 肤色
    hair:   '#2b2b2b',   // 发色（默认＝旧角色「熊猫」的黑色短发）
    top:    '#e53935',   // 上衣（默认＝红色 T 恤）
    bottom: '#3f51b5',   // 下装（默认＝牛仔裤）
    shoes:  '#f0f0f0',   // 鞋子（默认＝小白鞋）
    eye:    '#3a2a1a',
    blush:  'rgba(255,150,150,0.35)'
  };

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    ctx.fill();
  }

  function mkCanvas(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    fn(ctx, w, h);
    return c.toDataURL('image/png');
  }

  /* ---------- 六张零件图 ---------- */
  function headImg(p) {
    return mkCanvas(120, 120, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      // 后发（短发：比脸大一圈，露出下发尾）
      ctx.fillStyle = p.hair;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, 46, 48, 0, 0, Math.PI * 2); ctx.fill();
      // 脸
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(cx, cy + 6, 42, 0, Math.PI * 2); ctx.fill();
      // 刘海
      ctx.fillStyle = p.hair;
      ctx.beginPath(); ctx.arc(cx, cy + 4, 42, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - 16, cy - 24, 17, 11, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 14, cy - 26, 14, 9, 0.2, 0, Math.PI * 2); ctx.fill();
      // 眼睛 + 腮红 + 嘴
      ctx.fillStyle = p.eye;
      ctx.beginPath(); ctx.arc(cx - 14, cy + 10, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 14, cy + 10, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.blush;
      ctx.beginPath(); ctx.ellipse(cx - 23, cy + 20, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 23, cy + 20, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c04a4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy + 24, 8, 0.1, Math.PI - 0.1); ctx.stroke();
    });
  }

  function bodyImg(p) {
    return mkCanvas(100, 120, (ctx, w, h) => {
      const cx = w / 2;
      // 脖子
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(cx, 22, 14, 0, Math.PI); ctx.fill();
      // 上衣
      ctx.fillStyle = p.top;
      rr(ctx, cx - 38, 12, 76, 100, 20);
      // 下摆阴影（一点立体感）
      ctx.fillStyle = 'rgba(0,0,0,.10)';
      rr(ctx, cx - 38, 92, 76, 20, 18);
      // 领口
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.ellipse(cx, 14, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    });
  }

  function armImg(p) {
    return mkCanvas(50, 110, (ctx, w, h) => {
      const cx = w / 2;
      ctx.fillStyle = p.top;                       // 袖子
      rr(ctx, cx - 14, 0, 28, 55, 13);
      ctx.fillStyle = p.skin;                      // 小臂
      rr(ctx, cx - 11, 50, 22, 45, 10);
      ctx.fillStyle = p.skin;                      // 手
      ctx.beginPath(); ctx.arc(cx, 100, 10, 0, Math.PI * 2); ctx.fill();
    });
  }

  function legImg(p) {
    return mkCanvas(50, 110, (ctx, w, h) => {
      const cx = w / 2;
      ctx.fillStyle = p.bottom;                    // 裤/裙
      rr(ctx, cx - 11, 0, 22, 82, 9);
      ctx.fillStyle = p.shoes;                     // 鞋
      rr(ctx, cx - 14, 76, 28, 22, 8);
      ctx.fillStyle = 'rgba(0,0,0,.12)';           // 鞋底
      rr(ctx, cx - 14, 91, 28, 7, 4);
    });
  }

  /* ---------- 组装（坐标 / 关节与服装引擎「示例小人」完全一致） ---------- */
  function build(palette) {
    const p = Object.assign({}, DEFAULTS, palette || {});
    const arm = armImg(p), leg = legImg(p);
    const HW = 80, HH = 80, BW = 80, BH = 96, AW = 32, AH = 76, LW = 26, LH = 92, CX = 150;
    const bodyY = 20 + HH;
    return {
      head:  { x: CX - HW / 2, y: 20,   w: HW, h: HH, rot: 0, flipH: false, jointPct: null,        imgSrc: headImg(p) },
      body:  { x: CX - BW / 2, y: bodyY, w: BW, h: BH, rot: 0, flipH: false, jointPct: null,        imgSrc: bodyImg(p) },
      armL:  { x: CX - BW / 2 - AW + 6, y: bodyY + 8, w: AW, h: AH, rot: 0, flipH: false, jointPct: { x: .5, y: 0 }, imgSrc: arm },
      armR:  { x: CX + BW / 2 - 6,      y: bodyY + 8, w: AW, h: AH, rot: 0, flipH: false, jointPct: { x: .5, y: 0 }, imgSrc: arm },
      legL:  { x: CX - LW,              y: bodyY + BH - 6, w: LW, h: LH, rot: 0, flipH: false, jointPct: { x: .5, y: 0 }, imgSrc: leg },
      legR:  { x: CX,                   y: bodyY + BH - 6, w: LW, h: LH, rot: 0, flipH: false, jointPct: { x: .5, y: 0 }, imgSrc: leg }
    };
  }

  /* 旧版存档的 outfit（{hair:{color},top:{color},bottom:{color},shoes:{color}}）
     → 模板配色，让「以前那个角色」直接在素体上复活 */
  function paletteFromOutfit(outfit) {
    if (!outfit) return null;
    const pick = (k) => {
      const v = outfit[k];
      if (!v) return null;
      if (typeof v === 'string') return null;                 // 新版引擎 id，没有颜色可继承
      return (typeof v === 'object' && v.color) ? v.color : null;
    };
    const p = {};
    const hair = pick('hair'), top = pick('top'), bottom = pick('bottom'), shoes = pick('shoes');
    if (hair) p.hair = hair;
    if (top) p.top = top;
    if (bottom) p.bottom = bottom;
    if (shoes) p.shoes = shoes;
    return Object.keys(p).length ? p : null;
  }

  global.BodyTemplate = { build: build, paletteFromOutfit: paletteFromOutfit, DEFAULTS: DEFAULTS };
})(window);
