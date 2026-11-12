const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken'),{randomUUID}=require('node:crypto');
(async()=>{
 assert.match(process.env.DATABASE_URL||'',/^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55473\//);
 const db=new PrismaClient(),port=3241,origin=`http://127.0.0.1:${port}`,appOrigin='https://hymnmusic.fun',out=path.resolve('.cache/producer-follow-live');fs.mkdirSync(out,{recursive:true});
 let browser;
 const log=fs.openSync(path.join(out,'server.log'),'w');const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,CANONICAL_HOST:'127.0.0.1',APP_URL:appOrigin,NEXT_PUBLIC_APP_URL:appOrigin,HYMN_CRON_WORKER_ENABLED:'false'},stdio:['ignore',log,log]});
 try{
  let ready=false;for(let i=0;i<90;i++){try{const response=await fetch(origin+'/api/health',{redirect:'manual',headers:{'x-forwarded-proto':'https'}});if(response.status<500){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,'Production Next server starts');
  const user=await db.user.create({data:{googleId:randomUUID(),name:'API Listener',email:`${randomUUID()}@example.test`,status:'ACTIVE'}});
  const owner=await db.user.create({data:{googleId:randomUUID(),name:'API Producer',email:`${randomUUID()}@example.test`,role:'PRODUCER',status:'ACTIVE'}});
  const profile=await db.producerProfile.create({data:{userId:owner.id,slug:'api-follow-test',displayName:'API Producer',bio:'Fixture',specialty:'Hip Hop',status:'active'}});
  const cookie=actor=>'hymn_session='+jwt.sign({sub:actor.id,email:actor.email,name:actor.name,role:actor.role.toLowerCase()},process.env.JWT_SECRET,{expiresIn:'10m'});
  const request=(route,options={})=>fetch(origin+route,{redirect:'manual',...options,headers:{'x-forwarded-proto':'https',...options.headers}});
  const write=(body,actor=user,source=appOrigin)=>request('/api/producer-follows',{method:'POST',headers:{'Content-Type':'application/json',Origin:source,...(actor?{Cookie:cookie(actor)}:{})},body:JSON.stringify(body)});
  assert.equal((await request('/api/producer-follows?ids=bad')).status,400);
  let response=await request(`/api/producer-follows?ids=${profile.id}`);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/);assert.match(response.headers.get('Vary'),/Cookie/);assert.equal((await response.json()).producers[0].count,0);
  assert.equal((await write({producerId:profile.id,following:true},null)).status,401);
  assert.equal((await write({producerId:profile.id,following:true},user,'https://other.example')).status,403);
  assert.equal((await write({producerId:profile.id,following:'yes'})).status,400);
  assert.equal((await write({producerId:profile.id,following:true},owner)).status,409);
  for(let i=0;i<2;i++){response=await write({producerId:profile.id,following:true});assert.equal(response.status,200);const data=await response.json();assert.equal(data.producer.count,1);assert.equal(data.producer.following,true);}
  response=await request(`/api/producer-follows?ids=${profile.id}`,{headers:{Cookie:cookie(user)}});assert.equal((await response.json()).producers[0].following,true);
  response=await request(`/api/producer-follows?ids=${profile.id}`);assert.equal((await response.json()).producers[0].following,false,'Anonymous clients do not receive another account follow state');
  response=await write({producerId:profile.id,following:false});assert.equal(response.status,200);assert.equal((await response.json()).producer.count,0);
  await db.producerProfile.update({where:{id:profile.id},data:{active:false}});assert.equal((await write({producerId:profile.id,following:true})).status,404);
  console.log('PASS production Next producer-follow API: real cookies, anonymous access, CSRF, validation, self-follow, repeat safety, persisted state, counts, private cache headers and inactive profile handling.');
  await db.producerProfile.update({where:{id:profile.id},data:{active:true}});
  const upload=await db.upload.create({data:{userId:owner.id,kind:'BEAT',storageKey:'fixture/preview.wav',fileName:'preview.wav',mimeType:'audio/wav',sizeBytes:960044,publicUrl:'/fixture-preview.wav'}});
  await db.beat.create({data:{userId:owner.id,title:'Navigation preview beat',bpm:90,genre:'Hip Hop',mood:'Chill',keySignature:'C Minor',priceCents:12000,enabled:true,status:'PUBLISHED',previewUploadId:upload.id}});
  // An existing isolated build may cache another fixture's public catalogue.
  // Invalidate only that tagged entry inside this test's dedicated build directory.
  const cacheRoot=path.resolve('.next-distribution-services-check/cache/fetch-cache');
  if(fs.existsSync(cacheRoot))for(const entry of fs.readdirSync(cacheRoot,{withFileTypes:true})){if(!entry.isFile())continue;const target=path.resolve(cacheRoot,entry.name);assert.ok(target.startsWith(cacheRoot+path.sep));try{const cached=JSON.parse(fs.readFileSync(target,'utf8'));if(cached.tags?.includes('public-home-preview'))fs.unlinkSync(target);}catch{}}
  const audio=Buffer.alloc(960044);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(960000,40);
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-forwarded-proto':'https'}});const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{const NativeAudio=window.Audio;window.fixtureAudios=[];window.Audio=function(...args){const audio=new NativeAudio(...args);window.fixtureAudios.push(audio);return audio;};window.Audio.prototype=NativeAudio.prototype;});
  await page.route('**/fixture-preview.wav',route=>route.fulfill({body:audio,contentType:'audio/wav'}));
  await page.goto(origin+'/');await expect(page.getByRole('button',{name:'Play Navigation preview beat',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play Navigation preview beat',exact:true}).click();const player=page.getByRole('complementary',{name:'Now playing',exact:true});await expect(player).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.fixtureAudios.some(audio=>!audio.paused))).toBe(true);await page.evaluate(()=>window.initialAudio=window.fixtureAudios.find(audio=>!audio.paused));
  await page.getByRole('link',{name:'Contact HYMN',exact:true}).first().click();await page.waitForURL('**/contact');await expect(player).toBeVisible();assert.ok(await page.evaluate(()=>window.initialAudio===window.fixtureAudios.find(audio=>!audio.paused)),'Navigation retains the exact playing audio instance');
  await page.evaluate(()=>window.scrollTo(0,0));await player.hover();await player.getByRole('button',{name:'Pause Navigation preview beat',exact:true}).click();await expect(player).toHaveCount(0);
  await page.getByRole('link',{name:'HYMN Music home',exact:true}).click();await page.waitForURL(origin+'/');await expect(player).toHaveCount(0);await page.getByRole('button',{name:'Play Navigation preview beat',exact:true}).click();await expect(player).toBeVisible();assert.ok(await page.evaluate(()=>window.initialAudio===window.fixtureAudios.find(audio=>!audio.paused)),'Homepage replay resumes the existing preview');
  await page.getByRole('link',{name:'Browse all beats',exact:true}).click();await page.waitForURL('**/beat-store');await expect(player).toBeVisible();await page.evaluate(()=>window.scrollTo(0,0));await player.hover();await player.getByRole('button',{name:'Pause Navigation preview beat',exact:true}).click();await expect(player).toBeVisible();
  await page.getByRole('link',{name:'HYMN Music home',exact:true}).click();await page.waitForURL(origin+'/');await expect(player).toHaveCount(0);assert.equal(await page.locator('.hymn-player-page-space').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS production Next homepage playback: one global audio instance across homepage/contact/Beatstore navigation, hidden on non-store pause, homepage replay, unchanged paused Beatstore bar and removed idle spacing.');

 }finally{if(browser)await browser.close();server.kill();await db.$disconnect();fs.closeSync(log);}
})().catch(error=>{console.error(error);process.exitCode=1});
