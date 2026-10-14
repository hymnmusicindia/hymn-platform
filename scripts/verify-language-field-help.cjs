const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-language-help-'));
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {LanguageFieldHelp} from './components/language-field-help';createRoot(document.getElementById('root')).render(<main><section>Track language<LanguageFieldHelp track/></section><section>Release language<LanguageFieldHelp/></section></main>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(output, 'help.js'), jsx: 'automatic' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ path: path.join(output, 'help.css') });
    await page.addScriptTag({ path: path.join(output, 'help.js') });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      const track = page.getByLabel('What does track language mean?');
      const before = await page.locator('main').boundingBox();
      await track.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Track language help' })).toBeVisible();
      assert.deepEqual(await page.locator('main').boundingBox(), before, 'Popup must not shift field layout');
      const bounds = await page.getByRole('dialog', { name: 'Track language help' }).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Popup stays within viewport');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Track language help' })).not.toBeVisible();
      const release = page.getByLabel('What does release language mean?');
      await release.click();
      await expect(page.getByRole('dialog', { name: 'Release language help' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(release).toHaveAttribute('aria-expanded', 'false');
      await release.click();
      await page.mouse.click(width - 5, 650);
      await expect(page.getByRole('dialog', { name: 'Release language help' })).not.toBeVisible();
    }
    console.log('PASS language help: keyboard and pointer toggle, distinct explanations, mobile and desktop overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
