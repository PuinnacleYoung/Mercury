/* 云端资产库端到端测试（只连本机 127.0.0.1:8090，别拿去连线上服务器）
   用法：先 node server/server.js，再 node scripts/test-cloud.js */
const crypto = require('crypto');
const net = require('net');

const HOST = '127.0.0.1', PORT = Number(process.env.PORT || 8090);
const KEY = process.env.ADMIN_KEY || 'admin123';
const CHUNK = 256 * 1024;

function wsConnect(onMsg){
  return new Promise((resolve, reject)=>{
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, HOST, ()=>{
      sock.write(
        'GET / HTTP/1.1\r\nHost: ' + HOST + ':' + PORT + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    let buf = Buffer.alloc(0), hs = false;
    sock.on('data', (chunk)=>{
      buf = Buffer.concat([buf, chunk]);
      if(!hs){
        const idx = buf.indexOf('\r\n\r\n');
        if(idx < 0) return;
        const head = buf.slice(0, idx).toString();
        if(!head.includes('101')){ reject(new Error('握手失败')); return; }
        buf = buf.slice(idx + 4); hs = true; resolve(sock);
      }
      while(buf.length >= 2){
        const b1 = buf[1];
        let len = b1 & 0x7f, off = 2;
        if(len === 126){ if(buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if(len === 127){ if(buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if(buf.length < off + len) break;
        const p = buf.slice(off, off + len).toString('utf8');
        buf = buf.slice(off + len);
        try{ onMsg(JSON.parse(p)); }catch(e){}
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
  else if(len < 65536){ h = Buffer.alloc(4); h[1] = 0x80 | 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[1] = 0x80 | 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
  h[0] = 0x81;
  const mask = crypto.randomBytes(4);
  const m = Buffer.alloc(len);
  for(let i=0;i<len;i++) m[i] = payload[i] ^ mask[i%4];
  sock.write(Buffer.concat([h, mask, m]));
}
const sleep = ms => new Promise(r=>setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('  OK  ', name); } else { fail++; console.log('  FAIL', name); } }

/* 完整地提交一次（分片），返回是否成功 */
async function push(sock, msgsRef, slot, by, items, baseRev, force){
  const raw = JSON.stringify(items || {});
  const total = Math.max(1, Math.ceil(raw.length / CHUNK));
  msgsRef.length = 0;
  send(sock, { t:'assetPushBegin', adminKey:KEY, slot, by, total, baseRev: baseRev || 0, force: !!force });
  await sleep(250);
  const ready = msgsRef.find(m=>m.t==='assetPushReady');
  if(!ready) return { ok:false, msgs: msgsRef.slice() };
  for(let i=0;i<total;i++) send(sock, { t:'assetPushChunk', token:ready.token, i, chunk: raw.slice(i*CHUNK,(i+1)*CHUNK) });
  msgsRef.length = 0;
  send(sock, { t:'assetPushEnd', token:ready.token });
  await sleep(400);
  return { ok:true, msgs: msgsRef.slice() };
}

(async ()=>{
  const SUF = Date.now().toString(36).slice(-5);
  let msgs = [];
  const C = await wsConnect(m=>msgs.push(m));
  send(C, { t:'login', username:'cloud_' + SUF, nickname:'云端测试' });
  await sleep(300);

  /* 拿某个槽位当前的「草稿版本号」，模拟编辑器提交前先拉取 */
  async function revOf(slot){
    msgs = []; send(C, { t:'assetPull', slot }); await sleep(250);
    const d = msgs.find(m=>m.t==='assetData');
    return (d && d.slots[slot]) ? d.slots[slot].rev.draft : 0;
  }

  console.log('=== 1. 空云端拉取 ===');
  msgs = []; send(C, { t:'assetPull' }); await sleep(250);
  const d0 = msgs.find(m=>m.t==='assetData');
  check('收到 assetData', !!d0);
  check('map 槽位线上为空', d0 && d0.slots.map && d0.slots.map.items === null);
  check('六个槽位都在', d0 && Object.keys(d0.slots).length === 6);

  console.log('=== 2. 错误口令必须被拒 ===');
  msgs = []; send(C, { t:'assetPushBegin', adminKey:'wrongkey', slot:'map', by:'坏蛋', total:1 }); await sleep(250);
  check('错误口令被拒绝', msgs.some(m=>m.t==='assetErr'));
  msgs = []; send(C, { t:'assetList', adminKey:'wrongkey' }); await sleep(250);
  check('错误口令看不到清单', msgs.some(m=>m.t==='sys' && /权限不足/.test(m.msg||'')));

  console.log('=== 3. 正常提交（700KB 大资产，验证分片）===');
  const bigItems = { game_maps: 'X'.repeat(700 * 1024), __tag:'v1-朋友A' };
  check('700KB 应切成 3 片', Math.ceil(JSON.stringify(bigItems).length / CHUNK) === 3);
  let r = await push(C, msgs, 'map', '朋友A', bigItems, 0);
  check('提交成功进草稿区', r.msgs.some(m=>m.t==='assetPushDone'));
  const done = r.msgs.find(m=>m.t==='assetPushDone');
  check('大小约 700KB（分片拼装无损）', done && done.bytes > 690 * 1024 && done.bytes < 720 * 1024);

  console.log('=== 4. 后台能看到待发布草稿 ===');
  msgs = []; send(C, { t:'assetList', adminKey:KEY }); await sleep(300);
  const list1 = msgs.find(m=>m.t==='assetList');
  check('拿到资产清单', !!list1);
  const mapRow = list1 && list1.list.find(x=>x.slot==='map');
  check('map 标记为待发布', mapRow && mapRow.pending === true);
  check('草稿作者是朋友A', mapRow && mapRow.draft && mapRow.draft.by === '朋友A');

  console.log('=== 5. 版本锁：拿旧版本号提交必须报冲突 ===');
  r = await push(C, msgs, 'map', '朋友B', { game_maps:'Y', __tag:'v2-朋友B' }, 0);
  const conflict = r.msgs.find(m=>m.t==='assetConflict');
  check('旧版本号被拦下（assetConflict）', !!conflict);
  check('冲突提示里点名朋友A', conflict && /朋友A/.test(conflict.msg || ''));
  check('服务器没被覆盖（草稿还是朋友A）', await (async()=>{
    msgs = []; send(C, { t:'assetList', adminKey:KEY }); await sleep(250);
    const l2 = msgs.find(m=>m.t==='assetList');
    const row = l2 && l2.list.find(x=>x.slot==='map');
    return row && row.draft && row.draft.by === '朋友A';
  })());

  console.log('=== 6. 确认后强制覆盖 ===');
  r = await push(C, msgs, 'map', '朋友B', { game_maps:'Y', __tag:'v2-朋友B' }, 0, true);
  check('force 覆盖成功', r.msgs.some(m=>m.t==='assetPushDone'));

  console.log('=== 7. 发布 → 线上生效 ===');
  msgs = []; send(C, { t:'assetPublish', adminKey:KEY, slot:'map', by:'陛下' }); await sleep(350);
  check('提示已发布', msgs.some(m=>m.t==='sys' && /已发布/.test(m.msg||'')));
  msgs = []; send(C, { t:'assetPull', slot:'map' }); await sleep(300);
  const d1 = msgs.find(m=>m.t==='assetData');
  check('线上能拉到资产', d1 && d1.slots.map.items && d1.slots.map.items.__tag === 'v2-朋友B');
  check('线上版本号 v1', d1 && d1.slots.map.rev.live === 1);
  check('发布后草稿区清空', d1 && d1.slots.map.draft === null);

  console.log('=== 8. 第二版发布 + 回滚 ===');
  const rev8 = await revOf('map');   // 必须先取值再提交：revOf 会重置 msgs 引用
  await push(C, msgs, 'map', '朋友A', { game_maps:'Z', __tag:'v3-朋友A' }, rev8);
  msgs = []; send(C, { t:'assetPublish', adminKey:KEY, slot:'map', by:'陛下' }); await sleep(350);
  msgs = []; send(C, { t:'assetPull', slot:'map' }); await sleep(300);
  const d2 = msgs.find(m=>m.t==='assetData');
  check('线上已是 v3', d2 && d2.slots.map.items.__tag === 'v3-朋友A');
  msgs = []; send(C, { t:'assetRollback', adminKey:KEY, slot:'map', by:'陛下' }); await sleep(350);
  check('提示已回滚', msgs.some(m=>m.t==='sys' && /已回滚到/.test(m.msg||'')));
  msgs = []; send(C, { t:'assetPull', slot:'map' }); await sleep(300);
  const d3 = msgs.find(m=>m.t==='assetData');
  check('回滚后回到 v2（朋友B的版本）', d3 && d3.slots.map.items.__tag === 'v2-朋友B');

  console.log('=== 9. 丢弃草稿 ===');
  const rev9 = await revOf('map');
  await push(C, msgs, 'map', '朋友B', { game_maps:'W' }, rev9);
  msgs = []; send(C, { t:'assetList', adminKey:KEY }); await sleep(250);
  const l3 = msgs.find(m=>m.t==='assetList');
  check('丢弃前有待发布草稿', l3 && l3.list.find(x=>x.slot==='map').pending === true);
  msgs = []; send(C, { t:'assetDiscard', adminKey:KEY, slot:'map', by:'陛下' }); await sleep(300);
  check('提示已丢弃', msgs.some(m=>m.t==='sys' && /丢弃/.test(m.msg||'')));

  console.log('=== 10. 操作日志 ===');
  msgs = []; send(C, { t:'assetList', adminKey:KEY }); await sleep(300);
  const l4 = msgs.find(m=>m.t==='assetList');
  check('日志里记了发布', l4 && l4.log.some(x=>x.action==='publish'));
  check('日志里记了回滚', l4 && l4.log.some(x=>x.action==='rollback'));
  check('日志里记了提交', l4 && l4.log.some(x=>x.action==='draft'));

  console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('测试异常：', e.message); process.exit(1); });
