const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/release-document-browser'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<ReleaseForm initialStage={5} amendmentMode={window.fixtureAmendment} selectedPlan='one_time' initialRelease={window.fixtureRelease}/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);

  const browser=await chromium.launch();
  try{for(const width of [1440,390]){
    const release={id:116,userId:60,status:'changes_requested',releaseType:'single',wizardFormatIntent:'single',releaseTitle:'ONLY FEELINGS',artistName:'Fixture Artist',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',language:'Hindi',createdAt:'2026-10-16',tracks:[{id:400,trackNumber:1,trackTitle:'ONLY FEELINGS',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Writer',composers:'Writer',producers:'Producer',duration:'02:37'}]};
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];let chunks=0,posts=0,failed=false,metadata;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',async route=>{const request=route.request(),url=new URL(request.url());
      if(request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureRelease='+JSON.stringify(release)+';window.fixtureAmendment=false</script>'});
      if(url.pathname==='/api/assets'){posts++;return route.abort('connectionreset')}
      if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      if(url.pathname==='/api/uploads/sessions'&&request.method()==='POST'){metadata=request.postDataJSON();return route.fulfill({json:{session:{id:'doc-upload',chunkSize:524288,totalChunks:metadata.chunkHashes.length,uploadedChunks:[]}}})}
      if(url.pathname.includes('/chunks/')){chunks++;if(!failed){failed=true;return route.abort('connectionreset')}return route.fulfill({json:{ok:true}})}
      if(url.pathname.endsWith('/complete'))return route.fulfill({json:{asset:{id:999,downloadPath:'/api/assets/999/download?filename=license.pdf'}}});
      return route.fulfill({json:{artists:[{id:10,name:'Fixture Artist'}],profiles:[],sessions:[],requests:[]}});
    });
    await page.goto('https://hymn.fixture/');await page.addStyleTag({path:path.join(out,'global.css')});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    await page.locator('.record-review-details>section').filter({has:page.getByRole('heading',{name:'Rights & ownership',exact:true})}).getByRole('button',{name:/Edit/}).click();
    await page.getByRole('button',{name:/Original\/Exclusive Licensed/}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Non-Exclusive Licensed',exact:true}).click();
    const file=page.locator('input[type=file][accept="application/pdf"]').first();await expect(file).toHaveCount(1);
    const pdf=Buffer.alloc(800000);pdf.write('%PDF-1.7');await file.setInputFiles({name:'beat-license.pdf',mimeType:'application/pdf',buffer:pdf});
    await expect(page.getByText('PDF attached and ready for HYMN.',{exact:true})).toBeVisible();
    expect(posts).toBe(0);expect(chunks).toBe(3);expect(metadata.releaseId).toBe(116);expect(metadata.assetCategory).toBe('RELEASE_LICENSE_RECEIPT');expect(errors).toEqual([]);
    await page.screenshot({path:path.join(out,'rights-'+width+'.png'),fullPage:true});console.log('PASS '+width+'px ONLY FEELINGS correction: change exclusive to non-exclusive, attach license through reset/retry, avoid failed legacy endpoint.');await page.close();
  }}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
