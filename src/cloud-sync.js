/* 拾光·澈屿 · 云端同步条（各编辑器共用）
   ------------------------------------------------------------------
   用法（编辑器页里两行就够）：
     <script src="./net-client.js"></script>
     <script src="./cloud-sync.js"></script>
     CloudSync.mount('map');        // map / outfit / body / npc / tarot / misc

   它做的事：
     - 右下角挂一个小面板，显示云端版本和「谁提交了还没发布的草稿」
     - 「拉取线上」：把陛下发布过的内容拉回本机，覆盖同名 localStorage
     - 「提交到云端」：把本机这个槽位的数据提交到草稿区，等陛下发布
     - 提交前自动对版本号，发现别人抢先改过会提示，陛下确认后可强覆盖

   注意：SLOT_DEF 必须和 server/server.js 里的 SLOTS 保持一致，改一处要改两处。 */
(function(){
  'use strict';

  var SLOT_DEF = {
    body:   { name:'素体',      keys:['engine_body_v4'] },
    /* engine_outfits_v3 是玩家自己存的穿搭，属于个人数据，不上传 */
    outfit: { name:'服装件',    keys:['engine_lib_v3','engine_outfitsets_v1'] },
    map:    { name:'地图/关卡', keys:['game_maps'] },
    npc:    { name:'NPC',       keys:['engine_npcs_v1'] },
    tarot:  { name:'塔罗',      keys:['tarot_editor_v1'], prefixes:['tarot_assets_'] },
    misc:   { name:'动画/裁边', keys:['engine_anim_cfg','engine_auto_trim'] },
    login:  { name:'登录页/开场动画', keys:['login_engine_config'] },
  };

  function fmtSize(b){
    if(b === null || b === undefined) return '—';
    if(b < 1024) return b + 'B';
    if(b < 1024 * 1024) return (b / 1024).toFixed(0) + 'KB';
    return (b / 1024 / 1024).toFixed(1) + 'MB';
  }
  function when(ts){
    if(!ts) return '—';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
           ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  /* 按槽位定义，把本机 localStorage 里的相关键值整套收上来 */
  function collect(slot){
    var def = SLOT_DEF[slot]; if(!def) return {};
    var items = {};
    (def.keys || []).forEach(function(k){
      var v = localStorage.getItem(k);
      if(v !== null && v !== undefined) items[k] = v;
    });
    (def.prefixes || []).forEach(function(p){
      for(var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if(k && k.indexOf(p) === 0){
          var v = localStorage.getItem(k);
          if(v !== null && v !== undefined) items[k] = v;
        }
      }
    });
    return items;
  }

  /* ================= 素材跟着配置一起上云 =================
     陛下在 A 电脑上传的 PNG / 视频，本体躺在浏览器 IndexedDB（MediaStore）里，
     配置里只留一个 'ms:xxx' 的引用。以前 collect() 只搬 localStorage，
     图根本没跟着走 —— 别人（或另一台电脑）拉下来就是「布局在、图全空」。

     现在提交时把配置里所有 ms: 引用读出来，转成 dataURL 一起塞进 __media__；
     拉下来时再写回各人本机的 MediaStore（id 原样保留 → 配置里的 ms:xxx 照样解析）。
     id 不变是关键：换机器也认得同一张图。 */
  var MEDIA_KEY      = '__media__';
  var MEDIA_ONE_MAX  = 12 * 1024 * 1024;   // 单个素材上限（转 base64 之前算）
  var MEDIA_ALL_MAX  = 24 * 1024 * 1024;   // 一次提交的总上限

  function blobToDataUrl(blob){
    return new Promise(function(res, rej){
      try{
        var fr = new FileReader();
        fr.onload  = function(){ res(String(fr.result || '')); };
        fr.onerror = function(){ rej(new Error('读取素材失败')); };
        fr.readAsDataURL(blob);
      }catch(e){ rej(e); }
    });
  }
  function dataUrlToBlob(u){
    var m = /^data:([^;,]*);base64,([\s\S]*)$/.exec(u || '');
    if(!m) return null;
    var bin = atob(m[2]);
    var arr = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    try{ return new Blob([arr], { type: m[1] || 'application/octet-stream' }); }
    catch(e){ return null; }
  }
  /* 从收集到的配置文本里挑出所有 'ms:xxx' 引用（去重） */
  function findMediaRefs(items){
    var seen = {}, out = [];
    Object.keys(items).forEach(function(k){
      var s = items[k];
      if(typeof s !== 'string') return;
      var re = /ms:([A-Za-z0-9_\-.]+)/g, m;
      while((m = re.exec(s))){ if(!seen[m[1]]){ seen[m[1]] = 1; out.push(m[1]); } }
    });
    return out;
  }

  /* ---------- 压精度（陛下钦定：原始素材是高清的，上云前自动压） ----------
     超过阈值的图：先用 canvas 把最长边缩到 ≤2048，再转 WebP（保透明）；
     还压不下来就降质量再来一轮。原始素材本机原样保留，只压「要上云」的这一份。 */
  var IMG_COMPRESS_OVER = 1.2 * 1024 * 1024;   // 超过 1.2MB 的图才压
  var IMG_MAX_SIDE      = 2048;                // 最长边
  var IMG_QUALITY_STEPS = [0.85, 0.7, 0.55];   // 一轮不行就降质量再来
  var IMG_TARGET        = 3.5 * 1024 * 1024;   // 压到 3.5MB 以下就收手

  function compressImageBlob(blob){
    return new Promise(function(res){
      try{
        if(!blob || blob.type.indexOf('image/') !== 0 || blob.type === 'image/gif'){ res(null); return; }
        var bitmap = null;
        var done = function(outBlob, w, h, q){
          try{ if(bitmap && bitmap.close) bitmap.close(); }catch(e){}
          res(outBlob ? { blob: outBlob, w: w, h: h, q: q } : null);
        };
        var step = function(bm){
          bitmap = bm;
          var sw = bm.width, sh = bm.height;
          var k = Math.min(1, IMG_MAX_SIDE / Math.max(sw, sh));
          var w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          if(!ctx){ done(null); return; }
          ctx.drawImage(bm, 0, 0, w, h);
          var qi = 0;
          var attempt = function(){
            if(qi >= IMG_QUALITY_STEPS.length){ done(null); return; }
            var q = IMG_QUALITY_STEPS[qi++];
            /* 输出格式看原图：jpeg 本来就没透明 → 用 jpeg 压得最狠；
               png/webp 可能带透明 → 一律 webp（支持透明）。
               不能靠抽样像素猜有没有透明 —— 大图的角落往往恰好全不透明，猜错就把透明压没了。 */
            var mime = (blob.type === 'image/jpeg') ? 'image/jpeg' : 'image/webp';
            cv.toBlob(function(ob){
              if(ob && ob.size < blob.size && (ob.size <= IMG_TARGET || qi >= IMG_QUALITY_STEPS.length)){
                done(ob, w, h, q);
              } else if(ob && ob.size < blob.size){
                attempt();
              } else { done(null); }
            }, mime, q);
          };
          attempt();
        };
        if(window.createImageBitmap){
          createImageBitmap(blob).then(step).catch(function(){ done(null); });
        } else { done(null); }
      }catch(e){ res(null); }
    });
  }
  /* 打包：ms: 素材 → dataURL，挂到 items.__media__。resolve {n, bytes, skipped, shrunk}
     超过阈值的图先压精度再走（原始素材只存在陛下本机，上云的这份是压过的） */
  function packMedia(items){
    return new Promise(function(res){
      if(!window.MediaStore || typeof MediaStore.get !== 'function'){ res({ n:0, bytes:0, skipped:0, shrunk:[] }); return; }
      var ids = findMediaRefs(items);
      if(!ids.length){ res({ n:0, bytes:0, skipped:0, shrunk:[] }); return; }
      var out = {}, bytes = 0, skipped = 0, shrunk = [], i = 0;
      (function next(){
        if(i >= ids.length){
          if(Object.keys(out).length) items[MEDIA_KEY] = JSON.stringify(out);
          res({ n:Object.keys(out).length, bytes:bytes, skipped:skipped, shrunk:shrunk });
          return;
        }
        var id = ids[i++];
        try{
          MediaStore.get(id).then(function(b){
            if(!b || !b.size || b.size > MEDIA_ONE_MAX || bytes + b.size > MEDIA_ALL_MAX){ skipped++; return null; }
            /* 图片超过阈值 → 先压精度（压不动就用原图） */
            var p = (b.size > IMG_COMPRESS_OVER && typeof compressImageBlob === 'function')
              ? compressImageBlob(b).then(function(z){
                  if(z && z.blob && z.blob.size < b.size){
                    shrunk.push((b.size/1024/1024).toFixed(1) + 'MB→' + (z.blob.size/1024).toFixed(0) + 'KB');
                    return z.blob;
                  }
                  return b;
                }).catch(function(){ return b; })
              : Promise.resolve(b);
            return p.then(function(use){
              if(!use || use.size > MEDIA_ONE_MAX || bytes + use.size > MEDIA_ALL_MAX){ skipped++; return; }
              return blobToDataUrl(use).then(function(u){
                if(u){ out['ms:' + id] = u; bytes += u.length; } else skipped++;
              }).catch(function(){ skipped++; });
            });
          }).catch(function(){ skipped++; }).then(next, next);
        }catch(e){ skipped++; next(); }
      })();
    });
  }
  /* 落本机：把 __media__ 里的素材写回 IndexedDB。cb(写入个数) */
  function restoreMedia(items, cb){
    var raw = items && items[MEDIA_KEY];
    if(!raw || !window.MediaStore || typeof MediaStore.put !== 'function'){
      if(cb) cb(0); return Promise.resolve(0);
    }
    var map = null;
    try{ map = JSON.parse(raw); }catch(e){ map = null; }
    var keys = map ? Object.keys(map) : [];
    if(!keys.length){ if(cb) cb(0); return Promise.resolve(0); }
    var q = Promise.resolve(0);
    keys.forEach(function(k){
      q = q.then(function(n){
        var blob = dataUrlToBlob(map[k]);
        if(!blob) return n;
        return MediaStore.put(String(k).slice(3), blob).then(function(){ return n + 1; })
                 .catch(function(){ return n; });
      });
    });
    return q.then(function(n){ if(cb) cb(n); return n; });
  }

  var CloudSync = {
    SLOT_DEF: SLOT_DEF,
    MEDIA_KEY: MEDIA_KEY,
    packMedia: packMedia,
    restoreMedia: restoreMedia,
    slot: null,
    def: null,
    el: null,
    st: { connected:false, live:null, draft:null, rev:null },

    /* slots 可以是一个字符串，也可以是数组（多于一个时面板上会出现下拉切换） */
    mount: function(slots){
      if(!window.Net){ console.warn('[CloudSync] 页面没引 net-client.js'); return CloudSync; }
      if(!Array.isArray(slots)) slots = [slots];
      slots = slots.filter(function(s){ return !!SLOT_DEF[s]; });
      if(!slots.length){ console.warn('[CloudSync] 没有有效槽位'); return CloudSync; }
      CloudSync.slots = slots;
      CloudSync.slot  = slots[0];
      CloudSync.def   = SLOT_DEF[slots[0]];
      CloudSync.build();
      CloudSync.connect();
      return CloudSync;
    },

    switchTo: function(slot){
      if(!SLOT_DEF[slot]) return;
      CloudSync.slot = slot;
      CloudSync.def  = SLOT_DEF[slot];
      CloudSync.st.live = null; CloudSync.st.draft = null; CloudSync.st.rev = null;
      var t = document.getElementById('cs-slot');
      if(t) t.textContent = '· ' + CloudSync.def.name;
      var sel = document.getElementById('cs-sel');
      if(sel) sel.value = slot;
      CloudSync.paint();
      if(CloudSync.st.connected) CloudSync.refresh();
    },

    /* ---------- 界面 ---------- */
    build: function(){
      if(CloudSync.el) return;
      var selHtml = '';
      if(CloudSync.slots.length > 1){
        selHtml = '<select id="cs-sel" style="width:100%;margin-bottom:8px;padding:7px 8px;border-radius:8px;' +
          'border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#f2eefc;' +
          'font-size:13px;font-family:inherit;">' +
          CloudSync.slots.map(function(s){ return '<option value="' + s + '">' + SLOT_DEF[s].name + '</option>'; }).join('') +
          '</select>';
      }
      var box = document.createElement('div');
      box.id = 'cloud-sync-box';
      box.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;width:264px;' +
        'font-family:-apple-system,"Microsoft YaHei",sans-serif;color:#f2eefc;' +
        'background:rgba(26,21,48,.94);border:1px solid rgba(180,154,224,.35);' +
        'border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.45);overflow:hidden;backdrop-filter:blur(12px);';
      box.innerHTML =
        '<div id="cs-head" style="display:flex;align-items:center;gap:6px;padding:9px 12px;cursor:pointer;' +
          'background:rgba(180,154,224,.16);font-size:13px;font-weight:700;">' +
          '<span>☁️ 云端同步</span>' +
          '<span id="cs-slot" style="font-size:11px;font-weight:400;opacity:.8"></span>' +
          '<span id="cs-fold" style="margin-left:auto;font-size:11px;opacity:.7">收起</span>' +
        '</div>' +
        '<div id="cs-body" style="padding:10px 12px;">' +
          selHtml +
          '<div id="cs-state" style="font-size:12px;line-height:1.7;color:#9d94bb;min-height:34px"></div>' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<button id="cs-pull" style="flex:1;padding:8px 4px;border:0;border-radius:9px;cursor:pointer;' +
              'font-size:13px;font-weight:700;background:rgba(255,255,255,.12);color:#f2eefc;">⬇️ 拉取线上</button>' +
            '<button id="cs-push" style="flex:1;padding:8px 4px;border:0;border-radius:9px;cursor:pointer;' +
              'font-size:13px;font-weight:700;background:linear-gradient(135deg,#b49ae0,#7fc4e8);color:#fff;">☁️ 提交</button>' +
          '</div>' +
          '<div id="cs-note" style="font-size:11px;color:#9d94bb;margin-top:7px;line-height:1.5">' +
            '提交后进草稿区，等陛下在「后端管理引擎」发布</div>' +
        '</div>';
      document.body.appendChild(box);
      CloudSync.el = box;

      document.getElementById('cs-slot').textContent = '· ' + CloudSync.def.name;
      document.getElementById('cs-head').onclick = function(){
        var b = document.getElementById('cs-body');
        var hidden = b.style.display === 'none';
        b.style.display = hidden ? '' : 'none';
        document.getElementById('cs-fold').textContent = hidden ? '收起' : '展开';
      };
      document.getElementById('cs-pull').onclick = function(){ CloudSync.pull(); };
      document.getElementById('cs-push').onclick = function(){ CloudSync.push(); };
      var sel = document.getElementById('cs-sel');
      if(sel) sel.onchange = function(){ CloudSync.switchTo(sel.value); };
      CloudSync.paint();
    },

    paint: function(){
      var el = document.getElementById('cs-state');
      if(!el) return;
      var s = CloudSync.st;
      if(!s.connected){ el.innerHTML = '<span style="color:#f09595">● 未连服务器</span><br>同步功能不可用'; return; }
      var html = '<span style="color:#81c784">● 已连接</span>　线上：' +
        (s.live ? ('v' + (s.rev && s.rev.live || 0) + ' · ' + (s.live.by || '?') + ' · ' + when(s.live.ts)) : '（空）');
      if(s.draft){
        html += '<br><span style="color:#ef9f27">● 有未发布草稿</span>：' + (s.draft.by || '?') + ' · ' + when(s.draft.ts);
      }
      el.innerHTML = html;
    },

    setBusy: function(txt){
      var b1 = document.getElementById('cs-pull'), b2 = document.getElementById('cs-push');
      if(!b1 || !b2) return;
      var busy = !!txt;
      b1.disabled = busy; b2.disabled = busy;
      b2.textContent = busy ? txt : '☁️ 提交';
      b2.style.opacity = busy ? .7 : 1;
    },

    /* ---------- 连接与状态 ---------- */
    connect: function(){
      Net.on('disconnect', function(){ CloudSync.st.connected = false; CloudSync.paint(); });
      Net.connect().then(function(){
        CloudSync.st.connected = true; CloudSync.paint(); CloudSync.refresh();
      }).catch(function(){
        CloudSync.st.connected = false; CloudSync.paint();
      });
    },

    /* 拉一次云端状态（不写本地），cb(是否成功) */
    refresh: function(cb){
      if(!CloudSync.slot) { if(cb) cb(false); return; }
      var done = false;
      var un = Net.on('assetData', function(m){
        if(done) return; done = true; un();
        var s = m.slots && m.slots[CloudSync.slot];
        if(s){ CloudSync.st.live = s.live; CloudSync.st.draft = s.draft; CloudSync.st.rev = s.rev; CloudSync.paint(); }
        if(cb) cb(true);
      });
      Net.assetPull(CloudSync.slot);
      setTimeout(function(){ if(!done){ done = true; un(); if(cb) cb(false); } }, 8000);
    },

    /* ---------- 拉取线上 → 覆盖本机 ---------- */
    pull: function(){
      if(!CloudSync.st.connected){ alert('还没连上服务器，先确认联机服务是开的'); return; }
      CloudSync.setBusy('拉取中');
      var done = false;
      var un = Net.on('assetData', function(m){
        if(done) return; done = true; un(); CloudSync.setBusy('');
        var s = m.slots && m.slots[CloudSync.slot];
        if(!s || !s.items){ alert('云端这个槽位还没有发布过内容，去让陛下先发布一份'); return; }
        /* __media__ 是随配置一起下发的素材本体（PNG/视频），要写进 IndexedDB 而不是 localStorage */
        var keys = Object.keys(s.items).filter(function(k){ return k !== MEDIA_KEY; });
        var nMedia = (s.items[MEDIA_KEY] ? 1 : 0);
        var who = (s.live && s.live.by) || '?';
        if(!confirm('用云端版本覆盖本机？\n\n' + keys.join('\n') +
            (nMedia ? '\n＋ 随配置一起的素材图（写进本机素材库）' : '') +
            '\n\n作者：' + who + '　时间：' + when(s.live && s.live.ts) +
            '\n大小：' + fmtSize(s.live && s.live.bytes) +
            '\n\n⚠️ 本机同名数据会被替换，确定继续？')) return;
        var fail = 0;
        keys.forEach(function(k){
          try{ localStorage.setItem(k, s.items[k]); }catch(e){ fail++; }
        });
        if(fail){ alert('有 ' + fail + ' 项写入失败（可能是本机存储空间不够）'); return; }
        restoreMedia(s.items, function(n){
          alert('✅ 已写入本机 ' + keys.length + ' 项' + (n ? '，外加 ' + n + ' 个素材图' : '') +
                '\n\n页面即将刷新加载云端内容');
          location.reload();
        });
      });
      Net.assetPull(CloudSync.slot);
      setTimeout(function(){ if(!done){ done = true; un(); CloudSync.setBusy(''); alert('拉取超时，服务器可能没开'); } }, 10000);
    },

    /* ---------- 提交本机 → 云端草稿区 ---------- */
    askKey: function(){
      var k = prompt('请输入后台口令（找陛下要一次，输完本机就记住了）：', '');
      if(k === null) return false;
      k = String(k).trim();
      if(!k){ alert('口令不能为空'); return false; }
      Net.setAdminKey(k);
      var a = prompt('你的署名（会记进云端日志，出事好查是谁改的）：', Net.author() || '');
      if(a !== null) Net.setAuthor(String(a).trim());
      return true;
    },

    push: function(){
      if(!CloudSync.st.connected){ alert('还没连上服务器，先确认联机服务是开的'); return; }
      if(!Net.adminKey && !CloudSync.askKey()) return;
      var items = collect(CloudSync.slot);
      var keys = Object.keys(items);
      if(!keys.length){ alert('本机这个槽位还没有数据，先做点东西再提交吧'); return; }
      /* 先把本机素材库里的 PNG / 视频打包进来 —— 不打包的话别人拉下来只有布局、没有图 */
      CloudSync.setBusy('打包素材');
      packMedia(items).then(function(info){
        CloudSync.setBusy('');
        var size = (JSON.stringify(items) || '').length;
        var hasSrv = (JSON.stringify(items) || '').indexOf('srv:') >= 0;   // 服务器素材地址（/media/… 人人可看）
        if(!confirm('提交到云端草稿区：\n\n' + keys.join('\n') +
            (info.n ? '\n＋ 本机素材 ' + info.n + ' 个（' + fmtSize(info.bytes) + '，PNG/视频本体一起传）' : '') +
            (info.shrunk && info.shrunk.length ? '\n\n🗜 已自动压精度 ' + info.shrunk.length + ' 张：' + info.shrunk.join('、') + '\n（原始高清素材还在陛下本机，云端这份是压过的）' : '') +
            '\n\n署名：' + (Net.author() || '（没填）') +
            '\n大小：' + fmtSize(size) +
            (info.n ? '\n\n✅ 素材会和配置一起走：别的电脑「拉取线上」后图也在，不用各自重传。' : '') +
            (info.skipped ? '\n\n⚠️ 有 ' + info.skipped + ' 个素材太大或读不出来，没打包进去\n（单个上限 12MB、整批上限 24MB；超大视频建议走「☁️ 传到服务器」）' : '') +
            (hasSrv ? '\n\n✅ 含服务器素材（/media/…），玩家边下边播，不用等。' : '') +
            (size > 8 * 1024 * 1024 ? '\n\n⚠️ 超过 8MB，可能很慢，建议先清理无用素材' : '') +
            '\n\n提交后要等陛下发布才会全服生效。确定吗？')) return;

        CloudSync.setBusy('检查版本');
        CloudSync.refresh(function(ok){
          if(!ok){ CloudSync.setBusy(''); alert('连不上服务器，稍后再试'); return; }
          CloudSync.doPush(items);
        });
      });
    },

    doPush: function(items, force){
      var baseRev = (CloudSync.st.rev && CloudSync.st.rev.draft) || 0;
      CloudSync.setBusy('上传中');
      Net.assetPush({
        slot: CloudSync.slot, by: Net.author() || '匿名', items: items,
        baseRev: baseRev, force: !!force,
        onProgress: function(p){ CloudSync.setBusy('上传 ' + Math.round(p * 100) + '%'); },
      }).then(function(m){
        CloudSync.setBusy('');
        alert('✅ 已提交到云端草稿区（' + fmtSize(m.bytes) + '）\n\n等陛下在「后端管理引擎」点「发布」后全服生效。');
        CloudSync.refresh();
      }).catch(function(e){
        CloudSync.setBusy('');
        if(e.conflict){
          if(confirm('⚠️ ' + e.message + '\n\n如果你确定要覆盖对方那版，点确定。')){
            CloudSync.doPush(items, true);
          }
        } else {
          alert('提交失败：' + e.message);
        }
      });
    },
  };

  window.CloudSync = CloudSync;
})();
