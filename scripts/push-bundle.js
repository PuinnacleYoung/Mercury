/* ============================================================
   离线包上传器（陛下专用）
   ------------------------------------------------------------
   朋友/陛下在另一台电脑上导出「登录页完整包」（配置 + 素材），
   本机跑这个脚本把它推进服务器云端草稿区（可选直接发布）。

   用法：
     NODE_PATH=<workspace>/node_modules node scripts/push-bundle.js <包.json> [--slot=login] [--publish] [--key=mercury]

   它做三件事：
     1) 识别「完整包」还是「裸配置」（裸配置会自动包成 login_engine_config）
     2) 包里带的素材（__media__）先走媒体库传到服务器 /media/，
        再把配置里的 ms:xxx 全部改写成 srv:/media/xxx.png
        —— 这样包瞬间从几十 MB 瘦成几 KB，所有人都能直接看到图
     3) 逐片 ACK 提交到草稿区；--publish 时顺手发布到线上区
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
let WebSocket;
try{ WebSocket = require('ws'); }catch(e){
  console.error('❌ 缺 ws 库。先装：');
  console.error('   cd C:/Users/pandanyang/.workbuddy/binaries/node/workspace && npm i ws');
  console.error('   然后带上 NODE_PATH=C:/Users/pandanyang/.workbuddy/binaries/node/workspace/node_modules 再跑');
  process.exit(1);
}

const argv = process.argv.slice(2);
const file = argv.find(a => !a.startsWith('--'));
const opt = {};
argv.filter(a => a.startsWith('--')).forEach(a => {
  const i = a.indexOf('=');
  if(i < 0) opt[a.slice(2).toLowerCase()] = true;
  else opt[a.slice(2, i).toLowerCase()] = a.slice(i + 1);   // 只把「键」转小写，别把值也吞进来
});

const URL = opt.url || 'ws://43.138.164.146/ws';
const KEY = opt.key || 'mercury';
const SLOT = opt.slot || 'login';

if(!file){ console.error('用法：node scripts/push-bundle.js <包.json> [--slot=login] [--publish] [--key=mercury]'); process.exit(1); }

const EXT = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/svg+xml':'svg', 'video/mp4':'mp4', 'video/webm':'webm' };

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
function send(ws, o){ ws.send(JSON.stringify(o)); }

/* --- 传一个素材到 /media/（媒体库通道，192KB 一片 base64） --- */
function uploadMedia(ws, name, buf){
  return new Promise((res, rej)=>{
    const CHUNK = 192 * 1024;
    send(ws, { t:'mediaBegin', adminKey:KEY, name, size:buf.length });
    waitFor(ws, ['mediaReady','mediaErr'], 30000).then(m=>{
      if(m.t === 'mediaErr') return rej(new Error(m.msg));
      const token = m.token;
      for(let i = 0; i < buf.length; i += CHUNK){
        send(ws, { t:'mediaChunk', token, chunk: buf.slice(i, i + CHUNK).toString('base64') });
      }
      send(ws, { t:'mediaEnd', token });
      waitFor(ws, ['mediaDone','mediaErr'], 120000).then(d=>{
        if(d.t === 'mediaErr') return rej(new Error(d.msg));
        res(d.url || ('/media/' + name));
      }, rej);
    }, rej);
  });
}

/* --- 逐片 ACK 提交配置 --- */
function pushItems(ws, items, force){
  return new Promise((res, rej)=>{
    const raw = JSON.stringify(items);
    const CHUNK = 64 * 1024;
    const total = Math.max(1, Math.ceil(raw.length / CHUNK));
    let cur = 0, token = '', tries = 0, done = false;
    console.log('   包大小 ' + (raw.length/1024).toFixed(0) + 'KB，分 ' + total + ' 片');
    function finish(err, m){
      if(done) return; done = true; clearTimeout(timer);
      ws.off('message', h);
      err ? rej(err) : res(m);
    }
    const timer = setTimeout(()=> finish(new Error('提交超时')), 60000 + total * 20000);
    function h(rawMsg){
      let m; try{ m = JSON.parse(rawMsg.toString()); }catch(e){ return; }
      if(!m) return;
      if(m.t === 'assetPushReady'){ token = m.token; sendChunk(); }
      else if(m.t === 'assetPushAck'){ cur++; tries = 0; if(cur % 10 === 0 || cur === total) console.log('   已确认 ' + cur + '/' + total + ' 片'); if(cur >= total) send(ws, { t:'assetPushEnd', token }); else sendChunk(); }
      else if(m.t === 'assetPushDone'){ finish(null, m); }
      else if(m.t === 'assetErr'){ finish(new Error(m.msg || '提交失败')); }
      else if(m.t === 'assetConflict'){
        if(!force){ finish(new Error('版本冲突：' + (m.msg||''))); return; }
        console.log('   ⚠ 版本冲突，按 force 重来');
        send(ws, { t:'assetPushBegin', adminKey:KEY, slot:SLOT, by:'陛下代传', baseRev:m.cur || 0, total, force:true });
      }
    }
    ws.on('message', h);
    function sendChunk(){
      if(done) return;
      send(ws, { t:'assetPushChunk', token, i:cur, chunk: raw.slice(cur * CHUNK, (cur + 1) * CHUNK) });
      setTimeout(()=>{ if(!done && tries < 6){ tries++; console.log('   ⟳ 重发第 ' + (cur+1) + ' 片'); sendChunk(); } }, 15000);
    }
    send(ws, { t:'assetPushBegin', adminKey:KEY, slot:SLOT, by:'陛下代传', baseRev:0, total, force:true });
  });
}

(async function main(){
  const text = fs.readFileSync(file, 'utf8');
  let o;
  try{ o = JSON.parse(text); }catch(e){ console.error('❌ 不是合法 JSON'); process.exit(1); }

  let items;
  if(o && o.__bundle__ && o.items){
    items = o.items;
    console.log('📦 完整包：槽位 ' + o.slot + '，导出者 ' + (o.by || '?'));
  } else {
    items = { login_engine_config: JSON.stringify(o) };
    console.log('📄 裸配置：包成 { login_engine_config }');
  }
  console.log('   配置项 ' + Object.keys(items).filter(k=>k !== '__media__').join('、'));
  console.log('🎯 目标槽位：' + SLOT + (o && o.__bundle__ && o.slot && o.slot !== SLOT ? ('（⚠ 包里写的是 ' + o.slot + '，以 --slot 为准）') : ''));

  const ws = new WebSocket(URL, { perMessageDeflate:false });
  await new Promise((res, rej)=>{ ws.on('open', res); ws.on('error', e=>rej(new Error('连不上 ' + URL + '：' + e.message))); });
  console.log('🔌 已连 ' + URL);

  /* 1) 素材先上服务器 /media/ */
  const mediaRaw = items.__media__;
  if(mediaRaw && !opt.nomedia){
    let map = null; try{ map = JSON.parse(mediaRaw); }catch(e){}
    const keys = map ? Object.keys(map) : [];
    console.log('🖼 素材 ' + keys.length + ' 个，准备传到服务器 /media/ …');
    const pairs = [];
    for(const k of keys){
      const u = map[k];
      const mm = /^data:([^;,]*);base64,([\s\S]*)$/.exec(u || '');
      if(!mm){ console.log('   ⚠ ' + k + ' 不是图片数据，跳过'); continue; }
      const buf = Buffer.from(mm[2], 'base64');
      const id = String(k).slice(3);
      const ext = EXT[mm[1]] || 'png';
      const name = 'login_' + id.replace(/[^A-Za-z0-9_\-.]/g, '_') + '.' + ext;
      const url = await uploadMedia(ws, name, buf);
      console.log('   ✅ ' + k + ' → ' + url + '（' + (buf.length/1024).toFixed(0) + 'KB）');
      pairs.push([k, 'srv:' + url]);
    }
    if(pairs.length){
      /* 2) 把配置里的 ms:xxx 全换成服务器地址 */
      Object.keys(items).forEach(k=>{
        if(k === '__media__' || typeof items[k] !== 'string') return;
        let s = items[k];
        pairs.forEach(p=>{ s = s.split(p[0]).join(p[1]); });
        items[k] = s;
      });
      delete items.__media__;
      console.log('🔁 已把 ' + pairs.length + ' 个素材地址改成服务器路径（人人可见，包也瘦了）');
    }
  }

  /* 3) 提交 */
  const r = await pushItems(ws, items, true);
  console.log('✅ 已提交草稿区（' + ((r.bytes || 0)/1024).toFixed(0) + 'KB）');
  if(opt.publish){
    send(ws, { t:'assetPublish', adminKey:KEY, slot:SLOT, by:'陛下代传' });
    // 服务器发布成功回 sys/assetListRefresh/assetPublished，出错才回 assetErr
    const m = await waitFor(ws, ['assetErr','assetListRefresh','assetPublished','sys'], 30000);
    if(m.t === 'assetErr') console.log('❌ 发布失败：' + m.msg);
    else console.log('🚀 已发布到线上区' + (m.msg ? ('（' + m.msg + '）') : ''));
  } else {
    console.log('ℹ️ 只进了草稿区 —— 去 /admin 「☁️ 云端资产」点发布，或直接加 --publish');
  }
  try{ ws.close(); }catch(e){}
  process.exit(0);
})().catch(e=>{ console.error('❌ ' + (e && e.message || e)); process.exit(1); });
