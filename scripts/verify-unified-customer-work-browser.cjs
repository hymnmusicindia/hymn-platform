const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const configBundle = await build({ entryPoints: ['next.config.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
  const Module = require('node:module'), configModule = new Module(require('node:path').resolve('.tmp/calendar-csp.cjs'), module);
  configModule.filename = require('node:path').resolve('.tmp/calendar-csp.cjs'); configModule.paths = module.paths; configModule._compile(configBundle.outputFiles[0].text, configModule.filename);
  const csp = (await configModule.exports.default.headers())[0].headers.find(header => header.key === 'Content-Security-Policy').value;
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{CustomerWorkActions}from'./components/team/customer-work-actions';import{TeamQueue,CalendarConnection}from'./components/team/team-queue';
window.writes=[];window.failSchedule=true;let pending=true;const actor={id:'rep',workspaceId:'ws',owner:false,permissions:['tasks.update','tasks.complete','crm.outreach.manage']};const task={id:'task',title:'First conversation with Artist',version:3,ownerId:'rep',dueAt:new Date(Date.now()+86400000).toISOString()};
const api=async(resource,body)=>{if(body){window.writes.push({resource,body});if(resource==='call-reschedule'&&window.failSchedule){window.failSchedule=false;throw Error('That slot was just taken. Choose another slot.');}if(resource==='handoff-resolve')pending=false;return{id:'saved'}};if(resource.startsWith('call-slots'))return{items:[{startsAt:new Date(Date.now()+86400000).toISOString(),memberId:'rep',name:'HYMN rep',reason:'Existing teammate; shared call capacity available.'}]};if(resource==='handoff-members')return{items:[{id:'specialist',department:'Distribution',user:{name:'Specialist'}}]};if(resource==='calendar-connection')return{connected:true,connection:{accountEmail:'hymn@fixture.invalid'},failures:[]};if(resource.startsWith('team-queue'))return{manager:false,waiting:[],tasks:[],handoffs:pending?[{id:'handoff',version:1,fromId:'other',toId:'rep',fromName:'Other rep',toName:'HYMN rep',summary:'Client needs release planning. Review requirements and confirm the next step.',mode:'TRANSFER',team:'Distribution',task:{id:'task',title:'Artist consultation',clientId:'client'}}]:[]};return{items:[]}};
createRoot(document.getElementById('root')).render(<><section aria-label="Call controls"><CustomerWorkActions api={api} task={task} confirmed onSaved={()=>{}}/></section><section aria-label="Team queue"><TeamQueue api={api} actor={actor}/></section><section aria-label="Calendar hosting"><CalendarConnection api={api} actor={{...actor,owner:true}}/></section></>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outfile: 'unified-ui.js', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}'  } });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [];
      page.on('pageerror', error => {errors.push(error.message);console.error(error.message);});
      page.on('requestfailed', request=>console.error('Request failed:',request.url(),request.failure()?.errorText));
      page.on('console', message=>{if(message.type()==='error')console.error(message.text());});
      await page.route('https://hymn.fixture/**', route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: '<html><body style="background:#151719;color:white;margin:12px"><div id="root"></div></body></html>' }));
      await page.goto('https://hymn.fixture/');
      const css = bundle.outputFiles.find(file => file.path.endsWith('.css')); if (css) await page.addStyleTag({ content: css.text });
      await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
      const controls = page.getByRole('region', { name: 'Call controls' });
      await controls.getByRole('button', { name: 'Reschedule', exact: true }).click();
      let dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Keep the current teammate')).toBeChecked();
      await expect(dialog.getByLabel('The customer agreed to this appointment time')).toBeChecked();
      await expect(dialog.getByLabel('Available time')).toContainText('HYMN rep');
      await dialog.getByLabel('Reason / next step').fill('Customer asked for a different day.');
      await dialog.getByRole('button', { name: 'Save schedule' }).click();
      await expect(dialog.getByRole('alert')).toContainText('just taken');
      await expect(dialog.getByLabel('Reason / next step')).toHaveValue('Customer asked for a different day.');
      await dialog.getByRole('button', { name: 'Save schedule' }).click();
      await expect(dialog).not.toBeVisible();
      const writes = await page.evaluate(() => window.writes.filter(row => row.resource === 'call-reschedule'));
      assert.equal(writes.length, 2); assert.equal(writes[1].body.version, 3); assert.equal(writes[1].body.confirmed, true);
      assert.ok(!writes.some(row => /outcome|attempt/.test(row.resource)), 'Rescheduling never logs an outcome.');
      await controls.getByRole('button', { name: 'Hand off / request help' }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel('Receiving teammate').selectOption('specialist');
      await dialog.getByLabel('Handoff action', { exact: true }).selectOption('HELP');
      await dialog.getByLabel('Receiving team', {exact:true}).fill('Distribution');
      await dialog.getByLabel('Handoff summary').fill('Customer needs release advice. Review artwork; call tomorrow.');
      await dialog.getByRole('button', { name: 'Request handoff' }).click();
      await expect(dialog).not.toBeVisible();
      assert.equal(await page.evaluate(() => window.writes.find(row => row.resource === 'handoff-request').body.mode), 'HELP');
      const queue = page.getByRole('region', { name: 'Team queue' });
      await expect(queue.getByRole('link', { name: 'Open customer' })).toHaveAttribute('href', /module=contacts&client=client/);
      await queue.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(queue.getByText('No handoffs waiting.')).toBeVisible();
      const hosting = page.getByRole('region', { name: 'Calendar hosting' });
      await expect(hosting.getByText('Hosting account: hymn@fixture.invalid')).toBeVisible();
      await expect(hosting.locator('form')).toHaveAttribute('action', '/api/team/google-calendar/connect');
      assert.equal(await hosting.locator('input[name=workspace]').inputValue(), 'ws');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No horizontal overflow at ${width}`);
      assert.deepEqual(errors, []);
      await page.route('https://accounts.google.com/fixture-calendar-consent', route => route.fulfill({ contentType: 'text/html', body: '<h1>Simulated Google calendar consent</h1>' }));
      // The route boundary suite checks the 303. Chromium redirect interception
      // cannot mock later hops, so exercise the allowed provider origin directly.
      await hosting.locator('form').evaluate(form => { form.action = 'https://accounts.google.com/fixture-calendar-consent'; });
      await hosting.getByRole('button', { name: 'Reconnect Google Calendar' }).click();
      await expect(page).toHaveURL('https://accounts.google.com/fixture-calendar-consent');
      console.log(`PASS unified customer controls at ${width}px: schedule failure recovery, retained input, shared slots, confirmed booking, no fake outcomes, specialist help, handoff acceptance, hosting account and customer links.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
