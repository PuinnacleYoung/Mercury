/* 零依赖测试：验证三频道聊天路由（world/level/dm） */
const net = require('net');
const crypto = require('crypto');

const HOST = '127.0.0.1', PORT = 8090;

function wsConnect(onMsg){
  return new Promise((resolve, reject)=>{
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, HOST, ()=>{
      sock.write('GET / HTTP/1.1\r\nHost: '+HOST+':'+PORT+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    let buf = Buffer.alloc(0), handshaken = false;
    sock.on('data', (chunk)=>{
      buf = Buffer.concat([buf, chunk]);
      if(!handshaken){
        const idx = buf.indexOf('\r\n\r\n');
        if(idx < 0) return;
        if(!buf.slice(0, idx).toString().includes('101')){ reject(new Error('handshake fail')); return; }
        buf = buf.slice(idx + 4); handshaken = true; resolve(sock);
      }
      while(buf.length >= 2){
        const b1 = buf[1];
        let len = b1 & 0x7f, off = 2;
        if(len === 126){ if(buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if(len === 127){ if(buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if(buf.length < off + len) break;
        const payload = buf.slice(off, off+len).toString('utf8');
        buf = buf.slice(off + len);
        try{ onMsg(JSON.parse(payload)); }catch(e){}
      }
    });
    sock.on('error', reject);
  });
}
function send(sock, obj){
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let h;
  if(len < 126){ h = Buffer.alloc(2); h[1] = 0x80 | len; }
  else if(len < 65536){ h = Buffer.alloc(4); h[1] = 0x80 | 126; h.writeUInt16BE(len,2); }
  else { h = Buffer.alloc(10); h[1] = 0x80 | 127; h.writeUInt32BE(len,2); }
  h[0] = 0x81;
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for(let i=0;i<len;i++) masked[i] = payload[i] ^ mask[i%4];
  sock.write(Buffer.concat([h, mask, masked]));
}

let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } }

const SUF = Date.now().toString(36).slice(-5);
const A = 'cha_' + SUF, B = 'chb_' + SUF, C = 'chc_' + SUF;

(async ()=>{
  let am = [], bm = [], cm = [];
  const a = await wsConnect(m=>am.push(m));
  const b = await wsConnect(m=>bm.push(m));
  const c = await wsConnect(m=>cm.push(m));
  send(a, { t:'login', username:A, nickname:'甲', avatar:'fox', element:'wood', outfit:{}, mapId:'level1' });
  send(b, { t:'login', username:B, nickname:'乙', avatar:'cat', element:'fire', outfit:{}, mapId:'level1' });
  send(c, { t:'login', username:C, nickname:'丙', avatar:'dog', element:'water', outfit:{}, mapId:'level2' });
  await new Promise(r=>setTimeout(r,400));
  am=[]; bm=[]; cm=[];

  console.log('=== 世界频道（全服广播）===');
  send(a, { t:'chat', text:'世界你好', channel:'world' });
  await new Promise(r=>setTimeout(r,200));
  check('同图 B 收到世界消息', bm.some(m=>m.t==='chat' && m.text==='世界你好' && m.channel==='world'));
  check('异图 C 也收到世界消息', cm.some(m=>m.t==='chat' && m.text==='世界你好' && m.channel==='world'));

  console.log('=== 关卡频道（只推同图）===');
  bm=[]; cm=[];
  send(a, { t:'chat', text:'关卡内喊话', channel:'level' });
  await new Promise(r=>setTimeout(r,200));
  check('同图 B 收到关卡消息', bm.some(m=>m.t==='chat' && m.text==='关卡内喊话' && m.channel==='level'));
  check('异图 C 收不到关卡消息', !cm.some(m=>m.t==='chat' && m.text==='关卡内喊话'));

  console.log('=== 私聊频道（只推目标）===');
  bm=[]; cm=[];
  send(a, { t:'chat', text:'悄悄话', channel:'dm', to:B });
  await new Promise(r=>setTimeout(r,200));
  check('目标 B 收到私聊', bm.some(m=>m.t==='chat' && m.text==='悄悄话' && m.channel==='dm' && m.from===A));
  check('非目标 C 收不到私聊', !cm.some(m=>m.t==='chat' && m.text==='悄悄话'));

  console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('异常:', e.message); process.exit(1); });
