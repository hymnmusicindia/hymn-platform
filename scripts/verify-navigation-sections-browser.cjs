const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 30000 });
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'http://127.0.0.1:3026';
const fixture = path.resolve('app/navigation-sections-preview/page.tsx');
const originalNextEnv = fs.readFileSync('next-env.d.ts', 'utf8');
const originalConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
let server, browser, ownsFixture = false;
(async () => {
  if (fs.existsSync(fixture)) throw Error('Temporary fixture route already exists; refusing to overwrite it.');
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(fixture, 'export { default } from "@/scripts/fixtures/navigation-sections";\n');
  ownsFixture = true;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3026'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_DIST_DIR: '.next-navigation-sections', NODE_OPTIONS: '--max-old-space-size=8192', DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:55439/navigation_fixture', NEXT_PUBLIC_APP_URL: origin, APP_URL: origin, EMAIL_ENABLED: 'false' } });
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
  await page.route('**/api/**', route => route.fulfill({ json: { items: [], tasks: [], roles: [], total: 0, active: 0, overdue: 0, blocked: 0, reviews: 0, completed: 0, workload: [], leads: 0, commissions: [], workspaces: [], subscription: null } }));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/navigation-sections-preview?mode=admin');
    await expect(page.locator('[data-admin-section]')).toHaveCount(6);
    await page.getByRole('link', { name: 'Finance', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Finance modules' })).toBeVisible();
    await expect(page.locator('[data-module-key]')).toHaveCount(5);
    await page.locator('[data-module-key=reconciliation]').click();
    await expect(page.getByRole('heading', { name: 'Reconciliation', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-module-key=revenue]')).toHaveAttribute('aria-current', 'page');
    await page.goto(origin + '/navigation-sections-preview?mode=admin&limited=1&tab=earnings-entry');
    await expect(page.locator('[data-admin-section]')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Platform & team', exact: true })).toHaveCount(0);
    for (const mode of ['customer', 'producer']) {
      await page.goto(origin + '/navigation-sections-preview?mode=' + mode + '&tab=earnings');
      await expect(page.locator('[data-selected-module]')).toHaveAttribute('data-fixture-ready', 'true');
      await expect(page.locator('[data-module-key=earnings]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('[data-module-key=payouts]')).toHaveAttribute('href', '/payout');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('hymn-reveal-service', { detail: 'Distribution' })));
      await expect(page.locator('[data-module-tabs] [data-guide-route="/distribution/start"]')).toBeVisible();
      await page.goto(origin + '/navigation-sections-preview?mode=' + mode + '&tab=settings');
      await expect(page.locator('[data-selected-module]')).toHaveAttribute('data-fixture-ready', 'true');
      await expect(page.locator('[data-module-key=referral]')).toBeVisible();
      await page.locator('[data-module-key=referral]').click();
      await expect(page.locator('[data-selected-module]')).toHaveText('referral');
      await page.locator('[data-module-key=support]').click();
      await expect(page.locator('[data-selected-module]')).toHaveText('support');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Creator horizontal overflow at ' + width);
    }
    await page.goto(origin + '/navigation-sections-preview?mode=team&module=work');
    await expect(page.locator('[data-module-key=work]')).toHaveAttribute('aria-current', 'page');
    await page.locator('[data-module-key=tasks]').click();
    await expect(page.getByRole('heading', { name: 'All Work', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
    await page.goto(origin + '/navigation-sections-preview?mode=team&module=referral');
    await expect(page.getByRole('button', { name: 'Get my referral link', exact: true })).toBeVisible();
    await expect(page.locator('[data-module-key=release-qc]')).toHaveCount(0);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Team horizontal overflow at ' + width);
    console.log('PASS merged admin/team/customer/producer navigation at width ' + width);
  }
  if (errors.length) throw Error(errors.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) {
    if (process.platform === 'win32') require('node:child_process').spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else server.kill('SIGTERM');
    server.stdout.destroy(); server.stderr.destroy(); server.unref();
  }
  if (ownsFixture && fs.existsSync(fixture) && fs.readFileSync(fixture, 'utf8') === 'export { default } from "@/scripts/fixtures/navigation-sections";\n') { fs.unlinkSync(fixture); fs.rmdirSync(path.dirname(fixture)); }
  if (ownsFixture) {
    if (fs.readFileSync('next-env.d.ts', 'utf8').includes('.next-navigation-sections/')) fs.writeFileSync('next-env.d.ts', originalNextEnv);
    const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
    const retained = config.include.filter(value => !value.startsWith('.next-navigation-sections/') || originalConfig.include.includes(value));
    if (retained.length !== config.include.length) fs.writeFileSync('tsconfig.json', JSON.stringify({ ...config, include: retained }, null, 2) + '\n');
  }
});
