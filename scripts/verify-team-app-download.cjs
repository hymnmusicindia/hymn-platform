const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const { textContrast } = require('./lib/text-contrast.cjs');
const origin = process.env.TEAM_APP_TEST_ORIGIN || 'http://localhost:3016';

(async () => {
  const release = JSON.parse(await fs.readFile('public/downloads/hymn-team/release.json', 'utf8'));
  const android = JSON.parse(await fs.readFile('android/team-release.json', 'utf8'));
  assert.equal(release.version, android.versionName);
  assert.equal(release.versionCode, android.versionCode);
  const head = await fetch(`${origin}/team/app/download`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(head.headers.get('x-hymn-app-version'), release.version);
  assert.match(head.headers.get('content-disposition'), new RegExp(`HYMN-Team-${release.version.replaceAll('.', '\\.')}\\.apk`));
  const downloaded = await fetch(`${origin}/team/app/download`);
  assert.equal(downloaded.status, 200);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(bytes.length, release.size);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), release.sha256);
  const browser = await chromium.launch({ args: ['--enable-features=WebContentsForceDark'] });
  const out = path.resolve('.cache/team-app-download'); await fs.mkdir(out, { recursive: true });
  try {
    const context = await browser.newContext({ colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
    for (const width of [320, 390, 1440]) {
      const page = await context.newPage(); await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/team/app`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByRole('heading', { name: 'HYMN Team app', exact: true }).waitFor();
      await page.getByText(`Version ${release.version}`, { exact: true }).waitFor();
      assert.equal(page.url(), `${origin}/team/app`, 'Public install page must not redirect to login');
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), `${theme} only`);
        assert.equal(await page.locator('meta[name="color-scheme"]').getAttribute('content'), `only ${theme}`);
        for (const element of await page.locator('h1,h2,p,li,a,button,strong').all()) {
          if (!await element.isVisible() || !(await element.innerText()).trim()) continue;
          const result = await element.evaluate(textContrast);
          assert.ok(result.ratio >= 4.5, `${width}px ${theme}: ${await element.innerText()} ${JSON.stringify(result)}`);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
        await page.screenshot({ path: path.join(out, `${width}-${theme}.png`), fullPage: true });
      }
      await page.getByRole('button', { name: 'Copy app link' }).click();
      await page.getByText('App link copied.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/team/app`);
      await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('Clipboard denied'); }; });
      await page.getByRole('button', { name: 'Copy app link' }).click();
      assert.equal(await page.getByRole('textbox', { name: 'App link' }).inputValue(), `${origin}/team/app`);
      assert.equal(await page.getByRole('link', { name: 'Download Android app' }).getAttribute('href'), '/team/app/download');
      // Restore the saved light theme for the next viewport.
      await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await page.close();
      console.log(`PASS ${width}px light/dark install page, forced browser darkening, clipboard and fallback`);
    }
  } finally { await browser.close(); }
  console.log(`PASS APK ${release.version}: public download, MIME/filename, no stale cache, size and SHA-256`);
})().catch(error => { console.error(error); process.exitCode = 1; });
