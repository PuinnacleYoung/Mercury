const fs = require('fs');
const path = require('path');
const files = [
  path.resolve(__dirname, '..', 'src', 'index.html'),
  path.resolve(__dirname, '..', 'src', '地图编辑引擎.html'),
  path.resolve(__dirname, '..', 'src', 'NPC编辑引擎.html')
];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m, i = 0, ok = true;
  while ((m = re.exec(html))) {
    if (m[1].length < 20) continue;
    i++;
    try { new Function(m[1]); } catch (e) { ok = false; console.log(f + ' script #' + i + ' ERROR:', e.message); }
  }
  console.log(f, '→ scanned', i, 'scripts,', ok ? 'ALL OK' : 'HAS ERROR');
}

