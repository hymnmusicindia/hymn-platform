const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/release-artist-scope'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';import {ArtistPicker} from './components/artist-picker';function App(){const[q,setQ]=React.useState('');const[selected,setSelected]=React.useState(null);return window.fixturePickerOnly?<><ArtistPicker label=\"Test artist\" helper=\"\" valueIds={[]} max={3} query={q} onQueryChange={setQ} onSelect={setSelected} onRemove={()=>{}}/><pre id=\"selected-profile\">{JSON.stringify(selected)}</pre></>:<ReleaseForm initialStage={3} selectedPlan=\"one_time\" initialRelease={window.fixtureRelease}/>;}createRoot(document.getElementById('root')).render(<App/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,external:['/fonts/*'],outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);





  const browser=await chromium.launch();
  try { for (const width of [1440,390]) {
    const release={id:25,userId:51,status:'draft',paymentStatus:'pending',releaseType:'album',wizardFormatIntent:'album',releaseTitle:'Album',trackName:'Album',artistName:'Main Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-12-19',createdAt:'2026-11-15',copyrightOwner:'Main Artist',publishingRights:'Main Artist',artworkUrl:'/fixture-cover.jpg',platforms:['Spotify'],tracks:[{id:400,trackNumber:1,trackTitle:'First track',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10,20],primaryArtist:'Main Artist, Track Collaborator',featuredArtists:'Featured Guest',featuredArtistProfileIds:[30],songwriters:'Writer',composers:'Writer',producers:'Producer',duration:'02:37'},{id:401,trackNumber:2,trackTitle:'Second track',artistProfileIds:[10],primaryArtist:'Main Artist'}]};
    const page=await browser.newPage({viewport:{width,height:1000}}); const errors=[]; let saved;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',async route=>{const req=route.request(),u=new URL(req.url());
      if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureRelease='+JSON.stringify(release)+';window.fixturePickerOnly=false</script>'});
      if(u.pathname==='/api/artists')return route.fulfill({json:{artists:[{id:10,name:'Main Artist'},{id:20,name:'Track Collaborator'},{id:30,name:'Featured Guest'}],canCreateMore:true,allowedLimit:10,currentCount:3}});
      if(u.pathname.includes('save-draft')){saved=JSON.parse(req.postData().match(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/)[1]);return route.fulfill({json:{release:{...release,draftVersion:'2026-11-15T10:00:00.000Z'}}});}
      if(req.method()==='PATCH'&&u.pathname.includes('/drafts/')){saved=req.postDataJSON();return route.fulfill({json:{savedAt:'2026-11-15T10:00:00.000Z'}});}
      if(u.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      return route.fulfill({json:{profiles:[],sessions:[],requests:[]}});
    });
    await page.goto('https://hymn.fixture/distribution/start');
    await page.addStyleTag({path:path.join(out,'global.css')});
    await page.addScriptTag({path:path.join(out,'ui.js')});
    await page.getByRole('button',{name:/^Credits & tracks/}).first().click();
    await expect(page.getByRole('button',{name:/Add another track$/})).toBeVisible();
    await page.getByRole('button',{name:/Add another track$/}).click();
    await page.locator('.release-footer-action.is-draft').click();
    await expect.poll(()=>saved?.metadata?.tracks?.length ?? saved?.tracks?.length).toBe(3);
    const tracks=saved.metadata?.tracks ?? saved.tracks;
    expect(saved.metadata?.artistName ?? saved.artistName).toBe('Main Artist');
    expect(tracks[0].artistProfileIds).toEqual([10,20]);
    expect(tracks[0].featuredArtistProfileIds).toEqual([30]);
    expect(tracks[2].artistProfileIds).toEqual([10]);
    expect(tracks[2].featuredArtistProfileIds).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({path:path.join(out,'artist-scope-'+width+'.png'),fullPage:true});
    await page.close(); console.log('PASS '+width+'px actual release form: album artist stays independent; new track inherits album artists only; existing primary/featured collaborators retained.');
  }} finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
