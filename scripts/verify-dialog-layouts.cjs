const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {textContrast}=require('./lib/text-contrast.cjs');

(async () => {
  const out = path.resolve('.cache/dialog-layouts');
  await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CustomerDialog} from './components/customer-dialog';import {AdminCenteredDialog} from './components/admin-centered-dialog';import {FinalReleaseConfirmation} from './components/final-release-confirmation';import {useAccessibleDialog} from './components/ui/use-accessible-dialog';
  function App(){const [mode,setMode]=React.useState('');const [busy,setBusy]=React.useState(false);const close=()=>{if(!busy)setMode('')};const ref=useAccessibleDialog(mode==='form',close);return <><button onClick={()=>setMode('form')}>Open settings</button><button onClick={()=>setMode('admin')}>Open details</button><button onClick={()=>setMode('final')}>Confirm release</button><CustomerDialog wide open={mode==='form'} dialogRef={ref} titleId="settings-title" title="Artist settings" description="Keep your artist details up to date." busy={busy} onClose={close} footer={<><button className="btn-outline" disabled={busy} onClick={close}>Cancel</button><button className="btn-primary" type="submit" form="settings-form" disabled={busy}>Save changes</button></>}><form id="settings-form" onSubmit={e=>{e.preventDefault();setBusy(true);setTimeout(()=>{setBusy(false);setMode('')},300)}}><label>Artist name<input required aria-label="Artist name"/></label>{Array.from({length:30},(_,i)=><p key={i}>Catalogue detail {i+1}: check the information before saving.</p>)}</form></CustomerDialog>{mode==='admin'?<AdminCenteredDialog title="Release details" onClose={close}>{Array.from({length:35},(_,i)=><p key={i}>Recording information {i+1}</p>)}</AdminCenteredDialog>:null}<FinalReleaseConfirmation open={mode==='final'} onClose={close} onAgree={()=>{window.agreed=true;setMode('')}}/></>};createRoot(document.getElementById('root')).render(<App/>);`, loader:'tsx', resolveDir:process.cwd() }, bundle:true, external:['/fonts/*'], outfile:path.join(out,'ui.js'), jsx:'automatic' });
  const tokens = await fs.readFile('app/styles/theme-tokens.css','utf8');
  const browser = await chromium.launch();
  try {
    for (const theme of ['light','dark']) for (const width of [320,390,1440]) {
      const page = await browser.newPage({viewport:{width,height:600},reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<div id="root"></div>');
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.addStyleTag({content:tokens+'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}button,input{font:inherit}'});
      await page.addStyleTag({path:'app/styles/mobile-workspace.css'});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
      await page.getByRole('button',{name:'Open settings',exact:true}).click();
      const dialog=page.getByRole('dialog');
      const save=page.getByRole('button',{name:'Save changes'});
      await expect(dialog).toBeVisible();
      if(width===1440) assert.equal(Math.round((await dialog.boundingBox()).width),860,'Wide forms retain room for catalogue selection');
      const before=await save.boundingBox();
      await dialog.locator('form').evaluate(e=>e.parentElement.scrollTop=10000);
      assert.deepEqual(await save.boundingBox(),before,'Actions remain in place when long content scrolls');
      await expect(dialog.getByRole('heading')).toBeInViewport();await expect(save).toBeInViewport();
      await save.click();await expect(dialog).toBeVisible();
      assert.equal(await page.getByLabel('Artist name').evaluate(e=>e.validity.valueMissing),true,'Footer submit retains native validation');
      await page.getByLabel('Artist name').fill('Example artist');await save.click();
      await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Open settings',exact:true})).toBeFocused();
      await page.getByRole('button',{name:'Open details',exact:true}).click();
      await expect(dialog).toBeVisible();
      await dialog.locator('p').last().scrollIntoViewIfNeeded();
      await expect(page.getByRole('button',{name:'Close details'})).toBeInViewport();
      await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Open details',exact:true})).toBeFocused();
      await page.getByRole('button',{name:'Confirm release',exact:true}).click();
      await expect(page.getByRole('button',{name:'I agree - submit release'})).toBeInViewport();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      for(const element of await dialog.locator('h2,p,button').all()) if(await element.isVisible()) assert.ok((await element.evaluate(textContrast)).ratio>=4.5, `${theme} dialog contrast: ${await element.textContent()}`);
      await page.screenshot({path:path.join(out,`${theme}-${width}.png`)});
      await page.getByRole('button',{name:'I agree - submit release'}).click();await expect(dialog).toHaveCount(0);
      assert.equal(await page.evaluate(()=>window.agreed),true);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.deepEqual(errors,[]);
      console.log(`PASS ${theme} ${width}px: short viewport, fixed actions, native validation, busy Escape guard, focus restoration, admin scrolling, release confirmation`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
