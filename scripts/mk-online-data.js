/* 把「数据备份与迁移」导出的 JSON 备份 → 打包成线上数据包 src/online-data.json
   用法：
     node scripts/mk-online-data.js "D:/projects/q版换装小游戏/备份_从xxx导出.json"
     node scripts/mk-online-data.js <备份.json> --all     # 连服装/塔罗/账号一起打包
   默认只打「地图数据（game_maps）」—— 背包最小、更新最快。
   打包完记得：升 sw.js 的 CACHE 版本 + 用 ghpush.js 推送，线上才能拉到。 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const src = argv.find(a => !a.startsWith('--'));
const all = argv.includes('--all');
if (!src) { console.error('用法: node scripts/mk-online-data.js <备份.json> [--all]'); process.exit(1); }

const raw = fs.readFileSync(src, 'utf8');
const o = JSON.parse(raw);
const data = (o && o.data && typeof o.data === 'object') ? o.data : o;
if (!data || typeof data !== 'object') { console.error('备份格式不认识（找不到 data）'); process.exit(1); }

const keep = all ? Object.keys(data) : Object.keys(data).filter(k => k === 'game_maps');
if (!keep.length) { console.error('备份里没有 game_maps，试试 --all'); process.exit(1); }

const packData = {};
keep.forEach(k => { packData[k] = data[k]; });

const out = {
  _meta: {
    app: 'q版换装小游戏',
    kind: 'online-data',
    ver: 1,
    source: path.basename(src),
    exportedAt: (o && o._meta && o._meta.exportedAt) || null,
    fromOrigin: (o && o._meta && o._meta.origin) || null,
    builtAt: new Date().toISOString(),
    keys: keep
  },
  data: packData
};

const dest = path.join(__dirname, '..', 'src', 'online-data.json');
const json = JSON.stringify(out);
fs.writeFileSync(dest, json, 'utf8');

const mb = s => (Buffer.byteLength(s, 'utf8') / 1024 / 1024).toFixed(2) + 'MB';
console.log('✅ 已生成 ' + dest);
keep.forEach(k => console.log('   · ' + k + '  ' + mb(typeof packData[k] === 'string' ? packData[k] : JSON.stringify(packData[k]))));
console.log('   合计 ' + mb(json));
console.log('下一步：升 src/sw.js 的 CACHE 版本，再跑 ghpush.js 推送。');
