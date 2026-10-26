const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 30000 });
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'http://127.0.0.1:3027';
const fixture = path.resolve('app/dashboard-design-preview/page.tsx');
const originalNextEnv = fs.readFileSync('next-env.d.ts', 'utf8');
const originalConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
let server, browser, ownsFixture = false;
(async () => {
  if (fs.existsSync(fixture)) throw Error('Temporary fixture route already exists; refusing to overwrite it.');
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(fixture, 'export { default } from "@/scripts/fixtures/workspace-dashboard";\n');
  ownsFixture = true;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3027'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_DIST_DIR: '.next-dashboard-design', NODE_OPTIONS: '--max-old-space-size=8192', DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:55439/navigation_fixture', NEXT_PUBLIC_APP_URL: origin, APP_URL: origin, EMAIL_ENABLED: 'false' } });
  let logs = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-5000); });
  for (let attempt = 0; attempt < 120; attempt++) {
    try { const r = await fetch(origin + '/robots.txt'); if (r.ok) break; } catch {}
    if (attempt === 119) throw Error('Development server did not start: ' + logs);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  await page.route('**/api/**', route => route.fulfill({ json: { counts: {}, notifications: [], tickets: [], memberships: [], purchases: [], actions: [], profiles: [], data: [], summary: {availableBalance:0}, logs: [], items: [], tasks: [], roles: [], total: 0, active: 0, overdue: 0, blocked: 0, reviews: 0, completed: 0, workload: [], leads: 0, commissions: [], workspaces: [], subscription: null } }));
  const tabs = {admin:['overview','users','releases','revenue','support'],artist:['overview','releases','purchases','settings','support'],producer:['overview','catalog','sales','earnings','profile','upload','settings'],team:['overview','work','tasks','referral']};
  for (const [role, modules] of Object.entries(tabs)) for (const tab of modules) {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/dashboard-design-preview?role='+role+'&tab='+tab+'&module='+tab);
    await expect(page.locator('[data-dashboard-surface]')).toHaveCount(1);
    await expect(page.locator('[data-dashboard-content]')).toBeVisible();
    const panel=page.locator('[data-dashboard-surface] .dashboard-module-panel').first();
    if(await panel.count()) {
      await expect(panel).toHaveCSS('border-radius','12px');
      await expect(panel).toHaveCSS('background-color','rgb(20, 23, 29)');
      await expect(panel.locator('h2').first()).toHaveCSS('font-size','18px');
    }
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error(role+'/'+tab+' overflow '+width);
    }
    if(role==='producer'&&tab==='sales'&&await page.getByText('Unpaid purchase',{exact:true}).count())throw Error('Unpaid sale leaked');
    console.log('PASS shared design and responsive layout '+role+'/'+tab);
  }
  if (errors.length) throw Error(errors.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) {
    if (process.platform === 'win32') require('node:child_process').spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else server.kill('SIGTERM');
    server.stdout.destroy(); server.stderr.destroy(); server.unref();
  }
  if (ownsFixture && fs.existsSync(fixture) && fs.readFileSync(fixture, 'utf8') === 'export { default } from "@/scripts/fixtures/workspace-dashboard";\n') { fs.unlinkSync(fixture); fs.rmdirSync(path.dirname(fixture)); }
  if (ownsFixture) {
    if (fs.readFileSync('next-env.d.ts', 'utf8').includes('.next-dashboard-design/')) fs.writeFileSync('next-env.d.ts', originalNextEnv);
    const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
    const retained = config.include.filter(value => !value.startsWith('.next-dashboard-design/') || originalConfig.include.includes(value));
    if (retained.length !== config.include.length) fs.writeFileSync('tsconfig.json', JSON.stringify({ ...config, include: retained }, null, 2) + '\n');
  }
});
