/* 诊断：模拟 assetPush，测不同分片大小能否收到 ACK */
const WebSocket = require('ws');
const URL = 'ws://43.138.164.146/ws';
const KEY = process.env.ADMIN_KEY || 'mercury';

function run(chunkSizeKB, label){
  return new Promise((resolve)=>{
    const ws = new WebSocket(URL, { perMessageDeflate:false });
    let token = '', t0 = Date.now(), acked = false;
    ws.on('open', ()=>{
      ws.send(JSON.stringify({ t:'assetPushBegin', adminKey:KEY, slot:'login', by:'diag', baseRev:0, total:1, force:true }));
    });
    ws.on('message', (raw)=>{
      let m; try{ m = JSON.parse(raw.toString()); }catch(e){ return; }
      if(m.t === 'assetPushReady'){ token = m.token; const s = 'x'.repeat(chunkSizeKB*1024); console.log(`[${label}] ready, send ${chunkSizeKB}KB`); ws.send(JSON.stringify({ t:'assetPushChunk', token, i:0, chunk:s })); }
      else if(m.t === 'assetPushAck'){ acked = true; console.log(`[${label}] ✅ ACK in ${Date.now()-t0}ms`); ws.close(); resolve(true); }
      else if(m.t === 'assetErr'){ console.log(`[${label}] ❌ err: ${m.msg}`); ws.close(); resolve(false); }
      else if(m.t === 'assetConflict'){ console.log(`[${label}] ⚠ conflict cur=${m.cur} base=${m.base}`); ws.close(); resolve(false); }
    });
    ws.on('error', (e)=>{ console.log(`[${label}] ❌ socket error ${e.message}`); resolve(false); });
    ws.on('close', ()=>{ if(!acked){ console.log(`[${label}] ❌ closed without ACK (${Date.now()-t0}ms)`); resolve(false); } });
    setTimeout(()=>{ if(!acked){ console.log(`[${label}] ⏰ 12s timeout, no ACK`); try{ws.close();}catch(e){} resolve(false); } }, 12000);
  });
}

(async ()=>{
  for(const kb of [16, 64, 256, 512]){
    await run(kb, kb+'KB');
  }
  process.exit(0);
})();
