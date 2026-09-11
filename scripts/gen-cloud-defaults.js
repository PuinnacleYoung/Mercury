/* 生成 src/cloud-defaults.json —— 「云端默认数据」快照
   素体/动画走内置出厂（legacy-body-v4.js），其余留空等管理员在页面里上传。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

const g = {};
new Function('window', fs.readFileSync(path.join(SRC,'legacy-body-v4.js'),'utf8'))(g);
const V4 = g.LegacyBodyV4;
if(!V4) { console.error('legacy-body-v4.js 没解析出 LegacyBodyV4'); process.exit(1); }

const out = {
  _meta: {
    app: 'q版换装小游戏',
    ver: 1,
    note: '云端默认数据快照 · 数据恢复工具读取此文件把本机数据恢复成官方默认',
    updatedAt: new Date().toISOString(),
    source: 'legacy-body-v4.js (内置出厂)'
  },
  data: {
    engine_body_v4:  JSON.stringify(V4.build()),
    engine_anim_cfg: JSON.stringify(V4.anim)
  }
};
fs.writeFileSync(path.join(SRC,'cloud-defaults.json'), JSON.stringify(out), 'utf8');
const sz = fs.statSync(path.join(SRC,'cloud-defaults.json')).size;
console.log('cloud-defaults.json 已生成，', sz, 'bytes，键：', Object.keys(out.data).join(', '));
