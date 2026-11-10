const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const origin = 'http://127.0.0.1:3037';
const originalNextEnv = fs.readFileSync('next-env.d.ts', 'utf8');
const originalConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
let server, browser;
const get = (path, headers = {}) => fetch(origin + path, { headers, signal: AbortSignal.timeout(120000) });
(async () => {
  server = spawn(process.execPath, ['--max-old-space-size=8192', 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3037'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_DIST_DIR: '.next-agent-readiness', DATABASE_URL: 'mysql://user:password@localhost:3306/hymn', MIGRATION_DATABASE_URL: '', NEXT_PUBLIC_APP_URL: origin, APP_URL: origin, EMAIL_ENABLED: 'false', CRON_SCHEDULER_ENABLED: 'false' }
  });
  let logs = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-5000); });
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await get('/robots.txt')).ok) break; } catch {}
    if (attempt === 119) throw Error('Development server did not start: ' + logs);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const robots = await get('/robots.txt'); assert.match(await robots.text(), /Content-Signal: search=yes, ai-train=no/);
  const llms = await get('/llms.txt'); assert.equal(llms.status, 200); assert.match(await llms.text(), /\/pricing/);
  const markdown = await get('/', { Accept: 'text/markdown' }); assert.equal(markdown.status, 200); assert.match(markdown.headers.get('content-type'), /^text\/markdown/); assert.match(markdown.headers.get('vary'), /Accept/i); assert.match(await markdown.text(), /# HYMN Music/);
  const explicit = await get('/index.md'); assert.match(explicit.headers.get('content-type'), /^text\/markdown/);
  const html = await get('/', { Accept: 'text/html' }); assert.equal(html.status, 200); assert.match(html.headers.get('content-type'), /^text\/html/); assert.match(html.headers.get('vary'), /Accept/i);
  const markup = await html.text(); assert.match(markup, /mailto:hymnmusicindia@gmail.com/); assert.match(markup, /tel:\+918793643228/); assert.match(markup, /href="\/pricing"/);
  const discovery = await get('/.well-known/mcp/server-card.json'); assert.equal(discovery.status, 200); const card = await discovery.json(); assert.equal(card.transport.endpoint, origin + '/mcp'); assert.equal(discovery.headers.get('access-control-allow-origin'), '*');
  const call = async (method, params, extra = {}) => fetch(origin + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...extra }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const init = await (await call('initialize', { protocolVersion: card.protocolVersion, clientInfo: { name: 'http-check', version: '1' }, capabilities: {} })).json(); assert.deepEqual(init.result.serverInfo, card.serverInfo);
  const listed = await (await call('tools/list')).json(); assert.equal(listed.result.tools.length, 3);
  for (const tool of listed.result.tools) { const result = await (await call('tools/call', { name: tool.name, arguments: {} })).json(); assert.equal(result.result.isError, false); }
  assert.equal((await call('tools/list', {}, { Origin: 'https://evil.example' })).status, 403);
  console.log('PASS live HTTP: crawl signals, Markdown negotiation and Vary, HTML contact/pricing links, discovery and real MCP calls.');
  browser = await chromium.launch({ headless: true });
  for (const mode of ['modern', 'legacy', 'unsupported']) {
    const context = await browser.newContext();
    await context.addInitScript(mode => {
      window.__hymnTools = new Map();
      if (mode === 'unsupported') return;
      const api = {
        registerTool(tool, options) {
          if (window.__hymnTools.has(tool.name)) throw Error('Duplicate tool');
          window.__hymnTools.set(tool.name, tool);
          if (mode === 'modern') options.signal.addEventListener('abort', () => { if (window.__hymnTools.get(tool.name) === tool) window.__hymnTools.delete(tool.name); }, { once: true });
          return mode === 'modern' ? Promise.resolve() : undefined;
        },
        unregisterTool(name) { window.__hymnTools.delete(name); }
      };
      Object.defineProperty(mode === 'modern' ? document : navigator, 'modelContext', { configurable: true, value: api });
    }, mode);
    const page = await context.newPage();
    page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: { items: [], workspaces: [], total: 0 } }));
    await page.goto(origin + '/pricing');
    await expect(page.getByRole('heading', { name: 'Music distribution pricing', exact: true })).toBeVisible();
    if (mode !== 'unsupported') {
      await expect.poll(() => page.evaluate(() => window.__hymnTools.size)).toBe(3);
      const result = await page.evaluate(async () => window.__hymnTools.get('hymn_get_distribution_pricing').execute({ trackCount: 6 }));
      assert.equal(JSON.parse(result.content[0].text).oneTime.finalPrice, 546);
      await page.getByRole('link', { name: 'Read the policies', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__hymnTools.size)).toBe(3);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const page = await noScript.newPage();
  await page.goto(origin + '/pricing');
  const publicFallback = page.getByRole('region', { name: 'Public information without JavaScript', exact: true });
  for (const price of ['₹99', '₹699', '₹1,099', '₹1,999']) await expect(publicFallback.getByText(price, { exact: true })).toBeVisible();
  await page.goto(origin + '/');
  await expect(publicFallback.getByRole('link', { name: 'hymnmusicindia@gmail.com', exact: true })).toBeVisible();
  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = schemas.flatMap(text => { const value = JSON.parse(text); return value['@graph'] || [value]; });
  for (const type of ['Organization', 'WebSite', 'WebPage', 'Service', 'FAQPage']) assert(graph.some(node => node['@type'] === type), type);
  const organization = graph.find(node => node['@type'] === 'Organization'); assert.equal(organization.telephone, '+918793643228'); assert.equal(organization.sameAs.length, 2); assert(!organization.address);
  await noScript.close();
  console.log('PASS browser: modern and legacy WebMCP registration/execution/navigation, unsupported-browser fallback, no-JavaScript pricing/contact/schema.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else server.kill('SIGTERM'); server.stdout.destroy(); server.stderr.destroy(); server.unref(); }
  if (fs.readFileSync('next-env.d.ts', 'utf8').includes('.next-agent-readiness/')) fs.writeFileSync('next-env.d.ts', originalNextEnv);
  const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  const retained = config.include.filter(value => !value.startsWith('.next-agent-readiness/') || originalConfig.include.includes(value));
  if (retained.length !== config.include.length) fs.writeFileSync('tsconfig.json', JSON.stringify({ ...config, include: retained }, null, 2) + '\n');
});
