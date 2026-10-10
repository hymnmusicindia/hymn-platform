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
assert.deepEqual([...new Set(normalized.map(item=>item.group))],['Home',...workspaceGroups.map(group=>group.title)]);
assert.equal(normalized.find(item=>item.key==='upload')?.href,undefined);
assert.equal(normalized.find(item=>item.key==='earnings')?.href,undefined);
assert.equal(normalized.find(item=>item.key==='help')?.href,'/dashboard?tab=support');
assert.equal(normalized.find(item=>item.label==='My releases')?.href,'/dashboard/releases');
const admin=[{key:'overview',label:'Operations Overview',group:'Command Center'}];
assert.deepEqual(consistentWorkspaceNavigation(admin),admin);
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  await page.goto('http://localhost:3015/faq',{waitUntil:'domcontentloaded',timeout:120000});
  await expect(page.locator('.dashboard-os-group-toggle').first()).toBeAttached({timeout:30000});
  assert.deepEqual(await page.locator('.dashboard-os-group-toggle').evaluateAll(nodes=>nodes.map(node=>node.textContent?.trim())),workspaceGroups.map(group=>group.title));
  const links=page.locator('a[data-nav-key]');
  assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(node=>({label:node.textContent?.trim(),href:node.getAttribute('href')}))),workspaceNavigation.filter(item=>item.group!=='Home').map(item=>({label:item.label,href:item.href})));
  await expect(page.locator('a.workspace-home-link')).toHaveAttribute('href','/');
 }
 console.log('Navigation passed: canonical desktop/mobile order, labels, URLs, direct Home link, support grouping, producer tab preservation, unique keys and admin isolation.');
} finally { await browser.close(); }

}
main().catch(error=>{console.error(error);process.exitCode=1;});
