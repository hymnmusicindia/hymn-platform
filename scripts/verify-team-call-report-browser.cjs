const fs=require('node:fs/promises'),path=require('node:path');
const {build}=require('esbuild');const {chromium,expect}=require('@playwright/test');
async function main(){
 const out=path.resolve('.cache/team-call-report');await fs.mkdir(out,{recursive:true});
 await build({entryPoints:['scripts/team-call-report-fixture.tsx'],bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch();
 try{for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:3461/**',route=>route.fulfill({contentType:'text/html',body:'<style>body{background:#10151e;color:white;font-family:Arial;margin:12px}</style><div id="root"></div>'}));await page.goto('http://localhost:3461/');await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
  await page.getByRole('button',{name:'Call report & history',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('link',{name:'Start activity in Work-station',exact:false})).toBeVisible();await expect(dialog.getByLabel('Conversation report')).toHaveCount(0);await expect(dialog.getByText('Discussed customer needs and agreed release next steps.',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Add update',exact:true}).click();await dialog.getByLabel('Conversation report').fill('Customer confirmed a new release date after discussion.');await dialog.getByRole('button',{name:'Save report to contact',exact:true}).click();await expect(dialog.locator('article')).toHaveCount(2);expect(await page.evaluate(()=>window.writes[0].amendsReportId)).toBe('report-existing');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:path.join(out,'report-'+width+'.png')});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Call report & history',exact:true}).click();await expect(dialog.locator('article')).toHaveCount(2);await page.close();console.log('PASS '+width+'px structured report, actual IST time, saved history, append update, reopen and no horizontal overflow.');
 }}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
