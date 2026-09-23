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

    on(t, fn){ (onMsgHandlers[t] = onMsgHandlers[t] || []).push(fn); },
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

    close(){ if(sock){ try{ sock.close(); }catch(e){} sock = null; connected = false; } },
  };

  window.Net = Net;
})();
