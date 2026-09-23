/* 纯 Node 版 GitHub 推送（不依赖 git 子进程，规避 Windows spawnSync EBUSY）
   与 ghpush.js 区别：ghpush.js 用 execFileSync('git') 枚举文件/读message，
   但本机环境 spawnSync 恒 EBUSY，故本脚本直接解析 .git 对象。
   用法： node scripts/ghpush-pure.js [分支名，默认 main]
   token：环境变量 GH_TOKEN / GITHUB_TOKEN，或根目录 .local/gh_token.txt */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = 'PuinnacleYoung/Mercury';
const BRANCH = process.argv[2] || 'main';
const API = 'https://api.github.com';
const ROOT = path.resolve(__dirname, '..');
const GITDIR = path.join(ROOT, '.git');

function readToken(){
  if(process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  if(process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const cands = [
    path.join(require('os').homedir(), 'gh_token.txt'),
    path.join(ROOT, '.local', 'gh_token.txt'),
    path.join(ROOT, '.local', 'github-token.txt')
  ];
  for(const f of cands){
    try{ const s = fs.readFileSync(f, 'utf8'); const m = s.match(/TOKEN=(\S+)/); if(m) return m[1].trim(); if(s.trim()) return s.trim(); }catch(e){}
  }
  throw new Error('找不到 GitHub token');
}
const TOKEN = readToken();
const HDR = { Authorization: 'token ' + TOKEN, Accept: 'application/vnd.github+json',
              'User-Agent': 'ghpush-pure', 'Content-Type': 'application/json' };

async function api(method, url, body){
  const r = await fetch(API + url, { method, headers: HDR, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j = null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){}
  if(!r.ok){ throw new Error(method + ' ' + url + ' → ' + r.status + ' ' + ((j&&j.message)||txt.slice(0,300))); }
  return j;
}

// ---- git object 读取（loose + pack）----
function readLoose(sha){
  const p = path.join(GITDIR, 'objects', sha.slice(0,2), sha.slice(2));
  if(fs.existsSync(p)){
    const buf = zlib.inflateSync(fs.readFileSync(p));
    const nul = buf.indexOf(0);
    const [type] = buf.slice(0, nul).toString().split(' ');
    return { type, body: buf.slice(nul+1) };
  }
  return null;
}

let _packs = null;
function packs(){
  if(_packs) return _packs;
  _packs = [];
  const dir = path.join(GITDIR, 'objects', 'pack');
  if(!fs.existsSync(dir)) return _packs;
  for(const f of fs.readdirSync(dir)) if(f.endsWith('.idx')){
    _packs.push({ idx: fs.readFileSync(path.join(dir, f)), pack: fs.readFileSync(path.join(dir, f.replace(/\.idx$/,'.pack'))) });
  }
  return _packs;
}
function applyDelta(base, delta){
  let i = 0;
  const rv = () => { let r=0,s=0; for(;;){ const b=delta[i++]; r|=(b&0x7f)<<s; s+=7; if(!(b&0x80)) return r; } };
  rv(); // base size
  const resultSize = rv();
  const out = Buffer.alloc(resultSize); let o = 0;
  while(i < delta.length){
    const op = delta[i++];
    if(op & 0x80){ // copy from base
      let off=0, len=0;
      if(op&0x01) off|=delta[i++]; if(op&0x02) off|=delta[i++]<<8;
      if(op&0x04) off|=delta[i++]<<16; if(op&0x08) off|=delta[i++]<<24;
      if(op&0x10) len|=delta[i++]; if(op&0x20) len|=delta[i++]<<8;
      if(op&0x40) len|=delta[i++]<<16;
      if(len===0) len=0x10000;
      base.copy(out, o, off, off+len); o+=len;
    } else { // literal
      delta.copy(out, o, i, i+op); i+=op; o+=op;
    }
  }
  return out;
}

function parseObjAt(pack, off){
  let i=off, b=pack[i++];
  const type=(b>>4)&0x7;
  let size=b&0x0f, shift=4;
  while(b&0x80){ b=pack[i++]; size|=(b&0x7f)<<shift; shift+=7; }
  if(type===6){ // OFS_DELTA
    let c=pack[i++], rel=c&0x7f;
    while(c&0x80){ c=pack[i++]; rel=((rel+1)<<7)|(c&0x7f); }
    const base=parseObjAt(pack, off-rel);
    const delta=zlib.inflateSync(pack.slice(i));
    return { type: base.type, body: applyDelta(base.body, delta) };
  }
  if(type===7){ // REF_DELTA
    const baseSha=pack.slice(i, i+20).toString('hex'); i+=20;
    const baseObj=readObj(baseSha);
    const delta=zlib.inflateSync(pack.slice(i));
    return { type: baseObj.type, body: applyDelta(baseObj.body, delta) };
  }
  const names={1:'commit',2:'tree',3:'blob',4:'tag'};
  return { type: names[type]||('t'+type), body: zlib.inflateSync(pack.slice(i)) };
}

function findInPack(sha){
  const bin = Buffer.from(sha, 'hex');
  for(const {idx, pack} of packs()){
    // idx v2 布局：magic(4)+version(4)+fanout(1024)+sha表+crc表+offset表+大offset表
    if(idx.readUInt32BE(4) !== 2) continue;
    const fanout = 8;
    const cnt = (i)=>idx.readUInt32BE(fanout + i*4);
    const prev = bin[0]===0 ? 0 : cnt(bin[0]-1);
    const cur = cnt(bin[0]);
    if(cur<=prev) continue;
    const shaBase = fanout + 256*4;
    const total = cnt(255);
    const crcBase = shaBase + total*20;
    const offBase = crcBase + total*4;
    let lo=prev, hi=cur-1, found=-1;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      const s=idx.slice(shaBase+mid*20, shaBase+mid*20+20).toString('hex');
      if(s===sha){found=mid;break;} if(s<sha)lo=mid+1; else hi=mid-1;
    }
    if(found<0) continue;
    let off=idx.readUInt32BE(offBase+found*4);
    if(off & 0x80000000){
      const i64=off & 0x7fffffff;
      off=Number(idx.readBigUInt64BE(offBase+total*4+i64*8));
    }
    return parseObjAt(pack, off);
  }
  return null;
}
function readObj(sha){ return readLoose(sha) || findInPack(sha); }

function parseTree(body, prefix, out){
  let i=0;
  while(i<body.length){
    const sp=body.indexOf(0x20,i);
    const mode=body.slice(i,sp).toString();
    const nul=body.indexOf(0,sp);
    const name=body.slice(sp+1,nul).toString('utf8');
    const sha=body.slice(nul+1,nul+21).toString('hex');
    i=nul+21;
    const full=prefix?prefix+'/'+name:name;
    if(mode==='40000'){ const t=readObj(sha); if(t) parseTree(t.body, full, out); }
    else out.push({mode, sha, path: full});
  }
}

(async()=>{
  const ref = await api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  console.log('远端 ' + BRANCH + ' = ' + baseSha.slice(0,8));

  const headSha = fs.readFileSync(path.join(GITDIR, 'refs', 'heads', BRANCH), 'utf8').trim();
  const commit = readObj(headSha);
  if(!commit || commit.type!=='commit') throw new Error('无法解析本地 HEAD commit');
  const cmt = commit.body.toString();
  const treeSha = cmt.match(/^tree ([0-9a-f]{40})/m)[1];
  const msg = cmt.slice(cmt.indexOf('\n\n')+2).trim();
  console.log('本地 HEAD = ' + headSha.slice(0,8) + ' tree=' + treeSha.slice(0,8));

  const entries = [];
  parseTree(readObj(treeSha).body, '', entries);
  console.log('HEAD 树共 ' + entries.length + ' 个文件');

  const tree = [];
  let done = 0;
  for(const e of entries){
    const abs = path.join(ROOT, e.path.split('/').join(path.sep));
    if(!fs.existsSync(abs)){ console.log('  跳过(工作区无) ' + e.path); continue; }
    const content = fs.readFileSync(abs).toString('base64');
    const b = await api('POST', `/repos/${REPO}/git/blobs`, { content, encoding: 'base64' });
    tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: b.sha });
    if(++done % 20 === 0 || done === entries.length) console.log('  blob ' + done + '/' + entries.length);
  }

  const t = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: baseSha, tree });
  const c = await api('POST', `/repos/${REPO}/git/commits`, { message: msg, tree: t.sha, parents: [baseSha] });
  await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: c.sha, force: false });

  console.log('\n✅ 已推送 ' + c.sha.slice(0,8) + ' → ' + BRANCH);
  console.log('   https://github.com/' + REPO + '/commit/' + c.sha);
})().catch(e=>{ console.error('❌ ' + e.message); process.exit(1); });
