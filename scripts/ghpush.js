/* 走 GitHub Git Data API 推送（本机 git push over https 会被网络层掐断 / token 失效时的兜底）
   用法： node scripts/ghpush.js [分支名，默认 main]
   token 来源：环境变量 GH_TOKEN / GITHUB_TOKEN，或本机 gh_token.txt
   注意：只推工作区 HEAD 这一棵树的全部文件，不处理子模块与空目录。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = 'PuinnacleYoung/Mercury';
const BRANCH = process.argv[2] || 'main';
const API = 'https://api.github.com';
const ROOT = path.resolve(__dirname, '..');

function readToken(){
  if(process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  if(process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const home = require('os').homedir();
  const cands = [
    path.join(home, 'gh_token.txt'),
    path.join(home, '.workbuddy', 'gh_token.txt'),
    path.join(ROOT, '.local', 'gh_token.txt')
  ];
  for(const f of cands){
    try{ const s = fs.readFileSync(f, 'utf8').trim(); if(s) return s; }catch(e){}
  }
  throw new Error('找不到 GitHub token：请设置 GH_TOKEN 环境变量，或把 token 写进 gh_token.txt');
}
const TOKEN = readToken();
const HDR = { Authorization: 'token ' + TOKEN, Accept: 'application/vnd.github+json',
              'User-Agent': 'ghpush-script', 'Content-Type': 'application/json' };

async function api(method, url, body){
  const r = await fetch(API + url, { method, headers: HDR, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j = null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){}
  if(!r.ok){
    const msg = (j && j.message) ? j.message : txt.slice(0, 300);
    throw new Error(method + ' ' + url + ' → ' + r.status + ' ' + msg);
  }
  return j;
}

function sh(cmd, args){ return execFileSync(cmd, args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); }

(async()=>{
  // 1) 远端当前分支指向的 commit
  const ref = await api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  console.log('远端 ' + BRANCH + ' = ' + baseSha.slice(0, 8));

  // 2) 本地 HEAD 的全部文件
  const out = sh('git', ['ls-tree', '-r', '-z', 'HEAD']).toString('utf8');
  const entries = out.split('\0').filter(Boolean).map(line=>{
    const tab = line.indexOf('\t');
    const meta = line.slice(0, tab).split(' ');
    return { mode: meta[0], type: meta[1], sha: meta[2], path: line.slice(tab + 1) };
  }).filter(e=>e.type === 'blob' && e.path !== '.gitignore' || e.type === 'blob');
  console.log('本地文件 ' + entries.length + ' 个，逐个上传 blob…');

  // 3) 建 blob（内容用 base64，二进制也安全）
  const tree = [];
  let done = 0;
  for(const e of entries){
    const abs = path.join(ROOT, e.path);
    if(!fs.existsSync(abs)){ console.log('  跳过（工作区无此文件）' + e.path); continue; }
    const content = fs.readFileSync(abs).toString('base64');
    const b = await api('POST', `/repos/${REPO}/git/blobs`, { content, encoding: 'base64' });
    tree.push({ path: e.path.split(path.sep).join('/'), mode: e.mode, type: 'blob', sha: b.sha });
    if(++done % 10 === 0 || done === entries.length) console.log('  blob ' + done + '/' + entries.length);
  }

  // 4) 建 tree
  const t = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: baseSha, tree });
  // 5) 建 commit
  const msg = sh('git', ['log', '-1', '--pretty=%B']).toString('utf8').trim();
  const c = await api('POST', `/repos/${REPO}/git/commits`, { message: msg, tree: t.sha, parents: [baseSha] });
  // 6) 移动分支指针
  await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: c.sha, force: false });

  console.log('\n✅ 已推送 ' + c.sha.slice(0, 8) + ' → ' + BRANCH);
  console.log('   https://github.com/' + REPO + '/commit/' + c.sha);
})().catch(e=>{ console.error('❌ ' + e.message); process.exit(1); });
