/* ============================================================
   拾光·澈屿 —— 多人联机服务器（零依赖，单文件）
   ------------------------------------------------------------
   用 Node 原生 http + 手写 WebSocket（RFC 6455）实现，
   不依赖任何 npm 包，`node server.js` 直接跑。

   能力：
   - 大厅聊天（广播）
   - 关卡同屏（玩家位置广播，只推最近 8 人）
   - 好友系统（申请 / 接受 / 在线状态）
   - 邮件系统（后台发，客户端收 / 领资产）
   - 后台管理（查询所有玩家 + 定向发邮件带资产）

   数据持久化：server/data.json（玩家账号 + 好友 + 邮件 + 背包）
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8090);   // 联机端口（与静态 8080 分开）
const DATA_FILE = path.join(__dirname, 'data.json');

/* ================= 数据持久化 ================= */
function loadData(){
  try{ const raw = fs.readFileSync(DATA_FILE, 'utf8'); return JSON.parse(raw); }
  catch(e){ return { accounts:{}, mails:{}, friends:{}, seq:0 }; }
}
function saveData(d){
  try{ fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8'); }
  catch(e){ console.error('[server] 数据保存失败:', e.message); }
}
let DB = loadData();
function persist(){ saveData(DB); }

/* 账号（服务器侧镜像玩家公开资料 + 背包/邮件索引）。
   密码只做哈希存服务器，别明文。 */
function ensureAccount(username, info){
  if(!DB.accounts[username]){
    DB.accounts[username] = {
      username, nickname: info.nickname || username, avatar: info.avatar || 'fox',
      element: info.element || 'earth', outfit: info.outfit || {},
      friends: [],            // 好友用户名列表
      inventory: [            // 背包（默认一张改名卡，占位图标）
        { id:'rename_card', name:'改名卡', icon:'🎫', desc:'改名卡（占位）', qty:1, kind:'functional' }
      ],
      createdAt: Date.now(),
    };
    DB.mails[username] = DB.mails[username] || [];
    persist();
  }
  return DB.accounts[username];
}

/* ================= WebSocket 帧协议（RFC 6455） ================= */
function sha1(b){ return crypto.createHash('sha1').update(b).digest(); }
function acceptKey(key){ return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }

/* 编码一个文本帧（server -> client） */
function encodeFrame(text){
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if(len < 126){
    header = Buffer.alloc(2);
    header[1] = len;
  } else if(len < 65536){
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
    header.writeUInt32BE(len % 0x100000000, 6);
  }
  header[0] = 0x81; // FIN + text
  return Buffer.concat([header, payload]);
}

/* ================= 在线连接管理 ================= */
const clients = new Map();   // socket -> { username, nickname, avatar, element, outfit, mapId, x, y, facing, walk }
const socketUser = new Map(); // socket -> username

function send(sock, obj){ try{ sock.write(encodeFrame(JSON.stringify(obj))); }catch(e){} }
function broadcast(obj, exceptSocket){
  const buf = encodeFrame(JSON.stringify(obj));
  for(const sock of clients.keys()){ if(sock === exceptSocket) continue; try{ sock.write(buf); }catch(e){} }
}
function onlineList(){
  const list = [];
  for(const c of clients.values()){
    list.push({ username:c.username, nickname:c.nickname, avatar:c.avatar, element:c.element });
  }
  return list;
}

/* ================= 业务：大厅聊天 ================= */
function handleChat(c, msg){
  if(!c.username) return;
  const text = String(msg.text || '').slice(0, 200);
  if(!text) return;
  broadcast({ t:'chat', from:c.username, nickname:c.nickname, avatar:c.avatar, text, ts:Date.now() });
}

/* ================= 业务：同屏位置（只推最近 8 人） ================= */
const MAX_NEARBY = 8;
function handleMove(c, msg){
  if(!c.username) return;
  c.x = msg.x; c.y = msg.y; c.facing = msg.facing; c.walk = msg.walk; c.mapId = msg.mapId || c.mapId;
  // 找同图其他玩家，按距离排序，只广播最近的 8 个
  const others = [];
  for(const [sock, o] of clients){
    if(sock === c.sock || !o.username) continue;
    if(o.mapId !== c.mapId) continue;   // 不同关卡/大厅不互相同步
    const dx = (o.x||0) - c.x, dy = (o.y||0) - c.y;
    others.push({ sock, dist: dx*dx + dy*dy, o });
  }
  others.sort((a,b)=>a.dist-b.dist);
  const near = others.slice(0, MAX_NEARBY);
  const payload = {
    t:'move', from:c.username,
    x:c.x, y:c.y, facing:c.facing, walk:c.walk, mapId:c.mapId,
    nick:c.nickname, avatar:c.avatar, element:c.element, outfit:c.outfit,
  };
  for(const it of near){ send(it.sock, payload); }
  // 同时把「附近这些人的最新位置」回推给自己（进入时能立刻看到周围的人）
  const nearbySnapshot = near.map(it=>({
    username:it.o.username, x:it.o.x, y:it.o.y, facing:it.o.facing, walk:it.o.walk,
    nick:it.o.nickname, avatar:it.o.avatar, element:it.o.element, outfit:it.o.outfit,
  }));
  if(nearbySnapshot.length) send(c.sock, { t:'nearby', list: nearbySnapshot });
}

/* ================= 业务：好友 ================= */
function handleFriendReq(c, msg){
  const to = String(msg.to||'').trim();
  if(!to || to === c.username) return;
  const target = clients.get([...clients.keys()].find(s=>clients.get(s).username===to));
  const acc = DB.accounts[to];
  if(!acc){ send(c.sock, { t:'sys', msg:'该玩家不存在或不在线' }); return; }
  // 已互为好友？
  if(acc.friends.includes(c.username)){ send(c.sock, { t:'sys', msg:'你们已经是好友了' }); return; }
  if(target){
    send(target.sock, { t:'friendReq', from:c.username, nickname:c.nickname, avatar:c.avatar, element:c.element });
    send(c.sock, { t:'sys', msg:'好友申请已发送给 ' + (acc.nickname||to) });
  } else {
    send(c.sock, { t:'sys', msg:'对方不在线，暂不支持离线申请（后续迭代）' });
  }
}
function handleFriendAcc(c, msg){
  const from = String(msg.from||'').trim();
  if(!from) return;
  const me = DB.accounts[c.username];
  const other = DB.accounts[from];
  if(!other) return;
  if(!me.friends.includes(from)) me.friends.push(from);
  if(!other.friends.includes(c.username)) other.friends.push(c.username);
  persist();
  // 通知双方刷新
  send(c.sock, { t:'friends', list: me.friends.map(u=>friendInfo(u)) });
  const otherSock = [...clients.keys()].find(s=>clients.get(s).username===from);
  if(otherSock){ send(otherSock, { t:'friends', list: other.friends.map(u=>friendInfo(u)) }); }
  send(c.sock, { t:'sys', msg:'已和 ' + (other.nickname||from) + ' 成为好友' });
}
function friendInfo(username){
  const a = DB.accounts[username];
  const online = [...clients.values()].some(o=>o.username===username);
  return {
    username, nickname: a ? a.nickname : username,
    avatar: a ? a.avatar : 'fox', element: a ? a.element : 'earth',
    online,
  };
}

/* ================= 业务：邮件 ================= */
function handleMailList(c){ send(c.sock, { t:'mails', list: DB.mails[c.username] || [] }); }
function handleMailClaim(c, msg){
  const id = msg.id;
  const box = DB.mails[c.username] || [];
  const mail = box.find(m=>m.id===id);
  if(!mail || mail.claimed){ return; }
  mail.claimed = true;
  mail.claimedAt = Date.now();
  // 发放资产
  const acc = DB.accounts[c.username];
  if(mail.attach){
    for(const item of mail.attach){
      if(item.type==='coin' || item.type==='diamond' || item.type==='pearl'){
        acc.currency = acc.currency || { coin:0, diamond:0, pearl:0 };
        acc.currency[item.type] = (acc.currency[item.type]||0) + (item.qty||0);
      } else if(item.type==='clothes'){
        acc.ownedItems = acc.ownedItems || [];
        if(!acc.ownedItems.includes(item.itemId)) acc.ownedItems.push(item.itemId);
      } else if(item.type==='item'){   // 功能道具（进背包）
        acc.inventory = acc.inventory || [];
        const slot = acc.inventory.find(s=>s.id===item.itemId);
        if(slot) slot.qty += (item.qty||1);
        else acc.inventory.push({ id:item.itemId, name:item.name||item.itemId, icon:item.icon||'📦', desc:item.desc||'', qty:item.qty||1, kind:item.kind||'functional' });
      }
    }
  }
  persist();
  send(c.sock, { t:'mailClaimed', id, acc: publicAccount(acc) });
}

/* ================= 业务：改名卡 ================= */
function handleRename(c, msg){
  const newName = String(msg.nickname||'').trim().slice(0,8);
  if(!newName) return;
  const acc = DB.accounts[c.username];
  const card = acc.inventory && acc.inventory.find(s=>s.id==='rename_card');
  if(!card || card.qty<=0){ send(c.sock, { t:'sys', msg:'没有改名卡了' }); return; }
  card.qty -= 1;
  acc.nickname = newName;
  c.nickname = newName;
  persist();
  send(c.sock, { t:'renamed', nickname:newName, inventory:acc.inventory });
  send(c.sock, { t:'sys', msg:'改名成功：' + newName });
}

/* 公开资料（不含密码/敏感信息） */
function publicAccount(acc){
  if(!acc) return null;
  return {
    username: acc.username, nickname: acc.nickname, avatar: acc.avatar, element: acc.element,
    outfit: acc.outfit || {}, friends: acc.friends || [],
    currency: acc.currency || { coin:0, diamond:0, pearl:0 },
    inventory: acc.inventory || [], ownedItems: acc.ownedItems || [],
    createdAt: acc.createdAt,
  };
}

/* ================= 业务：后台管理 ================= */
function handleAdminList(c, msg){
  // 简单管理员校验：请求里带 adminKey
  if(msg.adminKey !== (process.env.ADMIN_KEY || 'admin123')){
    send(c.sock, { t:'sys', msg:'后台权限不足' }); return;
  }
  const list = Object.keys(DB.accounts).map(u=>publicAccount(DB.accounts[u]));
  send(c.sock, { t:'adminPlayers', list });
}
function handleAdminMail(c, msg){
  if(msg.adminKey !== (process.env.ADMIN_KEY || 'admin123')){
    send(c.sock, { t:'sys', msg:'后台权限不足' }); return;
  }
  const targets = msg.targets || [];   // ['all'] 或 [username, ...]
  const recipients = targets.includes('all') ? Object.keys(DB.accounts) : targets.filter(u=>DB.accounts[u]);
  let sent = 0;
  for(const u of recipients){
    const box = DB.mails[u] || (DB.mails[u] = []);
    box.push({
      id:'m'+ (++DB.seq),
      from:'系统', title: msg.title || '系统通知', body: msg.body || '',
      attach: msg.attach || null, claimed:false, createdAt: Date.now(),
    });
    sent++;
  }
  persist();
  // 通知在线的收件人
  for(const [sock, o] of clients){
    if(recipients.includes(o.username)) send(sock, { t:'newMail' });
  }
  send(c.sock, { t:'sys', msg:'已发送 ' + sent + ' 封邮件' });
}

/* ================= 连接生命周期 ================= */
function onMessage(sock, text){
  let msg;
  try{ msg = JSON.parse(text); }catch(e){ return; }
  const c = clients.get(sock);
  switch(msg.t){
    case 'login': {
      const username = String(msg.username||'').trim();
      if(!username) return;
      ensureAccount(username, msg);
      const acc = DB.accounts[username];
      clients.set(sock, {
        sock, username, nickname:acc.nickname, avatar:acc.avatar, element:acc.element,
        outfit:msg.outfit || acc.outfit || {}, mapId:msg.mapId||'lobby', x:msg.x||0, y:msg.y||0, facing:1, walk:0,
      });
      socketUser.set(sock, username);
      // 回欢迎 + 自己完整资料 + 当前在线列表
      send(sock, { t:'welcome', self: publicAccount(acc) });
      send(sock, { t:'online', list: onlineList().filter(o=>o.username!==username) });
      send(sock, { t:'mails', list: DB.mails[username] || [] });
      // 广播在线人数
      broadcast({ t:'onlineCount', n: clients.size });
      console.log('[server]', username, '上线，当前在线', clients.size);
      break;
    }
    case 'move':   handleMove(c, msg); break;
    case 'chat':   handleChat(c, msg); break;
    case 'friendReq': handleFriendReq(c, msg); break;
    case 'friendAcc': handleFriendAcc(c, msg); break;
    case 'mailList': handleMailList(c); break;
    case 'mailClaim': handleMailClaim(c, msg); break;
    case 'rename': handleRename(c, msg); break;
    case 'adminList': handleAdminList(c, msg); break;
    case 'adminMail': handleAdminMail(c, msg); break;
  }
}

function onClose(sock){
  const username = socketUser.get(sock);
  if(clients.has(sock)) clients.delete(sock);
  socketUser.delete(sock);
  if(username){
    broadcast({ t:'onlineCount', n: clients.size });
    console.log('[server]', username, '下线，当前在线', clients.size);
  }
}

/* ================= HTTP + WebSocket 握手 ================= */
const server = http.createServer((req, res)=>{
  if(req.url.startsWith('/health')){
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ ok:true, online:clients.size, accounts:Object.keys(DB.accounts).length }));
    return;
  }
  res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
  res.end('拾光·澈屿联机服务器');
});

server.on('upgrade', (req, socket)=>{
  const key = req.headers['sec-websocket-key'];
  if(!key){ socket.destroy(); return; }
  const accept = acceptKey(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  clients.set(socket, { sock:socket });   // 先占位，login 后填充

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk)=>{
    buf = Buffer.concat([buf, chunk]);
    // 解析帧
    while(buf.length >= 2){
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if(len === 126){ if(buf.length < 4) break; len = buf.readUInt16BE(2); offset = 4; }
      else if(len === 127){ if(buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
      let mask;
      if(masked){ if(buf.length < offset + 4) break; mask = buf.slice(offset, offset+4); offset += 4; }
      if(buf.length < offset + len) break;
      let payload = buf.slice(offset, offset + len);
      if(masked){ const u = Buffer.alloc(len); for(let i=0;i<len;i++) u[i] = payload[i] ^ mask[i%4]; payload = u; }
      buf = buf.slice(offset + len);
      if(opcode === 0x8){ socket.end(); return; }   // close
      if(opcode === 0x9){ socket.write(encodeFrame('')); continue; }   // ping
      if(opcode === 0x1 || opcode === 0x0){ onMessage(socket, payload.toString('utf8')); }
    }
  });
  socket.on('close', ()=>onClose(socket));
  socket.on('error', ()=>onClose(socket));
});

server.listen(PORT, ()=>{
  console.log('==============================================');
  console.log('  拾光·澈屿 联机服务器已启动');
  console.log('  端口: ' + PORT + '  (WebSocket)');
  console.log('  健康检查: http://localhost:' + PORT + '/health');
  console.log('  数据文件: ' + DATA_FILE);
  console.log('==============================================');
});
