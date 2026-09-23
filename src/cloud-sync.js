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

  var CloudSync = {
    SLOT_DEF: SLOT_DEF,
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
        var keys = Object.keys(s.items);
        var who = (s.live && s.live.by) || '?';
        if(!confirm('用云端版本覆盖本机？\n\n' + keys.join('\n') +
            '\n\n作者：' + who + '　时间：' + when(s.live && s.live.ts) +
            '\n大小：' + fmtSize(s.live && s.live.bytes) +
            '\n\n⚠️ 本机同名数据会被替换，确定继续？')) return;
        var fail = 0;
        keys.forEach(function(k){
          try{ localStorage.setItem(k, s.items[k]); }catch(e){ fail++; }
        });
        if(fail){ alert('有 ' + fail + ' 项写入失败（可能是本机存储空间不够）'); return; }
        alert('✅ 已写入本机 ' + keys.length + ' 项，页面即将刷新加载云端内容');
        location.reload();
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
      var raw = JSON.stringify(items);
      var size = raw.length;
      var hasMedia = raw.indexOf('ms:') >= 0;   // 含 IndexedDB 素材引用（视频/大图 —— 只有本机能看）
      var hasSrv   = raw.indexOf('srv:') >= 0;  // 含服务器素材地址（/media/xxx.mp4 —— 所有人可看）
      if(!confirm('提交到云端草稿区：\n\n' + keys.join('\n') +
          '\n\n署名：' + (Net.author() || '（没填）') +
          '\n大小：' + fmtSize(size) +
          (hasMedia ? '\n\n⚠️ 里面有视频/大素材：云端只同步「配置」（位置、时长、层级），\n视频本体存在你这台电脑的 IndexedDB 里，别的电脑要自己再传一次\n（想要所有人都看到，点素材下面的「☁️ 传到服务器」）。' : '') +
          (hasSrv ? '\n\n✅ 视频已传到服务器（/media/…），玩家边下边播，不用等。' : '') +
          (size > 8 * 1024 * 1024 ? '\n\n⚠️ 超过 8MB，可能很慢，建议先清理无用素材' : '') +
          '\n\n提交后要等陛下发布才会全服生效。确定吗？')) return;

      CloudSync.setBusy('检查版本');
      CloudSync.refresh(function(ok){
        if(!ok){ CloudSync.setBusy(''); alert('连不上服务器，稍后再试'); return; }
        CloudSync.doPush(items);
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
