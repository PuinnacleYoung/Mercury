/* 扫描 src/ 下所有 HTML 内联 <script> 的语法（用 new Function 做一次解析） */
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '..', 'src');

const files = fs.readdirSync(SRC)
  .filter(n => n.endsWith('.html'))
  .map(n => path.join(SRC, n))
  .sort();

let bad = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m, i = 0, ok = true;
  while ((m = re.exec(html))) {
    if (m[1].length < 20) continue;
    i++;
    try { new Function(m[1]); }
    catch (e) { ok = false; bad++; console.log('  x ' + path.basename(f) + ' script #' + i + ': ' + e.message); }
  }
  console.log((ok ? '[OK] ' : '[ERR] ') + path.basename(f) + ' -> ' + i + ' scripts');
}
console.log(bad ? '\n[FAIL] ' + bad + ' error(s)' : '\n[PASS] all ' + files.length + ' pages');
process.exit(bad ? 1 : 0);
