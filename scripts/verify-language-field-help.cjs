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
      await track.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(/Choose the language actually sung or spoken/)).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.keyboard.press('Enter');
      await expect(page.getByText(/Choose the language actually sung or spoken/)).not.toBeVisible();
      const release = page.getByLabel('What does release language mean?');
      await release.click();
      await expect(page.getByText(/Choose the main language of the release as a whole/)).toBeVisible();
      await release.click();
    }
    console.log('PASS language help: keyboard and pointer toggle, distinct explanations, mobile and desktop overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
