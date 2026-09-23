/* 银行玩法端到端验证：银行引擎 + 游戏端 bank-screen + 地图补种 */
const pw = require('C:/Users/pandanyang/.workbuddy/binaries/node/versions/22.22.2-3/node_modules/@playwright/cli/node_modules/playwright-core');

const BASE = 'http://localhost:8080/';
const BANK_ENGINE = BASE + encodeURIComponent('银行引擎.html');
const GAME = BASE + 'index.html';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true, executablePath: 'C:/Users/pandanyang/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  /* ============ 1. 银行引擎 ============ */
  console.log('\n[1] 银行引擎验证');
  await page.goto(BANK_ENGINE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  ok('引擎标题正确', (await page.title()).includes('银行引擎'), await page.title());

  // 三页签
  const tabs = await page.$$eval('.tab-btn', els => els.map(e => e.textContent.trim()));
  ok('三页签存在(储蓄/借贷/股市)', tabs.some(t=>t.includes('储蓄')) && tabs.some(t=>t.includes('借贷')) && tabs.some(t=>t.includes('股市')), JSON.stringify(tabs));

  // 默认在储蓄页，应有 6 档
  const savingList = await page.$$eval('.list-row', els => els.length).catch(()=>0);
  ok('储蓄页渲染 6 档列表', savingList === 6, 'rows=' + savingList);
  // 用文本兜底：检查默认配置是否写入 localStorage 或已渲染
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('engine_bank_cfg') || 'null'));
  ok('localStorage 有默认配置', !!cfg && cfg.version === 1);
  ok('默认储蓄 6 档', cfg && Array.isArray(cfg.savings) && cfg.savings.length === 6, cfg && cfg.savings && cfg.savings.length);
  ok('默认借贷 4 档', cfg && Array.isArray(cfg.loans) && cfg.loans.length === 4, cfg && cfg.loans && cfg.loans.length);
  ok('默认股票 19 支', cfg && Array.isArray(cfg.stocks) && cfg.stocks.length === 19, cfg && cfg.stocks && cfg.stocks.length);

  // 切到股市页签，验证 19 支股票渲染
  await page.click('.tab-btn[data-tab="stock"]');
  await page.waitForTimeout(400);
  const stockRows = await page.$$eval('.list-row', els => els.length).catch(()=>-1);
  ok('股市页渲染 19 支股票列表', stockRows === 19, 'rows=' + stockRows);

  // 大热股标记
  const hotCount = await page.$$eval('.list-row .k', els => els.filter(e=>e.textContent.includes('🔥')).length).catch(()=>-1);
  ok('大热股标记存在(🔥)', hotCount > 0, 'hot=' + hotCount);

  /* ============ 2. 游戏端 bank-screen ============ */
  console.log('\n[2] 游戏端银行玩法验证');
  await page.goto(GAME, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  // 预置一个已登录账号 + currentUser，绕过登录 UI
  await page.evaluate(() => {
    const username = '__bank_test__';
    const accounts = JSON.parse(localStorage.getItem('game_accounts') || '{}');
    accounts[username] = {
      username, password: '1234', nickname: '银行测试', element: 'metal',
      outfit: {}, coins: 500, level: 1, wealth: 500, hideWealth: false,
      avatar: 'av1', jobs: {}, friends: []
    };
    localStorage.setItem('game_accounts', JSON.stringify(accounts));
    localStorage.setItem('game_current_user', username);
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // 确认已进入游戏（currentUser 已加载）
  const loggedIn = await page.evaluate(() => {
    try {
      return !!(currentUser && currentUser.username === '__bank_test__');
    } catch(e) { return false; }
  });
  ok('测试账号已登录', loggedIn);

  // 直接调用 enterBank 进入银行
  const enterOk = await page.evaluate(() => {
    if (typeof enterBank !== 'function') return 'no-enterBank';
    try { enterBank(); return 'ok'; } catch (e) { return 'err:' + e.message; }
  });
  ok('enterBank 函数存在并可调用', enterOk === 'ok', enterOk);
  await page.waitForTimeout(400);

  // bank-screen 是否显示
  const bankVisible = await page.evaluate(() => {
    const el = document.getElementById('bank-screen');
    return el ? (el.style.display !== 'none' ? 'shown' : el.style.display) : 'no-el';
  });
  ok('bank-screen 元素存在', bankVisible !== 'no-el');
  ok('bank-screen 已显示', bankVisible === 'shown' || bankVisible === '' || bankVisible === 'block', String(bankVisible));

  // 三页签
  const bankTabs = await page.$$eval('.bank-tab', els => els.map(e => e.textContent.trim()));
  ok('bank-screen 三页签存在', bankTabs.length === 3, JSON.stringify(bankTabs));

  // 钱包显示
  const coinText = await page.$eval('#bank-coin', e => e.textContent).catch(()=>null);
  ok('钱包金币显示', coinText !== null, String(coinText));

  // 储蓄档位渲染（默认在 saving 页）
  const savingCards = await page.$$eval('.bank-card', els => els.length);
  ok('储蓄页渲染档位卡片', savingCards >= 6, 'cards=' + savingCards);

  // 切到股市页
  await page.click('.bank-tab[data-tab="stock"]');
  await page.waitForTimeout(400);
  const stockTableRows = await page.$$eval('.stock-table tbody tr', els => els.length);
  ok('股市页 19 支股票表格', stockTableRows === 19, 'rows=' + stockTableRows);

  // 买入逻辑：给玩家充金币，买入 10 股
  await page.evaluate(() => {
    if (!profile) profile = ensureProfile();
    profile.currency.coin = 100000;
    if (typeof saveProfile === 'function') saveProfile(profile);
  });
  await page.click('.bank-tab[data-tab="stock"]');
  await page.waitForTimeout(300);
  const firstBuyInput = await page.$('.stock-table tbody tr [data-st-qty]');
  await firstBuyInput.fill('10');
  const firstBuyBtn = await page.$('.stock-table tbody tr [data-st-buy]');
  await firstBuyBtn.click();
  await page.waitForTimeout(300);
  const holdings = await page.evaluate(() => {
    const b = profile && profile.bank;
    return b && b.stocks ? b.stocks : [];
  });
  ok('买入后持仓增加', holdings.length === 1, 'holdings=' + holdings.length);
  if (holdings.length) ok('买入 10 股正确', holdings[0].shares === 10, 'shares=' + holdings[0].shares);

  // 卖出
  await page.click('.bank-tab[data-tab="stock"]');
  await page.waitForTimeout(300);
  const sellInput = await page.$('.stock-table tbody tr [data-st-qty]');
  await sellInput.fill('5');
  const sellBtn = await page.$('.stock-table tbody tr [data-st-sell]');
  await sellBtn.click();
  await page.waitForTimeout(300);
  const holdingsAfter = await page.evaluate(() => {
    const b = profile && profile.bank;
    return b && b.stocks ? b.stocks : [];
  });
  ok('卖出后持仓 5 股', holdingsAfter.length === 1 && holdingsAfter[0].shares === 5, 'shares=' + (holdingsAfter[0] && holdingsAfter[0].shares));

  /* ============ 3. 限购逻辑验证 ============ */
  console.log('\n[3] 限购逻辑验证（大热股每日限购）');
  // 给第一支股票设 dailyLimit=2，验证限购
  await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('engine_bank_cfg'));
    cfg.stocks[0].dailyLimit = 2;
    cfg.stocks[0].hot = true;
    localStorage.setItem('engine_bank_cfg', JSON.stringify(cfg));
    // 清空当前持仓和每日记录
    if (profile && profile.bank) { profile.bank.stocks = []; profile.bank.stockDaily = []; saveProfile(profile); }
  });
  // 重新进入银行（重新加载配置）
  await page.evaluate(() => { BANK_CFG = null; enterBank(); });
  await page.waitForTimeout(300);
  await page.click('.bank-tab[data-tab="stock"]');
  await page.waitForTimeout(300);
  // 诊断：检查股票表格渲染状态
  const diag = await page.evaluate(() => ({
    rows: document.querySelectorAll('.stock-table tbody tr').length,
    buyBtns: document.querySelectorAll('.stock-table tbody tr [data-st-buy]').length,
    firstRowHtml: (document.querySelector('.stock-table tbody tr')||{}).outerHTML ? document.querySelector('.stock-table tbody tr').outerHTML.slice(0,300) : 'NO-ROW',
  }));
  console.log('  诊断:', JSON.stringify(diag));
  // 第一支股票（限购2）买 3 股，应被拦
  await page.locator('.stock-table tbody tr [data-st-qty]').first().fill('3');
  await page.locator('.stock-table tbody tr [data-st-buy]').first().click();
  await page.waitForTimeout(300);
  const afterLimitBuy = await page.evaluate(() => {
    const b = profile && profile.bank;
    return b ? b.stocks.length : -1;
  });
  ok('限购：买3股被拦(持仓仍0)', afterLimitBuy === 0, 'holdings=' + afterLimitBuy);
  // 买 2 股（等于限购额度），应成功
  await page.click('.bank-tab[data-tab="stock"]');
  await page.waitForTimeout(300);
  await page.locator('.stock-table tbody tr [data-st-qty]').first().fill('2');
  await page.locator('.stock-table tbody tr [data-st-buy]').first().click();
  await page.waitForTimeout(300);
  const afterOkBuy = await page.evaluate(() => {
    const b = profile && profile.bank;
    return b && b.stocks.length ? b.stocks[0].shares : 0;
  });
  ok('限购：买2股成功(持仓2股)', afterOkBuy === 2, 'shares=' + afterOkBuy);
  // 再买 1 股（今日已买2，达上限），应被拦：检查买入按钮已 disabled
  await page.click('.bank-tab[data-tab="stock"]');
  await page.waitForTimeout(300);
  const buyBtnDisabled = await page.locator('.stock-table tbody tr [data-st-buy]').first().isDisabled();
  const afterThird = await page.evaluate(() => {
    const b = profile && profile.bank;
    return b && b.stocks.length ? b.stocks[0].shares : 0;
  });
  ok('限购：达上限后买入按钮 disabled', buyBtnDisabled === true, 'disabled=' + buyBtnDisabled);
  ok('限购：持仓仍 2 股', afterThird === 2, 'shares=' + afterThird);

  /* ============ 4. 地图补种 ============ */
  console.log('\n[4] 地图补种验证（华夏 → 京市 → 商政中心 → 银行）');
  const seed = await page.evaluate(() => {
    try {
      const d = ensureMaps();
      // 找华夏
      let huaxia = d.maps[d.rootMapId];
      const allMaps = Object.values(d.maps);
      huaxia = allMaps.find(m => m && /华夏/.test(m.name || '')) || huaxia;
      // 找京市
      const jing = allMaps.find(m => m && m.parent === (huaxia && huaxia.id) && /京市|京/.test(m.name || ''));
      // 找商政中心
      const center = jing ? allMaps.find(m => m && m.parent === jing.id && /商政中心/.test(m.name || '')) : null;
      // 找银行 tile
      const bankTile = center ? (center.entities || []).find(n => n && (n.panelId === 'bank' || n.panel === 'bank')) : null;
      return {
        huaxia: huaxia ? huaxia.name : null,
        jing: jing ? jing.name : null,
        center: center ? center.name : null,
        bankTile: bankTile ? bankTile.name : null,
      };
    } catch (e) { return { error: e.message }; }
  });
  ok('华夏节点存在', !!seed.huaxia, seed.huaxia);
  ok('京市节点存在', !!seed.jing, seed.jing);
  ok('商政中心关卡存在', !!seed.center, seed.center);
  ok('银行建筑 tile 存在', !!seed.bankTile, seed.bankTile);

  /* ============ 总结 ============ */
  console.log('\n========== 验证结果 ==========');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (errors.length) {
    console.log('运行时错误（可能无害）:');
    errors.slice(0, 10).forEach(e => console.log('  ! ' + e));
  }

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常:', e); process.exit(2); });
