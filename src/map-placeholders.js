/* ============================================================
   拾光·澈屿 · 地图内置占位素材（map-placeholders.js）
   ------------------------------------------------------------
   地块不再用「底色方块 + emoji」，而是一张真正的 PNG。
   这里用代码画 8 张卡通建筑插画当占位素材，陛下随时可以在
   《地图编辑引擎》里换成自己的 PNG（上传即覆盖）。

   用法：
     MapPlaceholders.list            // [{id,name,icon,src}]
     MapPlaceholders.byId(id)
     MapPlaceholders.pick(seed)      // 没指定素材时，按名字挑一张，保证同一地块每次都一样
   ============================================================ */
(function (global) {
  'use strict';

  function mk(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x, w, h);
    return c.toDataURL('image/png');
  }
  function rr(x, px, py, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    x.beginPath();
    if (x.roundRect) x.roundRect(px, py, w, h, r);
    else {
      x.moveTo(px + r, py);
      x.arcTo(px + w, py, px + w, py + h, r);
      x.arcTo(px + w, py + h, px, py + h, r);
      x.arcTo(px, py + h, px, py, r);
      x.arcTo(px, py, px + w, py, r);
      x.closePath();
    }
    x.fill();
  }

  function building(o) {
    return mk(200, 200, (x, w, h) => {
      const ground = 182, cx = 100;
      // 地面影子
      x.fillStyle = 'rgba(40,30,60,.20)';
      x.beginPath(); x.ellipse(cx, ground + 5, 72, 11, 0, 0, Math.PI * 2); x.fill();

      const bw = o.bw || 132, bh = o.bh || 92;
      const bx = (200 - bw) / 2, by = ground - bh;

      // 墙体
      x.fillStyle = o.wall;
      rr(x, bx, by, bw, bh, 7);
      // 墙面暗部（右侧一点体积感）
      x.fillStyle = 'rgba(0,0,0,.07)';
      rr(x, bx + bw * 0.66, by, bw * 0.34, bh, 7);

      // 屋顶
      if (o.roof === 'gable') {
        x.fillStyle = o.roofColor;
        x.beginPath();
        x.moveTo(bx - 12, by + 2); x.lineTo(cx, by - 46); x.lineTo(bx + bw + 12, by + 2);
        x.closePath(); x.fill();
      } else if (o.roof === 'flat') {
        x.fillStyle = o.roofColor;
        rr(x, bx - 8, by - 14, bw + 16, 16, 5);
      } else if (o.roof === 'dome') {
        x.fillStyle = o.roofColor;
        x.beginPath(); x.ellipse(cx, by, bw * 0.52, 44, 0, Math.PI, Math.PI * 2); x.fill();
        x.fillRect(bx, by - 1, bw, 6);
        x.fillStyle = 'rgba(255,255,255,.55)';
        x.beginPath(); x.arc(cx, by - 46, 5, 0, Math.PI * 2); x.fill();
      } else if (o.roof === 'awning') {
        const stripe = (bw + 20) / 6;
        for (let i = 0; i < 6; i++) {
          x.fillStyle = (i % 2 === 0) ? o.roofColor : '#ffffff';
          rr(x, bx - 10 + i * stripe, by - 16, stripe, 18, 2);
        }
      }

      // 门
      x.fillStyle = o.door || '#8a5a3b';
      rr(x, cx - 17, ground - 48, 34, 48, 15);
      x.fillStyle = 'rgba(255,255,255,.35)';
      rr(x, cx - 12, ground - 44, 24, 12, 6);

      // 窗
      const wy = by + bh * 0.30;
      x.fillStyle = o.window || '#bfe3f5';
      rr(x, bx + 16, wy, 28, 26, 5);
      rr(x, bx + bw - 44, wy, 28, 26, 5);
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(cx - 31, wy + 13); x.lineTo(cx - 3, wy + 13);
      x.moveTo(cx + 31, wy + 13); x.lineTo(cx + 3, wy + 13); x.stroke();

      // 招牌 emoji
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '30px sans-serif';
      x.fillText(o.icon, cx, by + bh * 0.22);

      // 小装饰（台阶/草丛）
      x.fillStyle = 'rgba(90,150,90,.65)';
      x.beginPath(); x.ellipse(bx + 14, ground + 2, 16, 7, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(bx + bw - 12, ground + 2, 14, 6, 0, 0, Math.PI * 2); x.fill();
    });
  }

  function fountain() {
    return mk(200, 200, (x, w, h) => {
      const ground = 182, cx = 100;
      x.fillStyle = 'rgba(40,30,60,.20)';
      x.beginPath(); x.ellipse(cx, ground + 5, 72, 11, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#cfd8e3';
      x.beginPath(); x.ellipse(cx, ground, 68, 22, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#8fb8d8';
      x.beginPath(); x.ellipse(cx, ground - 4, 56, 16, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#e6eef6';
      rr(x, cx - 12, ground - 60, 24, 58, 6);
      x.beginPath(); x.ellipse(cx, ground - 60, 30, 10, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(150,200,235,.9)'; x.lineWidth = 5; x.lineCap = 'round';
      x.beginPath();
      x.moveTo(cx, ground - 66); x.quadraticCurveTo(cx - 34, ground - 92, cx - 44, ground - 56);
      x.moveTo(cx, ground - 66); x.quadraticCurveTo(cx + 34, ground - 92, cx + 44, ground - 56);
      x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '28px sans-serif';
      x.fillText('⛲', cx, ground - 78);
    });
  }

  function garden() {
    return mk(200, 200, (x, w, h) => {
      const ground = 182, cx = 100;
      x.fillStyle = 'rgba(40,30,60,.18)';
      x.beginPath(); x.ellipse(cx, ground + 5, 66, 10, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#8a5a3b';
      rr(x, cx - 9, ground - 56, 18, 56, 5);
      x.fillStyle = '#5fae5f';
      x.beginPath(); x.arc(cx, ground - 74, 34, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#79c879';
      x.beginPath(); x.arc(cx - 14, ground - 84, 20, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(cx + 16, ground - 80, 18, 0, Math.PI * 2); x.fill();
      const pts = [[cx - 20, ground - 66], [cx + 18, ground - 62], [cx - 2, ground - 90]];
      pts.forEach(p => {
        x.fillStyle = '#ff9ec4';
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          x.beginPath(); x.arc(p[0] + Math.cos(a) * 7, p[1] + Math.sin(a) * 7, 5, 0, Math.PI * 2); x.fill();
        }
        x.fillStyle = '#fff3b0';
        x.beginPath(); x.arc(p[0], p[1], 4, 0, Math.PI * 2); x.fill();
      });
    });
  }

  const LIST = [
    { id: 'ph_house',  name: '温馨小屋', icon: '🏠', src: building({ wall: '#f6e7cf', roof: 'gable',  roofColor: '#c0553f', icon: '🏠', window: '#cfe8f5' }) },
    { id: 'ph_shop',   name: '服装店',   icon: '👗', src: building({ wall: '#fbe3ee', roof: 'awning', roofColor: '#ef7aa8', icon: '👗', door: '#c96a90', window: '#ffe6f1' }) },
    { id: 'ph_school', name: '学校',     icon: '🏫', src: building({ wall: '#f3ecd7', roof: 'flat',   roofColor: '#4f9d5d', icon: '🏫', bw: 150, bh: 86, window: '#d6ecf7' }) },
    { id: 'ph_library',name: '图书馆',   icon: '📚', src: building({ wall: '#e6ecf7', roof: 'dome',   roofColor: '#6d84b4', icon: '📚', door: '#5b6b93', window: '#e8f1fb' }) },
    { id: 'ph_cafe',   name: '咖啡馆',   icon: '☕', src: building({ wall: '#f0e0cd', roof: 'awning', roofColor: '#8a5a3b', icon: '☕', door: '#7a4b30', window: '#ffe9c9' }) },
    { id: 'ph_flower', name: '花店',     icon: '🌸', src: building({ wall: '#e3f3ec', roof: 'gable',  roofColor: '#6bb59a', icon: '🌸', door: '#7d9c8c', window: '#e9fbf3' }) },
    { id: 'ph_tarot',  name: '塔罗小屋', icon: '🔮', src: building({ wall: '#ece3f7', roof: 'dome',   roofColor: '#8a6fc4', icon: '🔮', door: '#6a52a0', window: '#f0e9ff' }) },
    { id: 'ph_fountain', name: '喷泉广场', icon: '⛲', src: fountain() },
    { id: 'ph_garden', name: '花园',     icon: '🌳', src: garden() }
  ];

  function byId(id) { return LIST.filter(p => p.id === id)[0] || null; }
  function pick(seed) {
    let n = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return LIST[n % LIST.length];
  }

  global.MapPlaceholders = { list: LIST, byId: byId, pick: pick };
})(window);
