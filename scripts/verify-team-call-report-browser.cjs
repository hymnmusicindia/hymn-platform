const fs=require('node:fs/promises'),path=require('node:path');
const {build}=require('esbuild');const {chromium,expect}=require('@playwright/test');
async function main(){
 const out=path.resolve('.cache/team-call-report');await fs.mkdir(out,{recursive:true});
 await build({entryPoints:['scripts/team-call-report-fixture.tsx'],bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch();
 try{for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:3461/**',route=>route.fulfill({contentType:'text/html',body:'<style>body{background:#10151e;color:white;font-family:Arial;margin:12px}</style><div id="root"></div>'}));await page.goto('http://localhost:3461/');await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
  await page.getByRole('button',{name:'Team assistance',exact:true}).click();let guide=page.getByRole('complementary',{name:'Team assistance'});await guide.getByRole('button',{name:'Write a customer call report',exact:true}).click();await guide.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Call report & history',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();guide=dialog.getByRole('complementary',{name:'Team assistance'});await expect(guide).toBeVisible();await guide.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('[data-team-highlight]')).toBeVisible();await guide.getByRole('button',{name:'Next',exact:true}).click();await guide.getByRole('button',{name:'Done',exact:true}).click();
  await dialog.getByLabel('Actual call date & time (IST)').fill('2026-10-01T14:15');await dialog.getByLabel('Conversation report').fill('Discussed customer needs and agreed release next steps.');await dialog.getByLabel('Customer needs').fill('Distribution support');await dialog.getByRole('button',{name:'Save report to contact',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('Report saved');await expect(dialog.getByText('Kira',{exact:false})).toBeVisible();expect(await page.evaluate(()=>window.writes[0].occurredAt)).toBe('2026-10-01T08:45:00.000Z');
  await dialog.getByRole('button',{name:'Add update',exact:true}).click();await dialog.getByLabel('Conversation report').fill('Customer confirmed a new release date after discussion.');await dialog.getByRole('button',{name:'Save report to contact',exact:true}).click();await expect(dialog.locator('article')).toHaveCount(2);expect(await page.evaluate(()=>window.writes[1].amendsReportId)).toBe('report-0');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:path.join(out,'report-'+width+'.png')});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Call report & history',exact:true}).click();await expect(dialog.locator('article')).toHaveCount(2);await page.close();console.log('PASS '+width+'px structured report, actual IST time, saved history, append update, reopen and no horizontal overflow.');
 }}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
