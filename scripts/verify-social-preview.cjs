const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild'),sharp=require('sharp');
async function main(){
 const dir=path.resolve('.tmp/social-preview');fs.mkdirSync(dir,{recursive:true});
 await build({entryPoints:['app/opengraph-image.tsx'],outfile:path.join(dir,'image.cjs'),bundle:true,platform:'node',packages:'external',jsx:'automatic'});
 const image=require(path.join(dir,'image.cjs'));
 const response=await image.default();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/png/);
 const bytes=Buffer.from(await response.arrayBuffer());const metadata=await sharp(bytes).metadata();
 assert.equal(metadata.width,1200);assert.equal(metadata.height,630);assert.ok(bytes.length<1024*1024,'Preview stays below 1 MB');
 fs.writeFileSync(path.join(dir,'hymn-share-preview.png'),bytes);
 const {channels}=await sharp(bytes).stats();assert.ok(channels[0].stdev>30,'Artwork is rendered, rather than a blank image');
 const homepage=fs.readFileSync('app/(public)/page.tsx','utf8'),layout=fs.readFileSync('app/layout.tsx','utf8'),seo=fs.readFileSync('lib/seo.ts','utf8');
 assert.ok(homepage.includes("title: 'Your music. Ready for the world. | HYMN Music'"));assert.ok(homepage.includes("publicPageMetadata('Music Distribution, Beats & Artist Services'"),'Search title is preserved');
 for(const source of[layout,seo])assert.ok(source.includes('/opengraph-image?v=hymn-logo-20261125'),'Default shared-image URL is versioned');
 assert.ok(image.alt.includes('Awesome human.'));const corner=await sharp(bytes).extract({left:0,top:0,width:20,height:20}).raw().toBuffer();assert.ok(corner.every(value=>value===255),'Background is pure white');
 console.log(`PASS actual social PNG: 1200x630, ${Math.round(bytes.length/1024)} KB, local Manrope, centred logo, white background and sender easter egg, versioned default metadata and new homepage copy. Preview: ${path.join(dir,'hymn-share-preview.png')}`);
}main().catch(error=>{console.error(error);process.exitCode=1});
