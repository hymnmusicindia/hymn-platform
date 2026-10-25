const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');
(async () => {
  const result = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{CrmPipeline}from'./components/team/crm-pipeline';window.calls=[];const api=async(resource,body)=>{window.calls.push({resource,body});return{items:[]}};createRoot(document.getElementById('root')).render(<CrmPipeline leads={[{id:'lead1',researcher:{user:{name:'Researcher'}},acquisitionEmployeeId:'caller1',acquisitionEmployee:{user:{name:'Caller'}},leadVerified:false,prospect:{id:'p1',version:1,name:'Artist Example',email:'artist@example.org',phone:'+919876543210',stage:'READY_TO_CONTACT',verified:true,contactEligibility:'LEGITIMATE_INTEREST',sourceUrl:'https://example.org',notes:'',categories:[]}}]} api={api} refresh={async()=>{}} admin={false} canEdit={true} canCreate={false} employeeId="caller1" onAdd={()=>{}}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outfile: 'lead-stage-test.js', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: result.outputFiles.find(file => file.path.endsWith('.js')).text });
    const css = result.outputFiles.find(file => file.path.endsWith('.css')); if (css) await page.addStyleTag({ content: css.text });
    await page.getByRole('button', { name: /Artist Example/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Contact: Artist Example' });
    await dialog.getByLabel('Call notes', { exact: true }).fill('Talked with the customer about distribution.');
    await dialog.getByLabel('Call evidence', { exact: true }).fill('Call log 456');
    await dialog.getByLabel('I spoke with this person', { exact: false }).check();
    await dialog.getByLabel('I confirmed their name and contact details', { exact: true }).check();
    await dialog.getByLabel('I confirmed what help they need', { exact: true }).check();
    await dialog.getByLabel('Mark as a verified lead', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Save contact & next call' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Confirm verified lead?' }); await confirmation.waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.resource === 'prospect-call-save').length), 0);
    await confirmation.getByRole('button', { name: 'Go back' }).click();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.resource === 'prospect-call-save').length), 0);
    await dialog.getByRole('button', { name: 'Save contact & next call' }).click();
    await confirmation.getByRole('button', { name: 'Yes, verify this lead' }).click();
    await page.waitForFunction(() => window.calls.some(call => call.resource === 'prospect-call-save'));
    const saved = await page.evaluate(() => window.calls.find(call => call.resource === 'prospect-call-save').body);
    assert.equal(saved.stage, 'VERIFIED_LEAD'); assert.equal(saved.verifyLead.confirmed, true); assert.equal(saved.verifyLead.identityConfirmed, true); assert.equal(saved.contact.evidence, 'Call log 456');
    console.log('Lead stage UI: simple stages, rep checklist, second confirmation, cancel without saving and confirmed call payload passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
