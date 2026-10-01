/* 上传本地视频/图片到服务器媒体库 /media/（nginx 直出，人人可见）
   用法：NODE_PATH=<workspace>/node_modules node scripts/upload-media.js <文件> [--name=xxx.mp4] [--key=mercury]
   说明：文件会被读成 base64 分片走 WS 通道（服务器端上限 60MB）。
        传完返回 http(s) 绝对地址，可直接填进配置里当 srv:/media/xxx.mp4 用。
*/
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

function arg(k, d){ const a = process.argv.slice(2).find(x=>x.indexOf('--'+k+'=')===0); return a ? a.split('=')[1] : d; }
const file = process.argv.slice(2).filter(x=>x.indexOf('--')!==0)[0];
if(!file){ console.error('用法：node scripts/upload-media.js <文件> [--name=xxx.mp4] [--key=mercury]'); process.exit(1); }
let name = arg('name', '');
if(!name){
  // 文件名一律英文：中文名进 URL 要转义，容易踩坑
  name = path.basename(file).replace(/[^\w.\-]/g, '_');
}
const KEY = arg('key', 'mercury');

const WS = 'ws://43.138.164.146/ws';
const buf = fs.readFileSync(file);
if(buf.length > 60 * 1024 * 1024){ console.error('❌ 太大了（' + (buf.length/1048576).toFixed(1) + 'MB），服务器上限 60MB，先压一下'); process.exit(1); }

function send(ws, o){ ws.send(JSON.stringify(o)); }
function waitFor(ws, types, ms){
  return new Promise((res, rej)=>{
    const t = setTimeout(()=>{ ws.off('message', h); rej(new Error('等 ' + types.join('/') + ' 超时')); }, ms);
    const h = d=>{
      let m; try{ m = JSON.parse(d.toString()); }catch(e){ return; }
      if(!m || types.indexOf(m.t) < 0) return;
      clearTimeout(t); ws.off('message', h); res(m);
    };
    ws.on('message', h);
  });
}

const ws = new WebSocket(WS);
ws.on('error', e=>{ console.error('❌ 连不上：' + e.message); process.exit(1); });
ws.on('open', async ()=>{
  console.log('🔌 已连 ' + WS);
  console.log('📄 ' + name + '（' + (buf.length/1024).toFixed(0) + 'KB）');
  const CHUNK = 192 * 1024;
  const total = Math.ceil(buf.length / CHUNK);
  send(ws, { t:'mediaBegin', adminKey:KEY, name, size:buf.length });
  try{
    const m = await waitFor(ws, ['mediaReady','mediaErr'], 30000);
    if(m.t === 'mediaErr') throw new Error(m.msg);
    const token = m.token;
    for(let i = 0; i < buf.length; i += CHUNK){
      send(ws, { t:'mediaChunk', token, chunk: buf.slice(i, i + CHUNK).toString('base64') });
      if((i / CHUNK) % 20 === 0) process.stdout.write('.');
    }
    send(ws, { t:'mediaEnd', token });
    const d = await waitFor(ws, ['mediaDone','mediaErr'], 180000);
    if(d.t === 'mediaErr') throw new Error(d.msg);
    console.log('\n✅ 已上传：' + (d.url || ('/media/' + name)) + '（共 ' + total + ' 片）');
    console.log('   配置里填：srv:' + (d.url || ('/media/' + name)));
  }catch(e){ console.error('\n❌ ' + e.message); }
  try{ ws.close(); }catch(e){}
  process.exit(0);
});
