const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');
(async () => {
  await mkdir('.cache', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log('Navigation:', frame.url()); });
    await page.route('**/api/newsletter/subscribe', route => route.fulfill({ json: { subscription: null } }));
    const metrics = [];
    for (const width of [1440, 390]) for (const path of ['/', '/faq']) {
      await page.setViewportSize({ width, height: 950 });
      console.log('Checking sidebar:', width, path);
      await page.goto('http://localhost:3015' + path, { waitUntil: 'networkidle', timeout: 120000 });
      const sidebar = page.locator(path === '/' ? '.landing-rail' : '.dashboard-os-sidebar');
      await expect(sidebar.locator('.workspace-destinations')).toBeAttached({ timeout: 60000 });
      await page.waitForFunction(() => [...document.querySelectorAll('.workspace-destination')].some(node => Object.keys(node).some(key => key.startsWith('__reactProps$'))));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (width < 1024) await page.evaluate(() => window.dispatchEvent(new Event('hymn-toggle-navigation')));
      await expect(sidebar).toBeInViewport();
      const destinations = sidebar.locator('.workspace-destination');
      await expect(destinations).toHaveCount(2);
      assert.deepEqual(await destinations.allTextContents(), ['Home', 'Overview']);
      const boxes = await destinations.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
      assert.ok(Math.abs(boxes[0].width - boxes[1].width) < 1, 'Home/Overview must split equally');
      assert.equal(boxes[0].y, boxes[1].y, 'Destinations must be adjacent');
      assert.ok(boxes[1].x > boxes[0].x);
      await expect(destinations.first()).toHaveAttribute('href', '/');
      const groups = sidebar.locator('.landing-group-title,.dashboard-os-group-toggle');
      assert.deepEqual(await groups.allTextContents(), ['Library', 'Distribution', 'Beatstore', 'Mixing / Mastering']);
      await groups.filter({ hasText: 'Beatstore' }).click();
      await expect(groups.filter({ hasText: 'Beatstore' })).toHaveAttribute('aria-expanded', 'true');
      await expect(sidebar.getByRole('link', { name: 'Browse beats', exact: true })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'My purchases', exact: true })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Sell beats', exact: true })).toBeVisible();
      const density = await sidebar.evaluate(root => {
        const group = root.querySelector('.landing-group-title,.dashboard-os-group-toggle');
        const link = [...root.querySelectorAll('.landing-nav-link,.dashboard-os-nav-item')].find(n => n.textContent.trim() === 'Browse beats');
        const g = getComputedStyle(group), l = getComputedStyle(link);
        return { sidebarWidth: root.getBoundingClientRect().width, headingSize: getComputedStyle(group.querySelector('span')).fontSize, headingHeight: group.getBoundingClientRect().height, linkSize: l.fontSize, linkHeight: link.getBoundingClientRect().height, groupGap: getComputedStyle(group.parentElement).marginBottom, padding: g.padding };
      });
      metrics.push({ width, path, ...density });
      assert.equal(density.headingSize, '13px');
      assert.equal(density.linkSize, '13px');
      assert.equal(density.linkHeight, width < 1024 ? 44 : 36);
      await sidebar.screenshot({ path: `.cache/sidebar-consistent-${path === '/' ? 'home' : 'portal'}-${width}.png` });
    }
    for (const width of [1440, 390]) {
      const [home, portal] = metrics.filter(m => m.width === width);
      for (const key of ['headingSize', 'headingHeight', 'linkSize', 'linkHeight', 'groupGap', 'padding', 'sidebarWidth']) assert.equal(home[key], portal[key], `Sidebar mismatch: ${key}`);
    }
    console.log(JSON.stringify({ passed: true, metrics }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
