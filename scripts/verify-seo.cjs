const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const origin='https://hymn.fixture';
let missing=false;
const stub=new Proxy(()=>null,{get:()=>stub});
const mocks={
  './public-app-url':{getPublicAppUrl:()=>origin},
  '@/lib/public-app-url':{getPublicAppUrl:()=>origin},
  'react':{cache:fn=>fn},
  '@/lib/prisma':{prisma:{
    producerProfile:{findMany:async input=>{assert.equal(input.where.status,'active');assert.equal(input.where.user.status,'ACTIVE');return [{slug:'real-producer',updatedAt:new Date('2026-10-20')}] }},
    engineerProfile:{findMany:async input=>{assert.equal(input.where.sellerState,'ACTIVE');assert.equal(input.where.listings.some.paused,false);return [{slug:'real-engineer',updatedAt:new Date('2026-10-21')}]},findUnique:async()=>missing?null:{slug:'real-engineer',professionalName:'Real Engineer',sellerState:'ACTIVE',bio:'A professional mixing engineer.',profilePhotoUrl:null,listings:[{id:1}]}}
  }},
  '@/lib/policy-content':{policyDocuments:[{slug:'privacy'}]},
  '@/lib/engineer-applications':{ENGINEER_GENRES:['Hip-Hop','R&B']},
  '@/lib/db':{listBeats:async()=>[],listProducerProfiles:async()=>[]},
  '@/lib/beat-store':{findProducerBySlug:()=>missing?null:{producer:{name:'Real Producer',story:'Music for your next release.',imageUrl:'data:image/svg+xml,poster'}}}
};
function load(file){const box={exports:{},require:name=>name in mocks?mocks[name]:name==='react/jsx-runtime'?require(name):stub,URL,Date,process};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);return box.exports;}
(async()=>{
  const seo=load('lib/seo.ts');mocks['@/lib/seo']=seo;
  const metadata=seo.publicPageMetadata('Beat licensing','Learn about licences.','/beat-store');
  assert.equal(metadata.alternates.canonical,origin+'/beat-store');assert.equal(metadata.openGraph.url,metadata.alternates.canonical);assert.equal(metadata.twitter.card,'summary_large_image');assert.equal(metadata.openGraph.images[0].width,1200);
  assert.equal(seo.publicPageMetadata('Profile','Description','/profile','data:image/svg+xml,').openGraph.images[0].url,'/opengraph-image');
  assert.equal(seo.policyCanonicalPath('privacy'),'/privacy-policy');assert.equal(seo.policyCanonicalPath('terms'),'/terms-of-service');assert.equal(seo.policyCanonicalPath('distribution'),'/policies/distribution');
  const encoded=seo.jsonLd(seo.profileStructuredData('Artist </script>','/profile','Studio','/studio'));assert.ok(!encoded.includes('</script>'));assert.equal(JSON.parse(encoded)['@graph'][1].itemListElement[2].position,3);
  for(const [page,url] of [['page.tsx','/'],['about/page.tsx','/about'],['services/page.tsx','/services'],['beat-store/page.tsx','/beat-store'],['studio/page.tsx','/studio'],['faq/page.tsx','/faq'],['contact/page.tsx','/contact'],['mission/page.tsx','/mission'],['partnership-program/page.tsx','/partnership-program'],['policies/page.tsx','/policies'],['privacy-policy/page.tsx','/privacy-policy'],['terms-of-service/page.tsx','/terms-of-service'],['music-distribution/page.tsx','/music-distribution']]){
    const m=load('app/(public)/'+page).metadata;assert.equal(m.alternates.canonical,origin+url,page);assert.equal(m.openGraph.url,origin+url,page);assert.ok(m.description.length<=160);
  }
  for(const page of ['app/(authenticated)/layout.tsx','app/(admin)/layout.tsx','app/(public)/login/page.tsx']){const m=load(page).metadata;assert.equal(m.robots.index,false);assert.equal(m.robots.googleBot.index,false);}
  const promotion=load('app/(authenticated)/first-release/page.tsx').metadata;assert.equal(promotion.robots.googleBot.index,true,'The public first-release offer stays indexable.');
  const map=await load('app/sitemap.ts').default();const urls=map.map(item=>item.url);assert.equal(new Set(urls).size,urls.length);assert.ok(urls.includes(origin+'/music-distribution'));assert.ok(urls.includes(origin+'/studio/engineers/real-engineer'));assert.ok(urls.includes(origin+'/beat-store/producers/real-producer'));assert.ok(!urls.some(url=>/dashboard|api\/|\/distribution$/.test(url)));assert.ok(!map.find(item=>item.url===origin).lastModified,'Static pages do not invent modification dates.');
  const producer=load('app/(public)/beat-store/producers/[slug]/page.tsx');let result=await producer.generateMetadata({params:Promise.resolve({slug:'real-producer'})});assert.equal(result.alternates.canonical,origin+'/beat-store/producers/real-producer');
  const engineer=load('app/(public)/studio/engineers/[slug]/page.tsx');result=await engineer.generateMetadata({params:Promise.resolve({slug:'real-engineer'})});assert.equal(result.alternates.canonical,origin+'/studio/engineers/real-engineer');missing=true;assert.equal((await producer.generateMetadata({params:Promise.resolve({slug:'missing'})})).robots.index,false);assert.equal((await engineer.generateMetadata({params:Promise.resolve({slug:'missing'})})).robots.index,false);
  const robots=load('app/robots.ts').default();assert.equal(robots.sitemap,origin+'/sitemap.xml');assert.ok(robots.rules[0].allow.includes('/api/image-preview'));assert.ok(robots.rules[0].disallow.includes('/api/'));assert.ok(!robots.rules[0].disallow.includes('/dashboard/'),'Bots can see the noindex or sign-in response.');
  console.log('PASS SEO: canonical/social metadata, public profile eligibility, sitemap membership, real modification dates, private noindex, public offer override, crawl rules and safe structured data.');
})().catch(error=>{console.error(error);process.exitCode=1;});
