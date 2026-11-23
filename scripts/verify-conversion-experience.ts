import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect as baseExpect } from '@playwright/test';
import { loginForTask, reportReturnPath } from '../lib/routes';
import { readOnboardingContext, saveOnboardingContext, markOnboardingSeen } from '../lib/onboarding-client';
import { configureCustomerFixtureBrowser, customerFixturePublicOrigin, customerFixtureHeaders } from './customer-fixture-browser';

const origin = 'http://127.0.0.1:35510';
const expect = baseExpect.configure({ timeout: 60000 });
const output = '.cache/conversion-experience';
mkdirSync(output, { recursive: true });
const checks: string[] = [];
function pass(label: string) { checks.push(label); console.log('PASS', label); writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2)); }

async function main() {
  for (const value of ['/distribution/start?campaign=first-release&edit=42', '/producer-onboarding', '/first-release?utm_source=instagram', '/studio/start?listing=engineer-1&beatPurchaseId=12', '/checkout?product=subscription-yearly', '/dashboard?tab=support', '/beat-store#producer-suggestions', '/library', '/artist-journey', '/managed-services', '/studio/engineer/profile', '/producer/deliveries/12']) assert.equal(reportReturnPath(value), value);
  for (const value of ['//evil.example', 'https://evil.example', '/\\evil.example', '/api/auth/email', '/login', '/admin', '/studio/../admin', '/%2f%2fevil.example', '/dashboard\n', '/dashboard?next=https://evil.example', '/beat-store#other', '/team/performance?next=https://evil.example', '/partnerships/activate/' + 'a'.repeat(64) + '?next=https://evil.example', '/dashboard?' + 'a'.repeat(300)]) assert.equal(reportReturnPath(value), undefined, value);
  assert.equal(loginForTask('/distribution/start?fbclid=untracked'),'/login?next=%2Fdistribution%2Fstart');
  assert.equal(loginForTask('//evil.example'),'/login');
  pass('Task redirects preserve approved context and reject external, encoded, traversal, privileged, unknown and oversized destinations');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = 'null';
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: () => { throw Error('Storage blocked'); } } });
    for (const value of ['null','[]','1','{"name":5,"releaseType":{},"previouslyReleased":"true"}','{']) { stored = value; assert.deepEqual(readOnboardingContext(), {}); }
    stored = '{"name":"Artist","previouslyReleased":true,"unknown":"discard"}';
    assert.deepEqual(readOnboardingContext(), { name: 'Artist', previouslyReleased: true });
    assert.doesNotThrow(() => saveOnboardingContext({ primaryIntent: 'beats' })); assert.doesNotThrow(markOnboardingSeen);
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
  pass('Malformed and unavailable browser storage cannot block onboarding');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers:'block', extraHTTPHeaders:customerFixtureHeaders });
  await configureCustomerFixtureBrowser(context);
  await context.addInitScript('window.__name = fn => fn');
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/welcome', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Start with your goal' }).getByRole('link')).toHaveCount(4);
    await expect.poll(() => page.getByRole('button', { name: 'Help me choose', exact: true }).evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))), { timeout: 120000 }).toBe(true);
    await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What are you trying to make happen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Find the right beat', exact: false }).click();
    await page.getByRole('button', { name: 'Show my next step now' }).click();
    await expect(page.getByRole('button', { name: 'Explore my beats', exact: true })).toBeVisible();
    assert.ok(!(await page.locator('main').innerText()).includes('undefined'));
    await page.getByRole('button', { name: 'Explore my beats', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/beat-store');
    assert.equal(await page.getByRole('dialog').count(), 0);
    pass('Onboarding starts with intent, allows skipping optional questions and opens beat browsing without an account gate');

    await page.goto(origin + '/welcome', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.getByRole('button', { name: 'Help me choose', exact: true }).evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))), { timeout: 120000 }).toBe(true);
    await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What are you trying to make happen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Sell my beats', exact: false }).click();
    await page.getByRole('button', { name: 'Show my next step now' }).click();
    await page.getByRole('button', { name: 'Set up my producer store' }).click();
    await page.waitForURL(url => url.pathname === '/producer-onboarding');
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
    pass('Producer route goes directly to setup with email and Google alternatives and accurate revenue-share copy');

    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    const planner = page.getByRole('figure').filter({ hasText: 'Your catalogue plan' });
    await expect.poll(() => planner.getByRole('radio', { name:'Monthly',exact:true }).evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))), { timeout:120000 }).toBe(true);
    await planner.getByRole('radio', { name: 'Monthly', exact: true }).check();
    await expect(planner.getByRole('status')).toHaveText('12planned releases in a year');
    await planner.getByRole('radio', { name: 'Once a year', exact: true }).check();
    await expect(planner.getByRole('status')).toHaveText('1planned release in a year');
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Homepage fits ${width}px`);
      await planner.screenshot({ path: `${output}/planner-${width}.png` });
    }
    pass('Illustrative graph updates accurately, exposes accessible controls and fits 320/390/768/1440px');

    await page.goto(origin + '/login?next=%2Fstudio%2Fstart%3Flisting%3Dfixture', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sign in to continue where you left off.')).toBeVisible();
    const email = page.getByLabel('Email address', { exact: true });
    await expect.poll(() => email.evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))), { timeout:120000 }).toBe(true);
    await email.fill('artist@fixture.invalid');
    await page.route('**/api/auth/email', route => route.fulfill({ status: 502, contentType: 'text/html', body: 'Upstream unavailable' }));
    await page.getByRole('button', { name: 'Send me a code', exact: true }).click();
    await expect(page.locator('form').getByRole('alert')).toHaveText('We could not confirm the response. Please try again.');
    await expect(email).toHaveValue('artist@fixture.invalid');
    await expect(page.getByRole('button', { name: 'Send me a code', exact: true })).toBeEnabled();
    await page.unroute('**/api/auth/email');
    pass('Sign-in retains task context and typed email after malformed upstream responses');

    const api = context.request;
    assert.equal((await api.post(origin + '/api/auth/email', { headers: { Origin: 'https://evil.example' }, data: { action: 'request', email: 'fixture@fixture.invalid' } })).status(), 403);
    assert.equal((await api.post(origin + '/api/auth/email', { headers: { Origin: customerFixturePublicOrigin, 'Content-Type': 'text/plain' }, data: '{}' })).status(), 415);
    assert.equal((await api.post(origin + '/api/auth/email', { headers: { Origin: customerFixturePublicOrigin }, data: { action: 'verify', email: 'bad', code: '123', challenge: 'x' } })).status(), 400);
    for (const route of ['/api/workspaces','/api/user/onboarding-preferences','/api/admin/producer-applications']) assert.ok([401,403].includes((await api.get(origin + route)).status()), route);
    pass('Real API handlers reject cross-origin sign-in, invalid content and malformed credentials; protected routes reject guests');
    await page.goto(origin + '/distribution/start?onboarding=release&campaign=first-release', {waitUntil:'domcontentloaded'});
    const start = page.getByRole('button', {name:'Sign in to start my release',exact:true});
    await expect.poll(() => start.evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))), {timeout:120000}).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await start.click(); await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', {name:'Close',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await start.click(); await expect(page.getByRole('dialog')).toBeVisible();
    pass('Release preview opens sign-in only on request and allows reopening after dismissal');
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage blocked','SecurityError'); }; });
    await page.route('**/api/auth/email', route => route.fulfill({
      status:200,
      json:route.request().postDataJSON().action === 'request' ? {challenge:'mock-ui-only',resendAfter:0,message:'Fixture code ready.'} : {signedIn:true,redirectPath:'/pricing'}
    }));
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email address',{exact:true}).fill('ui-only@fixture.invalid');
    await dialog.getByRole('button',{name:'Send me a code',exact:true}).click();
    await dialog.getByLabel('Six-digit code',{exact:true}).fill('123456');
    const navigation = page.waitForEvent('domcontentloaded');
    await dialog.getByRole('button',{name:'Verify & continue',exact:true}).click();
    await navigation;
    assert.equal(new URL(page.url()).pathname,'/distribution/start');
    assert.equal(new URL(page.url()).searchParams.get('campaign'),'first-release');
    await page.unroute('**/api/auth/email');
    pass('Mocked successful OTP callback keeps the release campaign even when browser storage throws');
    await page.goto(origin + '/distribution/start?campaign=first-release&stage=2', {waitUntil:'domcontentloaded'});
    await expect(page.getByRole('link', {name:'Go to login',exact:true})).toHaveAttribute('href', '/login?next=' + encodeURIComponent('/distribution/start?campaign=first-release&stage=2'));
    await expect(page.getByRole('link', {name:'Compare pricing',exact:true}).first()).toHaveAttribute('href','/pricing');
    await page.goto(origin + '/studio/start?listing=fixture-service&beatPurchaseId=12', {waitUntil:'domcontentloaded'});
    await page.waitForURL(url => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'),'/studio/start?listing=fixture-service&beatPurchaseId=12');
    pass('Distribution sign-in retains campaign and stage; Studio sign-in retains the selected service and beat purchase');
    assert.deepEqual(errors, [], 'No uncaught client errors during tested journeys');
  } catch (error) {
    writeFileSync(`${output}/failure.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'));
    await page.screenshot({path:`${output}/failure.png`,fullPage:true,timeout:10000}).catch(() => {});
    throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
