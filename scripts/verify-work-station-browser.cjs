const fs=require('node:fs/promises'),path=require('node:path');
const {build}=require('esbuild'),{chromium,expect}=require('@playwright/test');
async function main(){
 const out=path.resolve('.cache/work-station-browser');await fs.mkdir(out,{recursive:true});
 await build({entryPoints:['scripts/work-station-fixture.tsx'],bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
 const css=await require('postcss')([require('tailwindcss')({content:['./components/team/**/*.{ts,tsx}']})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});await fs.writeFile(path.join(out,'global.css'),css.css);
 const layout=await fs.readFile('app/layout.tsx','utf8');const styles=[...layout.matchAll(/import "\.\/styles\/([^"]+)"/g)].map(m=>'app/styles/'+m[1]);
 const browser=await chromium.launch();
 try{for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://hymn.fixture/**',r=>r.fulfill({contentType:'text/html',body:`<html data-theme="${theme}"><body><div id="root"></div></body></html>`}));await page.goto('https://hymn.fixture/');
  await page.addStyleTag({path:path.join(out,'global.css')});for(const style of styles)await page.addStyleTag({path:style});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
  await page.getByRole('button',{name:'Start activity',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'Work-station activity'});await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Activity time · running')).toBeVisible();await dialog.getByLabel('Live notes / activity report').fill('Discussed distribution requirements and release timeline.');await dialog.getByLabel('Music distribution',{exact:true}).check();
  await expect.poll(()=>page.evaluate(()=>window.writes.some(w=>w.resource==='workstation-save'&&w.body.draft.notes.includes('timeline')))).toBe(true);
  await dialog.getByRole('button',{name:'Pause & close',exact:true}).click();await expect(dialog).not.toBeVisible();await page.getByRole('button',{name:'Resume activity',exact:false}).click();await expect(dialog.getByLabel('Live notes / activity report')).toHaveValue(/timeline/);await expect(dialog.getByText('Activity time · paused')).toBeVisible();
  await dialog.getByRole('button',{name:'Resume timer',exact:true}).click();await dialog.getByLabel('What happened?').selectOption('NO_ANSWER');await dialog.getByRole('button',{name:'Save report & finish',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('status').filter({hasText:'Activity report saved'})).toBeVisible();
  await page.getByRole('button',{name:'Customer tickets',exact:true}).click();await page.getByRole('button',{name:'Open ticket activity',exact:true}).click();await expect(dialog.getByText('No usable phone number.',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'Email templates',exact:true}).click();
  await expect(dialog.getByText('Sender: Kira',{exact:false})).toBeVisible();await dialog.getByLabel('I reviewed the recipient, message and next steps.').check();await dialog.getByRole('button',{name:'Queue email',exact:true}).click();await expect(dialog.getByRole('status').filter({hasText:'Email queued'})).toBeVisible();
  await dialog.getByLabel('Live notes / activity report').fill('Customer support resolved by email with clear next steps.');await dialog.getByLabel('Close ticket #1 with this resolution report').check();
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:path.join(out,`${theme}-${width}.png`),fullPage:true});await dialog.getByRole('button',{name:'Save report & finish',exact:true}).click();await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Manual activity',exact:true}).click();const manual=page.getByRole('dialog',{name:'Start manual activity'});await manual.getByLabel('Find a contact').fill('Customer');await manual.getByRole('button',{name:/Customer.*customer@fixture/}).click();await expect(manual.getByText('Selected: Customer')).toBeVisible();await manual.getByRole('button',{name:'Close manual activity'}).click();
  expect(errors).toEqual([]);await page.close();console.log(`PASS ${theme} ${width}px: autosave, timer pause/resume, call outcome, ticket email, closure, contact lookup and no overflow.`);
 }}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
