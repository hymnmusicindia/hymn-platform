const { chromium } = require('@playwright/test');
const { readFileSync } = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    await page.route('**/assets/hymnlogowhite.png', route => route.fulfill({ contentType: 'image/png', body: readFileSync('public/assets/hymnlogowhite.png') }));
    await page.setContent(readFileSync('.cache/yamunawood-branded-email.html', 'utf8'));
    await page.screenshot({ path: '.cache/yamunawood-branded-email-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw Error('Email overflows mobile viewport');
    const button = page.getByRole('link', { name: 'View your release' });
    if (await button.getAttribute('href') !== 'https://hymnmusic.fun/dashboard/releases/81') throw Error('Incorrect CTA');
    await page.screenshot({ path: '.cache/yamunawood-branded-email-mobile.png', fullPage: true });
    console.log('Desktop/mobile email previews generated; mobile width and release button verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
