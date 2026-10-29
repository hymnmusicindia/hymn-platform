/* Read-only rendered-page audit. Run against a local server; writes screenshots and evidence. */
const fs = require('node:fs/promises');
const { chromium } = require('@playwright/test');
const { textContrast } = require('./lib/text-contrast.cjs');

async function main() {
  const origin = process.env.THEME_AUDIT_ORIGIN || 'http://localhost:3104';
  const routes = (process.env.THEME_AUDIT_ROUTES || '/,/studio,/beat-store,/distribution,/services,/faq,/contact,/login').split(',');
  const output = '.cache/theme-core-audit';
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      for (const route of routes) {
        await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForTimeout(1000);
        for (const theme of ['light', 'dark']) {
          await page.evaluate(t => { document.documentElement.dataset.theme = t; localStorage.setItem('hymn-theme', t); }, theme);
          await page.waitForTimeout(250);
          await page.evaluate(`window.auditTextContrast = ${textContrast.toString()}`);
          const result = await page.evaluate(() => {
            const failures = [];
            let checked = 0;
            for (const element of document.querySelectorAll('body *')) {
              const text = [...element.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
              if (!text || element.closest('svg,script,style,[aria-hidden=true],nextjs-portal,.sr-only')) continue;
              const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
              if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none' || element.closest('[disabled],[inert]')) continue;
              if (element.closest('.landing-hero,.home-release-stage,.landing-producers,.home-goal-workspace')) continue; // Photograph/composite artwork needs visual review.
              const colors = window.auditTextContrast(element);
              const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700;
              checked++;
              if (colors.ratio < (large ? 3 : 4.5) - .02) failures.push({ text: text.slice(0, 100), ratio: +colors.ratio.toFixed(2), selector: element.tagName.toLowerCase() + '.' + String(element.className).replaceAll(' ', '.'), ...colors });
            }
            return { checked, failures, overflow: document.documentElement.scrollWidth > innerWidth + 1, header: (() => { const h = document.querySelector('header'); return h && { background: getComputedStyle(h).backgroundColor, text: getComputedStyle(h).color }; })() };
          });
          report.push({ route, width, theme, ...result });
          console.log(JSON.stringify(report.at(-1)));
          await page.screenshot({ path: `${output}/${route.replaceAll('/', '_') || 'home'}-${theme}-${width}.png`, fullPage: true });
        }
      }
      await page.close();
    }
  } finally {
    if (report.some(row => row.failures.length || row.overflow)) process.exitCode = 1;
    await browser.close();
    await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
