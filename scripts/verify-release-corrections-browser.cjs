const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ReleaseCorrectionForm} from './components/release-correction-form'; createRoot(document.getElementById('root')).render(<ReleaseCorrectionForm release={{id:7,status:'live',upcCode:'3473620314135',tracks:[{id:9,trackNumber:1,trackTitle:'Existing recording',isrc:'INDN22602494'}]}} onCreated={r=>window.saved=r}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); let body;
    await page.route('https://correction.fixture/**', async route => {
      if (route.request().url().includes('/api/releases/')) { body = route.request().postDataJSON(); await route.fulfill({ json: { request: { id: 12, status: 'submitted' } } }); }
      else await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://correction.fixture'); await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.getByLabel('Artist to add', { exact: true }).fill('Guest Artist');
    await page.getByLabel('What needs correcting?').fill('Please add the credited featured artist.');
    await page.locator('select[name="artist_type"]').selectOption('featuring');
    await page.getByRole('button', { name: 'Submit correction for review' }).click();
    await page.getByRole('status').filter({ hasText: 'Correction #12 saved' }).waitFor();
    assert.deepEqual(body.requestedChanges.supportCorrection, { action: 'request_add_artist', trackId: 9, artist_name: 'Guest Artist', artist_type: 'featuring' });
    assert.equal(await page.evaluate(() => window.saved.id), 12);
    await page.getByLabel('Correction', { exact: true }).selectOption('request_audio_change');
    await page.getByText('WAV · 44.1 kHz · stereo · 24-bit · under 100 MB', { exact: false }).waitFor();
    assert.equal(await page.locator('input[name="file"]').getAttribute('accept'), '.wav,audio/wav');
    await page.getByLabel('Correction', { exact: true }).selectOption('request_replace_artist');
    await page.getByText('For the same artist linked to the wrong Spotify profile', { exact: false }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile form must fit viewport.');
    console.log('Correction form: mobile layout, selected recording, artist role, receipt feedback and replacement-file guidance passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
