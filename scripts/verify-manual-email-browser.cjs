const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const http = require('node:http');
const { readFileSync } = require('node:fs');
(async () => {
  await build({ stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {AdminManualEmail} from "./components/admin-manual-email"; createRoot(document.getElementById("app")).render(React.createElement(AdminManualEmail,{configured:true}));', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', outfile: '.cache/manual-email-browser.js', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const server = http.createServer((request, response) => { response.setHeader('Content-Type', request.url === '/bundle.js' ? 'application/javascript' : 'text/html'); response.end(request.url === '/bundle.js' ? readFileSync('.cache/manual-email-browser.js') : '<div id="app"></div><script src="/bundle.js"></script>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let sends = 0, previewDraft;
    await page.route('**/api/admin/manual-email', async route => {
      const payload = route.request().postDataJSON();
      if (payload.action === 'send') sends++; else previewDraft = payload.draft;
      await route.fulfill({ json: payload.action === 'preview' ? { html: '<h1>Verified preview</h1>' } : { status: 'sent' } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Blank message', exact: true }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved on this browser.');
    await page.reload();
    await page.getByRole('button', { name: 'Load saved draft', exact: true }).click();
    await expect(page.getByLabel('Recipient', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Release under review', exact: true }).click();
    await page.getByLabel('Recipient', { exact: true }).fill('test@example.com');
    await page.getByLabel('Button link', { exact: true }).fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Preview email', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('HTTP');
    await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
    await page.getByLabel('Button link', { exact: true }).fill('https://hymnmusic.fun/dashboard/releases/81');
    await page.getByRole('button', { name: 'Preview email', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeEnabled();
    await page.getByLabel('Subject', { exact: true }).fill('Updated subject');
    await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Preview email', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Send email', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Email sent successfully.');
    await expect(page.getByRole('button', { name: 'Sent', exact: true })).toBeDisabled();
    if (sends !== 1 || previewDraft.subject !== 'Updated subject' || errors.length) throw Error(JSON.stringify({ sends, errors }));
    console.log('Browser composer passed: incomplete draft persistence, unsafe link rejection, preview invalidation and one explicit send. No real email sent.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
