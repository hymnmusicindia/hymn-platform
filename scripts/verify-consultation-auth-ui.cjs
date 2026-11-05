// Edge-case browser checks for the consultation authentication handoff.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  const directory = path.resolve('.tmp/consultation-auth-ui');
  fs.mkdirSync(directory, { recursive: true });
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConsultationPortal} from './components/consultation-portal';createRoot(document.getElementById('root')).render(<ConsultationPortal/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true,
    outfile: path.join(directory, 'bundle.js'),
    alias: { '@': process.cwd() },
    plugins: [{
      name: 'next-ui-stubs',
      setup(build) {
        build.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'next-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'next-stub' }, args => ({
          contents: args.path === 'next/link'
            ? `import React from 'react'; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`
            : args.path === 'next/image'
              ? `import React from 'react'; export default function Image(props){return <img {...props}/>} `
              : `export function useRouter(){return {push(){},refresh(){}}}`,
          loader: 'tsx', resolveDir: process.cwd()
        }));
      }
    }],
    loader: { '.module.css': 'local-css' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID': '"fixture-google-client"' }
  });
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><div id="root"></div><script src="/bundle.js"></script>`;
  const server = http.createServer((request, response) => {
    if (request.url === '/bundle.js' || request.url === '/bundle.css') {
      response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : 'application/javascript');
      response.end(fs.readFileSync(path.join(directory, request.url.slice(1))));
    } else response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    page.on('pageerror', error => console.error('CONSULTATION_TEST_PAGE_ERROR', error.stack));
    page.on('console', message => { if (message.type() === 'error') console.error('CONSULTATION_TEST_CONSOLE_ERROR', message.text()); });
    await page.addInitScript(() => { window.process = { env: { NODE_ENV: 'production', NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'fixture-google-client' } }; });
    const googleStub = `window.google={accounts:{id:{initialize:c=>window.__googleCallback=c.callback,disableAutoSelect(){},renderButton:p=>{const b=document.createElement('button');b.textContent='Mock Google sign in';b.onclick=()=>window.__googleCallback({credential:'fixture-credential'});p.append(b)},prompt(){}}}};`;
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: googleStub }));
    let profileCalls = 0;
    await page.route('**/api/consultation?mode=profile', async route => {
      profileCalls++;
      if (profileCalls < 3) await route.fulfill({ status: 401, json: { error: 'Sign in to HYMN to continue.' } });
      else await route.fulfill({ status: 200, json: { account: { id: 17, name: 'Test Artist', email: 'artist@example.test', mobile: null } } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Full name').fill('Test Artist');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Continue with email').waitFor();
    assert.equal(await page.getByLabel('Your name').count(), 0, 'The account step reuses the name entered on step one.');
    assert.equal(await page.getByRole('link', { name: 'Back to HYMN' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The mobile header must not overflow.');

    await page.route('**/api/auth/email', async route => {
      const body = route.request().postDataJSON();
      await route.fulfill(body.action === 'request'
        ? { status: 202, json: { challenge: 'fixture-challenge', resendAfter: 30, message: 'Check your inbox.' } }
        : { status: 200, json: { signedIn: true, redirectPath: '/consultation' } });
    });
    await page.getByLabel('Email address').fill('artist@example.test');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await page.getByLabel('Six-digit code').fill('123456');
    await page.getByRole('button', { name: 'Verify & continue' }).click();
    await page.getByLabel('Phone number').waitFor();
    assert.equal(profileCalls, 3, 'OTP proceeds after a transient session-cookie propagation delay.');

    const googlePage = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await googlePage.addInitScript(() => { window.process = { env: { NODE_ENV: 'production', NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'fixture-google-client' } }; });
    await googlePage.route('https://accounts.google.com/gsi/client', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: googleStub }));
    let googleProfileCalls = 0;
    await googlePage.route('**/api/consultation?mode=profile', async route => {
      googleProfileCalls++;
      await route.fulfill(googleProfileCalls < 3
        ? { status: 401, json: { error: 'Sign in to HYMN to continue.' } }
        : { status: 200, json: { account: { id: 18, name: 'Google Artist', email: 'google@example.test', mobile: null } } });
    });
    await googlePage.goto(`http://127.0.0.1:${server.address().port}`);
    await googlePage.getByRole('button', { name: 'Next' }).click();
    await googlePage.getByLabel('Full name').fill('Google Artist');
    await googlePage.getByRole('button', { name: 'Continue' }).click();
    let googleAttempts = 0;
    await googlePage.route('**/api/auth/google', async route => {
      googleAttempts++;
      if (googleAttempts === 1) await route.fulfill({ status: 503, json: { error: 'Google sign-in is temporarily unavailable.' } });
      else await route.fulfill({ status: 200, json: { user: {}, redirectPath: '/consultation' } });
    });
    await googlePage.getByRole('button', { name: 'Mock Google sign in' }).click();
    await googlePage.getByText('Google sign-in is temporarily unavailable.').waitFor();
    assert.equal(await googlePage.getByText('Continue with HYMN').count(), 1, 'A Google failure remains on the account step and shows the real error.');
    await googlePage.getByRole('button', { name: 'Mock Google sign in' }).click();
    await googlePage.getByLabel('Phone number').waitFor();
    assert.equal(googleAttempts, 2, 'Google can be retried after a failed response.');
    assert.equal(googleProfileCalls, 3, 'Google proceeds after a transient session-cookie propagation delay.');
    console.log('PASS consultation auth UI: prior name reused, OTP transient-session retry, Google error/retry, both auth paths advance to contact step, responsive header.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
