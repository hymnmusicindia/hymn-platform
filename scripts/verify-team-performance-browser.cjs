const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const out = path.resolve('.tmp/team-performance-browser');
  await fs.mkdir(out, { recursive: true });
  const metrics = { leads: 12, qualifiedLeads: 10, contacts: 8, contactEvents: 14, replies: 3, conversions: 2, cohortConversions: 1, tasksCompleted: 6 };
  const fixture = { version: 1, workspaceId: 'fixture', memberId: 'member', userId: 1, name: 'Fixture Member', jobTitle: 'Lead Researcher', workRole: 'researcher', period: 'daily', startDay: '2026-10-22', endDay: '2026-10-22', startAt: '2026-10-21T18:30:00Z', endAt: '2026-10-22T18:29:00Z', generatedAt: '2026-10-22T18:29:00Z', provisional: true, target: 15, targetActual: 10, targetLabel: 'contactable leads', metrics, previous: { ...metrics, leads: 9 }, previousLabel: '2026-10-21', overdueFollowUps: 2, overdueTasks: 1, blockedTasks: 1, openAssignments: 7, commissions: [{ currency: 'INR', earnedMinor: 15000, adjustmentMinor: -2500, netMinor: 12500, pendingMinor: 15000, clearedMinor: -2500, reservedMinor: 0 }], days: [{ day: '2026-10-22', leads: 12, qualifiedLeads: 10, contacts: 8, tasksCompleted: 6 }], tips: ['Review two overdue follow-ups and log the next step.'], wins: ['Six assignments completed.'] };
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {TeamPerformanceReport} from './components/team/performance-report';createRoot(document.getElementById('root')).render(<TeamPerformanceReport report={window.reportFixture} snapshot/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-link', setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: process.cwd() })); } }] });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>');
      await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#161b23;--bg:#161b23;--card:#202733;--text:#f2f4f8;--text-muted:#b7c2d2;--accent:#e8bc76;--border:#384357}' });
      await page.evaluate(report => { window.reportFixture = report; }, fixture);
      await page.addStyleTag({ path: path.join(out, 'ui.css') }); await page.addScriptTag({ path: path.join(out, 'ui.js') });
      await expect(page.getByRole('heading', { name: 'Daily performance' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Commission recorded on 2026-10-22' })).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveAttribute('value', '10');
      await expect(page.getByRole('link', { name: 'View updated report' })).toHaveAttribute('href', /member=member/);
      await page.getByText('How this report is calculated', { exact: true }).click();
      await expect(page.getByText(/No attendance, leave or hours-worked records/)).toBeVisible();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Page overflow at ${width}px`);
      if (errors.length) throw new Error(errors.join('\n'));
      await page.screenshot({ path: path.join(out, `${width}.png`), fullPage: true });
      await page.close(); console.log(`PASS ${width}px Team performance: metrics, target, commission, report link, methodology and no page overflow`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
