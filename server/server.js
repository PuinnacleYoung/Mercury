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

/* 云端资产库（老版本 data.json 没有这块，自动补上） */
function cloudInit(){
  if(!DB.cloud) DB.cloud = { rev:{}, draft:{}, live:{}, history:{}, log:[] };
  const c = DB.cloud;
  c.rev = c.rev || {}; c.draft = c.draft || {}; c.live = c.live || {};
  c.history = c.history || {}; c.log = c.log || [];
}
cloudInit();

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

/* ================= 业务：频道聊天 =================
   channel = 'world'(世界，全服广播) | 'level'(关卡，只推同图) | 'dm'(好友私聊，只推对方)
   消息统一带 channel + mapId，客户端据此分流。 */
function handleChat(c, msg){
  if(!c.username) return;
  const text = String(msg.text || '').slice(0, 200);
  if(!text) return;
  const channel = (msg.channel === 'level' || msg.channel === 'dm') ? msg.channel : 'world';
  const base = { t:'chat', from:c.username, nickname:c.nickname, avatar:c.avatar, text, ts:Date.now(), channel, mapId:c.mapId };

  if(channel === 'dm'){
    // 好友私聊：只发给目标（对方必须在线），自己这边由客户端本地回显
    const to = String(msg.to||'').trim();
    if(!to || to === c.username) return;
    const targetSock = [...clients.keys()].find(s=>clients.get(s).username===to);
    if(targetSock){ send(targetSock, Object.assign({}, base, { to })); }
    else send(c.sock, { t:'sys', msg:'对方不在线，暂时收不到私聊' });
    return;
  }

  if(channel === 'level'){
    // 关卡频道：只推同图（同 mapId）的玩家
    const buf = encodeFrame(JSON.stringify(base));
    for(const [sock, o] of clients){
      if(sock === c.sock) continue;
      if(o.mapId !== c.mapId) continue;
      try{ sock.write(buf); }catch(e){}
    }
    return;
  }

  // world：全服广播（原大厅聊天）
  broadcast(base);
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

/* ================= 云端资产库（多人协作） =================
   槽位 slot = body / outfit / map / npc / tarot / misc
   每个槽位存一组 localStorage 键值，分三区：
     draft   草稿区（编辑器提交上来，还没发布）
     live    发布区（游戏端拉取的唯一真源）
     history 历史版本（发布时自动归档旧版本，最多 10 份，可一键回滚）
   版本锁：每槽位两个版本号 live / draft。提交时带 baseRev（上次看到的草稿版本），
     对不上说明有人抢先改过 → 回 assetConflict；客户端问过人之后可带 force:true 强覆盖。
   大资产分片：BEGIN(总分片数) → CHUNK×N → END，服务端按 token 拼接，
     这样单条 WebSocket 消息永远很小，不会被 nginx / 代理掐断。 */
const SLOTS = {
  body:   { name:'素体',      keys:['engine_body_v4'] },
  /* 注意：engine_outfits_v3（玩家自己存的穿搭）不进云端，否则发布一次就把玩家的搭配冲掉了 */
  outfit: { name:'服装件',    keys:['engine_lib_v3','engine_outfitsets_v1'] },
  map:    { name:'地图/关卡', keys:['game_maps'] },
  npc:    { name:'NPC',       keys:['engine_npcs_v1'] },
  tarot:  { name:'塔罗',      keys:['tarot_editor_v1'], prefixes:['tarot_assets_'] },
  misc:   { name:'动画/裁边', keys:['engine_anim_cfg','engine_auto_trim'] },
  /* 登录页：只同步配置（含 'ms:xxx' 素材引用）——视频本体在各自电脑的 IndexedDB 里，
     不上云，否则几十 MB 的片子会把 data.json 撑爆 */
  login:  { name:'登录页/开场动画', keys:['login_engine_config'] },
};
const HISTORY_MAX = 10;
const UPLOAD_TTL  = 10 * 60 * 1000;
const pendingUploads = new Map();   // token -> {slot,by,total,chunks,got,ts}

function slotRev(slot){
  const r = DB.cloud.rev[slot] || {};
  return { live: r.live || 0, draft: r.draft || 0 };
}
function bumpDraft(slot){
  const r = DB.cloud.rev[slot] || (DB.cloud.rev[slot] = { live:0, draft:0 });
  r.draft = (r.draft || 0) + 1;
  return r.draft;
}
function cloudLog(slot, action, by, extra){
  DB.cloud.log.unshift(Object.assign({ slot, action, by: by || '?', ts: Date.now() }, extra || {}));
  if(DB.cloud.log.length > 200) DB.cloud.log.length = 200;
}
function adminOk(msg){ return !!(msg && msg.adminKey && msg.adminKey === (process.env.ADMIN_KEY || 'admin123')); }
function when(ts){ try{ return new Date(ts).toLocaleString('zh-CN'); }catch(e){ return String(ts); } }

/* 拉取：不需要权限（游戏端人人可拉 live） */
function handleAssetPull(c, msg){
  const want = (msg && msg.slot) ? [msg.slot] : Object.keys(SLOTS);
  const slots = {};
  for(const s of want){
    if(!SLOTS[s]) continue;
    const L = DB.cloud.live[s], D = DB.cloud.draft[s], rev = slotRev(s);
    slots[s] = {
      name: SLOTS[s].name,
      items: L ? L.items : null,
      rev,
      live:  L ? { by:L.by, ts:L.ts, rev:rev.live, bytes:L.bytes } : null,
      draft: D ? { by:D.by, ts:D.ts, bytes:D.bytes } : null,
    };
  }
  send(c.sock, { t:'assetData', slots });
}

/* 列表：给后台管理引擎看（要权限） */
function handleAssetList(c, msg){
  if(!adminOk(msg)){ send(c.sock, { t:'sys', msg:'后台权限不足' }); return; }
  const list = Object.keys(SLOTS).map(s=>{
    const L = DB.cloud.live[s], D = DB.cloud.draft[s], rev = slotRev(s);
    return {
      slot:s, name:SLOTS[s].name, rev,
      live:  L ? { by:L.by, ts:L.ts, bytes:L.bytes, rev:rev.live } : null,
      draft: D ? { by:D.by, ts:D.ts, bytes:D.bytes } : null,
      pending: !!D,
      historyCount: (DB.cloud.history[s] || []).length,
    };
  });
  send(c.sock, { t:'assetList', list, log: DB.cloud.log.slice(0, 60) });
}

/* 提交（分片）——第 1 步：申请 */
function handlePushBegin(c, msg){
  if(!adminOk(msg)){ send(c.sock, { t:'assetErr', msg:'后台权限不足（adminKey 不对）' }); return; }
  const slot = String(msg.slot || '');
  if(!SLOTS[slot]){ send(c.sock, { t:'assetErr', msg:'未知槽位：' + slot }); return; }
  const cur = slotRev(slot).draft;
  const baseRev = Number(msg.baseRev || 0);
  if(baseRev !== cur && !msg.force){
    const D = DB.cloud.draft[slot];
    send(c.sock, { t:'assetConflict', slot, cur, base:baseRev, msg: D
      ? ('「' + (D.by||'?') + '」在 ' + when(D.ts) + ' 提交过一份还没发布的草稿。要覆盖它吗？')
      : ('云端版本已经变了（云端 v' + cur + '，你基于 v' + baseRev + '），请先拉取最新再改。') });
    return;
  }
  const total = Math.max(1, Number(msg.total || 1));
  const token = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  pendingUploads.set(token, { slot, by: msg.by || '?', total, chunks: new Array(total), got: 0, ts: Date.now() });
  send(c.sock, { t:'assetPushReady', token });
}
/* 提交——第 2 步：收分片 */
function handlePushChunk(c, msg){
  const u = pendingUploads.get(msg.token);
  if(!u){ return; }
  const i = Number(msg.i || 0);
  if(i >= 0 && i < u.total && u.chunks[i] === undefined){ u.chunks[i] = String(msg.chunk || ''); u.got++; }
  u.ts = Date.now();
}
/* 提交——第 3 步：拼装入库 */
function handlePushEnd(c, msg){
  const u = pendingUploads.get(msg.token);
  if(!u){ send(c.sock, { t:'assetErr', msg:'上传会话已失效，请重新提交' }); return; }
  pendingUploads.delete(msg.token);
  if(u.got !== u.total){ send(c.sock, { t:'assetErr', msg:'分片缺失（收到 ' + u.got + '/' + u.total + '），请重新提交' }); return; }
  const raw = u.chunks.join('');
  let items;
  try{ items = JSON.parse(raw); }
  catch(e){ send(c.sock, { t:'assetErr', msg:'数据解析失败：' + e.message }); return; }
  const bytes = Buffer.byteLength(raw, 'utf8');
  DB.cloud.draft[u.slot] = { items, by: u.by, ts: Date.now(), bytes };
  const rev = bumpDraft(u.slot);
  cloudLog(u.slot, 'draft', u.by, { bytes, rev });
  persist();
  send(c.sock, { t:'assetPushDone', slot:u.slot, rev, bytes, msg:'已提交到草稿区，等陛下发布' });
  broadcast({ t:'assetDraftChanged', slot:u.slot, by:u.by, ts:Date.now() }, c.sock);
  console.log('[cloud]', u.by, '提交草稿', u.slot, (bytes/1024).toFixed(0) + 'KB');
}

/* 发布：草稿 → 线上（旧线上进历史） */
function handleAssetPublish(c, msg){
  if(!adminOk(msg)){ send(c.sock, { t:'sys', msg:'后台权限不足' }); return; }
  const slot = String(msg.slot || '');
  const D = DB.cloud.draft[slot];
  if(!D){ send(c.sock, { t:'sys', msg:'这个槽位没有待发布的草稿' }); return; }
  const L = DB.cloud.live[slot];
  if(L){
    const H = DB.cloud.history[slot] || (DB.cloud.history[slot] = []);
    H.unshift({ items:L.items, by:L.by, ts:L.ts, rev:slotRev(slot).live, archivedAt:Date.now() });
    if(H.length > HISTORY_MAX) H.length = HISTORY_MAX;
  }
  DB.cloud.live[slot] = { items:D.items, by:D.by, ts:D.ts, publishedAt:Date.now(), bytes:D.bytes };
  delete DB.cloud.draft[slot];
  const r = DB.cloud.rev[slot] || (DB.cloud.rev[slot] = { live:0, draft:0 });
  r.live = (r.live || 0) + 1;
  cloudLog(slot, 'publish', msg.by || '陛下', { rev:r.live, from:D.by, bytes:D.bytes });
  persist();
  send(c.sock, { t:'sys', msg:'已发布：' + SLOTS[slot].name + ' → v' + r.live });
  send(c.sock, { t:'assetListRefresh' });
  broadcast({ t:'assetPublished', slot, rev:r.live, by:D.by });
  console.log('[cloud] 发布', slot, 'v' + r.live, '作者', D.by);
}

/* 回滚：把历史里最新一份放回线上 */
function handleAssetRollback(c, msg){
  if(!adminOk(msg)){ send(c.sock, { t:'sys', msg:'后台权限不足' }); return; }
  const slot = String(msg.slot || '');
  const H = DB.cloud.history[slot] || [];
  if(!H.length){ send(c.sock, { t:'sys', msg:'这个槽位没有可回滚的历史版本' }); return; }
  const old = H.shift();
  const L = DB.cloud.live[slot];
  DB.cloud.live[slot] = { items:old.items, by:old.by, ts:old.ts, bytes:old.bytes, rolledBackAt:Date.now() };
  if(L){
    const H2 = DB.cloud.history[slot] || (DB.cloud.history[slot] = []);
    H2.unshift({ items:L.items, by:L.by, ts:L.ts, rev:slotRev(slot).live, archivedAt:Date.now() });
    if(H2.length > HISTORY_MAX) H2.length = HISTORY_MAX;
  }
  const r = DB.cloud.rev[slot] || (DB.cloud.rev[slot] = { live:0, draft:0 });
  r.live = (r.live || 0) + 1;
  cloudLog(slot, 'rollback', msg.by || '陛下', { rev:r.live, to:old.by });
  persist();
  send(c.sock, { t:'sys', msg:'已回滚到「' + (old.by||'?') + '」的版本' });
  send(c.sock, { t:'assetListRefresh' });
  broadcast({ t:'assetPublished', slot, rev:r.live, by:old.by });
}

/* 丢弃草稿 */
function handleAssetDiscard(c, msg){
  if(!adminOk(msg)){ send(c.sock, { t:'sys', msg:'后台权限不足' }); return; }
  const slot = String(msg.slot || '');
  if(!DB.cloud.draft[slot]){ send(c.sock, { t:'sys', msg:'没有草稿可丢弃' }); return; }
  const D = DB.cloud.draft[slot];
  delete DB.cloud.draft[slot];
  cloudLog(slot, 'discard', msg.by || '陛下', { from:D.by });
  persist();
  send(c.sock, { t:'sys', msg:'已丢弃「' + (D.by||'?') + '」的草稿' });
  send(c.sock, { t:'assetListRefresh' });
}

/* 半途而废的上传会话，定时清掉 */
setInterval(()=>{
  const now = Date.now();
  for(const [k, u] of pendingUploads){ if(now - u.ts > UPLOAD_TTL) pendingUploads.delete(k); }
}, 60 * 1000).unref();

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
      // 广播在线人数 + 最新在线名单（新玩家自己已单独收到过，排除掉）
      broadcast({ t:'onlineCount', n: clients.size });
      broadcast({ t:'online', list: onlineList() }, sock);
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
    /* 云端资产库 */
    case 'assetPull':      handleAssetPull(c, msg); break;
    case 'assetList':      handleAssetList(c, msg); break;
    case 'assetPushBegin': handlePushBegin(c, msg); break;
    case 'assetPushChunk': handlePushChunk(c, msg); break;
    case 'assetPushEnd':   handlePushEnd(c, msg); break;
    case 'assetPublish':   handleAssetPublish(c, msg); break;
    case 'assetRollback':  handleAssetRollback(c, msg); break;
    case 'assetDiscard':   handleAssetDiscard(c, msg); break;
  }
}

function onClose(sock){
  const username = socketUser.get(sock);
  if(clients.has(sock)) clients.delete(sock);
  socketUser.delete(sock);
  if(username){
    broadcast({ t:'onlineCount', n: clients.size });
    broadcast({ t:'online', list: onlineList() });   // 名单同步刷新，客户端好友面板实时更新
    console.log('[server]', username, '下线，当前在线', clients.size);
  }
}

/* ================= HTTP + WebSocket 握手 ================= */
const server = http.createServer((req, res)=>{
  if(req.url.startsWith('/health')){
    const cloud = {};
    for(const s of Object.keys(SLOTS)){
      cloud[s] = { name:SLOTS[s].name, live: slotRev(s).live, draft: slotRev(s).draft, pending: !!DB.cloud.draft[s] };
    }
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ ok:true, online:clients.size, accounts:Object.keys(DB.accounts).length, cloud }));
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
