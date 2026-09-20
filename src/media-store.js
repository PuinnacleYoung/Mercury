/* 拾光·澈屿 · 大文件仓库（IndexedDB）
   ------------------------------------------------------------------
   localStorage 每个源只有约 5MB，地图数据本身（合成背景 PNG）就已经很占地方，
   MP4 动辄几 MB ~ 几十 MB，塞进 localStorage 必炸（QuotaExceededError）。
   所以视频这类大块头单独存 IndexedDB：地图数据里只留一个 mediaId 字符串，
   真正的 Blob 住在这里。编辑器 / 游戏 / 数据恢复共用这一份。

   用法：
     await MediaStore.put(id, blob)      // 存（同名覆盖）
     await MediaStore.get(id)            // 取 Blob
     await MediaStore.url(id)            // 取可直接喂给 <video src> 的 objectURL（同 id 复用）
     MediaStore.peek(id)                 // 已经取过就同步返回 URL，否则 ''
     MediaStore.del(id)                  // 删（并回收 URL）
     MediaStore.keys()                   // 列出所有 id
     MediaStore.estimate()               // 浏览器给的配额估算（可能不支持 → null）
*/
(function(g){
  var DB='shuguang_media', STORE='files', VER=1;
  var _db=null, _opening=null;
  var _urls = Object.create(null);          // id -> objectURL（复用，避免反复 create/revoke）

  function open(){
    if(_db) return Promise.resolve(_db);
    if(_opening) return _opening;
    _opening = new Promise(function(res,rej){
      var rq;
      try{ rq = indexedDB.open(DB, VER); }
      catch(e){ rej(e); return; }
      rq.onupgradeneeded = function(){
        var db = rq.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      rq.onsuccess = function(){ _db = rq.result; res(_db); };
      rq.onerror   = function(){ rej(rq.error || new Error('IndexedDB 打开失败')); };
      rq.onblocked = function(){ rej(new Error('IndexedDB 被其他标签页占用')); };
    });
    _opening.catch(function(){ _opening = null; });   // 失败了允许下次重试
    return _opening;
  }

  function store(mode){
    return open().then(function(db){ return db.transaction(STORE, mode).objectStore(STORE); });
  }
  function wrap(rq){
    return new Promise(function(res,rej){
      rq.onsuccess = function(){ res(rq.result); };
      rq.onerror   = function(){ rej(rq.error || new Error('IndexedDB 操作失败')); };
    });
  }

  function put(id, blob){
    release(id);                             // 旧 URL 作废，否则拿到的是上一个视频
    return store('readwrite').then(function(st){ return wrap(st.put(blob, id)); })
                             .then(function(){ return id; });
  }
  function get(id){
    if(!id) return Promise.resolve(null);
    return store('readonly').then(function(st){ return wrap(st.get(id)); })
                            .then(function(v){ return v || null; });
  }
  function del(id){
    release(id);
    return store('readwrite').then(function(st){ return wrap(st.delete(id)); })
                             .then(function(){ return true; });
  }
  function keys(){
    return store('readonly').then(function(st){ return wrap(st.getAllKeys()); })
                            .then(function(a){ return a || []; });
  }
  /* 能直接喂给 <video src> 的 objectURL；同一个 id 永远复用同一条 URL */
  function url(id){
    if(!id) return Promise.resolve('');
    if(_urls[id]) return Promise.resolve(_urls[id]);
    return get(id).then(function(blob){
      if(!blob) return '';
      try{ var u = URL.createObjectURL(blob); _urls[id] = u; return u; }
      catch(e){ return ''; }
    }).catch(function(){ return ''; });
  }
  function peek(id){ return (id && _urls[id]) || ''; }
  function release(id){
    if(id && _urls[id]){ try{ URL.revokeObjectURL(_urls[id]); }catch(e){} delete _urls[id]; }
  }
  function estimate(){
    try{
      if(navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    }catch(e){}
    return Promise.resolve(null);
  }

  g.MediaStore = { put:put, get:get, del:del, url:url, peek:peek, release:release, keys:keys, estimate:estimate };
})(window);
