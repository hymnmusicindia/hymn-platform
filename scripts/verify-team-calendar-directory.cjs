const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-team-calendar-'));
  await build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {TeamCalendar} from './components/team/calendar';import {TeamContacts} from './components/team/contacts';import {CustomerCalls} from './components/team/customer-calls';
    const actor={id:'staff',workspaceId:'workspace',name:'Staff',owner:false,permissions:['calendar.view','calendar.manage','tasks.create']};
    const date=new Date(Date.now()+330*60000).toISOString().slice(0,10);
    const card={id:'contact',name:'Shared Artist',phone:'+919876543210',email:'artist@example.org',secondaryEmail:'',interests:[],city:'Delhi',state:'',status:'ACTIVE',notes:'',notesVisible:false,ownerId:'someone-else',version:1};
    const events=[{id:'event1',title:'Artist call',kind:'CALL',assigneeId:'staff',creatorId:'staff',startsAt:date+'T10:00:00+05:30',endsAt:date+'T11:00:00+05:30',status:'SCHEDULED',clientId:'contact',client:card,notes:'Call context',outcome:'',version:1},{id:'event2',title:'Overlapping meeting',kind:'MEETING',assigneeId:'staff',creatorId:'staff',startsAt:date+'T10:30:00+05:30',endsAt:date+'T11:30:00+05:30',status:'SCHEDULED',clientId:null,notes:'',outcome:'',version:1}];
    const api=async (resource,body)=>{if(body){window.saved={resource,body};return {...card,...body};}if(resource.startsWith('calendar?'))return {items:events,total:2,deadlines:[]};if(resource.startsWith('clients?'))return {items:[card],total:1};if(resource.startsWith('client-account-match'))return {accounts:[]};if(resource.startsWith('call-followups'))return {items:[{id:'callback',title:'Draft inactive for 30 hours',dueAt:date+'T12:00:00+05:30',priority:'NORMAL',ownerId:'staff',client:card,followUpContext:{footnotes:['Draft needs help']}}],total:1};throw Error('Unexpected API '+resource);};
    const members=[{id:'staff',status:'ACTIVE',role:{owner:false},user:{name:'Staff'}}];
    function App(){return <><TeamCalendar api={api} actor={actor} members={members} onContacts={id=>window.openContact=id||'new'}/><hr/><TeamContacts api={api} actor={actor}/><hr/><CustomerCalls api={api} workspaceId="workspace"/></>};
    createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-link', setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`, loader: 'jsx', resolveDir: process.cwd() })); } }] });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];page.on('pageerror', e => errors.push(e.message));
      await page.route('http://localhost:3219/**', route => route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://localhost:3219/');
      await page.addStyleTag({ content: 'body{margin:0;padding:16px;background:#141b24;color:#edf1f7;font-family:Arial}*{box-sizing:border-box}#root{max-width:1400px;margin:auto}hr{margin:32px 0}' });
      await page.addStyleTag({ path: path.join(output, 'fixture.css') });await page.addScriptTag({ path: path.join(output, 'fixture.js') });
      await expect(page.getByRole('region', { name: width > 700 ? 'Week schedule' : 'Day schedule' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Artist call', exact: false }).first()).toBeVisible();
      await page.screenshot({path:path.join(output,'timeline-'+width+'.png'),fullPage:true});
      await page.getByRole('button', { name: 'Day', exact: true }).click();
      const day = page.getByRole('region', { name: 'Day schedule' });
      const date = new Date(Date.now()+330*60000).toISOString().slice(0,10);
      await day.getByRole('button', { name: 'Schedule '+date+' at 9:00 IST', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button', { name: 'Close calendar form' }).click();
      await page.getByRole('button', { name: 'Month', exact: true }).click();await expect(page.getByRole('button', { name: 'View schedule for '+date, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Schedule', exact: true }).click();await expect(page.getByLabel('Agenda date')).toBeVisible();
      await page.getByRole('button', { name: 'New client card', exact: true }).click();assert.equal(await page.evaluate(()=>window.openContact),'new');
      await page.getByRole('button', { name: 'Open contact card', exact: true }).click();
      const contact = page.getByRole('dialog', { name: 'Contact card: Shared Artist' });await expect(contact).toBeVisible();await expect(contact.getByText('Private notes are restricted', { exact: false })).toBeVisible();await expect(contact.locator('textarea[name=notes]')).toHaveCount(0);
      await contact.getByLabel('Name', { exact: true }).fill('Corrected shared artist');await contact.getByRole('button', { name: 'Save contact', exact: true }).click();
      await expect(contact).not.toBeVisible();assert.equal((await page.evaluate(()=>window.saved)).body.ownerId,'someone-else');
      await expect(page.getByRole('link',{name:'Open WhatsApp Web',exact:true})).toHaveAttribute('href','https://web.whatsapp.com/send?phone=919876543210');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow at '+width);
      assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,'team-'+width+'.png'),fullPage:true});await page.close();
    }
    console.log('PASS desktop/mobile calendar views, time-slot composer, shared contact edit, private-note hiding, WhatsApp Web and page overflow. Previews: '+output);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
