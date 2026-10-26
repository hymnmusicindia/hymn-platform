const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {chromium,expect}=require('@playwright/test');
const {mkdirSync}=require('node:fs');
async function main(){
  const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ReferralConsentManager}from'./components/referral-consent-manager';createRoot(document.getElementById('root')).render(<><ReferralConsentManager promptOnly/><ReferralConsentManager/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'consent-preview.js',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const script=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
  mkdirSync('.cache/referral-consent-ui',{recursive:true});
  const browser=await chromium.launch();
  try{for(const width of [320,390,1440]){
    const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
    let offer={name:'Kira',avatar:null,kind:'EMPLOYEE',proof:'account-bound-fixture-proof',alreadyConnected:false,conflict:false,minimumDays:45};
    let active=[],invitation=offer,failRemoval=true;const calls=[];
    await page.route('https://consent.fixture/**',async route=>{
      if(!route.request().url().includes('/api/'))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'});
      if(route.request().method()==='GET')return route.fulfill({json:{connections:active,invitation,hasInvitation:Boolean(invitation),invitationError:''}});
      const body=route.request().postDataJSON();calls.push(body);
      if(body.action==='approve'){assert.equal(body.confirmed,true);assert.equal(body.proof,offer.proof);active=[{id:'employee-fixture',kind:'EMPLOYEE',name:'Kira',connectedAt:'2026-10-26T11:30:00Z',removableAt:'2026-12-10T11:30:00Z',canRemove:false,legacy:false}];invitation=null;return route.fulfill({json:{success:true}});}
      if(body.action==='decline'){invitation=null;return route.fulfill({json:{success:true}});}
      if(body.action==='remove'){if(failRemoval){failRemoval=false;return route.fulfill({status:409,json:{error:'Connection changed. Check again before removing.'}});}active=[];return route.fulfill({json:{success:true}});}
      return route.fulfill({json:{invitation:offer}});
    });
    await page.goto('https://consent.fixture/');await page.addStyleTag({content:`*{box-sizing:border-box}body{margin:0;padding:16px;background:#0b1018;color:#edf1f7;font-family:Arial,sans-serif;--card:#131b27;--border:#303c50;--text:#edf1f7;--text-muted:#9fadc1}button,input{font:inherit}${css}`});await page.addScriptTag({content:script});
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByText('Kira',{exact:true})).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Approve connection'})).toBeDisabled();assert.equal(calls.length,0,'Opening the invitation makes no approval mutation.');
    await page.screenshot({path:`.cache/referral-consent-ui/review-${width}.png`,fullPage:true});
    await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Approve connection'}).click();await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Kira',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeDisabled();
    active=active.map(row=>({...row,canRemove:true}));await page.evaluate(()=>window.dispatchEvent(new Event('hymn:referral-updated')));
    await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Remove connection',exact:true}).click();
    assert.equal(calls.filter(c=>c.action==='remove').length,0,'Removal requires a second explicit confirmation.');
    await page.getByRole('button',{name:'Confirm removal'}).click();await expect(page.getByRole('alert')).toContainText('Connection changed');await expect(page.getByRole('heading',{name:'Kira',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Confirm removal'}).click();await expect(page.getByRole('heading',{name:'No active referral connections'})).toBeVisible();
    invitation=offer;await page.evaluate(()=>window.dispatchEvent(new Event('hymn:referral-updated')));await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(calls.filter(c=>c.action==='approve').length,1,'Escape declines instead of approving.');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow.');
    await page.screenshot({path:`.cache/referral-consent-ui/connections-${width}.png`,fullPage:true});await context.close();
  }}finally{await browser.close();}
  console.log('PASS referral consent UI at 320/390/1440px: named approval dialog, explicit checkbox, locked removal date, second confirmation, stale-state retry, Escape decline and no horizontal overflow.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
