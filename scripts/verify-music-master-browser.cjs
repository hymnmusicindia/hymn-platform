const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/music-master-browser'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<ReleaseForm initialStage={0} amendmentMode={window.fixtureAmendment} selectedPlan='one_time' initialRelease={window.fixtureRelease}/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);
  const browser = await chromium.launch();
  try {
    for (const width of [1440,390]) {
      let release = { id:25,userId:51,status:'draft',draftVersion:'2026-10-24T10:00:00.000Z',releaseType:'album',wizardFormatIntent:'album',releaseTitle:'Night Sessions',artistName:'Fixture Artist',labelName:'HYMN',primaryGenre:'Pop',language:'Hindi',createdAt:'2026-10-24',tracks:['Alpha','Beta','Gamma'].map((name,i)=>({id:400+i,trackNumber:i+1,trackTitle:name,isrc:`INABC260000${i+1}`,audioUrl:`/api/assets/${10+i}/download`,artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:`Writer ${name}`,composers:`Composer ${name}`,producers:`Producer ${name}`,duration:'00:01',metadata:{clientTrackId:`track-${name}`,audioFileName:`${name}.wav`}})) };
      const page=await browser.newPage({viewport:{width,height:1100}}), errors=[]; let mode='success', latest=null, amendment=false;
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://hymn.fixture/**',async route=>{
        const request=route.request(), url=new URL(request.url());
        if(request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<div id="root"></div><script>window.fixtureRelease=${JSON.stringify(release)};window.fixtureAmendment=${amendment}</script>`});
        if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
        if(url.pathname==='/api/uploads/sessions' && request.method()==='GET') { if(mode==='hold')await new Promise(resolve=>setTimeout(resolve,1000)); return route.fulfill({json:{config:{chunkSize:1048576},sessions:[]}}); }
        if(url.pathname==='/api/uploads/sessions' && request.method()==='POST')return mode==='fail'?route.fulfill({status:400,json:{error:'Fixture rejected replacement'}}):route.fulfill({json:{session:{id:'upload-1',chunkSize:1048576,totalChunks:1,uploadedChunks:[]},config:{retryLimit:1,maxConcurrency:1}}});
        if(url.pathname.endsWith('/complete'))return route.fulfill({json:{asset:{id:99,downloadPath:'/api/assets/99/download?filename=new-master.wav'}}});
        if(url.pathname.includes('/chunks/'))return route.fulfill({json:{ok:true}});
        if(request.method()==='PATCH' && url.pathname==='/api/distribution/drafts/25') {
          latest=request.postDataJSON();
          release={...release,metadata:latest.metadata,tracks:latest.metadata.tracks.map(track=>({...track,id:release.tracks.find(prior=>(prior.metadata?.clientTrackId||prior.clientTrackId)===track.clientTrackId)?.id||500,metadata:track}))};
          return route.fulfill({json:{savedAt:'2026-10-24T11:00:00.000Z'}});
        }
        return route.fulfill({json:{artists:[{id:10,name:'Fixture Artist'}],profiles:[],sessions:[],requests:[]}});
      });
      async function mount(){await page.goto('https://hymn.fixture/');await page.addStyleTag({path:path.join(out,'global.css')});for(const match of (await fs.readFile('app/layout.tsx','utf8')).matchAll(/import \"\.\/styles\/([^\"]+)\"/g))await page.addStyleTag({path:`app/styles/${match[1]}`});await page.addStyleTag({path:'app/styles/workspace-system.css'});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});await expect(page.getByRole('heading',{name:'Add your music',exact:true})).toBeVisible();}
      await mount(); const rows=page.locator('.release-managed-master');
      await expect(rows).toHaveCount(3);
      await expect(page.getByRole('button',{name:'Move Alpha up',exact:true})).toBeDisabled();
      await page.getByRole('button',{name:'Move Alpha down',exact:true}).click();
      await expect(rows.nth(0)).toContainText('Beta.wav');
      await expect(rows.nth(1)).toContainText('Alpha.wav');
      if(width>=768)await page.getByRole('button',{name:'Drag to reorder Alpha',exact:true}).dragTo(rows.nth(2));else await page.getByRole('button',{name:'Move Alpha down',exact:true}).click();
      await expect(rows.nth(2)).toContainText('Alpha.wav');
      await expect.poll(()=>latest?.metadata?.tracks.map(track=>track.trackTitle).join(',')).toBe('Beta,Gamma,Alpha');
      const file=page.getByLabel('Choose replacement audio for Alpha',{exact:true});
      mode='fail'; await file.setInputFiles({name:'new-master.wav',mimeType:'audio/wav',buffer:wav()});
      await expect(page.getByRole('alert').filter({hasText:'Fixture rejected replacement'})).toContainText('original master is still attached');
      await expect(rows.nth(2).locator('audio')).toHaveAttribute('src','/api/assets/10/download');
      mode='hold'; await file.setInputFiles({name:'new-master.wav',mimeType:'audio/wav',buffer:wav()});
      await expect(page.getByRole('button',{name:'Move Alpha up',exact:true})).toBeDisabled();
      await expect(page.locator('.release-footer-action.is-primary')).toBeDisabled();
      await page.getByRole('button',{name:'Cancel replacement for Alpha',exact:true}).click();
      await expect(page.getByRole('alert').filter({hasText:'Replacement cancelled'})).toBeVisible();
      await expect(rows.nth(2).locator('audio')).toHaveAttribute('src','/api/assets/10/download');
      mode='success'; await file.setInputFiles({name:'new-master.wav',mimeType:'audio/wav',buffer:wav()});
      await expect(rows.nth(2).locator('audio')).toHaveAttribute('src','/api/assets/99/download?filename=new-master.wav');
      await expect.poll(()=>latest?.metadata?.tracks.find(track=>track.trackTitle==='Alpha')?.audioUrl).toContain('/api/assets/99/download');
      const alpha=latest.metadata.tracks.find(track=>track.trackTitle==='Alpha');
      expect(alpha.isrc).toBe('INABC2600001'); expect(alpha.songwriters).toBe('Writer Alpha'); expect(alpha.trackNumber).toBe(3);
      await mount(); await expect(rows.nth(2)).toContainText('new-master.wav');
      await expect(rows.nth(2).locator('audio')).toHaveAttribute('src','/api/assets/99/download?filename=new-master.wav');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:path.join(out,`music-${width}.png`),fullPage:true});
      if(errors.length)throw Error(errors.join('\n'));
      console.log(`PASS ${width}px music wizard: button and drag reordering, saved order, replacement failure/cancel safety, successful replacement, preserved credits/ISRC and reload.`);
      amendment=true;release.status='live';await mount();await expect(page.getByRole('button',{name:/^Move .* (up|down)$/})).toHaveCount(0);await expect(page.getByRole('button',{name:/^Drag to reorder/})).toHaveCount(0);await expect(page.getByRole('button',{name:/^Replace audio for/})).toHaveCount(3);
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
