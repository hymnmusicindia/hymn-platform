const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const bundle = await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ReleaseCorrectionNotice,ReleaseRightsEvidence} from './components/release-rights-evidence';const mode=new URLSearchParams(location.search).get('mode');const release={id:136,licenseReceiptUrl:'',tracks:[],metadata:mode==='missing'?{}:mode==='unsafe'?{license_receipt_url:'javascript:alert(1)'}:mode==='external'?{license_receipt_url:'https://example.com/licence.pdf'}:{license_receipt_url:'/api/assets/378/download?filename=licence.pdf'}};function App(){const[review,setReview]=useState(false);return <main><ReleaseCorrectionNotice release={release} review={()=>setReview(true)}/>{review&&<ReleaseRightsEvidence release={release}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',format:'iife'});
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('HYMN fixture licence'); const bytes=Buffer.from(await pdf.save());
  const browser=await chromium.launch();
  try {
    for(const mode of ['attached','denied','gone','missing','unsafe','external']) {
      const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://hymn.fixture/**',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):mode==='denied'?route.fulfill({status:403,json:{error:'Forbidden'}}):mode==='gone'?route.fulfill({status:404,json:{error:'Asset unavailable'}}):route.fulfill({contentType:'application/pdf',body:bytes}));
      await page.goto(`https://hymn.fixture/?mode=${mode}`);await page.addScriptTag({content:bundle.outputFiles[0].text});
      const missing=['missing','unsafe'].includes(mode);
      await expect(page.getByRole('button',{name:missing?'Review rights & corrections':'Review attached evidence',exact:true})).toBeVisible();
      await page.getByRole('button',{name:missing?'Review rights & corrections':'Review attached evidence',exact:true}).click();
      if(missing) { await expect(page.getByRole('region',{name:'Attached rights evidence'})).toContainText('No licence or rights-evidence document is attached');await expect(page.getByRole('link')).toHaveCount(0); }
      else if(mode==='external') { await expect(page.getByRole('link',{name:'Open Licence agreement'})).toHaveAttribute('href','https://example.com/licence.pdf');await expect(page.getByRole('button',{name:'Preview Licence agreement'})).toHaveCount(0); }
      else {
        await expect(page.getByRole('link',{name:'Download Licence agreement'})).toHaveAttribute('href','/api/assets/378/download?filename=licence.pdf&download=1');
        await page.getByRole('button',{name:'Preview Licence agreement'}).click();
        if(mode==='attached') { await expect(page.getByTitle('Licence agreement preview')).toBeVisible();await expect(page.getByTitle('Licence agreement preview')).toHaveAttribute('src',/^blob:/); }
        else await expect(page.getByRole('alert')).toContainText(mode==='denied'?'do not have access':'upload it again');
        await page.getByRole('button',{name:'Close preview',exact:true}).click();await expect(page.locator('iframe')).toHaveCount(0);
      }
      if(errors.length)throw Error(errors.join('\n'));await page.close();
    }
    console.log('PASS rights evidence UI: truthful correction notice, legacy references, PDF preview/download, missing documents, access errors and safe external links.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
