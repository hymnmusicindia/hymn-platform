const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const source = await fs.readFile('app/(public)/distribution/page.tsx', 'utf8');
  const entry = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: entry.exports, URLSearchParams, require: id => {
    assert.equal(id, 'next/navigation');
    return { redirect: destination => { throw Object.assign(new Error('redirect'), { destination }); } };
  } });
  for (const [params, target] of [
    [{}, '/distribution/start'],
    [{ manage: 'plans' }, '/distribution/start?subscriptions=1'],
    [{ recommended: 'half-yearly' }, '/distribution/start?subscriptions=1'],
    [{ recommended: 'yearly_plus', utm_source: 'onboarding' }, '/distribution/start?utm_source=onboarding&subscriptions=1'],
    [{ campaign: 'first-release', ref: 'friend' }, '/distribution/start?campaign=first-release&ref=friend'],
    [{ recommended: 'https://evil.invalid' }, '/distribution/start']
  ]) await assert.rejects(entry.exports.default({ searchParams: Promise.resolve(params) }), error => error.destination === target);
  assert(!source.includes('DistributionHero'));
  console.log('PASS retired page: release redirect, legacy plan links, attribution preservation and fixed destination');
  const out = path.resolve('.tmp/distribution-entry'); await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SubscriptionOptions,openSubscriptions} from './components/subscription-options';createRoot(document.getElementById('root')).render(<><button onClick={openSubscriptions}>View plans</button><SubscriptionOptions/></>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-fixture', setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ resolveDir: process.cwd(), loader: 'tsx', contents: a.path.endsWith('navigation') ? `const router={replace(url){history.replaceState(null,'',url)}};export function useRouter(){return router};export function usePathname(){return location.pathname};export function useSearchParams(){return new URLSearchParams(location.search)}` : `import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image') ? 'img' : 'a'}',props,children)}` }));
  } }] });
  const browser = await chromium.launch();
  try { for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://hymn.fixture/**', route => route.request().resourceType() === 'document'
      ? route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' })
      : route.fulfill({ json: { authenticated: false, eligible: false, reason: 'authentication_required' } }));
    await page.goto('https://hymn.fixture/distribution/start?subscriptions=1&utm_source=legacy');
    await page.addStyleTag({ content: '*{box-sizing:border-box}body{font-family:Arial;margin:0;background:#171d26;color:#f4f7fc;--text:#f4f7fc;--text-muted:#b8c3d4;--border:#3e4c60;--card:#202734}button,a{font:inherit}' });
    await page.addStyleTag({ path: 'app/styles/subscription-options.css' });
    await page.addScriptTag({ path: path.join(out, 'ui.js') });
    const dialog = page.getByRole('dialog', { name: 'Subscriptions', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.distribution-plan-card')).toHaveCount(3);
    assert.equal(new URL(page.url()).searchParams.get('subscriptions'), null);
    assert.equal(new URL(page.url()).searchParams.get('utm_source'), 'legacy');
    await page.getByRole('button', { name: 'Close subscriptions' }).click(); await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'View plans', exact: true }).click(); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: existing subscription dialog auto-opens once, preserves attribution, closes and reopens`);
    await page.close();
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
