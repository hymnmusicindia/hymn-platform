const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('@playwright/test');
async function main(){
 const directory=fs.mkdtempSync(path.resolve('.tmp/client-details-ui-'));
 const entry=path.join(directory,'entry.tsx');
 fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {ClientDetailsPreferences} from '../../components/client-details-preferences';createRoot(document.getElementById('root')!).render(<ClientDetailsPreferences/>);`);
 await build({entryPoints:[entry],outdir:directory,bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'local-css'},tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
 const js=fs.readFileSync(path.join(directory,'entry.js'),'utf8'),css=fs.readFileSync(path.join(directory,'entry.css'),'utf8');
 let saved={revision:0,details:{country:'India',state:'Delhi',city:'New Delhi',ageBand:'UNDER_18',lifeStage:'COLLEGE',projectBudget:'FREE_ONLY'}},rejectNext=false;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:1000}});
  await page.route('http://hymn.fixture/**',async route=>{
   if(new URL(route.request().url()).pathname==='/api/user/client-details'){
    if(route.request().method()==='PATCH'){
     const data=route.request().postDataJSON();
     if(rejectNext){rejectNext=false;return route.fulfill({status:409,json:{error:'These details changed in another session. Reload the saved details before saving again.'}});}
     saved={revision:saved.revision+1,details:data.details};
    }
    return route.fulfill({json:saved});
   }
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><div id="root"></div></body></html>'});
  });
  await page.goto('http://hymn.fixture/');
  await page.addStyleTag({content:':root{--text:#172033;--bg:#f6f7f9;--surface:#e8edf3;--border:#ccd5df;--bg-soft:#e8edf3;--text-muted:#596779}*{box-sizing:border-box}body{margin:0;background:var(--bg);font:14px Arial,sans-serif}button{cursor:pointer}'+css});
  await page.addScriptTag({content:js});
  const save=page.getByRole('button',{name:'Save project details'});await save.waitFor();
  await page.locator('[name=city]').fill('Pune');
  saved={...saved,revision:1,details:{...saved.details,city:'Mumbai',state:'Maharashtra'}};rejectNext=true;
  await save.click();await page.getByRole('alert').filter({hasText:'another session'}).waitFor();
  await page.getByRole('button',{name:/Reload saved details/}).click();
  await page.waitForFunction(()=>document.querySelector('[name=city]')?.value==='Mumbai');
  assert.equal(await page.locator('[name=state]').inputValue(),'Maharashtra');
  await page.locator('[name=city]').fill('Bengaluru');await save.click();await page.getByRole('status').filter({hasText:'Project details saved.'}).waitFor();assert.equal(saved.details.city,'Bengaluru');
  fs.mkdirSync('artifacts/client-call-details',{recursive:true});
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('[name=country]').evaluate(e=>e.getBoundingClientRect().height>=44));assert.ok(await save.evaluate(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`artifacts/client-call-details/form-focus-${width}.png`,fullPage:true});}
  for(const key of ['country','state','city'])await page.locator(`[name=${key}]`).fill('');for(const key of ['ageBand','lifeStage','projectBudget'])await page.locator(`[name=${key}]`).selectOption('');await save.click();await page.getByRole('status').filter({hasText:'Project details saved.'}).waitFor();assert.ok(Object.values(saved.details).every(v=>v===''));
  console.log('PASS actual profile component: stale-edit recovery replaces inputs, save/clear, responsive field styling and visible save action.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
