const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium,expect}=require('@playwright/test');
(async()=>{
const output=await fs.mkdtemp(path.join(os.tmpdir(),'hymn-manual-cron-'));
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AdminManualCron} from './components/admin-manual-cron';createRoot(document.getElementById('root')).render(<AdminManualCron/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(output,'ui.js'),jsx:'automatic',plugins:[{name:'router',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return {refresh(){window.refreshes=(window.refreshes||0)+1}}}'}));}}]});
const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage();let calls=0,releaseResponse;let payload={success:true,processedCount:2,changedCount:1,correctionCount:1,errorCount:1,results:[{releaseId:81,title:'YAMUNAWOOD',success:true,status:'changes_required'},{releaseId:21,title:'magenta',success:false,error:'Awaiting UPC'}]};
await page.route('**/api/admin/cron/release-status',async route=>{calls++;await new Promise(resolve=>releaseResponse=resolve);await route.fulfill({json:payload});});
await page.setContent('<base href="https://hymn.fixture/"><div id="root"></div>');
await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;padding:20px;font-family:Arial;background:#191b21;--text:#f3f5f8;--text-muted:#b2bac7;--text-soft:#909cac;--border:#363b44;--card:#252931;--bg:#191b21;--danger:#ff9999}p,h2{margin:0}'});
await page.addStyleTag({path:path.join(output,'ui.css')});await page.addScriptTag({path:path.join(output,'ui.js')});
const button=page.getByRole('button',{name:'Run sync now'});await button.click();await expect(page.getByRole('button',{name:'Sync running…'})).toBeDisabled();assert.equal(calls,1);releaseResponse();
await expect(page.getByRole('status')).toContainText('Completed with issues');await page.getByText('View per-release results').click();await expect(page.getByText('changes required',{exact:true})).toBeVisible();await expect(page.getByText('Awaiting UPC',{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.refreshes),1);
for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,`cron-${width}.png`)});}
payload={success:true,skipped:'already_running'};await button.click();await expect(page.getByRole('button',{name:'Sync running…'})).toBeDisabled();releaseResponse();await expect(page.getByRole('status')).toContainText('No duplicate job was started');assert.equal(await page.evaluate(()=>window.refreshes),1);
console.log('PASS manual sync loading, partial results, overlap notice, refresh and mobile layout. Previews: '+output);
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
