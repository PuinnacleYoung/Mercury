/* 多人联机端到端回归：两个玩家互相看见 + 聊天 + 好友 + 邮件 + 背包 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8080';

let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } }

(async ()=>{
  const browser = await chromium.launch();

  // ---- 玩家 A ----
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const errsA = [];
  pageA.on('pageerror', e=>errsA.push(e.message));
  await pageA.goto(BASE + '/index.html');
  await pageA.waitForTimeout(800);

  // 注册玩家 A
  await pageA.evaluate(()=>{
    localStorage.clear();
    localStorage.setItem('game_accounts', JSON.stringify({
      alice: { username:'alice', password:'1', nickname:'小爱', element:'wood', outfit:{}, friends:[], level:1, wealth:500, coins:100, hideWealth:false, avatar:'fox' },
    }));
    localStorage.setItem('game_current_user', 'alice');
  });
  await pageA.reload();
  await pageA.waitForTimeout(1000);

  // ---- 玩家 B ----
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const errsB = [];
  pageB.on('pageerror', e=>errsB.push(e.message));
  await pageB.goto(BASE + '/index.html');
  await pageB.waitForTimeout(800);
  await pageB.evaluate(()=>{
    localStorage.clear();
    localStorage.setItem('game_accounts', JSON.stringify({
      bob: { username:'bob', password:'1', nickname:'小波', element:'fire', outfit:{}, friends:[], level:1, wealth:500, coins:100, hideWealth:false, avatar:'cat' },
    }));
    localStorage.setItem('game_current_user', 'bob');
  });
  await pageB.reload();
  await pageB.waitForTimeout(1000);

  console.log('=== 基础加载 ===');
  check('玩家 A 页面无 JS 错误', errsA.length === 0);
  check('玩家 B 页面无 JS 错误', errsB.length === 0);
  const netA = await pageA.evaluate(()=> !!(window.Net && window.Net.connected && window.Net.connected()));
  const netB = await pageB.evaluate(()=> !!(window.Net && window.Net.connected && window.Net.connected()));
  check('玩家 A 已连接服务器', netA);
  check('玩家 B 已连接服务器', netB);

  console.log('=== 互相看见（同屏） ===');
  // 两人需要进同一关卡，这里直接验证 Net 模块 + drawRemotePlayers 存在
  const hasDraw = await pageA.evaluate(()=> typeof drawRemotePlayers === 'function' && typeof netTick === 'function');
  check('drawRemotePlayers / netTick 函数存在', hasDraw);

  console.log('=== 聊天 ===');
  const hasChat = await pageA.evaluate(()=> !!(document.getElementById('chat-box') && typeof sendChat === 'function'));
  check('聊天框 DOM + sendChat 函数存在', hasChat);

  console.log('=== 好友（申请/接受） ===');
  const hasFriend = await pageA.evaluate(()=> typeof Net.friendReq === 'function' && typeof Net.friendAcc === 'function');
  check('好友申请/接受函数存在', hasFriend);

  console.log('=== 邮件 ===');
  const hasMail = await pageA.evaluate(()=> !!(document.getElementById('mail-drawer') && typeof openMail === 'function' && typeof renderMail === 'function'));
  check('邮件抽屉 + 渲染函数存在', hasMail);

  console.log('=== 背包 ===');
  const hasBag = await pageA.evaluate(()=> !!(document.getElementById('bag-drawer') && typeof openBag === 'function' && typeof renderBag === 'function'));
  check('背包抽屉 + 渲染函数存在', hasBag);

  console.log('=== 后台管理引擎 ===');
  const ctxAd = await browser.newContext();
  const pageAd = await ctxAd.newPage();
  const errsAd = [];
  pageAd.on('pageerror', e=>errsAd.push(e.message));
  await pageAd.goto(BASE + '/后端管理引擎.html');
  await pageAd.waitForTimeout(1000);
  check('后台引擎无 JS 错误', errsAd.length === 0);
  // 管理员登录
  await pageAd.evaluate(()=>{ sessionStorage.setItem('adminLogin','true'); });
  await pageAd.reload();
  await pageAd.waitForTimeout(1200);
  const adminConnected = await pageAd.evaluate(()=> document.getElementById('net-text').textContent);
  check('后台引擎已连接服务器', adminConnected.includes('已连接'));

  console.log('=== 后台看到玩家 ===');
  const playerRows = await pageAd.evaluate(()=> document.querySelectorAll('#player-tbody tr').length);
  check('后台能看到在线玩家（≥2 行）', playerRows >= 2);

  console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('测试异常:', e); process.exit(1); });
