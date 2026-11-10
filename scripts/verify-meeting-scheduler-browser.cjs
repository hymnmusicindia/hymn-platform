const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const folder = path.resolve('.cache/meeting-scheduler-browser');
  await fs.mkdir(folder, { recursive: true });
  await build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {MeetingScheduler} from './components/team/meeting-scheduler';
    window.meetings=[];window.requests=[];window.failOnce=true;window.connected=false;
    const api=async(resource,body)=>{
      if(resource==='meeting-requests')return {items:window.meetings.map(item=>window.connected&&item.status==='SCHEDULED'?{...item,googleSyncStatus:'SYNCED',googleMeetUrl:'https://meet.google.com/abc-defg-hij',googleCalendarUrl:'https://www.google.com/calendar/event?eid=fixture'}:item)};
      if(resource==='meeting-create'){
        window.requests.push(body);
        if(window.failOnce){window.failOnce=false;throw Error('Temporary failure. Retry your saved details.');}
        const item={...body,id:'meeting',version:1,meetingAttendees:body.attendees,endsAt:new Date(Date.parse(body.startsAt)+body.durationMinutes*60000).toISOString(),status:'SCHEDULED',googleSyncStatus:'WAITING_CONNECTION',googleSyncError:null,googleMeetUrl:null,googleCalendarUrl:null};
        window.meetings=[item];return item;
      }
      if(resource==='meeting-cancel'){window.meetings=window.meetings.map(item=>({...item,status:'CANCELLED',version:2,googleSyncStatus:'PENDING'}));return window.meetings[0];}
      throw Error('Unexpected resource '+resource);
    };createRoot(document.getElementById('root')).render(<MeetingScheduler api={api}/>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, jsx: 'automatic', outfile: path.join(folder, 'fixture.js'), define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost:3492/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font-family:Arial;margin:16px}*{box-sizing:border-box}#root{max-width:1000px;margin:auto}</style><div id="root"></div>' }));
      await page.goto('http://localhost:3492/');
      await page.addStyleTag({ path: path.join(folder, 'fixture.css') });
      await page.addScriptTag({ path: path.join(folder, 'fixture.js') });
      await expect(page.getByRole('heading', { name: 'Schedule a Google meeting' })).toBeVisible();
      await expect(page.getByLabel('Time (IST)', { exact: true })).toHaveValue('16:00');
      const date = new Date(Date.now() + (330 + 1440) * 60000).toISOString().slice(0, 10);
      await expect(page.getByLabel('Date (IST)', { exact: true })).toHaveValue(date);
      await page.getByLabel('Guest emails').fill('Guest@example.org, guest@example.org');
      await page.getByLabel('Invitation message (shared with guests)').fill('Discuss the agreed release plan.');
      await page.getByRole('button', { name: 'Schedule meeting', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Temporary failure. Retry your saved details.');
      await expect(page.getByLabel('Guest emails')).toHaveValue('Guest@example.org, guest@example.org');
      await page.getByRole('button', { name: 'Schedule meeting', exact: true }).click();
      await expect(page.locator('article')).toHaveCount(1);
      await expect(page.getByRole('status')).toContainText('connect Google Calendar');
      const requests = await page.evaluate(() => window.requests);
      assert.equal(requests[0].requestKey, requests[1].requestKey, 'Ambiguous failures retain the idempotency key.');
      assert.deepEqual(requests[1].attendees, ['guest@example.org']);
      assert.equal(requests[1].startsAt, new Date(date + 'T16:00:00+05:30').toISOString());
      assert.equal(requests[1].durationMinutes, 30);
      await page.evaluate(() => { window.connected = true; });
      await page.getByRole('button', { name: 'Refresh meetings', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Join Google Meet' })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
      await expect(page.getByRole('link', { name: 'Open Google Calendar' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel meeting', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('cancelled in HYMN');
      await expect(page.getByRole('button', { name: 'Cancel meeting', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Join Google Meet' })).toHaveCount(0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(folder, `meeting-${width}.png`), fullPage: true });
      await page.close();
      console.log(`PASS meeting scheduler ${width}px: tomorrow at 4 PM IST, deduplicated guests, retained failure input/key, connection waiting state, Calendar/Meet links, cancellation and no overflow.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
