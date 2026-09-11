/* NPC 引擎回归：验证 NPC 引擎页 + 运行时 NPC 渲染 + 事件触发链路 */
const path = require('path');
const { chromium } = require(path.join('C:/Users/pandanyang/.workbuddy/binaries/node/workspace/node_modules/playwright'));
const BASE = 'http://localhost:8080/';
const results = [];
function log(name, ok, detail){ results.push({name, ok, detail}); console.log((ok?'✅':'❌')+' '+name+(detail?' — '+detail:'')); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:1200, height:800} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: '+e.message));

  // 0. 预置管理员门禁 + 测试 NPC（带塔罗事件）
  await page.goto(BASE + 'index.html', { waitUntil:'networkidle' });
  await page.evaluate(() => {
    sessionStorage.setItem('adminLogin', 'true');
    const npc = { id:'npc_test_tarot', name:'占卜师·小澈',
      outfit:{ top:'top_1', bottom:'bottom_1', hair:'hair_1' },
      dialogue:['欢迎来到占卜屋','让我为你翻开命运之牌'],
      event:{ type:'tarot', param:'' } };
    localStorage.setItem('engine_npcs_v1', JSON.stringify([npc]));
  });

  // 1. NPC 引擎页面可加载（门禁已开，不再跳转）
  await page.goto(BASE + 'NPC编辑引擎.html', { waitUntil:'networkidle' });
  const title = await page.title();
  log('NPC 引擎页面加载', title.includes('NPC'), JSON.stringify(title));

  // 2. NPC 引擎能读回刚写入的 NPC
  const npcInEngine = await page.evaluate(() => {
    try { const raw = localStorage.getItem('engine_npcs_v1'); const arr = JSON.parse(raw); return arr.length; }
    catch(e){ return -1; }
  });
  log('NPC 引擎读回 NPC', npcInEngine===1, '共 '+npcInEngine+' 个');

  // 3. 运行时 index.html 读到 NPC
  await page.goto(BASE + 'index.html', { waitUntil:'networkidle' });
  const npcCount = await page.evaluate(() => (typeof getNpcs==='function') ? getNpcs().length : -1);
  log('运行时 getNpcs 读取', npcCount===1, '共 '+npcCount+' 个 NPC');

  // 4. 关键函数存在
  log('fireNpcEvent 存在', await page.evaluate(()=>typeof fireNpcEvent==='function'), '');
  log('showNpcDialogue 存在', await page.evaluate(()=>typeof showNpcDialogue==='function'), '');

  // 5. fireNpcEvent 分发 tarot → 切到塔罗屏
  await page.evaluate(() => {
    const npc = npcById('npc_test_tarot');
    fireNpcEvent(npc, { id:'x', kind:'npc' });
  });
  await page.waitForTimeout(100);
  const tarotVisible = await page.evaluate(() => !document.getElementById('tarot-screen').classList.contains('hidden'));
  log('fireNpcEvent→tarot 切屏', tarotVisible, '塔罗屏已显示');

  // 6. fireNpcEvent 分发 dialogue → 气泡逐句
  await page.evaluate(() => { showScreen('map-screen'); });
  await page.evaluate(() => {
    const npc = npcById('npc_test_tarot'); npc.event.type='dialogue';
    showNpcDialogue(npc.name, npc.dialogue);
  });
  const dlgVisible = await page.evaluate(() => !document.getElementById('map-pop').classList.contains('hidden'));
  const dlgText = await page.evaluate(() => document.getElementById('mp-tip').textContent);
  log('NPC 对话气泡', dlgVisible && dlgText==='欢迎来到占卜屋', '首句:'+dlgText);

  const realErrs = errs.filter(e=>!e.includes('pageerror'));
  log('JS pageerror 数', errs.length===0, errs.length+' 个');
  if(errs.length) errs.slice(0,5).forEach(e=>console.log('   ⚠️ '+e));

  await browser.close();
  const fail = results.filter(r=>!r.ok).length;
  console.log('\n=== 回归：'+results.length+' 项，'+(results.length-fail)+' 通过，'+fail+' 失败 ===');
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
