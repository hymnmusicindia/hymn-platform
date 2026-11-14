const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises');
async function main(){
 const browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.route('**/fonts/manrope-variable.ttf',route=>route.fulfill({path:'public/fonts/manrope-variable.ttf',contentType:'font/ttf'}));
  await page.route('**/assets/hymnlogowhite.png',route=>route.fulfill({path:'public/assets/hymnlogowhite.png',contentType:'image/png'}));
  for(const kind of ['invitation','activation']){
   await page.setContent(await fs.readFile(`artifacts/sound-sync-partnership/${kind}-preview.html`,'utf8'));
   await page.evaluate(()=>document.fonts.ready);
   for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`artifacts/sound-sync-partnership/${kind}-email-${width}.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Email horizontal overflow');}
  }
 }finally{await browser.close();}
 console.log('Verified both monochrome HTML email designs at mobile and desktop widths.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
