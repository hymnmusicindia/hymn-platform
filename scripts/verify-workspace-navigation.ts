import { strict as assert } from 'node:assert';
import { chromium, expect } from '@playwright/test';
import { consistentWorkspaceNavigation, workspaceNavigation, workspaceGroups } from '../lib/workspace-navigation';
async function main() {
const legacy = [
 {key:'overview',label:'Overview',group:'Home'},
 {key:'releases',label:'My releases',group:'Distribution',href:'/dashboard?tab=releases'},
 {key:'upload',label:'Upload beat',group:'Beatstore'},
 {key:'earnings',label:'Earnings',group:'Business'},
 {key:'profile',label:'Producer Profile',group:'Profile'},
 {key:'help',label:'Help & FAQ',group:'Support',href:'/faq'}
];
const normalized=consistentWorkspaceNavigation(legacy);
assert.equal(new Set(normalized.map(item=>item.key)).size,normalized.length);
assert.deepEqual([...new Set(normalized.map(item=>item.group))],['Home',...workspaceGroups.map(group=>group.title),'Money','Account & support']);
assert.equal(normalized.find(item=>item.key==='upload')?.href,undefined);
assert.equal(normalized.find(item=>item.key==='earnings')?.href,undefined);
assert.equal(normalized.find(item=>item.key==='help')?.href,'/faq');
assert.equal(normalized.find(item=>item.label==='My releases')?.href,'/dashboard/releases');
const admin=[{key:'overview',label:'Operations Overview',group:'Command Center'}];
assert.deepEqual(consistentWorkspaceNavigation(admin),admin);
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 let newsletterFail=false;
 await page.route("**/api/newsletter/subscribe",route=>route.fulfill({status:route.request().method()==="POST" && newsletterFail?503:200,json:route.request().method()==="GET"?{subscription:null}:newsletterFail?{error:"Newsletter is temporarily unavailable."}:{subscribed:true,unsubscribeToken:"test-token"}}));
 await page.route("**/api/newsletter/unsubscribe",route=>route.fulfill({json:{unsubscribed:true}}));
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});
  await page.goto('http://localhost:3015/faq',{waitUntil:'domcontentloaded',timeout:120000});
  await expect(page.locator('[data-nav-section]').first()).toBeAttached({timeout:30000});
  assert.deepEqual(await page.locator('[data-nav-section]').evaluateAll(nodes=>nodes.map(node=>node.textContent?.trim())),workspaceGroups.map(group=>group.title));
  for (const group of workspaceGroups) {
    await page.evaluate(label => window.dispatchEvent(new CustomEvent('hymn-reveal-service',{detail:label})),group.title);
    const links = page.locator('[data-module-tabs] a');
    await expect(links).toHaveCount(group.links.length);
    assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(node=>({label:node.textContent?.trim(),href:node.getAttribute('href')}))),workspaceNavigation.filter(item=>item.group===group.title).map(item=>({label:item.label,href:item.href})));
  }
  await page.evaluate(()=>window.dispatchEvent(new Event('hymn-hide-service')));
  await expect(page.locator('a.workspace-home-link')).toHaveAttribute('href','/');
  await page.waitForFunction(()=>Object.keys(document.querySelector('.workspace-footer button')||{}).some(key=>key.startsWith('__reactProps$')));
  await page.waitForTimeout(1000);
  const breadcrumb=page.locator(width<1024?'.mobile-workspace-subheader .workspace-breadcrumbs':'.studio-header-section .workspace-breadcrumbs');
  await expect(breadcrumb.getByRole('link',{name:'Support',exact:true})).toHaveAttribute('href','/dashboard?tab=support');
  await expect(breadcrumb.getByRole('link',{name:'FAQ',exact:true})).toHaveAttribute('aria-current','page');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hymn-workspace-breadcrumbs',{detail:{group:'Distribution',label:'Royalty splits',href:'/dashboard?tab=collaborators'}})));
  const parent=breadcrumb.getByRole('link',{name:'Distribution',exact:true});
  const child=breadcrumb.getByRole('link',{name:'Royalty splits',exact:true});
  await expect(parent).toHaveAttribute('href','/distribution');
  await expect(child).toHaveAttribute('href','/dashboard?tab=collaborators');
  assert.ok(await child.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)) < await parent.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hymn-workspace-breadcrumbs',{detail:{group:'Support',label:'FAQ',href:'/faq'}})));
  if(width<1024) await page.evaluate(()=>window.dispatchEvent(new Event('hymn-toggle-navigation')));
  const home=page.locator('a.workspace-home-link');
  assert.equal(await home.evaluate(node=>getComputedStyle(node).justifyContent),'center');
  assert.ok(await home.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))===14);
  assert.ok(await home.evaluate(node=>node.getBoundingClientRect().height)>=40);
  const newsletter=page.getByRole('form',{name:'Newsletter signup'});
  await expect(newsletter).toBeInViewport();
  await expect(newsletter.getByRole('textbox')).toBeHidden();
  assert.ok(await newsletter.evaluate(node=>node.getBoundingClientRect().height)<45);
  await newsletter.locator('summary').click();
  newsletterFail=true;
  await newsletter.getByRole('textbox',{name:'Newsletter email address'}).fill('artist@example.com');
  await newsletter.getByRole('button',{name:'Subscribe to newsletter'}).click();
  await expect(newsletter.getByRole('status')).toContainText('temporarily unavailable');
  await expect(newsletter.getByRole('textbox')).toHaveValue('artist@example.com');
  newsletterFail=false;
  await newsletter.getByRole('button',{name:'Subscribe to newsletter'}).click();
  await expect(newsletter.getByText('Subscribed',{exact:true})).toBeVisible();
  await newsletter.locator('summary').click();
  await expect(newsletter.locator('summary')).toContainText("You're subscribed to our newsletter");
  await expect(newsletter.getByRole('button',{name:'Unsubscribe',exact:true})).toBeHidden();
  assert.ok(await newsletter.evaluate(node=>node.getBoundingClientRect().height)<45);
  await newsletter.locator('summary').click();
  await newsletter.getByRole('button',{name:'Unsubscribe',exact:true}).click();
  await expect(newsletter.getByRole('textbox')).toBeVisible();
  const gift=page.locator('.workspace-footer').getByRole('link',{name:'Refer a friend',exact:true});
  await expect(gift).toBeInViewport();
  await page.locator('.workspace-footer').getByRole('button',{name:'More links'}).click();
  const terms=page.getByRole('link',{name:'Terms of service',exact:true}).filter({visible:true}).first();
  await expect(terms).toBeInViewport();
  await expect(terms).toHaveAttribute('href','/terms-of-service');
  await page.keyboard.press('Escape');
  if(width===1440) {
    await page.evaluate(()=>window.dispatchEvent(new Event('hymn-toggle-navigation')));
    await expect(page.getByRole('button',{name:'Open newsletter signup',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open newsletter signup',exact:true}).click();
    await expect(newsletter).toBeVisible();
  }
  await page.screenshot({path:`.cache/sidebar-${width}.png`,fullPage:true});

 }
 console.log('Navigation passed: canonical desktop/mobile order, labels, URLs, direct Home link, support grouping, producer tab preservation, unique keys and admin isolation.');
} finally { await browser.close(); }

}
main().catch(error=>{console.error(error);process.exitCode=1;});
