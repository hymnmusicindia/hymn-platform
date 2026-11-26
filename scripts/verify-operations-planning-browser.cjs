const fs = require('node:fs/promises'), path = require('node:path');
const { build } = require('esbuild'), { chromium, expect } = require('@playwright/test');
async function main() {
  const out = path.resolve('.cache/operations-planning-browser'); await fs.mkdir(out, { recursive: true });
  await build({ entryPoints: ['scripts/operations-planning-fixture.tsx'], bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } });
  const browser = await chromium.launch();
  try { for (const theme of ['light', 'dark']) for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://hymn.fixture/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0;padding:16px;box-sizing:border-box;${theme === 'dark' ? '--card:#17212b;--surface:#17212b;--text:#edf2f7;--border:#344454;background:#101820;color:#edf2f7' : '--card:#fff;--surface:#fff;--text:#192632;--border:#d9e0e7;background:#f6f8fa'}"><div id="root"></div></body></html>` }));
    await page.goto('https://hymn.fixture/');
    await page.addStyleTag({ content: '*{box-sizing:border-box}body{font-family:Arial,sans-serif}a{color:inherit;text-decoration:none}button,input,textarea,select{font:inherit}' });
    await page.addStyleTag({ path: path.join(out, 'ui.css') }); await page.addScriptTag({ path: path.join(out, 'ui.js') });
    await expect(page.getByRole('heading', { name: 'Make room for the work that matters.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /intake requests without tasks/ })).toHaveAttribute('href', /module=overview/);
    await page.getByRole('button', { name: 'Activity', exact: true }).click(); await expect(page.getByRole('link', { name: 'Inspect record', exact: true })).toHaveAttribute('href', /module=directory/); await page.getByRole('button', { name: 'Workload', exact: true }).click();
    await page.keyboard.press('Control+k'); await expect(page.getByLabel('Search contacts, consultations and work')).toBeFocused();
    await expect(page.getByRole('option', { name: /Operations centre/ })).toBeVisible(); await page.keyboard.press('Escape');
    const first = page.getByRole('region', { name: 'Aaditya workload' }), target = page.getByRole('region', { name: 'Khushi workload' });
    if (width === 1440) await first.locator('article').dragTo(target);
    else { await page.getByLabel('Select Prepare artist onboarding').check(); await page.getByLabel('Assign selected tasks to').selectOption('1'); await page.getByRole('button', { name: 'Preview assignment', exact: true }).click(); }
    await expect(page.getByRole('complementary', { name: 'Assignment preview' })).toBeVisible();
    expect(await page.evaluate(() => window.writes.length)).toBe(0);
    await page.getByLabel('Handoff note').fill('Confirm the artwork before preparing delivery.');
    await page.getByRole('button', { name: 'Apply validated plan' }).click(); await expect(page.getByRole('button', { name: 'Undo last reassignment' })).toBeVisible();
    await expect(target.getByRole('button', { name: 'Prepare artist onboarding', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo last reassignment' }).click(); await expect(first.getByRole('button', { name: 'Prepare artist onboarding', exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'Prepare artist onboarding', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Operational task details' }); await expect(dialog).toBeVisible(); await dialog.getByLabel('Estimated remaining hours').fill('2.5'); await dialog.getByRole('button', { name: 'Save estimate' }).click(); await page.getByLabel('Close task details').click();
    await page.getByLabel('Configure capacity for Aaditya').click(); await expect(page.getByRole('dialog', { name: 'Member capacity settings' })).toBeVisible(); await page.getByLabel('Close capacity settings').click();
    await page.screenshot({ path: path.join(out, `${theme}-${width}-workspace.png`), fullPage: true });
    await page.getByLabel('Select Prepare artist onboarding').check(); await page.getByLabel('Assign selected tasks to').selectOption('1'); await page.getByRole('button', { name: 'Preview assignment', exact: true }).click();
    await page.evaluate(() => { window.fail = true; }); await page.getByRole('button', { name: 'Apply validated plan' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Task changed' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset plan', exact: true }).click(); await expect(first.getByRole('button', { name: 'Prepare artist onboarding', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Attention inbox', exact: true }).click(); await expect(page.getByRole('button', { name: /Review marketplace assets.*Waiting for licence details/ })).toBeVisible();
    await page.getByRole('button', { name: 'Workload', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(out, `${theme}-${width}.png`), fullPage: true }); expect(errors).toEqual([]); await page.close();
    console.log(`PASS operations ${theme} ${width}px: drag/touch alternatives, local preview, apply/undo, estimates, capacity dialog, stale rejection, attention inbox, command shortcut, reduced motion and no page overflow.`);
  } } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
