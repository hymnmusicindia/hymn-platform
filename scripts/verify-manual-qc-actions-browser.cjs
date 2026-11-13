const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

async function main() {
  const out = path.resolve('.cache/manual-qc-actions-browser');
  await fs.mkdir(out, { recursive: true });
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AdminControlCenter} from './components/admin-control-center';createRoot(document.getElementById('root')).render(<AdminControlCenter currentAdmin={{id:1,name:'Admin',email:'admin@fixture.invalid',role:'admin'}} adminAccess={{role:'super_admin',permissions:window.permissions}} initialTab="releases" initialReleases={window.fixtureReleases} initialBeats={[]} initialOrders={[]} initialUsers={[]} initialApplications={[]} initialLeads={[]} initialDistributionOrders={[]} initialArtistProfiles={[]} initialSiteSettings={{}} initialNotifications={[]} initialSupportTickets={[]}/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', external: ['/fonts/*'], define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'next-fixture', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|dynamic|image|link)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ resolveDir: process.cwd(), loader: 'tsx', contents: a.path.endsWith('navigation') ? `const params=new URLSearchParams('tab=releases');export const useSearchParams=()=>params;export const useRouter=()=>({push(){},replace(){},refresh(){}});export const usePathname=()=>'/admin';` : a.path.endsWith('dynamic') ? `export default function dynamic(){return ()=>null;}` : `import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image') ? 'img' : 'a'}',props,children)}` }));
    } }]
  });
  const base = { userId: 2, artistName: 'Artist', releaseType: 'single', createdAt: '2026-11-14', releaseDate: '2099-01-01', paymentStatus: 'paid', platforms: [], tracks: [], recordVersion: 3 };
  const releases = [
    { ...base, id: 1, status: 'under_review', releaseTitle: 'Correction response', trackName: 'Correction response', direNoteStatus: 'changes_required', metadata: { correctionReview: { status: 'pending', submissionKey: 'response-1' }, autoQc: { status: 'manual_review_required', reason: 'Review evidence' } } },
    { ...base, id: 2, status: 'approved', releaseTitle: 'Manual pass', trackName: 'Manual pass', direNoteStatus: 'changes_required', metadata: { manualQc: { status: 'passed', releaseId: 2, reviewedVersion: 3 }, correctionReview: { status: 'approved', submissionKey: 'response-2' }, autoQc: { status: 'manual_review_required', issues: [{ field: 'rights', message: 'Earlier hold' }] } } },
    { ...base, id: 3, status: 'resubmitted', releaseTitle: 'Resubmitted recording', trackName: 'Resubmitted recording', metadata: {} },
    { ...base, id: 4, status: 'in_qc_queue', releaseTitle: 'Queued recording', trackName: 'Queued recording', metadata: {} },
    { ...base, id: 5, status: 'delivery_failed', releaseTitle: 'Failed handoff', trackName: 'Failed handoff', metadata: {} },
    { ...base, id: 6, status: 'draft', releaseTitle: 'Unsubmitted draft', trackName: 'Unsubmitted draft', metadata: {} },
    { ...base, id: 7, status: 'distributor_processing', releaseTitle: 'Accepted recording', trackName: 'Accepted recording', metadata: {} }
  ];
  const permissions = ['releases.read', 'releases.review', 'releases.override', 'distribution.submit', 'distribution.retry', 'distribution.confirm_status'];
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [], writes = [];
      let blocked = false, unavailable = false, readCount = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://hymn.fixture/**', async route => {
        const req = route.request(), url = new URL(req.url());
        if (req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>' });
        if (url.pathname.endsWith('/direnote/readiness')) {
          readCount++;
          if (unavailable) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
          return route.fulfill({ json: { releaseId: Number(url.pathname.split('/')[4]), ready: !blocked, issues: blocked ? [{ field: 'audio', message: 'Audio source unavailable', fixSuggestion: 'Replace the missing file.' }] : [], warnings: [], checklist: [{ label: 'Audio', ready: !blocked }] } });
        }
        if (req.method() === 'PATCH') {
          writes.push({ path: url.pathname, data: req.postDataJSON() });
          const id = Number(url.pathname.split('/').at(-1));
          return route.fulfill({ json: { release: { ...releases.find(release => release.id === id), status: 'distributor_processing' } } });
        }
        return route.fulfill({ json: url.pathname === '/api/admin/releases' ? { releases, watermark: new Date().toISOString() } : { logs: [], attempts: [], history: [], items: [], tasks: [], stores: [], summary: {}, data: [] } });
      });
      await page.goto('https://hymn.fixture/admin?tab=releases');
      await page.evaluate(({ releases, permissions }) => { window.fixtureReleases = releases; window.permissions = permissions; }, { releases, permissions });
      await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;padding:20px;font-family:Arial;background:#0c1017;color:#edf1f7;--text:#edf1f7;--text-muted:#aeb8c7;--bg:#0c1017;--bg-soft:#192331;--card:#192331;--border:#303a49}button,input,select{font:inherit}' });
      await page.addStyleTag({ path: path.join(out, 'ui.css') });
      await page.addScriptTag({ path: path.join(out, 'ui.js') });
      const inspect = async title => page.getByRole('button', { name: `Inspect ${title}`, exact: true }).click();
      const close = async () => page.getByRole('button', { name: 'Close details', exact: true }).click();
      await inspect('Correction response');
      await expect(page.getByRole('button', { name: 'Approve & Send to DireNote', exact: true })).toBeEnabled();
      await expect(page.getByRole('dialog')).toContainText('Correction review required');
      await close();
      await inspect('Manual pass');
      await expect(page.getByRole('button', { name: 'Send to DireNote', exact: true })).toBeEnabled();
      await expect(page.getByRole('region', { name: 'Automatic QC evidence' })).toContainText('Manual QC passed');
      await expect(page.getByRole('region', { name: 'Automatic QC evidence' })).toContainText('Historical automatic QC notes');
      // Opening approval closes the native top-layer dialog, leaving confirmation accessible.
      await page.getByRole('button', { name: 'Send to DireNote', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Confirm Action' })).toBeVisible();
      await page.getByRole('button', { name: 'Yes, Approve & Send', exact: true }).click();
      await expect.poll(() => writes.length).toBe(1);
      assert.equal(writes[0].path, '/api/admin/update-status/2');
      assert.equal(writes[0].data.status, 'approved');
      // Dismiss the outcome dialog before inspecting more records.
      const dismiss = page.getByRole('button', { name: /close|got it|understood/i }).last();
      if (await dismiss.isVisible()) await dismiss.click();
      for (const title of ['Resubmitted recording', 'Queued recording']) {
        await inspect(title);
        await expect(page.getByRole('button', { name: 'Start Review', exact: true })).toBeEnabled();
        await close();
      }
      await inspect('Failed handoff');
      await expect(page.getByRole('button', { name: 'Retry Send', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Return to QC', exact: true })).toBeEnabled();
      await close();
      blocked = true;
      await inspect('Correction response');
      await page.getByRole('button', { name: 'Recheck readiness', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Approve & Send to DireNote', exact: true })).toBeDisabled();
      await expect(page.getByRole('region', { name: 'Release review actions' })).toContainText('Audio source unavailable');
      unavailable = true;
      await page.getByRole('button', { name: 'Recheck readiness', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Release review actions' })).toContainText('readiness is unavailable');
      unavailable = blocked = false;
      const before = readCount;
      await page.getByRole('button', { name: 'Recheck readiness', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Approve & Send to DireNote', exact: true })).toBeEnabled();
      assert.ok(readCount > before);
      await close();
      await inspect('Accepted recording');
      await expect(page.getByRole('button', { name: /Approve & Send to DireNote|^Send to DireNote$|^Retry Send$/ })).toHaveCount(0);
      await close();
      await page.getByRole('button', { name: 'QC queue', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Release review actions' })).toBeVisible();
      // A read-only operator can inspect eligibility without gaining write authority.
      await page.goto('https://hymn.fixture/admin?tab=releases');
      await page.evaluate(releases => { window.fixtureReleases = releases; window.permissions = ['releases.read']; }, releases);
      await page.addStyleTag({ path: path.join(out, 'ui.css') });
      await page.addScriptTag({ path: path.join(out, 'ui.js') });
      await inspect('Correction response');
      await expect(page.getByRole('button', { name: 'Approve & Send to DireNote', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Request Metadata Changes', exact: true })).toBeDisabled();
      await close();
      await page.getByRole('button', { name: /^Drafts/ }).click();
      await inspect('Unsubmitted draft');
      await expect(page.getByRole('button', { name: /Approve & Send to DireNote|^Send to DireNote$|^Start Review$/ })).toHaveCount(0);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${width}px catalogue and QC controls: correction review, manual pass, correct send target, accessible confirmation, resubmission, QC queue, failed delivery, visible blockers and readiness recovery.`);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
