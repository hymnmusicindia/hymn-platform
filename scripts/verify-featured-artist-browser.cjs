const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/featured-artist-browser'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';import {ArtistPicker} from './components/artist-picker';function App(){const[q,setQ]=React.useState('');const[selected,setSelected]=React.useState(null);return window.fixturePickerOnly?<><ArtistPicker label=\"Test artist\" helper=\"\" valueIds={[]} max={3} query={q} onQueryChange={setQ} onSelect={setSelected} onRemove={()=>{}}/><pre id=\"selected-profile\">{JSON.stringify(selected)}</pre></>:<ReleaseForm initialStage={3} selectedPlan=\"one_time\" initialRelease={window.fixtureRelease}/>;}createRoot(document.getElementById('root')).render(<App/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);




  const browser=await chromium.launch();
  try{for(const width of [1440,390,320]){
    const release={id:25,userId:51,status:'draft',paymentStatus:'pending',releaseType:'single',wizardFormatIntent:'single',releaseTitle:'Dreamy',trackName:'Dreamy',artistName:'Fixture Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-10-19',createdAt:'2026-10-16',copyrightOwner:'Fixture Artist',publishingRights:'Fixture Artist',artworkUrl:'/fixture-cover.jpg',platforms:['Spotify'],ownershipConfirmed:true,noUnauthorizedSamples:true,collaboratorsCredited:true,platformCompliant:true,hymnNotLiable:true,agreedToTerms:true,falseMetadataAcknowledged:true,tracks:[{id:400,trackNumber:1,trackTitle:'Dreamy',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Fixture Writer',composers:'Fixture Writer',producers:'Fixture Producer',duration:'02:37'}]};
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];let profileWrites=0,saved,slowReady,finishSlow;page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',async route=>{const req=route.request(),url=new URL(req.url());
      if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureRelease='+JSON.stringify(release)+';window.fixturePickerOnly=false</script>'});
      if(url.pathname==='/api/distribution/featured-artist'){const {name}=req.postDataJSON();if(name==='Error Guest')return route.fulfill({status:503,json:{error:'HYMN could not verify this artist name. Please retry.'}});if(name==='Slow Guest'){slowReady=true;await new Promise(resolve=>finishSlow=resolve);}return route.fulfill({json:{match:name==='New Guest'?'profile-required':'known'}})}
      if(url.pathname==='/api/artists'&&req.method()==='POST'){profileWrites++;const body=req.postDataJSON();return route.fulfill({json:{profile:{id:66,...body,isLinked:false}}})}
      if(url.pathname.includes('save-draft')){saved=JSON.parse(req.postData().match(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/)[1]);return route.fulfill({json:{release:{...release,draftVersion:'2026-10-28T10:00:00.000Z'}}})}
      if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      return route.fulfill({json:{artists:[{id:10,name:'Fixture Artist'}],canCreateMore:true,allowedLimit:10,currentCount:1,profiles:[],sessions:[],requests:[]}});
    });
    await page.goto('https://hymn.fixture/');await page.addStyleTag({path:path.join(out,'global.css')});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    const add=page.getByRole('button',{name:'Add featured artist',exact:true});await expect(add).toHaveClass(/artist-picker-add-trigger/);await expect(page.getByRole('button',{name:'Add primary artist',exact:true})).toHaveClass(/artist-picker-add-trigger/);
    const library=page.getByRole('dialog',{name:'Add artist profile',exact:true});
    const choose=async name=>{await add.click();await library.getByRole('textbox',{name:'Search artist profiles'}).fill(name);await library.getByRole('button',{name:'Use name: '+name,exact:true}).click()};
    await choose('Known Guest');const known=page.getByRole('button',{name:'Known Guest, featured artist. Click twice to remove.',exact:true});await expect(known).toBeVisible();expect(profileWrites).toBe(0);
    await page.locator('.release-footer-action.is-draft').click();await expect.poll(()=>saved?.metadata?.tracks?.[0]?.featuredArtists ?? saved?.tracks?.[0]?.featuredArtists).toBe('Known Guest');expect((saved.metadata?.tracks ?? saved.tracks)[0].featuredArtistProfileIds).toEqual([]);
    await choose('New Guest');const modal=page.locator('.artist-profile-modal');await expect(modal).toBeVisible();await modal.getByRole('button',{name:/^First release/}).click();await modal.getByRole('button',{name:'Next',exact:true}).click();await expect(modal.getByPlaceholder('Artist name',{exact:true})).toHaveValue('New Guest');await modal.getByRole('button',{name:'Next',exact:true}).click();await modal.getByRole('button',{name:'Create profile',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Instagram');expect(profileWrites).toBe(0);await modal.getByPlaceholder('https://instagram.com/yourartistname').fill('@newguest');await modal.getByRole('button',{name:'Create profile',exact:true}).click();await expect(page.getByRole('button',{name:'New Guest, featured artist. Click twice to remove.',exact:true})).toBeVisible();expect(profileWrites).toBe(1);
    await choose('Error Guest');await expect(library.getByText('HYMN could not verify this artist name. Please retry.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Error Guest, featured artist. Click twice to remove.',exact:true})).toHaveCount(0);await library.getByRole('button',{name:'Close artist profile popup'}).click();
    await choose('Slow Guest');await expect.poll(()=>slowReady).toBe(true);await library.getByRole('button',{name:'Close artist profile popup'}).click();finishSlow();await page.waitForTimeout(100);await expect(page.getByRole('button',{name:'Slow Guest, featured artist. Click twice to remove.',exact:true})).toHaveCount(0);
    await known.click();await page.getByRole('button',{name:'Confirm removal of Known Guest',exact:true}).click();await expect(page.getByRole('button',{name:/Known Guest, featured artist/})).toHaveCount(0);await expect(page.getByRole('button',{name:/New Guest, featured artist/})).toBeVisible();
    expect(errors).toEqual([]);await page.screenshot({path:path.join(out,'featured-'+width+'.png'),fullPage:true});await page.close();console.log('PASS '+width+'px: primary-style avatars/plus, known name without card, new profile requires Instagram, failed/cancelled lookups never add a name, independent removal and draft persistence.');
  }}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
