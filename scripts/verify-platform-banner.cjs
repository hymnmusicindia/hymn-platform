const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');

(async () => {
  await mkdir('.cache', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto(process.env.BANNER_TEST_URL || 'http://localhost:3015', { waitUntil: 'domcontentloaded', timeout: 120000 });
      const banner = page.locator('.home-platform-editorial');
      await banner.scrollIntoViewIfNeeded();
      await expect(banner.locator('h2')).toHaveText('Where your music lands.');
      await expect(banner.locator('.home-platform-column')).toHaveCount(3);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const youtube = banner.locator('img[src*="wordmark-youtube"]').first();
      await expect(youtube).toHaveClass(/home-platform-logo-detailed/);
      await expect.poll(() => youtube.evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true);
      assert.equal(await youtube.evaluate(img => getComputedStyle(img).filter), 'grayscale(1) invert(1)', 'Preserve the play triangle rather than flattening the logo');
      const geometry = await banner.evaluate(el => {
        const section = el.getBoundingClientRect(), title = el.querySelector('h2').getBoundingClientRect();
        return { left: title.left - section.left, right: section.right - title.right, width: section.width, viewport: innerWidth };
      });
      assert.ok(geometry.left >= 0 && geometry.right >= 0 && geometry.width <= geometry.viewport, 'Banner and headline must fit');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await banner.hover();
      assert.equal(await banner.locator('.home-platform-track').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await banner.locator('.home-platform-track').first().evaluate(el => getComputedStyle(el).animationName), 'none');
      await banner.screenshot({ path: `.cache/platform-banner-${width}.png` });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      console.log(`PASS platform banner at ${width}px: logo detail, layout, hover pause, reduced motion`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
