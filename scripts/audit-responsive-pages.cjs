const fs = require('node:fs/promises');
const { chromium } = require('@playwright/test');
(async () => { const origin = process.env.RESPONSIVE_AUDIT_ORIGIN || 'http://localhost:3104'; const routes = (process.env.RESPONSIVE_AUDIT_ROUTES || '/,/beat-store,/distribution,/studio,/services,/faq,/contact,/login').split(','); const out = '.cache/responsive-pages'; await fs.mkdir(out, { recursive: true }); const browser = await chromium.launch(); const results = []; try {
    for (const route of routes) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForTimeout(800);
        for (const width of [320, 390, 768]) {
            await page.setViewportSize({ width, height: 844 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
                const result = await page.evaluate(() => { const failures = []; for (const e of document.querySelectorAll('main *,[data-workspace-page] *')) {
                    const text = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
                    if (!text || !e.getClientRects().length || e.closest('svg,script,style,[aria-hidden=true],.sr-only,[hidden],.landing-rail:not(.is-open),[inert]'))
                        continue;
                    const style = getComputedStyle(e), r = e.getBoundingClientRect();
                    if (style.visibility === 'hidden' || style.display === 'none' || r.width === 0)
                        continue;
                    if (r.left >= -1 && r.right <= innerWidth + 1)
                        continue;
                    let scrolling = false;
                    for (let n = e; n && n !== document.body; n = n.parentElement) {
                        const s = getComputedStyle(n);
                        if ((/auto|scroll/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) || n.matches('[class*=carousel],[class*=showcase],[class*=marquee],[class*=record-wall],.home-release-showcase-viewport,[class*=logo-track]')) {
                            scrolling = true;
                            break;
                        }
                    }
                    if (scrolling)
                        continue;
                    failures.push({ text: text.slice(0, 80), tag: e.tagName, cls: String(e.className), left: Math.round(r.left), right: Math.round(r.right) });
                } return { pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, failures }; });
                results.push({ route, width, theme, ...result });
                if (result.failures.length || result.pageWidth > width + 1)
                    console.log('ISSUE ' + JSON.stringify(results.at(-1)));
                else
                    console.log('PASS ' + route + ' ' + width + ' ' + theme);
                await page.screenshot({ path: out + '/' + (route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')) + '-' + width + '-' + theme + '.png', fullPage: true });
            }
        }
        await page.close();
    }
}
finally {
    await fs.writeFile(out + '/report.json', JSON.stringify(results, null, 2));
    await browser.close();
} if (results.some(r => r.failures.length || r.pageWidth > r.width + 1))
    process.exitCode = 1; })().catch(e => { console.error(e.message); process.exitCode = 1; });
