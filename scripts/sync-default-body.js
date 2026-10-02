/* ============================================================
   把「服务器线上素体」同步成本地两处官方默认
   ------------------------------------------------------------
   为什么要这个脚本：
     数据恢复工具点「恢复默认数据」读的是 src/cloud-defaults.json，
     而这份文件是 9 月从 legacy-body-v4.js 生成的旧素体 ——
     陛下 10-01 上传的新底膜只进了云端 body 槽，没回写这两处，
     于是「恢复默认」反而把新素体打回旧版。以后换底膜跑一次本脚本即可。

   产出：
     ① src/legacy-body-v4.js   内置出厂（新设备 / 游戏端兜底 / 服装引擎「重置素体」）
     ② src/cloud-defaults.json 数据恢复工具「☁️ 恢复默认数据」读的那份

   用法：
     NODE_PATH=<workspace>/node_modules node scripts/sync-default-body.js
       └ 默认：先连服务器拉线上 body 槽，再回写两处
     ... sync-default-body.js --file=outputs/_server_body_20261002.json
       └ 用本地已拉好的槽位 JSON，不联网
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const opt = {};
argv.forEach(a => {
  if (a.indexOf('--') !== 0) return;
  const body = a.slice(2);
  const i = body.indexOf('=');
  const k = (i < 0 ? body : body.slice(0, i)).toLowerCase();
  opt[k] = i < 0 ? true : body.slice(i + 1);   // 键只取 = 前面那段
});
if (opt.file) console.log('🎯 目标文件 ' + path.resolve(opt.file));

const PART_KEYS = ['head', 'body', 'armL', 'armR', 'legL', 'legR'];

function pullBody() {
  let WebSocket;
  try { WebSocket = require('ws'); } catch (e) {
    return Promise.reject(new Error('缺 ws 库，改用 --file=<已拉取的槽位 JSON>'));
  }
  const URL = 'ws://43.138.164.146/ws';
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL, { perMessageDeflate: false, maxPayload: 200 * 1024 * 1024 });
    const timer = setTimeout(() => { try { ws.close(); } catch (e) {} rej(new Error('拉取超时')); }, 60000);
    ws.on('open', () => {
      console.log('🔌 已连 ' + URL + '，拉取槽位 body …');
      ws.send(JSON.stringify({ t: 'assetPull', slot: 'body' }));
    });
    ws.on('error', e => { clearTimeout(timer); rej(new Error('连不上 ' + URL + '：' + e.message)); });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (!m || m.t !== 'assetData') return;
      clearTimeout(timer);
      const s = (m.slots || {}).body;
      try { ws.close(); } catch (e) {}
      if (!s || !s.items || !s.items.engine_body_v4) return rej(new Error('云端 body 槽还没发布过素体'));
      console.log('   线上 rev ' + JSON.stringify(s.rev || s.live));
      res(JSON.parse(s.items.engine_body_v4));
    });
  });
}

(async function () {
  let body;
  if (opt.file) {
    const p = path.resolve(opt.file);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const raw = (j.items && j.items.engine_body_v4) || (j.engine_body_v4);
    if (!raw) throw new Error('这个文件里没有 engine_body_v4：' + p);
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    console.log('📄 读取本地槽位文件 ' + p);
  } else {
    body = await pullBody();
  }

  const miss = PART_KEYS.filter(k => !body[k] || !body[k].imgSrc);
  if (miss.length) throw new Error('素体缺部件图片：' + miss.join('、'));

  const parts = {};
  PART_KEYS.forEach(k => {
    const p = body[k];
    parts[k] = {
      x: p.x, y: p.y, w: p.w, h: p.h,
      rot: p.rot || 0, flipH: !!p.flipH,
      jointPct: p.jointPct || null,
      imgSrc: p.imgSrc
    };
  });
  const footBox = (body.footBox && typeof body.footBox.x === 'number')
    ? { x: body.footBox.x, y: body.footBox.y, w: body.footBox.w || 60, h: body.footBox.h || 20 } : null;
  const anim = body.animCfg || null;

  /* ---------- ① legacy-body-v4.js ---------- */
  const js =
    '/* ============================================================\n' +
    '   拾光·澈屿 · 官方默认素体（legacy-body-v4.js）\n' +
    '   ------------------------------------------------------------\n' +
    '   来源：云端 body 槽线上版本（底膜_20261001，六张图重画版）。\n' +
    '         ⚠️ 换底膜请用 scripts/sync-default-body.js 重新生成本文件，\n' +
    '            不要手改 —— 它会同时回写 cloud-defaults.json。\n' +
    '   用途：在本机还没有 engine_body_v4 时，ensureBody() / applyLegacyBody()\n' +
    '         优先用它，而不是 BodyTemplate.build() 程序生成的小人；\n' +
    '         服装编辑引擎「重置素体」也是换回这一套。\n' +
    '   生成时间：' + new Date().toISOString() + '\n' +
    '   ============================================================ */\n' +
    '(function (global) {\n' +
    '  "use strict";\n' +
    '  const PARTS = ' + JSON.stringify(parts) + ';\n' +
    '  const FOOTBOX = ' + JSON.stringify(footBox) + ';\n' +
    '  const ANIM  = ' + JSON.stringify(anim) + ';\n' +
    '  /* 导出引擎存档格式：6 个部件 + 脚底碰撞盒 + 动画参数（缺了就保持 null） */\n' +
    '  function build(){\n' +
    '    const r = {};\n' +
    '    for(const k of Object.keys(PARTS)){ const p = PARTS[k];\n' +
    '      r[k] = { x:p.x, y:p.y, w:p.w, h:p.h, rot:p.rot, flipH:p.flipH, jointPct:p.jointPct, imgSrc:p.imgSrc };\n' +
    '    }\n' +
    '    if(FOOTBOX) r.footBox = { x:FOOTBOX.x, y:FOOTBOX.y, w:FOOTBOX.w, h:FOOTBOX.h };\n' +
    '    if(ANIM) r.animCfg = ANIM;\n' +
    '    return r;\n' +
    '  }\n' +
    '  global.LegacyBodyV4 = { parts: PARTS, footBox: FOOTBOX, anim: ANIM, build: build,\n' +
    '    _note: "官方默认素体（云端 body 槽线上版，' + new Date().toISOString().slice(0, 10) + '）" };\n' +
    '})(window);\n';
  const jsPath = path.join(ROOT, 'src', 'legacy-body-v4.js');
  fs.writeFileSync(jsPath, js, 'utf8');
  console.log('✅ 已写入 src/legacy-body-v4.js  ' + (fs.statSync(jsPath).size / 1024).toFixed(0) + 'KB');

  /* ---------- ② cloud-defaults.json ---------- */
  const cdPath = path.join(ROOT, 'src', 'cloud-defaults.json');
  let cd = { _meta: {}, data: {} };
  try { cd = JSON.parse(fs.readFileSync(cdPath, 'utf8')); } catch (e) {}
  cd.data = cd.data || {};
  const keepKeys = Object.keys(cd.data).filter(k => k !== 'engine_body_v4' && k !== 'engine_anim_cfg');
  const out = { _meta: Object.assign({}, cd._meta, {
    app: 'q版换装小游戏', ver: 1,
    note: '云端默认数据快照 · 数据恢复工具读取此文件把本机数据恢复成官方默认',
    updatedAt: new Date().toISOString(),
    source: '云端 body 槽线上版本（scripts/sync-default-body.js 生成）'
  }), data: {} };
  out.data.engine_body_v4 = JSON.stringify(Object.assign({}, body, parts));
  if (anim) out.data.engine_anim_cfg = JSON.stringify(anim);
  keepKeys.forEach(k => { out.data[k] = cd.data[k]; });   // 塔罗快照等保留
  fs.writeFileSync(cdPath, JSON.stringify(out), 'utf8');
  console.log('✅ 已写入 src/cloud-defaults.json  ' + (fs.statSync(cdPath).size / 1024).toFixed(0) + 'KB');
  console.log('   保留的其他默认项：' + (keepKeys.join('、') || '（无）'));
  console.log('   footBox ' + JSON.stringify(footBox) + '　animCfg ' + JSON.stringify(anim));
  process.exit(0);
})().catch(e => { console.error('❌ ' + (e && e.message || e)); process.exit(1); });
