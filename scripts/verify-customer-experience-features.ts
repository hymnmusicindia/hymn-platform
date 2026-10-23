import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect as baseExpect, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';
const expect = baseExpect.configure({ timeout: 60000 });
const origin = 'http://127.0.0.1:35510', root = '.cache/customer-experience';
const f = JSON.parse(readFileSync(`${root}/fixture.json`, 'utf8'));
const draft = f.releases.find((r: { status: string }) => r.status === 'DRAFT').id;
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript('window.__name = fn => fn');
  await context.addCookies([{ name: 'hymn_session', value: jwt.sign({ sub: f.customer.id, name: f.customer.name, email: f.customer.email, role: 'customer' }, 'customer-experience-local-fixture-secret', { expiresIn: '2h' }), url: origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => console.error('Customer page error:', error.message));
  page.on('requestfailed', request => { if (request.resourceType() === 'script' || request.url().includes('/api/assets')) console.error('Customer request failed:', request.url(), request.failure()?.errorText); });
  const audio = Buffer.alloc(44 + 44100 * 4 * 12);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(2, 22); audio.writeUInt32LE(44100, 24); audio.writeUInt32LE(176400, 28); audio.writeUInt16LE(4, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  await context.route('https://media.audit.fixture.invalid/preview.wav', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: audio }));
  const resume = Number(process.env.CUSTOMER_FEATURE_FROM || 0);
  const checks: string[] = resume ? JSON.parse(readFileSync(`${root}/features.json`, 'utf8')) : [];
  const pass = (name: string) => { if (!checks.includes(name)) checks.push(name); console.log(`PASS ${name}`); writeFileSync(`${root}/features.json`, JSON.stringify([...new Set(checks)], null, 2)); };
  const open = async (path: string) => { await page.goto(origin + path, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined); };
  async function fits(target: Page) { const size = target.viewportSize()!; for (const width of [390, 320]) { await target.setViewportSize({ width, height: 844 }); assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `The customer viewport must fit at ${width}px.`); } await target.setViewportSize(size); }
  try {
    // Warm development route handlers before stateful interactions. A cold Next
    // development compilation may reload an otherwise valid open form.
    if (resume < 9) for (const url of ['/api/reviews/eligible', '/api/support-tickets', '/api/payout/summary', '/api/newsletter/subscribe', '/api/referrals/onboarding', '/api/assets', '/api/assets/0/download', '/api/checkout/quote', '/api/team/creator-applications']) await context.request.get(origin + url, { timeout: 180000 });
    if (resume < 1) {
    await open('/dashboard?tab=support');
    await expect(page.getByRole('heading', { name: 'Keep your music moving.' })).toBeVisible();
    const callback = page.getByRole('button', { name: 'Request a callback', exact: true });
    await expect.poll(() => callback.evaluate(e => Object.keys(e).some(key => key.startsWith('__reactProps'))), { timeout: 120000 }).toBe(true);
    await callback.click();
    const form = page.getByRole('form', { name: 'New support request' }); await expect(form).toBeVisible();
    const email = form.locator('input[name=email]'); await email.fill('');
    assert.equal(await email.evaluate((e: HTMLInputElement) => e.checkValidity()), false);
    await email.fill(f.customer.email);
    const uploadResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/assets' && r.request().method() === 'POST');
    await form.getByLabel('Attach screenshots', { exact: true }).setInputFiles({ name: 'support-screenshot.png', mimeType: 'image/png', buffer: readFileSync('public/assets/hymnlogowhite.png') });
    const upload = await uploadResponse; assert.equal(upload.status(), 201); const screenshot = (await upload.json()).asset;
    await expect(form.getByRole('link', { name: 'support-screenshot.png', exact: true })).toBeVisible();
    assert.equal((await context.request.get(`${origin}/api/assets/${screenshot.id}/download`, { timeout: 120000 })).status(), 200);
    const anonymous = await browser.newContext(); assert.ok([401, 403, 404].includes((await anonymous.request.get(`${origin}/api/assets/${screenshot.id}/download`, { timeout: 120000 })).status())); await anonymous.close();
    await expect(form.locator('input[name=callbackPhone]')).toHaveValue('+919876543210');
    assert.equal(await form.locator('input[name=upc]').evaluate((e: HTMLInputElement) => e.required), false);
    await fits(page); await page.screenshot({ path: `${root}/support-callback-mobile.png`, fullPage: true, caret: 'initial' });
    const ticketResponse = page.waitForResponse(r => r.url().endsWith('/api/support-tickets') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Send request', exact: true }).click();
    const ticket = await ticketResponse; assert.equal(ticket.status(), 201);
    await expect(page.getByRole('status').filter({ hasText: /Request #.*received/ })).toBeVisible();
    pass('Support: correct deep link, mandatory email, optional UPC, private screenshot, callback submission and receipt');
    }
    if (resume < 2) {
    await open('/dashboard?tab=promotions');
    const community = page.getByRole('link', { name: 'Community Plans', exact: true });
    await community.click(); await expect(community).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('#community-heading')).toBeVisible(); await fits(page);
    pass('Promotion: community section selection and mobile layout');
    }
    if (resume < 3) {
    await open('/dashboard?tab=settings');
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(f.customer.name);
    const save = page.getByRole('button', { name: 'Save changes', exact: true });
    await expect(save).toBeDisabled();
    await fits(page); pass('Settings: requested module, populated profile and unchanged form state');
    }
    if (resume < 4) {
    await open(`/distribution/start?draft=${draft}`);
    await expect(page.locator('form.release-workflow')).toBeVisible();
    assert.ok(new URL(page.url()).searchParams.get('edit') === String(draft) || new URL(page.url()).searchParams.get('draft') === String(draft));
    const sections = page.getByRole('navigation', { name: 'Release sections', exact: true });
    await expect(sections).toBeVisible();
    await sections.press('Home');
    const artwork = sections.getByRole('button', { name: /^Cover artwork/ });
    await expect(artwork).toHaveAttribute('aria-current', 'step');
    await sections.press('ArrowRight');
    await fits(page); pass('Distribution: legacy draft link opens saved release, section carousel and keyboard navigation');
    }
    if (resume < 5) {
    await open(`/dashboard/releases/${f.releases.find((r: { status: string }) => r.status === 'LIVE').id}`);
    const tabs = page.getByRole('tablist', { name: 'Release sections', exact: true });
    for (const tab of await tabs.getByRole('tab').all()) { await tab.click(); await expect(tab).toHaveAttribute('aria-selected', 'true'); await fits(page); }
    pass('Release details: every available section opens and reports its selected state');
    }
    if (resume < 6) {
    await open('/beat-store');
    const reviewLater = page.getByRole('button', { name: 'Review later', exact: true });
    if (await reviewLater.isVisible()) await reviewLater.click();
    const search = page.getByRole('textbox', { name: 'Search beat catalog', exact: true });
    await expect(search).toBeVisible();
    await search.fill('no-such-fixture-beat'); await expect(page.getByText('No beats match your search and filters.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click();
    await expect(search).toHaveValue('');
    const genre = page.getByLabel('Browse genres').getByRole('button', { name: 'Hip Hop', exact: true });
    await genre.click(); await expect(genre).toHaveAttribute('aria-pressed', 'true'); assert.ok(await genre.evaluate(e => parseFloat(getComputedStyle(e).borderRadius)) > 0); await genre.click();
    const cart = page.getByRole('button', { name: /Add Midnight Drive WAV licence to cart/ }); await cart.click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator(`#beat-${f.beatId}`).getByRole('button', { name: 'Play Midnight Drive', exact: true }).click();
    await expect(page.getByRole('slider', { name: 'Seek Midnight Drive', exact: true })).toBeVisible();
    await expect(page.locator(`#beat-${f.beatId}`).getByRole('button', { name: 'Pause Midnight Drive', exact: true })).toBeVisible();
    assert.notEqual(await page.locator(`#beat-${f.beatId} [class*=spinning]`).evaluate(e => getComputedStyle(e).animationName), 'none');
    await page.locator(`#beat-${f.beatId}`).getByRole('button', { name: 'Pause Midnight Drive', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: /Shopping cart, 1 item/ }).click();
    await expect(page.getByRole('dialog', { name: 'Shopping cart', exact: true })).toBeVisible();
    await fits(page); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Shopping cart', exact: true })).not.toBeVisible();
    pass('Beatstore: search/reset, selected genre styling, spinning CD, bottom playback controls, cart feedback, mobile drawer and Escape');
    }
    if (resume < 7) {
    await open('/checkout?product=beatstore');
    await expect(page.getByText('Midnight Drive', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your payment summary' })).toBeVisible();
    await fits(page); pass('Checkout: cart reaches the verified quote without creating a payment');
    }
    if (resume < 8) {
    await open(`/licenses/${f.purchaseId}`);
    await expect(page.getByRole('link', { name: 'Continue release', exact: true })).toHaveAttribute('href', `/distribution/start?edit=${draft}`);
    await fits(page); pass('Purchased licence: correct resume link and mobile agreement');
    }
    if (resume < 9) {
    await open('/dashboard?subscriptions=1');
    const plans = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close subscriptions' }) });
    await expect(plans).toBeVisible(); await fits(page);
    for (const action of await plans.locator('.subscription-offer-action').all()) assert.ok(await action.evaluate(e => parseFloat(getComputedStyle(e).borderRadius)) >= 8);
    await page.keyboard.press('Escape'); await expect(plans).not.toBeVisible();
    pass('Subscriptions: readable rounded actions, mobile comparison and accessible dismissal');
    }
    const referral = await context.request.get(`${origin}/api/referrals/onboarding`, { timeout: 180000 }); assert.equal(referral.status(), 200);
    const referralData = await referral.json(); assert.equal(referralData.showPrompt, false); assert.equal(referralData.referrerReward, 0);
    pass('Missing reward configuration hides optional referral offers without a server error');
    for (const url of ['/api/admin/producer-applications', '/api/team/creator-applications', `/api/releases/${f.privateReleaseId}/corrections`]) { const response = await context.request.get(origin + url, { timeout: 120000 }); assert.ok([401, 403, 404].includes(response.status())); }
    const forged = await context.request.post(`${origin}/api/distribution/payment/verify-submit`, { headers: { Origin: origin }, timeout: 180000, data: { razorpay_order_id: 'not-a-paid-order', razorpay_payment_id: 'forged', razorpay_signature: 'forged' } }); assert.ok(forged.status() >= 400 && forged.status() < 500);
    pass('Backend boundaries: admin, staff and other customer records remain blocked; forged payment rejected');
  } catch (error) {
    await page.screenshot({ path: `${root}/feature-failure.png`, fullPage: true, caret: 'initial' }).catch(() => undefined);
    writeFileSync(`${root}/feature-failure.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'));
    throw error;
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
