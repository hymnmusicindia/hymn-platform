import {chromium,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
async function main(){
 mkdirSync('.cache/faq',{recursive:true});const browser=await chromium.launch();
 try {
  const page=await browser.newPage({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1440,390,320]) {
   await page.setViewportSize({width,height:900});await page.goto('http://localhost:3015/faq',{waitUntil:'domcontentloaded',timeout:120000});
   await expect(page.getByRole('heading',{name:'More clarity. More time for music.'})).toBeVisible({timeout:30000});
   await page.waitForFunction(()=>Object.keys(document.querySelector('input[aria-label="Search FAQ"]') ?? {}).some(key=>key.startsWith('__reactProps$')));
   const ids=await page.locator('.faq-article').evaluateAll(nodes=>nodes.map(node=>node.id));expect(ids.length).toBeGreaterThan(30);expect(new Set(ids).size).toBe(ids.length);
   await page.screenshot({path:`.cache/faq/home-${width}.png`});
   await page.getByRole('textbox',{name:'Search FAQ'}).fill('Google authentication');await expect(page.locator('.faq-article')).toHaveCount(1);await page.locator('.faq-article h3 button').click();await expect(page.locator('.faq-article [role=region]')).toBeVisible();
   await page.getByRole('button',{name:'Clear FAQ search'}).click();await expect(page.getByRole('textbox',{name:'Search FAQ'})).toBeFocused();
   await page.getByRole('navigation',{name:'FAQ categories'}).getByRole('button',{name:/Audio & artwork/}).click();await expect(page.locator('.faq-article')).toHaveCount(2);
   await page.getByRole('textbox',{name:'Search FAQ'}).fill('zzzz-no-answer');await expect(page.getByText('No matching answer yet.')).toBeVisible();await page.getByRole('button',{name:'Reset search'}).click();await expect(page.locator('.faq-article')).toHaveCount(ids.length);
   await page.getByRole('link',{name:'Beat licenses',exact:true}).click();await expect(page.locator('#beat-licensing-trigger')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#beat-licensing-panel')).toBeVisible();
   await page.goto('http://localhost:3015/faq#isrc',{waitUntil:'domcontentloaded',timeout:120000});await expect(page.locator('#isrc-trigger')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#isrc-trigger')).toBeFocused();
   await page.screenshot({path:`.cache/faq/answer-${width}.png`});await page.locator('#isrc-trigger').press('Enter');await expect(page.locator('#isrc-panel')).toBeHidden();
   await expect(page.locator('.faq-contact a')).toHaveAttribute('href','/dashboard?tab=support');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.goto('http://localhost:3015/faq#%E0%A4%A',{timeout:120000});await expect(page.getByRole('textbox',{name:'Search FAQ'})).toBeVisible();expect(errors).toEqual([]);
  console.log('FAQ passed: unique answers, category/search/reset, direct hash links, malformed hashes, keyboard accordion and support links at desktop/390px/320px.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
