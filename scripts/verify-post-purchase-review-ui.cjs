const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(),'hymn-review-ui-'));
  await build({ stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PostPurchaseReviewPrompt} from './components/post-purchase-review-prompt';import {markReviewConfirmationEntered,markReviewConfirmationLeft} from './lib/purchase-review-timing';markReviewConfirmationEntered();createRoot(document.getElementById('root')).render(<PostPurchaseReviewPrompt/>);window.leaveConfirmation=()=>{document.getElementById('confirmation').remove();history.pushState({},'', '/dashboard');requestAnimationFrame(markReviewConfirmationLeft);};`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(output,'review.js'),jsx:'automatic' });
  const browser = await chromium.launch();
  try {
    for (const width of [1100,390]) {
      const context = await browser.newContext({ viewport:{width,height:850} }); const page = await context.newPage();
      let posts=0, patches=0;
      await page.route('https://hymn.fixture/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname==='/api/reviews/eligible') return route.fulfill({json:{eligible:{purchaseType:'service',purchaseId:7,label:'half_yearly · apke master'}}});
        if (url.pathname==='/api/reviews' && route.request().method()==='POST') { posts++; assert.equal(route.request().postDataJSON().rating,1); return route.fulfill({json:{review:{id:12}},status:201}); }
        if (url.pathname==='/api/reviews/12') { patches++; return route.fulfill({json:{success:true}}); }
        return route.fulfill({body:'<style>*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#11151c;color:white}button,textarea,input{font-family:inherit}</style><button id="confirmation" data-release-review-confirmation>Track my release</button><div id="root"></div>',contentType:'text/html'});
      });
      await page.goto('https://hymn.fixture/distribution/start');
      await page.addStyleTag({path:path.join(output,'review.css')});await page.addScriptTag({path:path.join(output,'review.js')});
      await page.waitForTimeout(250); await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hymn:purchase-review-eligible',{detail:{purchaseType:'service',purchaseId:7,label:'half_yearly · apke master'}})));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (width===390) await page.evaluate(()=>{const modal=document.createElement('section');modal.id='other-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');document.body.append(modal);});
      await page.evaluate(()=>window.leaveConfirmation());
      if (width===390) { await page.waitForTimeout(100);await expect(page.locator('[data-purchase-review]')).toHaveCount(0);await page.evaluate(()=>document.getElementById('other-dialog').remove()); }
      await expect(page.getByRole('dialog',{name:'How was submitting your release?'})).toBeVisible();
      await expect(page.getByText('half_yearly · apke master')).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
      await page.screenshot({path:path.join(output,`purchase-review-${width}.png`),fullPage:true});
      await page.getByRole('radio',{name:'1 star — Poor',exact:true}).check();assert.equal(posts,0,'Rating is not irrevocably saved on selection');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(page.getByLabel('A few words (optional)')).toBeVisible();
      await page.getByLabel('A few words (optional)').fill('The upload process could be clearer.');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByRole('button',{name:'Send feedback',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.equal(posts,1);assert.equal(patches,1);
      console.log(`PASS ${width}px: confirmation not interrupted; exit triggers prompt; no robotic labels; explicit rating save; negative ratings get the same optional comment step.`);
      await context.close();
    }
    console.log('Review prompt previews: '+output);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
