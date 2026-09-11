/* =====================================================================
 *  npc-render.js  ——  NPC / 角色 共享渲染器（v1，2026-09-11）
 *  ---------------------------------------------------------------------
 *  把原本散在 NPC 编辑引擎里的 ensureBody / drawNpc / drawBodyPart /
 *  drawCloth / engBounds / engGetAnchors / engComposeLayer / engImg 等
 *  全部抽到单文件，挂到 window.NPCRenderer，供：
 *    - NPC 编辑引擎（src/NPC编辑引擎.html）
 *    - 地图编辑引擎（src/地图编辑引擎.html）
 *    - 游戏端  （src/index.html，未来对接）
 *  共同使用，避免三处重复维护。
 *
 *  依赖：
 *    <script src="./legacy-body-v4.js"></script>
 *    <script src="./body-template.js"></script>
 *  （必须先加载素体源；本文件只做"装配 + 渲染"）
 *
 *  数据契约（localStorage 键）：
 *    engine_body_v4            : 素体 6 部件 { head, body, armL, armR, legL, legR }
 *    engine_lib_v3             : 服装库 { <catId>: [Item] }
 *    engine_outfitsets_v1      : 套装库 [OutfitSet]（暂未在本文件使用）
 *    engine_npcs_v1            : NPC 列表（NPC 引擎独占）
 *  ===================================================================== */
(function (global) {
  "use strict";

  if (global.NPCRenderer) { return; }   // 单例

  /* ---------- 存储键名（与游戏/服装引擎一致） ---------- */
  const LS = {
    body: "engine_body_v4",
    lib:  "engine_lib_v3",
    sets: "engine_outfitsets_v1",
    npcs: "engine_npcs_v1",
  };

  /* ---------- 部件 / 层级定义 ---------- */
  const ENG_PART_DEFS = [
    { key:"head", hasJoint:false },
    { key:"body", hasJoint:false },
    { key:"armL", hasJoint:true  },
    { key:"armR", hasJoint:true  },
    { key:"legL", hasJoint:true  },
    { key:"legR", hasJoint:true  },
  ];
  const ENG_BODY_Z = { armL:5, armR:5, legL:5, legR:5, body:6, head:7 };
  const ENG_ANCHOR_JOINT = {
    head:"head", earL:"head", earR:"head",
    torso:"body", hip:"body",
    armL:"armL", armR:"armR", handL:"armL", handR:"armR",
    legL:"legL", legR:"legR", footL:"legL", footR:"legR",
  };
  const ENG_SLOT_BOX = {
    "hair/front":   { w:100, h:70,  ox:0, oy:-10 },
    "hair/back":    { w:110, h:90,  ox:0, oy:10  },
    "face/face":    { w:70,  h:56,  ox:0, oy:5   },
    "headwear/main":{ w:90,  h:52,  ox:0, oy:-30 },
    "earring/L":    { w:16,  h:26,  ox:0, oy:0   },
    "earring/R":    { w:16,  h:26,  ox:0, oy:0   },
    "backwear/main":{ w:130, h:120, ox:0, oy:20  },
    "top/body":     { w:88,  h:80,  ox:0, oy:0   },
    "top/sleeveL":  { w:34,  h:62,  ox:0, oy:10  },
    "top/sleeveR":  { w:34,  h:62,  ox:0, oy:10  },
    "gloves/L":     { w:26,  h:28,  ox:0, oy:0   },
    "gloves/R":     { w:26,  h:28,  ox:0, oy:0   },
    "handheld/L":   { w:32,  h:48,  ox:0, oy:10  },
    "handheld/R":   { w:32,  h:48,  ox:0, oy:10  },
    "bottom/body":  { w:72,  h:70,  ox:0, oy:0   },
    "bottom/legL":  { w:34,  h:60,  ox:0, oy:6   },
    "bottom/legR":  { w:34,  h:60,  ox:0, oy:6   },
    "socks/L":      { w:30,  h:40,  ox:0, oy:5   },
    "socks/R":      { w:30,  h:40,  ox:0, oy:5   },
    "shoes/L":      { w:36,  h:26,  ox:0, oy:0   },
    "shoes/R":      { w:36,  h:26,  ox:0, oy:0   },
  };
  const ENG_LAYERS = {
    hair:     [ { key:"front", z:25, anchor:"head" }, { key:"back", z:0, anchor:"head" } ],
    face:     [ { key:"face",  z:15, anchor:"head" } ],
    headwear: [ { key:"main",  z:26, anchor:"head" } ],
    earring:  [ { key:"L", z:26, anchor:"earL" }, { key:"R", z:26, anchor:"earR", mirrorOf:"L" } ],
    backwear: [ { key:"main",  z:-10, anchor:"torso" } ],
    top:      [ { key:"body", z:22, anchor:"torso" }, { key:"sleeveL", z:23, anchor:"armL" }, { key:"sleeveR", z:23, anchor:"armR", mirrorOf:"sleeveL" } ],
    gloves:   [ { key:"L", z:24, anchor:"handL" }, { key:"R", z:24, anchor:"handR", mirrorOf:"L" } ],
    handheld: [ { key:"L", z:27, anchor:"handL" }, { key:"R", z:27, anchor:"handR" } ],
    bottom:   [ { key:"body", z:21, anchor:"hip" }, { key:"legL", z:20, anchor:"legL" }, { key:"legR", z:20, anchor:"legR", mirrorOf:"legL" } ],
    socks:    [ { key:"L", z:18, anchor:"legL" }, { key:"R", z:18, anchor:"legR", mirrorOf:"L" } ],
    shoes:    [ { key:"L", z:19, anchor:"footL" }, { key:"R", z:19, anchor:"footR", mirrorOf:"L" } ],
  };
  /* 分类清单（外部需要遍历时可调用 NPCRenderer.CATEGORIES） */
  const ENG_CATEGORIES = [
    { id:"hair",     label:"头发",   em:"💇" },
    { id:"face",     label:"妆容",   em:"💄" },
    { id:"headwear", label:"头饰",   em:"👑" },
    { id:"earring",  label:"耳饰",   em:"💎" },
    { id:"backwear", label:"背饰",   em:"🪽" },
    { id:"top",      label:"上衣",   em:"👕" },
    { id:"gloves",   label:"手套",   em:"🧤" },
    { id:"handheld", label:"手把件", em:"💐" },
    { id:"bottom",   label:"下衣",   em:"👖" },
    { id:"socks",    label:"袜子",   em:"🧦" },
    { id:"shoes",    label:"鞋子",   em:"👟" },
  ];
  const ENG_CAT_MAP = {};
  ENG_CATEGORIES.forEach(c => ENG_CAT_MAP[c.id] = c);

  const ENGINE_BASE_H = 200;

  /* ---------- 单例 engine 状态 ---------- */
  const engine = {
    parts: {}, lib: {}, bodyReady:false,
    _imgs: new Map(), _composed: new Map(),
    _v4ok:false,        // 当前 parts 是不是从 LegacyBodyV4 灌入的
    _forceV4:true,      // 缺图就强制灌 LegacyBodyV4（陛下明确要求找回的素体覆盖本地）
  };
  let _engPending = 0, _engReadyCbs = [];
  function _engDec(){
    _engPending--;
    if(_engPending<=0){
      _engPending=0;
      const c=_engReadyCbs; _engReadyCbs=[];
      c.forEach(f=>{ try{f(); }catch(e){} });
    }
  }
  function engImg(src){
    if(!src) return null;
    let im = engine._imgs.get(src);
    if(!im){
      im = new Image();
      engine._imgs.set(src, im);
      _engPending++;
      im.addEventListener("load", _engDec);
      im.addEventListener("error", _engDec);
      im.src = src;
    }
    return im;
  }
  function afterEngineReady(cb){ if(_engPending<=0) cb(); else _engReadyCbs.push(cb); }

  function hydrateBody(d){
    try{
      const parts = {};
      ENG_PART_DEFS.forEach(def => {
        const s = d && d[def.key]; if(!s) return;
        parts[def.key] = {
          x:+s.x||0, y:+s.y||0, w:+s.w||0, h:+s.h||0,
          rot:+s.rot||0, flipH:!!s.flipH,
          jointPct:s.jointPct||null,
          img:engImg(s.imgSrc),
        };
      });
      engine.parts = parts;
      engine.bodyReady = ENG_PART_DEFS.every(def => parts[def.key] && parts[def.key].img && parts[def.key].w>0);
      // 重新 hydrate 后再清一次 composed 缓存（服装合成依赖坐标）
      engine._composed.clear();
    }catch(e){
      engine.parts = {}; engine.bodyReady = false;
    }
  }
  function loadBody(){
    try{
      const raw = localStorage.getItem(LS.body);
      if(!raw){ engine.parts = {}; engine.bodyReady = false; return; }
      hydrateBody(JSON.parse(raw) || {});
    }catch(e){
      engine.parts = {}; engine.bodyReady = false;
    }
  }

  /**
   * ensureBody —— 陛下明确要求"找回的素体"（LegacyBodyV4）就是单一真理源。
   * 规则：
   *   1) localStorage 里有完整 6 部件带图 → 用本地（可能是用户微调过的）
   *   2) 缺图 / 缺部件 / 数据损坏 → 强制用 LegacyBodyV4 覆盖
   *   3) 没有 LegacyBodyV4 → 退到 BodyTemplate
   *   4) 都没有 → bodyReady=false（drawNpc 会走兜底小人）
   */
  function ensureBody(){
    if(engine.bodyReady) return true;

    // 读 localStorage 计数有多少个部件有 imgSrc
    let localHas = 0, localOk = 0;
    try{
      const raw = localStorage.getItem(LS.body);
      if(raw){
        const st = JSON.parse(raw);
        ENG_PART_DEFS.forEach(def => {
          if(st && st[def.key] && st[def.key].imgSrc) localHas++;
        });
      }
    }catch(e){}
    if(localHas >= ENG_PART_DEFS.length){
      loadBody();
      if(engine.bodyReady){ engine._v4ok = false; return true; }
      // localStorage 字段齐全但 hydrate 后不全（比如图全过期）→ 走 LegacyV4
      localOk = 0;
    }

    // 缺图或字段不全 → 强制 LegacyV4
    if(global.LegacyBodyV4 && global.LegacyBodyV4.build){
      try{
        const parts = global.LegacyBodyV4.build();
        // 保留 localStorage 里的坐标/旋转/jointPct 等参数（仅当部件存在时），
        // 但 imgSrc 一定以 LegacyV4 为准（陛下"找回的素体"才是黄金标准）
        try{
          const raw = localStorage.getItem(LS.body);
          if(raw){
            const st = JSON.parse(raw);
            ENG_PART_DEFS.forEach(def => {
              const lc = st && st[def.key]; if(!lc) return;
              const p = parts[def.key]; if(!p) return;
              if(typeof lc.x === "number") p.x = lc.x;
              if(typeof lc.y === "number") p.y = lc.y;
              if(typeof lc.w === "number") p.w = lc.w;
              if(typeof lc.h === "number") p.h = lc.h;
              if(typeof lc.rot === "number") p.rot = lc.rot;
              if(typeof lc.flipH === "boolean") p.flipH = lc.flipH;
              if(lc.jointPct) p.jointPct = lc.jointPct;
            });
          }
        }catch(e){}
        localStorage.setItem(LS.body, JSON.stringify(parts));
        hydrateBody(parts);
        engine._v4ok = true;
        return engine.bodyReady;
      }catch(e){}
    }

    // 都没有 LegacyV4 → 退到 BodyTemplate
    if(global.BodyTemplate && global.BodyTemplate.build){
      try{
        const parts = global.BodyTemplate.build();
        localStorage.setItem(LS.body, JSON.stringify(parts));
        hydrateBody(parts);
        engine._v4ok = false;
        return engine.bodyReady;
      }catch(e){}
    }

    engine.bodyReady = false;
    return false;
  }

  /* 无条件把「找回的默认素体 LegacyBodyV4」灌回 localStorage 并重新 hydrate。
     与 ensureBody 的区别：ensureBody 只在「本地没存过 / 存了空壳」时才补，
     本地已经有一套完整（但不是 LegacyV4）的素体时它就不管了 —— 这时候用这个。
     keepGeom=true  → 保留陛下手动调过的坐标 / 旋转 / jointPct，只换图片
     keepGeom=false → 连坐标一起还原成 LegacyV4 原始值（彻底恢复出厂）
     返回 { ok, parts, bytes } */
  function forceLegacyBody(keepGeom){
    if(!global.LegacyBodyV4 || !global.LegacyBodyV4.build){
      return { ok:false, reason:"LegacyBodyV4 没加载（legacy-body-v4.js 没引入？）" };
    }
    try{
      const parts = global.LegacyBodyV4.build();
      if(keepGeom !== false){
        try{
          const raw = localStorage.getItem(LS.body);
          if(raw){
            const st = JSON.parse(raw);
            ENG_PART_DEFS.forEach(def => {
              const lc = st && st[def.key]; if(!lc) return;
              const p = parts[def.key]; if(!p) return;
              if(typeof lc.x === "number") p.x = lc.x;
              if(typeof lc.y === "number") p.y = lc.y;
              if(typeof lc.w === "number") p.w = lc.w;
              if(typeof lc.h === "number") p.h = lc.h;
              if(typeof lc.rot === "number") p.rot = lc.rot;
              if(typeof lc.flipH === "boolean") p.flipH = lc.flipH;
              if(lc.jointPct) p.jointPct = lc.jointPct;
            });
          }
        }catch(e){}
      }
      const json = JSON.stringify(parts);
      localStorage.setItem(LS.body, json);
      if(LegacyBodyV4.anim && !localStorage.getItem(LS.anim)){
        try{ localStorage.setItem(LS.anim, JSON.stringify(LegacyBodyV4.anim)); }catch(e){}
      }
      hydrateBody(parts);
      engine._v4ok = true;
      return { ok: engine.bodyReady, parts: Object.keys(parts), bytes: json.length };
    }catch(e){
      return { ok:false, reason: String(e && e.message || e) };
    }
  }

  /* 体检：当前 localStorage 里的素体到底是什么样的（不改任何东西） */
  function inspectBody(){
    const out = { raw:0, parts:0, withImg:0, keys:[], looksLegacy:false, ready:engine.bodyReady, v4ok:!!engine._v4ok };
    try{
      const raw = localStorage.getItem(LS.body);
      out.raw = raw ? raw.length : 0;
      const st = raw ? JSON.parse(raw) : null;
      if(st){
        const keys = Object.keys(st); out.keys = keys;
        keys.forEach(k => {
          if(!st[k]) return;
          out.parts++;
          if(st[k].imgSrc) out.withImg++;
        });
        // LegacyV4 的图是 webp，且整体约 41KB；BodyTemplate 是程序生成的 png，小得多
        const h = st.head && st.head.imgSrc || "";
        out.looksLegacy = /^data:image\/webp/.test(h);
        out.imgType = (h.match(/^data:image\/([a-z0-9+]+)/i) || [])[1] || "";
      }
    }catch(e){ out.err = String(e && e.message || e); }
    return out;
  }

  function loadLib(){
    try{
      const raw = localStorage.getItem(LS.lib);
      const d = raw ? (JSON.parse(raw) || {}) : {};
      const lib = {};
      ENG_CATEGORIES.forEach(c => lib[c.id] = []);
      ENG_CATEGORIES.forEach(c => { lib[c.id] = Array.isArray(d[c.id]) ? d[c.id] : []; });
      return lib;
    }catch(e){ return ENG_CATEGORIES.reduce((a,c)=>(a[c.id]=[],a),{}); }
  }
  function refreshEngineData(){ loadBody(); engine.lib = loadLib(); engine._composed.clear(); }
  function findEngineItem(catId, id){
    if(!id) return null;
    return (engine.lib[catId] || []).find(x => x.id === id) || null;
  }

  /* ---------- 角色几何 ---------- */
  function engGetAnchors(){
    const h = engine.parts.head, b = engine.parts.body;
    const aL = engine.parts.armL, aR = engine.parts.armR;
    const lL = engine.parts.legL, lR = engine.parts.legR;
    if(!h || !b || !aL || !aR || !lL || !lR) return null;
    return {
      head:{x:h.x+h.w/2, y:h.y+h.h*0.5},
      earL:{x:h.x+h.w*0.08, y:h.y+h.h*0.55},
      earR:{x:h.x+h.w*0.92, y:h.y+h.h*0.55},
      torso:{x:b.x+b.w/2, y:b.y+b.h*0.42},
      hip:{x:b.x+b.w/2, y:b.y+b.h*0.92},
      armL:{x:aL.x+aL.w/2, y:aL.y+aL.h*0.15},
      armR:{x:aR.x+aR.w/2, y:aR.y+aR.h*0.15},
      handL:{x:aL.x+aL.w/2, y:aL.y+aL.h*0.88},
      handR:{x:aR.x+aR.w/2, y:aR.y+aR.h*0.88},
      legL:{x:lL.x+lL.w/2, y:lL.y+lL.h*0.45},
      legR:{x:lR.x+lR.w/2, y:lR.y+lR.h*0.45},
      footL:{x:lL.x+lL.w/2, y:lL.y+lL.h*0.96},
      footR:{x:lR.x+lR.w/2, y:lR.y+lR.h*0.96},
    };
  }
  function engBounds(){
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    ENG_PART_DEFS.forEach(d => {
      const p = engine.parts[d.key]; if(!p) return;
      if(p.x<minX) minX = p.x;
      if(p.y<minY) minY = p.y;
      if(p.x+p.w>maxX) maxX = p.x+p.w;
      if(p.y+p.h>maxY) maxY = p.y+p.h;
    });
    if(!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY, cx:(minX+maxX)/2, feetY:maxY, w:maxX-minX, h:maxY-minY };
  }

  /* ---------- 部件合成缓存（服装层） ---------- */
  /* 自由尺寸合成：按旋转后的几何包围盒开画布，再像素级精修裁透明边。
     不再把素材压回 SLOT_BOX —— 素材放大超出框也能原样保留。
     返回 w/h（舞台像素真实尺寸）+ cx/cy（内容中心相对 box 中心的偏移）。 */
  const ENG_COMPOSE_MAX_DIM = 900;
  function engComposeLayer(pieces, box){
    if(!pieces || pieces.length===0) return null;
    const PAD = 6;
    let gx0=Infinity, gy0=Infinity, gx1=-Infinity, gy1=-Infinity;
    pieces.forEach(pc=>{
      const r = ((pc.rot||0)%360) * Math.PI/180;
      const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
      const hw = (pc.w*c + pc.h*s)/2, hh = (pc.w*s + pc.h*c)/2;
      if(pc.ox-hw < gx0) gx0 = pc.ox-hw;
      if(pc.ox+hw > gx1) gx1 = pc.ox+hw;
      if(pc.oy-hh < gy0) gy0 = pc.oy-hh;
      if(pc.oy+hh > gy1) gy1 = pc.oy+hh;
    });
    if(!isFinite(gx0) || !isFinite(gy0) || !isFinite(gx1) || !isFinite(gy1)) return null;
    const bw = (gx1-gx0) + PAD*2, bh = (gy1-gy0) + PAD*2;
    if(!(bw>0) || !(bh>0)) return null;
    const k = Math.min(1, ENG_COMPOSE_MAX_DIM / Math.max(bw, bh));
    const cw = Math.max(2, Math.round(bw*k)), ch = Math.max(2, Math.round(bh*k));
    const x0 = gx0-PAD, y0 = gy0-PAD;
    const cvs = document.createElement("canvas"); cvs.width=cw; cvs.height=ch;
    const ctx = cvs.getContext("2d");
    ctx.scale(k, k); ctx.translate(-x0, -y0);
    pieces.forEach(pc=>{
      ctx.save();
      ctx.translate(pc.ox, pc.oy);
      ctx.rotate((pc.rot||0) * Math.PI / 180);
      if(pc.flipH) ctx.scale(-1, 1);
      const img = engImg(pc.imgSrc);
      if(img && img.complete && img.naturalWidth) ctx.drawImage(img, -pc.w/2, -pc.h/2, pc.w, pc.h);
      else { ctx.fillStyle = "rgba(160,150,190,.5)"; ctx.fillRect(-pc.w/2, -pc.h/2, pc.w, pc.h); }
      ctx.restore();
    });
    let data; try{ data = ctx.getImageData(0,0,cw,ch).data; }catch(e){
      return { dataUrl: cvs.toDataURL("image/png"), w:bw, h:bh, cx:(x0+bw/2), cy:(y0+bh/2) };
    }
    let minX=cw, minY=ch, maxX=-1, maxY=-1;
    for(let y=0;y<ch;y++){ const row=y*cw*4;
      for(let x=0;x<cw;x++){
        if(data[row+x*4+3] > 8){
          if(x<minX) minX=x; if(x>maxX) maxX=x;
          if(y<minY) minY=y; if(y>maxY) maxY=y;
        }
      } }
    if(maxX < 0) return null;
    const tX=minX, tY=minY, tW=maxX-minX+1, tH=maxY-minY+1;
    const out = document.createElement("canvas"); out.width=tW; out.height=tH;
    out.getContext("2d").drawImage(cvs, tX, tY, tW, tH, 0, 0, tW, tH);
    return {
      dataUrl: out.toDataURL("image/png"),
      w: tW/k, h: tH/k,
      cx: x0 + (tX + tW/2)/k, cy: y0 + (tY + tH/2)/k
    };
  }
  function engCacheComposed(key, pieces, box){
    let c = engine._composed.get(key);
    if(!c){ c = { ready:false, building:false }; engine._composed.set(key, c); }
    if(c.ready) return { dataUrl:c.dataUrl, w:c.w, h:c.h, cx:c.cx, cy:c.cy };
    if(c.building || !pieces || !pieces.length) return null;
    for(let i=0;i<pieces.length;i++){
      const im = engImg(pieces[i].imgSrc);
      if(!im || !im.complete || !im.naturalWidth) return null;
    }
    c.building = true;
    const res = engComposeLayer(pieces, box);
    c.building = false;
    if(res){ c.dataUrl = res.dataUrl; c.w = res.w; c.h = res.h; c.cx = res.cx; c.cy = res.cy; c.ready = true; }
    return c.ready ? { dataUrl:c.dataUrl, w:c.w, h:c.h, cx:c.cx, cy:c.cy } : null;
  }
  function engItemThumb(item){
    const cat = ENG_CAT_MAP[item.category]; if(!cat || !item.layers) return null;
    const layers = ENG_LAYERS[cat.id] || []; const L = layers[0];
    const sub = item.layers[L.key]; if(!sub) return null;
    return sub.composed ? sub.composed.dataUrl
      : (sub.pieces && sub.pieces[0] ? sub.pieces[0].imgSrc : null);
  }

  /* ---------- 绘制原语 ---------- */
  function drawBodyPart(ctx, p, def, bx, fy){
    if(!p.img || !p.img.complete || !p.img.naturalWidth) return;
    const hasJoint = def.hasJoint && p.jointPct;
    const ox = hasJoint ? engVisAnchorX(p) : 0.5;
    const oy = hasJoint ? p.jointPct.y : 0.5;
    const r = p.rot || 0;
    const px = p.x - bx, py = p.y - fy;
    ctx.save();
    ctx.translate(px + ox*p.w, py + oy*p.h);
    ctx.rotate((p.flipH ? -r : r) * Math.PI / 180);
    if(p.flipH){
      ctx.translate(0.5*p.w - ox*p.w, 0.5*p.h - oy*p.h);
      ctx.scale(-1, 1);
      ctx.drawImage(p.img, -0.5*p.w, -0.5*p.h, p.w, p.h);
    }else{
      ctx.translate(-ox*p.w, -oy*p.h);
      ctx.drawImage(p.img, 0, 0, p.w, p.h);
    }
    ctx.restore();
  }
  function engVisAnchorX(p){
    return (p.flipH && p.jointPct) ? (1 - p.jointPct.x) : (p.jointPct ? p.jointPct.x : 0.5);
  }
  /* composed 带 w/h/cx/cy 时用真实尺寸摆放；老数据没有就退回 box（行为不变） */
  function drawCloth(ctx, img, composed, box, a, mirror, deg, bx, fy){
    if(!img || !img.complete || !img.naturalWidth) return;
    const w  = (composed && composed.w)  || box.w;
    const h  = (composed && composed.h)  || box.h;
    const cx = (composed && composed.cx) || 0;
    const cy = (composed && composed.cy) || 0;
    const left = a.x + box.ox + cx - w/2;
    const top  = a.y + box.oy + cy - h/2;
    const L = left - a.x, T = top - a.y;
    ctx.save();
    ctx.translate(a.x - bx, a.y - fy);
    ctx.rotate((mirror ? -deg : deg) * Math.PI / 180);
    if(mirror){
      /* 绕 anchor 竖直线翻转：局部 [L, L+w] 经 scale(-1,1) 落到 [-L-w, -L] */
      ctx.translate(0, T);
      ctx.scale(-1, 1);
      ctx.drawImage(img, L, 0, w, h);
    }else{
      ctx.drawImage(img, L, T, w, h);
    }
    ctx.restore();
  }

  /**
   * drawNpc —— 在给定 canvas 上画 NPC 完整形象
   * @param {HTMLCanvasElement} canvas  - 目标画布（必须有 clientWidth/clientHeight）
   * @param {Object}            outfit  - { hair:'xxx', top:'yyy', ... } 服装 id 字典
   * @param {Object}            [opts]  - { baseH, dpr, groundRatio } 自定义参数
   * @returns {boolean} 是否真的画了角色（false = 走了 drawFallback 兜底）
   */
  function drawNpc(canvas, outfit, opts){
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const dpr = opts.dpr || Math.min(global.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth || canvas.width;
    const H = canvas.clientHeight || canvas.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if(!ensureBody()){ drawFallback(ctx, W, H, outfit); return false; }
    const anchors = engGetAnchors();
    const b = engBounds();
    if(!anchors || !b){ drawFallback(ctx, W, H, outfit); return false; }

    const baseH = opts.baseH || ENGINE_BASE_H;
    let scale;
    if(opts.fitMode === 'contain'){
      // 等比 contain：宽高都装下 + 留 15% 余量，不会拉伸变形
      const bw = Math.max(1, b.maxX - b.minX);
      const bh = Math.max(1, b.maxY - b.minY);
      scale = Math.min((W * 0.85) / bw, (H * 0.85) / bh);
    } else {
      // 旧行为：竖直高度归一化到 baseH（适合正方形小预览，画布可能会横向拉伸）
      scale = baseH / Math.max(1, (b.maxY - b.minY));
    }
    const cx = W / 2;
    const cy = H * (opts.groundRatio || 0.82);

    // 影子
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,.15)";
    ctx.beginPath();
    ctx.ellipse(0, -2, 20, 7, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const list = [];
    ENG_PART_DEFS.forEach(d => {
      const p = engine.parts[d.key]; if(!p || !p.img) return;
      list.push({ z:ENG_BODY_Z[d.key], kind:"body", p, def:d, deg:0 });
    });
    if(outfit){
      ENG_CATEGORIES.forEach(cat => {
        const id = outfit[cat.id]; if(!id) return;
        const item = findEngineItem(cat.id, id);
        if(!item || !item.layers) return;
        (ENG_LAYERS[cat.id] || []).forEach(L => {
          const box = ENG_SLOT_BOX[cat.id + "/" + L.key]; if(!box) return;
          const sub = item.layers[L.key]; if(!sub) return;
          let composed = sub.composed, mirror = false;
          if(L.mirrorOf && sub.mirrorEnabled){
            const src = item.layers[L.mirrorOf]; if(!src) return;
            composed = src.composed; mirror = true;
            if(!composed && src.pieces && src.pieces.length)
              composed = engCacheComposed(item.id + "|" + L.mirrorOf, src.pieces, ENG_SLOT_BOX[cat.id + "/" + L.mirrorOf]);
          } else if(!composed && sub.pieces && sub.pieces.length){
            composed = engCacheComposed(item.id + "|" + L.key, sub.pieces, box);
          }
          if(!composed || !composed.dataUrl) return;
          const img = engImg(composed.dataUrl); if(!img) return;
          const a = anchors[L.anchor]; if(!a) return;
          list.push({ z:L.z, kind:"cloth", img, composed, box, a, mirror, deg:0 });
        });
      });
    }
    list.sort((x,y)=>x.z - y.z);
    list.forEach(it => {
      if(it.kind === "body") drawBodyPart(ctx, it.p, it.def, b.cx, b.maxY);
      else drawCloth(ctx, it.img, it.composed, it.box, it.a, it.mirror, it.deg, b.cx, b.maxY);
    });
    ctx.restore();
    return true;
  }

  function drawFallback(ctx, W, H, outfit){
    const colors = {
      hair:"#5a4632", top:"#e06c6c", bottom:"#4a6cc0",
      shoes:"#3a3a3a", skin:"#ffd9b3",
    };
    if(outfit){
      // 用 outfit 颜色推断兜底色（粗略，无图时仍能看出搭配）
      const topId = outfit.top; const botId = outfit.bottom;
      const hairId = outfit.hair;
      // 不解析具体 item（兜底不依赖 lib）
    }
    const cx = W/2, cy = H*0.7;
    const s = Math.min(W, H) / 120;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,.15)";
    ctx.beginPath(); ctx.ellipse(0, 30, 22, 8, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.bottom;
    ctx.fillRect(-10, 0, 9, 28); ctx.fillRect(1, 0, 9, 28);
    ctx.fillStyle = colors.shoes;
    ctx.fillRect(-12, 26, 13, 7); ctx.fillRect(-1, 26, 13, 7);
    ctx.fillStyle = colors.top;
    roundRectF(ctx, -14, -24, 28, 28, 8); ctx.fill();
    ctx.fillStyle = colors.skin;
    ctx.beginPath(); ctx.arc(0, -38, 14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.hair;
    ctx.beginPath(); ctx.arc(0, -42, 14.5, Math.PI, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#2c2418";
    ctx.beginPath(); ctx.arc(4, -38, 1.8, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -38, 1.8, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function roundRectF(ctx, x, y, w, h, r){
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  /**
   * generateThumb —— 缩略图（带裁切）
   * 老版本：直接 drawNpc 后 toDataURL，导致角色整体画在 96×96 画布里，
   *         ENGINE_BASE_H=200 > 画布高，cy-H*0.82 < ENGINE_BASE_H 时头部被裁。
   * 新版本：用 384×384 大画布画 → 扫描非透明像素边界 → 裁成正方形 → 输出。
   * @param {Object} outfit
   * @param {number} size  最终缩略图边长（默认 128，给地图摆放用大点）
   * @returns {string|null} dataURL
   */
  function generateThumb(outfit, size){
    size = size || 128;
    const cvs = document.createElement("canvas");
    cvs.width = 384; cvs.height = 384;
    // drawNpc 会按 clientWidth/clientHeight 画，让大画布"装下"角色
    Object.defineProperty(cvs, "clientWidth",  { value:384, configurable:true });
    Object.defineProperty(cvs, "clientHeight", { value:384, configurable:true });
    drawNpc(cvs, outfit, { baseH: 280, groundRatio: 0.85 });

    // 扫描像素边界
    let data;
    try{ data = cvs.getContext("2d").getImageData(0, 0, 384, 384).data; }
    catch(e){ return null; }
    let minX=384, minY=384, maxX=0, maxY=0, found=false;
    for(let y=0;y<384;y++){
      for(let x=0;x<384;x++){
        const a = data[(y*384+x)*4+3];
        if(a>8){
          if(x<minX) minX=x; if(x>maxX) maxX=x;
          if(y<minY) minY=y; if(y>maxY) maxY=y;
          found = true;
        }
      }
    }
    if(!found) return null;
    const pad = 4;
    minX = Math.max(0, minX-pad); minY = Math.max(0, minY-pad);
    maxX = Math.min(383, maxX+pad); maxY = Math.min(383, maxY+pad);
    const cw = maxX-minX+1, ch = maxY-minY+1;
    const sz = Math.max(cw, ch);
    // 把正方形（包含角色外接矩形）居中放大到目标 size
    const out = document.createElement("canvas");
    out.width = size; out.height = size;
    out.getContext("2d").drawImage(
      cvs,
      minX - (sz-cw)/2, minY - (sz-ch)/2, sz, sz,
      0, 0, size, size
    );
    try{ return out.toDataURL("image/png"); }catch(e){ return null; }
  }

  /* ---------- 导出 ---------- */
  global.NPCRenderer = {
    // 常量
    LS, ENG_PART_DEFS, ENG_BODY_Z, ENG_LAYERS, ENG_SLOT_BOX,
    ENG_CATEGORIES, ENG_CAT_MAP, ENGINE_BASE_H,
    // 状态 / 工具
    engine, engImg, afterEngineReady,
    // 装/卸
    hydrateBody, loadBody, ensureBody, refreshEngineData,
    forceLegacyBody, inspectBody,
    loadLib, findEngineItem, engItemThumb,
    // 几何
    engGetAnchors, engBounds, engVisAnchorX,
    // 绘制
    drawNpc, drawBodyPart, drawCloth, drawFallback, roundRectF,
    generateThumb,
    _note:"npc-render.js v1（2026-09-11 重构）—— NPC/地图/游戏端共享渲染器",
  };
})(window);