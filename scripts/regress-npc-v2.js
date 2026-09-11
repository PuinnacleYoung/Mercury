/* NPC 立绘/缩略图 + 玩家头像/昵称 回归测试 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8080';

(async()=>{
  let fail = 0;
  const check = (name, cond, detail='') => { console.log((cond?'✅ ':'❌ ')+name + (detail?'  → '+detail:'')); if(!cond) fail++; };
  const browser = await chromium.launch();

  // ---------- 1. NPC 引擎：缩略图生成 + 可调节 ----------
  {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e=>errs.push(e.message));
    page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
    await page.addInitScript(()=>{ sessionStorage.setItem('adminLogin','true'); });
    await page.goto(BASE+'/NPC编辑引擎.html');
    await page.waitForTimeout(800);
    // 注入一个测试 NPC 并验证 generateThumb / 缩略图按钮存在
    const r = await page.evaluate(()=>{
      const out = {};
      out.hasGenerateThumb = typeof generateThumb === 'function';
      out.hasBtnRegen = !!document.getElementById('btn-thumb-regen');
      out.hasBtnUpload = !!document.getElementById('btn-thumb-upload');
      out.hasThumbFile = !!document.getElementById('thumb-file');
      out.hasThumbPreview = !!document.getElementById('thumb-preview');
      return out;
    });
    check('NPC引擎 generateThumb 函数存在', r.hasGenerateThumb);
    check('NPC引擎 重新生成按钮存在', r.hasBtnRegen);
    check('NPC引擎 上传按钮存在', r.hasBtnUpload);
    check('NPC引擎 缩略图预览区存在', r.hasThumbPreview);
    // 验证 generateThumb 能产出 dataUrl（即使素体缺失也会走 fallback 兜底小人）
    const thumbOk = await page.evaluate(()=>{
      try{ const t = generateThumb({}, 96); return !!t && t.startsWith('data:image/png'); }
      catch(e){ return false; }
    });
    check('generateThumb 产出 PNG dataUrl', thumbOk);
    check('NPC引擎 0 JS 错误', errs.length===0, errs.join(' | '));
    await page.close();
  }

  // ---------- 2. 地图编辑器：buildNpcEl 用 thumb 显示立绘 ----------
  {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e=>errs.push(e.message));
    await page.addInitScript(()=>{ sessionStorage.setItem('adminLogin','true'); });
    await page.goto(BASE+'/地图编辑引擎.html');
    await page.waitForTimeout(800);
    const r = await page.evaluate(()=>{
      // 注入一个带 thumb 的 NPC 到 localStorage，验证 buildNpcEl 渲染 img
      const npc = { id:'npc_test', name:'测试NPC', outfit:{}, dialogue:[], event:{type:'none',param:''}, thumb:'data:image/png;base64,iVBORw0KGgo=', thumbCustom:null };
      localStorage.setItem('engine_npcs_v1', JSON.stringify([npc]));
      const out = {};
      out.hasNpcById = typeof npcById === 'function';
      out.hasBuildNpcEl = typeof buildNpcEl === 'function';
      out.hasCssNpcImg = typeof document !== 'undefined'; // 仅确认函数存在，DOM 需要 map 上下文
      return out;
    });
    check('地图编辑器 npcById 函数存在', r.hasNpcById);
    check('地图编辑器 buildNpcEl 函数存在', r.hasBuildNpcEl);
    // 验证 buildNpcEl 源码逻辑：读函数体确认有 thumb 分支和 has-img
    const src = await page.evaluate(()=> buildNpcEl.toString());
    check('buildNpcEl 用 thumb 显示 img', src.includes('thumbCustom') && src.includes('npc-img') && src.includes('has-img'));
    check('地图编辑器 0 JS 错误', errs.length===0, errs.join(' | '));
    await page.close();
  }

  // ---------- 3. 运行时：预设头像 + 玩家头顶昵称 ----------
  {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e=>errs.push(e.message));
    await page.goto(BASE+'/index.html');
    await page.waitForTimeout(500);
    const r = await page.evaluate(()=>{
      const out = {};
      out.hasPresetAvatars = Array.isArray(PRESET_AVATARS) && PRESET_AVATARS.length >= 8;
      out.hasRenderAvatars = typeof renderAvatars === 'function';
      out.hasAvatarById = typeof avatarById === 'function';
      out.hasAvatarGrid = !!document.getElementById('avatar-grid');
      // 验证 refreshHud 用 avatar
      out.refreshHudUsesAvatar = refreshHud.toString().includes('avatarById');
      // 验证 drawMap 画玩家名字牌
      out.drawMapHasNick = (typeof drawMap==='function') && drawMap.toString().includes('ffd86b');
      return out;
    });
    check('预设头像列表 ≥8 个', r.hasPresetAvatars);
    check('renderAvatars 函数存在', r.hasRenderAvatars);
    check('头像网格 DOM 存在', r.hasAvatarGrid);
    check('refreshHud 用预设头像', r.refreshHudUsesAvatar);
    check('drawMap 画玩家昵称名字牌', r.drawMapHasNick);
    check('运行时 0 JS 错误', errs.length===0, errs.join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n'+(fail===0?'🎉 全部通过':'⚠️ '+fail+' 项失败'));
  process.exit(fail?1:0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
