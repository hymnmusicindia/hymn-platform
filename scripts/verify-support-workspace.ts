import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
async function main(){
 const dir='app/support-audit-preview';if(existsSync(dir))throw new Error('Preview already exists');mkdirSync(dir);
 writeFileSync(`${dir}/page.tsx`, `"use client";import {useState} from "react";import {SupportWorkspace} from "@/components/support-workspace";export default function Page(){const [tickets,setTickets]=useState([{id:1,userId:1,subject:"Release delivery question",message:"Please check the delivery of my latest release.",category:"release_correction",status:"in_progress" as const,createdAt:"2026-10-10T12:00:00Z",updatedAt:"2026-10-11T12:00:00Z"},{id:2,userId:1,subject:"License resolved",message:"I received my license successfully.",category:"beat_license",status:"resolved" as const,createdAt:"2026-10-09T12:00:00Z",updatedAt:"2026-10-10T12:00:00Z"}]);return <main style={{minHeight:"100vh",background:"#171b23",padding:24}}><SupportWorkspace tickets={tickets} releases={[{id:51,label:"Red Carpet"}]} purchases={[{id:7,label:"Purchase #7"}]} payouts={[{id:8,label:"Payout #8"}]} onRetry={()=>{}} onCreated={ticket=>setTickets(items=>[ticket,...items])}/></main>}`);
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let fail=false;let writes=0;let last:Record<string,unknown>={};
  await page.route('**/api/support-tickets',async route=>{writes++;last=route.request().postDataJSON();await route.fulfill({status:fail?503:201,json:fail?{error:'Temporarily unavailable. Try again.'}:{ticket:{...last,id:100+writes,userId:1,status:'open',createdAt:'2026-10-11T13:00:00Z',updatedAt:'2026-10-11T13:00:00Z'}}});});
  for(const width of [1440,390,320]) {
   await page.setViewportSize({width,height:900});await page.goto('http://localhost:3015/support-audit-preview',{timeout:120000});
   await expect(page.getByRole('heading',{name:'Keep your music moving.'})).toBeVisible({timeout:30000});
   await expect(page.locator('.support-topic')).toHaveCount(6);
   await page.getByRole('button',{name:'Completed',exact:true}).click();await expect(page.locator('.support-ticket')).toHaveCount(1);
   await page.getByRole('button',{name:'All requests',exact:true}).click();await page.getByRole('searchbox',{name:'Search requests'}).fill('delivery');await expect(page.locator('.support-ticket')).toHaveCount(1);
   await page.getByRole('searchbox',{name:'Search requests'}).fill('missing');await expect(page.getByText('No matching requests.')).toBeVisible();await page.getByRole('button',{name:'Reset filters'}).click();
   await page.getByRole('button',{name:/Music & releases/}).click();
   const form=page.getByRole('form',{name:'New support request'});await expect(form).toBeVisible();
   await page.screenshot({path:`.cache/support-form-${width}.png`,fullPage:true});
   await expect(form.locator('[name=relatedReleaseId]')).toBeVisible();await expect(form.locator('[name=relatedPurchaseId]')).toHaveCount(0);
   await form.getByLabel('Related release',{exact:false}).selectOption('51');
   await form.getByLabel('What do you need help with?',{exact:true}).fill('My release is missing');await form.getByLabel('The details',{exact:false}).fill('My release is not appearing in the selected stores.');
   fail=true;await form.getByRole('button',{name:'Send request',exact:true}).click();await expect(form.getByRole('alert')).toContainText('Temporarily');await expect(form.locator('[name=subject]')).toHaveValue('My release is missing');
   fail=false;await form.getByRole('button',{name:'Send request',exact:true}).click();await expect(page.getByRole('status')).toContainText('received');await expect(form).toHaveCount(0);expect(last.relatedReleaseId).toBe('51');expect(last.relatedPurchaseId).toBeNull();
   await expect(page.locator('.support-ticket')).toHaveCount(3);await expect(page.locator('.support-ticket[open]')).toHaveCount(1);
   await page.screenshot({path:`.cache/support-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:/Beats & licenses/}).click();await expect(page.locator('[name=relatedPurchaseId]')).toBeVisible();await expect(page.locator('[name=relatedReleaseId]')).toHaveCount(0);
   await page.locator('.support-composer select').first().selectOption('account_access');await expect(page.locator('[name=relatedPurchaseId]')).toHaveCount(0);
   await page.getByRole('button',{name:'Close new request',exact:true}).click();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);console.log('Support passed: issue selection, conditional references, status/search filters, failed submission retention, creation/receipt/history, keyboard labels and three viewport widths.');
 } finally {await browser.close();unlinkSync(`${dir}/page.tsx`);rmdirSync(dir);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
