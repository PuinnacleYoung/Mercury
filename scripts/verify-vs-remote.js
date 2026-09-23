/* ============================================================
   校验本地工作区是否与 GitHub 远端 main 分支「逐字节一致」
   ------------------------------------------------------------
   原理：把本地每个文件算成 git blob 的 sha1（sha1("blob 长度\0" + 内容)），
         再和远端最新 commit 的 tree 里记录的 blob sha 逐个比对。
         比"看文件大小 / 看修改时间"靠谱一万倍。

   用法（在仓库根目录跑）：
     node scripts/verify-vs-remote.js
     node scripts/verify-vs-remote.js D:/其它路径
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] || process.cwd();
const API = 'https://api.github.com/repos/PuinnacleYoung/Mercury/git/trees/main?recursive=1';

function gitBlobSha(file) {
  const buf = fs.readFileSync(file);
  const head = Buffer.from('blob ' + buf.length + '\0', 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([head, buf])).digest('hex');
}

(async () => {
  const res = await fetch(API, { headers: { 'User-Agent': 'mercury-verify' } });
  const json = await res.json();
  if (!json.tree) { console.log('API 返回异常（可能被限流）:', JSON.stringify(json).slice(0, 300)); return; }
  const blobs = json.tree.filter(t => t.type === 'blob');
  console.log('远端 main 最新 tree: ' + json.sha.slice(0, 7) + '，文件数 ' + blobs.length);
  console.log('本地目录: ' + ROOT + '\n');

  let same = 0; const diff = [], missing = [];
  for (const b of blobs) {
    const f = path.join(ROOT, b.path);
    if (!fs.existsSync(f)) { missing.push(b.path); continue; }
    if (gitBlobSha(f) === b.sha) same++; else diff.push(b.path);
  }
  console.log('完全一致: ' + same);
  console.log('内容不同: ' + diff.length + (diff.length ? '\n  ' + diff.join('\n  ') : ''));
  console.log('本地缺失: ' + missing.length + (missing.length ? '\n  ' + missing.join('\n  ') : ''));
  console.log('\n结论: ' + (diff.length === 0 && missing.length === 0
    ? '✅ 本地与远端 main 逐字节一致（拉齐了）'
    : '⚠️ 有 ' + (diff.length + missing.length) + ' 处差异——若这些文件正是你刚改的，说明是本地未推送改动，不是没拉齐'));
})();
