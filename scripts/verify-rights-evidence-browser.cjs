const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

async function main() {
 const bundle = await build({stdin:{contents:`import React,{StrictMode,useState} from 'react';import {createRoot} from 'react-dom/client';import {ReleaseCorrectionNotice,ReleaseRightsEvidence} from './components/release-rights-evidence';const mode=new URLSearchParams(location.search).get('mode');const initial={id:203,licenseReceiptUrl:'',tracks:mode==='aliases'?[{id:1,trackNumber:1,coverLicenseUrl:'/api/assets/378/download?download=1'}]:[],metadata:mode==='missing'?{}:mode==='unsafe'?{license_receipt_url:'javascript:alert(1)'}:mode==='external'?{license_receipt_url:'https://example.com/licence.pdf'}:{license_receipt_url:'/api/assets/378/download?filename=licence.pdf',sunoReceiptUrl:'/api/assets/379/download'}};function App(){const[review,setReview]=useState(false);const[release,setRelease]=useState(initial);window.updateEvidence=patch=>setRelease(r=>({...r,...patch}));return <main><ReleaseCorrectionNotice release={release} review={()=>setReview(true)}/>{review&&<ReleaseRightsEvidence release={release}/>}</main>}createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',format:'iife'});
 const pdf = await PDFDocument.create(); for(let i=0;i<3;i++)pdf.addPage().drawText('HYMN fixture licence page '+(i+1)); const bytes=Buffer.from(await pdf.save());
 const browser=await chromium.launch();
 try {
  for(const mode of ['attached','aliases','denied','gone','missing','unsafe','external','image','switch-race','close-race']) {
   const page=await browser.newPage({viewport:{width:mode==='attached'?1440:390,height:844}});const errors=[];let validationRequests=0;const csp=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.violatedDirective));});
   await page.route('https://hymn.fixture/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; frame-src 'self'; object-src 'none'"},body:'<div id="root"></div>'});
    if(request.resourceType()==='fetch')validationRequests++;
    if(['switch-race','close-race'].includes(mode)&&path.includes('/378/'))await new Promise(resolve=>setTimeout(resolve,400));
    if(mode==='denied')return route.fulfill({status:403,json:{error:'Forbidden'}});
    if(mode==='gone')return route.fulfill({status:404,json:{error:'Asset unavailable'}});
    if(mode==='image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGhoAAAAASUVORK5CYII=','base64')});
    return route.fulfill({contentType:'application/pdf',body:bytes});
   });
   await page.goto(`https://hymn.fixture/?mode=${mode}`);await page.addScriptTag({content:bundle.outputFiles[0].text});
   const missing=['missing','unsafe'].includes(mode);
   await page.getByRole('button',{name:missing?'Review rights & corrections':'Review attached evidence',exact:true}).click();
   const region=page.getByRole('region',{name:'Attached rights evidence'});
   if(missing){await expect(region).toContainText('No licence or rights-evidence document is attached');await expect(region.getByRole('link')).toHaveCount(0);}
   else if(mode==='external'){await expect(region.getByRole('link',{name:'Open Licence agreement'})).toHaveAttribute('href','https://example.com/licence.pdf');await expect(region.getByRole('button',{name:'Preview Licence agreement'})).toHaveCount(0);}
   else {
    await expect(region.getByRole('link',{name:'Download Licence agreement'})).toHaveAttribute('href','/api/assets/378/download?filename=licence.pdf&download=1');
    if(mode==='aliases')await expect(region.locator('article')).toHaveCount(2); // licence + genuinely separate AI receipt
    await region.getByRole('button',{name:'Preview Licence agreement'}).click();
    if(mode==='close-race'){
     await region.getByRole('button',{name:'Close preview',exact:true}).click();await page.waitForTimeout(600);await expect(region.locator('[data-rights-preview]')).toHaveCount(0);
    }else if(mode==='switch-race'){
     await region.getByRole('button',{name:'Preview AI generation receipt'}).click();await expect(region.getByTitle('AI generation receipt preview')).toHaveAttribute('src','/api/assets/379/download');await page.waitForTimeout(600);await expect(region.locator('iframe')).toHaveCount(1);await expect(region.getByTitle('Licence agreement preview')).toHaveCount(0);
    }else if(['denied','gone'].includes(mode))await expect(region.getByRole('alert')).toContainText(mode==='denied'?'do not have access':'upload it again');
    else if(mode==='image'){
     await expect(region.getByAltText('Licence agreement')).toHaveAttribute('src',/^blob:/);
     await page.evaluate(()=>{const revoke=URL.revokeObjectURL.bind(URL);window.revoked=[];URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url);};});
     await region.getByRole('button',{name:'Close preview',exact:true}).click();assert.equal(await page.evaluate(()=>window.revoked.length),1,'Image URL disposed on close');
    }else {
     const frame=region.getByTitle('Licence agreement preview');await expect(frame).toHaveAttribute('src','/api/assets/378/download?filename=licence.pdf');
     const first=await frame.elementHandle(),height=await region.evaluate(el=>el.getBoundingClientRect().height),requests=validationRequests;
     for(let i=0;i<20;i++){await page.evaluate(()=>window.updateEvidence({metadata:{license_receipt_url:'/api/assets/378/download?filename=licence.pdf',sunoReceiptUrl:'/api/assets/379/download'}}));await region.getByRole('button',{name:'Preview Licence agreement'}).click();}
     assert.equal(validationRequests,requests,'Refreshes and repeated clicks must not reload the document');
     await expect(region.locator('iframe')).toHaveCount(1);await expect(region.locator('[data-rights-preview-viewport]')).toHaveCount(1);assert(await first.evaluate(el=>el.isConnected),'Viewer node remains stable');
     assert(Math.abs((await region.evaluate(el=>el.getBoundingClientRect().height))-height)<2,'Review height stays bounded');
     await page.evaluate(()=>window.updateEvidence({id:204}));await expect(region.locator('iframe')).toHaveCount(0);await expect(region.locator('[data-rights-preview]')).toHaveCount(0);
     await region.getByRole('button',{name:'Preview Licence agreement'}).click();await expect(frame).toBeVisible();
     await page.evaluate(()=>window.updateEvidence({metadata:{},tracks:[]}));await expect(region.locator('iframe')).toHaveCount(0);
    }
    const close=region.getByRole('button',{name:'Close preview',exact:true});if(await close.count())await close.click();await expect(region.locator('iframe')).toHaveCount(0);
   }
   csp.push(...await page.evaluate(()=>window.cspViolations));assert.deepEqual(csp,[],'Preview complies with production frame/object policies');
   if(errors.length)throw Error(errors.join('\n'));await page.close();
  }
  console.log('PASS rights evidence UI: production CSP, stable single viewer, 20 refresh/reopen cycles, bounded height, alias dedupe, document/release switching, stale response cancellation, close races, image URL cleanup, missing files and access errors.');
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
