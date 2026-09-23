/* ============================================================
   拾光·澈屿 —— 联机客户端（window.Net）
   ------------------------------------------------------------
   连接本地/远程 WebSocket 服务器，封装：
   - 登录（同步公开资料）
   - 同屏移动广播（只收最近 8 人）
   - 大厅聊天
   - 好友申请 / 接受
   - 邮件收取 / 领资产
   - 背包 / 改名卡
   服务器地址默认 ws://localhost:8090，可被 ?server= 覆盖。
   ============================================================ */
(function(){
  'use strict';

  /* 服务器地址（优先级从高到低）：
     1) 页面里写死的 window.MERCURY_WS（部署到服务器时改这一行即可）
     2) 网址参数 ?server=wss://xxx
     3) https 页面 => 同域 wss:///ws（nginx 反代 443 -> 8090，避免混合内容被浏览器拦）
     4) 其它（本地 / 局域网 http）=> ws://主机名:8090  */
  function resolveUrl(){
    if(window.MERCURY_WS) return window.MERCURY_WS;
    const q = new URLSearchParams(location.search);
    const s = q.get('server');
    if(s) return s;
    if(location.protocol === 'https:') return 'wss://' + location.host + '/ws';
    return 'ws://' + (location.hostname || '127.0.0.1') + ':8090';
  }

  let sock = null;
  let connected = false;
  let self = null;          // 服务器返回的公开资料
  let remotePlayers = {};   // username -> {x,y,facing,walk,nick,avatar,element,outfit, lastSeen}
  let onMsgHandlers = {};   // t -> [fn]

  const Net = {
    connected: ()=>connected,
    self: ()=>self,
    remotePlayers: ()=>remotePlayers,
    url: resolveUrl,

    /* 注册监听，返回「取消监听」函数（一次性监听靠它收尾） */
    on(t, fn){
      (onMsgHandlers[t] = onMsgHandlers[t] || []).push(fn);
      return function(){ const a = onMsgHandlers[t] || []; const i = a.indexOf(fn); if(i >= 0) a.splice(i, 1); };
    },
    emit(t, data){ (onMsgHandlers[t]||[]).forEach(fn=>{ try{ fn(data); }catch(e){} }); },

    connect(){
      return new Promise((resolve, reject)=>{
        if(sock && connected){ resolve(); return; }
        const url = resolveUrl();
        try{ sock = new WebSocket(url); }
        catch(e){ reject(e); return; }
        sock.onopen = ()=>{ connected = true; resolve(); };
        sock.onerror = (e)=>{ connected = false; /* 静默，重连交给调用方 */ };
        sock.onclose = ()=>{ connected = false; sock = null; Net.emit('disconnect', {}); };
        sock.onmessage = (ev)=>{
          let msg; try{ msg = JSON.parse(ev.data); }catch(e){ return; }
          if(msg.t === 'welcome') self = msg.self;
          if(msg.t === 'move') remotePlayers[msg.from] = {
            x:msg.x, y:msg.y, facing:msg.facing, walk:msg.walk, mapId:msg.mapId,
            nick:msg.nick, avatar:msg.avatar, element:msg.element, outfit:msg.outfit, lastSeen:Date.now(),
          };
          if(msg.t === 'nearby'){ (msg.list||[]).forEach(p=>{ remotePlayers[p.username] = Object.assign(remotePlayers[p.username]||{}, p, { lastSeen:Date.now() }); }); }
          Net.emit(msg.t, msg);
        };
      });
    },

    send(obj){ if(sock && connected){ sock.send(JSON.stringify(obj)); } },

    /* 登录：带上自己公开资料 */
    login(info){
      Net.send({ t:'login', username:info.username, nickname:info.nickname, avatar:info.avatar, element:info.element, outfit:info.outfit, mapId:info.mapId });
    },
    /* 上报位置 */
    move(x, y, facing, walk, mapId){ Net.send({ t:'move', x, y, facing, walk, mapId }); },
    /* 大厅/频道聊天：channel = 'world'(世界) | 'level'(关卡) | 'dm'(好友私聊) */
    chat(text){ Net.send({ t:'chat', text, channel:'world' }); },
    chatCh(channel, text, to){ Net.send({ t:'chat', text, channel, to }); },
    /* 好友 */
    friendReq(to){ Net.send({ t:'friendReq', to }); },
    friendAcc(from){ Net.send({ t:'friendAcc', from }); },
    /* 邮件 */
    mailList(){ Net.send({ t:'mailList' }); },
    mailClaim(id){ Net.send({ t:'mailClaim', id }); },
    /* 改名卡 */
    rename(nickname){ Net.send({ t:'rename', nickname }); },

    /* ================= 云端资产库（多人协作） =================
       adminKey：后台口令，第一次用会弹窗问，之后存在本机 localStorage。
       author  ：提交者名字，写进云端日志，出事好查是谁改的。 */
    adminKey: (function(){ try{ return localStorage.getItem('cloud_admin_key') || 'mercury'; }catch(e){ return 'mercury'; } })(),
    setAdminKey(k){ Net.adminKey = k || ''; try{ localStorage.setItem('cloud_admin_key', Net.adminKey); }catch(e){} },
    author(){ try{ return localStorage.getItem('cloud_author') || ''; }catch(e){ return ''; } },
    setAuthor(a){ try{ localStorage.setItem('cloud_author', a || ''); }catch(e){} },

    /* 拉线上已发布的资产（不需要口令） */
    assetPull(slot){ Net.send({ t:'assetPull', slot: slot || '' }); },

    /* 列清单 / 发布 / 回滚 / 丢草稿（都要口令） */
    assetList(){ Net.send({ t:'assetList', adminKey: Net.adminKey }); },
    assetPublish(slot, by){ Net.send({ t:'assetPublish', adminKey: Net.adminKey, slot, by: by || Net.author() }); },
    assetRollback(slot, by){ Net.send({ t:'assetRollback', adminKey: Net.adminKey, slot, by: by || Net.author() }); },
    assetDiscard(slot, by){ Net.send({ t:'assetDiscard', adminKey: Net.adminKey, slot, by: by || Net.author() }); },

    /* 提交资产到草稿区（分片发送，256KB 一片，避免大消息被中途掐断）
       opts = { slot, by, items, baseRev, force, onProgress }
       返回 Promise：成功 resolve(assetPushDone)；冲突 reject(err.conflict=true) */
    assetPush(opts){
      return new Promise((resolve, reject)=>{
        if(!Net.adminKey){ reject(new Error('还没有后台口令，请先设置')); return; }
        const raw = JSON.stringify(opts.items || {});
        const CHUNK = 256 * 1024;
        const total = Math.max(1, Math.ceil(raw.length / CHUNK));
        let finished = false;
        function cleanup(){ finished = true; un1(); un2(); un3(); un4(); }
        var un1 = Net.on('assetPushReady', m=>{
          const token = m.token;
          for(let i=0;i<total;i++){
            Net.send({ t:'assetPushChunk', token, i, chunk: raw.slice(i*CHUNK, (i+1)*CHUNK) });
            if(opts.onProgress) opts.onProgress((i+1) / total);
          }
          Net.send({ t:'assetPushEnd', token });
        });
        var un2 = Net.on('assetPushDone', m=>{ if(finished) return; cleanup(); resolve(m); });
        var un3 = Net.on('assetErr', m=>{ if(finished) return; cleanup(); reject(new Error(m.msg || '提交失败')); });
        var un4 = Net.on('assetConflict', m=>{
          if(finished) return; cleanup();
          const e = new Error(m.msg || '云端版本已变化');
          e.conflict = true; e.cur = m.cur; e.base = m.base;
          reject(e);
        });
        Net.send({ t:'assetPushBegin', adminKey: Net.adminKey, slot: opts.slot,
          by: opts.by || Net.author(), baseRev: opts.baseRev || 0, total, force: !!opts.force });
        /* 30 秒没动静就算失败，免得按钮一直转圈 */
        setTimeout(()=>{ if(!finished){ cleanup(); reject(new Error('提交超时，请检查网络后重试')); } }, 30000);
      });
    },

    /* ================= 媒体库（开场动画 / 登录动画视频） =================
       视频单独放服务器 /media/ 目录，由 nginx 当静态文件发出去（URL 就是 /media/xxx.mp4）。
       玩家 <video src="/media/xxx.mp4"> 是边下边播，不占 WebSocket、不阻塞首屏。
       上传走 WS 分片 Base64（要后台口令），单文件上限 60MB。
       mediaUpload(file, onProgress) -> Promise<{url,name,size}> */
    mediaList(){ Net.send({ t:'mediaList' }); },
    mediaDelete(name){ Net.send({ t:'mediaDelete', adminKey: Net.adminKey, name }); },

    mediaUpload(file, onProgress){
      return new Promise((resolve, reject)=>{
        if(!file){ reject(new Error('没选文件')); return; }
        if(!Net.adminKey){ reject(new Error('还没有后台口令，请先设置')); return; }
        if(file.size > 60 * 1024 * 1024){
          reject(new Error('文件 ' + (file.size/1048576).toFixed(1) + 'MB，超过 60MB 上限。\n请先压小（720p / 1~1.5Mbps / 10 秒内 ≈ 1~2MB）'));
          return;
        }
        const CHUNK = 192 * 1024;                       // 192KB 原始字节 → base64 约 256KB，一片不会太大
        const total = Math.max(1, Math.ceil(file.size / CHUNK));
        let finished = false;
        function cleanup(){ finished = true; un1(); un2(); un3(); }
        /* 一片一片读，读完就发；顺序发，服务器按到达顺序追加 */
        function sliceB64(blob){
          return new Promise((res, rej)=>{
            const r = new FileReader();
            r.onload = ()=>{
              const s = String(r.result || '');
              const i = s.indexOf(',');
              res(i >= 0 ? s.slice(i + 1) : s);
            };
            r.onerror = ()=> rej(new Error('读取分片失败'));
            r.readAsDataURL(blob);
          });
        }
        var un1 = Net.on('mediaReady', async m=>{
          try{
            for(let i = 0; i < total; i++){
              if(finished) return;
              const b64 = await sliceB64(file.slice(i * CHUNK, (i + 1) * CHUNK));
              Net.send({ t:'mediaChunk', token: m.token, chunk: b64 });
              if(onProgress) onProgress((i + 1) / total);
            }
            Net.send({ t:'mediaEnd', token: m.token });
          }catch(e){ if(!finished){ cleanup(); reject(e); } }
        });
        var un2 = Net.on('mediaDone', m=>{ if(finished) return; cleanup(); resolve(m); });
        var un3 = Net.on('mediaErr', m=>{ if(finished) return; cleanup(); reject(new Error(m.msg || '上传失败')); });
        Net.send({ t:'mediaBegin', adminKey: Net.adminKey, name: file.name, size: file.size });
        /* 视频大，给 3 分钟 */
        setTimeout(()=>{ if(!finished){ cleanup(); reject(new Error('上传超时（3 分钟），请检查网络后重试')); } }, 180000);
      });
    },

    close(){ if(sock){ try{ sock.close(); }catch(e){} sock = null; connected = false; } },
  };

  window.Net = Net;
})();
