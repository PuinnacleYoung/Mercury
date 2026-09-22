/* 零依赖 WebSocket 客户端测试：验证服务器全链路 */
const http = require('http');
const crypto = require('crypto');
const net = require('net');

const HOST = '127.0.0.1', PORT = 8090;

function wsConnect(onMsg){
  return new Promise((resolve, reject)=>{
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, HOST, ()=>{
      sock.write(
        'GET / HTTP/1.1\r\n' +
        'Host: ' + HOST + ':' + PORT + '\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    let buf = Buffer.alloc(0), handshaken = false;
    sock.on('data', (chunk)=>{
      buf = Buffer.concat([buf, chunk]);
      if(!handshaken){
        const idx = buf.indexOf('\r\n\r\n');
        if(idx < 0) return;
        const head = buf.slice(0, idx).toString();
        if(!head.includes('101')){ reject(new Error('握手失败: ' + head)); return; }
        buf = buf.slice(idx + 4);
        handshaken = true;
        resolve(sock);
      }
      // 解析帧
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
  h[0] = 0x81;  // FIN + text
  // client -> server 必须 mask
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for(let i=0;i<len;i++) masked[i] = payload[i] ^ mask[i%4];
  sock.write(Buffer.concat([h, mask, masked]));
}

let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } }

/* 每次运行用随机账号，避免 data.json 历史数据（已是好友/旧邮件）干扰，可重复执行 */
const SUF = Date.now().toString(36).slice(-5);
const AL = 'alice_' + SUF, BO = 'bob_' + SUF, ADN = '_admin_' + SUF;

(async ()=>{
  console.log('=== 玩家 A 连接 ===');
  let aMsg = [];
  const A = await wsConnect(m=>aMsg.push(m));
  send(A, { t:'login', username:AL, nickname:'小爱', avatar:'fox', element:'wood', outfit:{}, mapId:'level1' });
  await new Promise(r=>setTimeout(r,300));
  check('A 收到 welcome + self', aMsg.some(m=>m.t==='welcome' && m.self && m.self.username===AL));
  check('A 收到 mails（默认空）', aMsg.some(m=>m.t==='mails'));
  check('A 背包默认有改名卡', aMsg.some(m=>m.t==='welcome' && m.self.inventory && m.self.inventory.some(s=>s.id==='rename_card')));

  console.log('=== 玩家 B 连接 ===');
  let bMsg = [];
  const B = await wsConnect(m=>bMsg.push(m));
  send(B, { t:'login', username:BO, nickname:'小波', avatar:'cat', element:'fire', outfit:{}, mapId:'level1' });
  await new Promise(r=>setTimeout(r,300));

  console.log('=== 同屏位置广播 ===');
  aMsg = [];
  send(A, { t:'move', x:100, y:200, facing:1, walk:0, mapId:'level1' });
  await new Promise(r=>setTimeout(r,200));
  check('B 收到 A 的 move', bMsg.some(m=>m.t==='move' && m.from===AL));

  console.log('=== 大厅聊天 ===');
  bMsg = [];
  send(A, { t:'chat', text:'大家好' });
  await new Promise(r=>setTimeout(r,200));
  check('B 收到 A 的聊天', bMsg.some(m=>m.t==='chat' && m.from===AL && m.text==='大家好'));

  console.log('=== 好友申请/接受 ===');
  bMsg = [];
  send(A, { t:'friendReq', to:BO });
  await new Promise(r=>setTimeout(r,200));
  check('B 收到 A 的好友申请', bMsg.some(m=>m.t==='friendReq' && m.from===AL));
  aMsg = [];
  send(B, { t:'friendAcc', from:AL });
  await new Promise(r=>setTimeout(r,300));
  check('A 收到好友列表更新（含对方）', aMsg.some(m=>m.t==='friends' && m.list.some(f=>f.username===BO)));

  console.log('=== 后台发邮件（带资产） ===');
  let adminMsg = [];
  const AD = await wsConnect(m=>adminMsg.push(m));
  send(AD, { t:'login', username:ADN, nickname:'管理员', avatar:'dragon', element:'metal' });
  await new Promise(r=>setTimeout(r,200));
  aMsg = [];
  send(AD, { t:'adminMail', adminKey:'admin123', targets:[AL], title:'测试邮件', body:'发你 100 金币 + 一张改名卡', attach:[{type:'coin',qty:100},{type:'item',itemId:'rename_card',name:'改名卡',icon:'🎫',qty:1}] });
  await new Promise(r=>setTimeout(r,300));
  check('A 收到 newMail 通知', aMsg.some(m=>m.t==='newMail'));

  console.log('=== A 领邮件资产 ===');
  aMsg = [];
  send(A, { t:'mailList' });
  await new Promise(r=>setTimeout(r,200));
  const mail = aMsg.find(m=>m.t==='mails');
  // 只认本次刚发的那封（标题匹配 + 未领取），避免历史邮件干扰
  const mine = (mail && mail.list) ? mail.list.filter(x=>x.title==='测试邮件' && !x.claimed) : [];
  check('A 收到本次测试邮件', mine.length >= 1);
  if(mine.length){
    const mid = mine[mine.length-1].id;
    aMsg = [];
    send(A, { t:'mailClaim', id: mid });
    await new Promise(r=>setTimeout(r,300));
    check('A 领取后金币到账 +100', aMsg.some(m=>m.t==='mailClaimed' && m.acc && m.acc.currency && m.acc.currency.coin>=100));
  }

  console.log('=== 后台查询所有玩家 ===');
  adminMsg = [];
  send(AD, { t:'adminList', adminKey:'admin123' });
  await new Promise(r=>setTimeout(r,300));
  check('后台能看到所有玩家', adminMsg.some(m=>m.t==='adminPlayers' && m.list && m.list.length>=2));

  console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('测试异常:', e.message); process.exit(1); });
