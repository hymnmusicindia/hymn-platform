const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const dir = path.resolve('.tmp/review-evidence'); await fs.mkdir(dir, { recursive: true });
  const videoBytes = await fs.readFile('public/testimonials/viraj-review.mp4');
  const posterBytes = await fs.readFile('public/testimonials/viraj-review-poster.webp');
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{HomeReviewsCarousel}from'./components/home-reviews-carousel';import{PostPurchaseReviewPrompt}from'./components/post-purchase-review-prompt';const root=createRoot(document.getElementById('root'));window.renderReviews=(signedIn=true)=>root.render(<><HomeReviewsCarousel signedIn={signedIn} reviews={Array.from({length:4},(_,i)=>({id:i+1,rating:5,body:'Review from a customer using HYMN.',featured:true,featuredOrder:i,purchaseType:'service',user:{id:i+1,name:'Artist '+(i+1),avatar:null}}))}/><PostPurchaseReviewPrompt/></>);window.renderReviews();`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, external: ['/fonts/*'], outfile: path.join(dir, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`, loader: 'tsx', resolveDir: process.cwd() }));
  } }] });
  const browser = await chromium.launch();
  try {
    for (const { width, reduced } of [{width:390,reduced:false},{width:1440,reduced:false},{width:390,reduced:true},{width:1440,reduced:true}]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced?'reduce':'no-preference' });
      const page = await context.newPage(); const errors = []; const saved = [];
      let videoRequests = 0, eligible = { purchaseType: 'service', purchaseId: 77, label: 'A real purchase fixture' }, failed = false;
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://hymn.test/', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><button id="outside">Browse music</button>' }));
      await page.route('**/testimonials/viraj-review.mp4', route => { videoRequests++; return route.fulfill({ contentType: 'video/mp4', body: videoBytes }); });
      await page.route('**/testimonials/viraj-review-poster.webp', route => route.fulfill({ contentType: 'image/webp', body: posterBytes }));
      await page.route('**/api/reviews/eligible', route => route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ eligible }) }));
      await page.route('**/api/reviews', route => { saved.push(route.request().postDataJSON()); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ review: { id: 88 } }) }); });
      await page.route('**/api/reviews/88', route => { saved.push(route.request().postDataJSON()); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
      await page.goto('https://hymn.test/');
      await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;font-family:Arial;--hymn-bg:#f6f7f9;--hymn-card:#fff;--hymn-bg-soft:#edf0f4;--hymn-text:#192330;--hymn-text-muted:#4c5b6d;--hymn-border:#cbd3de;--hymn-focus:#2357a0;--bg:var(--hymn-bg);--card:var(--hymn-card);--text:var(--hymn-text);--text-muted:var(--hymn-text-muted);--border:var(--hymn-border);--bg-soft:var(--hymn-bg-soft);--focus:var(--hymn-focus);background:var(--bg);color:var(--text)}button,a{font:inherit}button{cursor:pointer}' });
      await page.addStyleTag({ path: path.join(dir, 'ui.css') }); await page.addScriptTag({ path: path.join(dir, 'ui.js') });
      const watch = page.getByRole('button', { name: "Watch Viraj's video review of HYMN", exact: true });
      await expect(watch).toBeVisible(); assert.equal(videoRequests, 0, 'No video download before a visitor presses play');
      await expect(page.getByRole('dialog')).toHaveCount(0); // Automatic review requests remain deferred.
      const carousel=page.getByRole('region',{name:'Artist reviews. Hover, focus or select a review to pause.',exact:true});
      assert.equal(await page.getByRole('button',{name:/Next artist review|Previous artist review/}).count(),0,'No manual arrow controls');
      await carousel.scrollIntoViewIfNeeded();await page.mouse.move(0,0);const before=await carousel.evaluate(el=>el.scrollLeft);await page.waitForTimeout(700);const after=await carousel.evaluate(el=>el.scrollLeft);assert.equal(reduced?after===before:after>before+5,true,'Automatic movement respects reduced motion');
      const textReview=page.getByRole('button',{name:'Review by Artist 1',exact:true});await textReview.hover();await expect(textReview).toHaveAttribute('data-review-active','true');const hovered=await carousel.evaluate(el=>el.scrollLeft);await page.waitForTimeout(300);assert.equal(await carousel.evaluate(el=>el.scrollLeft),hovered,'Hover pauses movement');await textReview.click();await page.mouse.move(0,0);const pinned=await carousel.evaluate(el=>el.scrollLeft);await page.waitForTimeout(300);assert.equal(await carousel.evaluate(el=>el.scrollLeft),pinned,'Clicked review remains active');await page.locator('#outside').click();
      await watch.click(); await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.waitForFunction(() => { const video = document.querySelector('video'); return video && Number.isFinite(video.duration); });
      const metadata = await page.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, controls: video.controls }));
      assert(metadata.duration > 29 && metadata.duration < 30); assert.equal(metadata.width, 1920); assert(metadata.controls);
      await page.screenshot({ path: path.join(dir, `video-${width}.png`) });
      const playingPosition=await carousel.evaluate(el=>el.scrollLeft);await page.mouse.move(0,0);await page.waitForTimeout(400);assert.equal(await carousel.evaluate(el=>el.scrollLeft),playingPosition,'Playing review stays still');
      await page.getByRole('button',{name:'Back to video preview',exact:true}).click();await expect(page.locator('video')).toHaveCount(0);await expect(watch).toBeFocused();
      await page.evaluate(() => localStorage.setItem('hymn-review-snooze:service:77', String(Date.now() + 1000000)));
      await page.getByRole('button', { name: 'Share your experience', exact: false }).click();
      await expect(page.getByRole('dialog', { name: 'How was submitting your release?' })).toBeVisible();
      await page.getByRole('radio', { name: /1 star.*Poor/ }).check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByLabel('A few words', { exact: false }).fill('Honest feedback, including what could be better.');
      await page.getByRole('button', { name: 'Send feedback', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.equal(saved[0].rating, 1, 'The invitation accepts critical ratings without gating');
      assert.equal(saved[0].purchaseId, 77); assert.match(saved[1].body, /Honest feedback/);
      eligible = null; await page.getByRole('button', { name: 'Share your experience', exact: false }).click(); await expect(page.getByRole('status')).toContainText('Reviews open after a completed purchase');
      failed = true; await page.getByRole('button', { name: 'Share your experience', exact: false }).click(); await expect(page.getByRole('status')).toContainText('Could not load your purchases');
      await page.evaluate(() => window.renderReviews(false));
      assert.match(await page.getByRole('link', { name: 'Share your experience', exact: false }).getAttribute('href'), /review%3D1/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(dir, `carousel-${width}.png`), fullPage: true });
      console.log(`PASS ${width}px ${reduced?'reduced':'normal'} motion: supplied video, click-only loading, original metadata, native inline controls, automatic movement, hover/select pause, reduced motion, no arrows or popup, verified-purchase review, critical feedback, no-purchase and retry states, guest sign-in.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
