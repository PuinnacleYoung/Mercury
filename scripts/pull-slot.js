/* ============================================================
   云端槽位下载器（陛下专用·代传前的备份/合并底稿）
   ------------------------------------------------------------
   用法：
     NODE_PATH=<workspace>/node_modules node scripts/pull-slot.js <slot> [输出文件]

   例： node scripts/pull-slot.js outfit outputs/_server_outfit.json
        node scripts/pull-slot.js login  （默认输出 outputs/_server_login.json）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
let WebSocket;
try{ WebSocket = require('ws'); }catch(e){
  console.error('❌ 缺 ws 库。先装：cd C:/Users/pandanyang/.workbuddy/binaries/node/workspace && npm i ws');
  process.exit(1);
}
const argv = process.argv.slice(2);
const SLOT = argv[0] || 'outfit';
const OUT  = argv[1] || path.join(__dirname, '..', 'outputs', '_server_' + SLOT + '.json');
const URL  = 'ws://43.138.164.146/ws';

function waitFor(ws, types, ms){
  return new Promise((res, rej)=>{
    const t = setTimeout(()=>{ ws.off('message', h); rej(new Error('等 ' + types.join('/') + ' 超时')); }, ms);
    function h(raw){
      let m; try{ m = JSON.parse(raw.toString()); }catch(e){ return; }
      if(!m || types.indexOf(m.t) < 0) return;
      clearTimeout(t); ws.off('message', h); res(m);
    }
    ws.on('message', h);
  });
}

(async function(){
  const ws = new WebSocket(URL, { perMessageDeflate:false, maxPayload: 200 * 1024 * 1024 });
  await new Promise((res, rej)=>{ ws.on('open', res); ws.on('error', e=>rej(new Error('连不上 ' + URL + '：' + e.message))); });
  console.log('🔌 已连 ' + URL + '，拉取槽位 ' + SLOT + ' …');
  const p = waitFor(ws, ['assetData'], 60000);
  ws.send(JSON.stringify({ t:'assetPull', slot: SLOT }));
  const m = await p;
  const s = (m.slots || {})[SLOT];
  if(!s || !s.items){
    console.log('ℹ️ 云端这个槽位还没发布过内容');
    fs.writeFileSync(OUT, JSON.stringify({ slot:SLOT, rev:null, items:{} }, null, 1), 'utf8');
    try{ ws.close(); }catch(e){}
    process.exit(0);
  }
  const keys = Object.keys(s.items).filter(k=>k !== '__media__');
  fs.writeFileSync(OUT, JSON.stringify({ slot:SLOT, rev:s.rev, live:s.live, items:s.items }, null, 1), 'utf8');
  let total = 0; keys.forEach(k=>{ total += (s.items[k]||'').length; });
  console.log('✅ 已存 ' + OUT);
  console.log('   线上 rev ' + JSON.stringify(s.rev) + '　配置项：' + keys.join('、'));
  console.log('   合计 ' + (total/1024).toFixed(0) + 'KB');
  try{ ws.close(); }catch(e){}
  process.exit(0);
})().catch(e=>{ console.error('❌ ' + (e && e.message || e)); process.exit(1); });
