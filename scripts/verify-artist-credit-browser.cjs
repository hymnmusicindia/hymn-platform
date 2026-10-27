const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/artist-credit-browser'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';import {ArtistPicker} from './components/artist-picker';function App(){const[q,setQ]=React.useState('');const[selected,setSelected]=React.useState(null);return window.fixturePickerOnly?<><ArtistPicker label=\"Test artist\" helper=\"\" valueIds={[]} max={3} query={q} onQueryChange={setQ} onSelect={setSelected} onRemove={()=>{}}/><pre id=\"selected-profile\">{JSON.stringify(selected)}</pre></>:<ReleaseForm initialStage={3} selectedPlan=\"one_time\" initialRelease={window.fixtureRelease}/>;}createRoot(document.getElementById('root')).render(<App/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);



  const browser=await chromium.launch();
  try{for(const width of [1440,390]){for(const picker of [false,true]){
    const release={id:25,userId:51,status:'draft',paymentStatus:'pending',releaseType:'single',wizardFormatIntent:'single',releaseTitle:'Dreamy',trackName:'Dreamy',artistName:'Fixture Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-10-19',createdAt:'2026-10-16',copyrightOwner:'Fixture Artist',publishingRights:'Fixture Artist',artworkUrl:'/fixture-cover.jpg',platforms:['Spotify'],ownershipConfirmed:true,noUnauthorizedSamples:true,collaboratorsCredited:true,platformCompliant:true,hymnNotLiable:true,agreedToTerms:true,falseMetadataAcknowledged:true,tracks:[{id:400,trackNumber:1,trackTitle:'Dreamy',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Fixture Writer',composers:'Fixture Writer',producers:'Fixture Producer',duration:'02:37'}]};
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];let posted=null;page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',async route=>{const req=route.request(),url=new URL(req.url());
      if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureRelease='+JSON.stringify(release)+';window.fixturePickerOnly='+picker+'</script>'});
      if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      if(url.pathname==='/api/artists'&&req.method()==='POST'){posted=req.postDataJSON();return route.fulfill({json:{profile:{id:55,...posted,isLinked:true}}})}
      if(url.pathname.includes('save-draft'))return route.fulfill({json:{release:{...release,draftVersion:'2026-10-28T10:00:00.000Z'}}});
      return route.fulfill({json:{artists:[{id:10,name:'Fixture Artist'},{id:55,name:'Stage Producer',isProducer:true,producerArtistName:'Auto Beat Alias',producerLegalName:null}],canCreateMore:true,allowedLimit:10,currentCount:1,profiles:[],sessions:[],requests:[]}});
    });
    await page.goto('https://hymn.fixture/');await page.addStyleTag({path:path.join(out,'global.css')});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    if(!picker){
      for(const role of ['Songwriters','Composers','Producers']){
        await page.getByRole('button',{name:'Edit '+role.toLowerCase()+' credits',exact:true}).click();
        const modal=page.locator('.contributors-modal');const panel=modal.getByRole('region',{name:role+' details',exact:true});await expect(panel).toBeVisible();
        const input=panel.getByPlaceholder(role==='Producers'?'Producer artist name':'Full legal name');await expect(input).toBeFocused();
        for(const other of ['Songwriters','Composers','Producers'].filter(r=>r!==role))await expect(modal.locator('#credit-panel-'+other.toLowerCase())).toBeHidden();
        if(role==='Producers'){await input.fill('Public Beat Alias');await panel.getByPlaceholder('Optional legal name').fill('');await modal.getByRole('button',{name:'Save contributors',exact:true}).click();await expect(page.getByRole('button',{name:'Edit producers credits',exact:true})).toContainText('Public Beat Alias')}
        else await modal.getByRole('button',{name:'Close',exact:true}).click();
      }
      await page.getByRole('button',{name:'Add primary artist',exact:true}).click();await page.getByRole('button',{name:'Select Stage Producer',exact:true}).click();
      await expect(page.getByRole('button',{name:'Edit producers credits',exact:true})).toContainText('Auto Beat Alias');
      await page.getByRole('button',{name:'Edit producers credits',exact:true}).click();const producerPanel=page.locator('#credit-panel-producers');await expect(producerPanel.getByPlaceholder('Producer artist name').last()).toHaveValue('Auto Beat Alias');await expect(producerPanel.getByPlaceholder('Optional legal name').last()).toHaveValue('');await page.locator('.contributors-modal').getByRole('button',{name:'Close',exact:true}).click();
    }else{
      await page.getByPlaceholder('Search test artist').focus();await page.getByRole('button',{name:'New artist',exact:true}).click();
      const modal=page.locator('.artist-profile-modal');await modal.getByRole('button',{name:/^Existing artist/}).click();await modal.getByRole('button',{name:'Next',exact:true}).click();
      await modal.getByPlaceholder('Artist name',{exact:true}).fill('Stage Artist');await modal.getByRole('button',{name:'Next',exact:true}).click();
      await modal.getByRole('button',{name:'Next',exact:true}).click();await modal.getByPlaceholder('https://music.apple.com/...').fill('https://music.apple.com/us/artist/stage/123456');await modal.getByRole('button',{name:'Next',exact:true}).click();
      await modal.getByRole('button',{name:'Next',exact:true}).click();await modal.getByRole('button',{name:'Skip',exact:true}).click();await modal.getByRole('button',{name:'Yes',exact:true}).click();await modal.getByRole('button',{name:'Next',exact:true}).click();
      const artistName=modal.getByPlaceholder('Producer artist name');await expect(artistName).toHaveValue('Stage Artist');await artistName.fill('');await modal.getByRole('button',{name:'Create profile',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Producer artist name is required');expect(posted).toBe(null);
      await artistName.fill('Beat Alias');await modal.getByRole('button',{name:'Create profile',exact:true}).click();await expect.poll(()=>posted?.producerArtistName).toBe('Beat Alias');expect(posted.producerLegalName).toBeUndefined();await expect(page.locator('#selected-profile')).toContainText('Beat Alias');
    }
    expect(errors).toEqual([]);await page.close();console.log('PASS '+width+'px '+(picker?'producer profile asks for and submits artist name without legal name':'each contributor tile opens and focuses its own role; producer legal name optional'));
  }}}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
