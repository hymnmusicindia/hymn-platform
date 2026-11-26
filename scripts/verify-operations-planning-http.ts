import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { chromium, expect } from '@playwright/test';
import { prisma } from '../lib/prisma';
import { roleTemplates } from '../lib/team/policy';
import { mkdirSync } from 'node:fs';

async function main() {
  if (!process.env.DATABASE_URL?.includes('127.0.0.1:55461/team_fixture')) throw new Error('Only the isolated Team fixture is supported.');
  const origin = 'http://127.0.0.1:35479';
  // Production rejects localhost as its public CSRF origin. Model the public
  // reverse-proxy origin in headers while every request still targets loopback.
  const mutationOrigin = 'https://hymnmusic.fun';
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Operations HTTP fixture' } });
  const make = async (name: string, owner: boolean) => {
    const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name, owner, permissions: owner ? roleTemplates.Owner : roleTemplates['Team Member'] } });
    const user = await prisma.user.create({ data: { name, email: `${name}-${workspace.id}@example.test`, googleId: `${name}-${workspace.id}` } });
    const member = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id }, include: { role: true } });
    return { user, member };
  };
  const owner = await make('Operations owner', true), staff = await make('Operations employee', false);
  await prisma.teamTask.create({ data: { workspaceId: workspace.id, creatorId: owner.member.id, ownerId: staff.member.id, title: 'Prepare artist project handoff', followUpContext: { operations: { remainingHours: 3 } } } });
  const localHeaders = { 'x-forwarded-proto': 'https' };
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '35479', '--hostname', '127.0.0.1'], { env: { ...process.env, CANONICAL_HOST: '127.0.0.1', APP_URL: mutationOrigin, NEXT_PUBLIC_APP_URL: mutationOrigin }, stdio: 'inherit', windowsHide: true });
  const browser = await chromium.launch();
  const route = `/api/team/operations-planning?workspace=${workspace.id}`;
  try {
    for (let i = 0; i < 90; i++) { try { if ((await fetch(origin + route, { redirect: 'manual', headers: localHeaders })).status === 401) break; } catch (error) { if ((error as { cause?: { code?: string } }).cause?.code === 'EACCES') throw new Error('Localhost access is blocked. Run this isolated fixture with loopback networking enabled.'); } if (i === 89) throw new Error('Production fixture server did not start.'); await new Promise(resolve => setTimeout(resolve, 1000)); }
    const token = (user: typeof owner.user) => jwt.sign({ sub: user.id, email: user.email, name: user.name, role: 'customer' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: localHeaders });
    await context.route('**/*', request => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
    await context.addCookies([{ name: 'hymn_session', value: token(owner.user), url: origin }]);
    const result = await context.request.get(origin + route, { maxRedirects: 0 }); assert.equal(result.status(), 200);
    assert.equal(result.headers()['cache-control'], 'private, no-store');
    const data = await result.json(); assert.equal(data.items.length, 1); assert.equal(data.items[0].title, 'Prepare artist project handoff');
    assert.equal(data.items[0].followUpContext, undefined); assert.equal(data.items[0].eventKey, undefined);
    const staffContext = await browser.newContext({ extraHTTPHeaders: localHeaders }); await staffContext.addCookies([{ name: 'hymn_session', value: token(staff.user), url: origin }]);
    assert.equal((await staffContext.request.get(origin + route, { maxRedirects: 0 })).status(), 403);
    assert.equal((await staffContext.request.post(`${origin}/api/team/operations-delegate?workspace=${workspace.id}`, { maxRedirects: 0, headers: { origin: mutationOrigin }, data: { role: { owner: true }, changes: [] } })).status(), 403);
    assert.equal((await context.request.post(`${origin}/api/team/operations-delegate?workspace=${workspace.id}`, { maxRedirects: 0, headers: { origin: 'https://untrusted.example' }, data: { changes: [] } })).status(), 403);
    assert.equal((await context.request.post(`${origin}/api/team/operations-delegate?workspace=${workspace.id}`, { maxRedirects: 0, headers: { origin: mutationOrigin }, data: { changes: [] } })).status(), 400);
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    await page.goto(`${origin}/team?workspace=${workspace.id}&module=owner-operations`, { timeout: 120000 });
    await expect(page.getByRole('heading', { name: 'Make room for the work that matters.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prepare artist project handoff', exact: true })).toBeVisible();
    await page.keyboard.press('Control+k'); await expect(page.getByLabel('Search contacts, consultations and work')).toBeFocused(); await page.keyboard.press('Escape');
    mkdirSync('.cache/operations-planning-browser', { recursive: true });
    await page.screenshot({ path: '.cache/operations-planning-browser/production-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: '.cache/operations-planning-browser/production-mobile.png', fullPage: true });
    await prisma.teamMember.update({ where: { id: owner.member.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await context.request.get(origin + route, { maxRedirects: 0 })).status(), 403);
    await context.close(); await staffContext.close();
    console.log('PASS production HTTP/browser: real owner session, private/no-store payload, unauthenticated/member denial, forged owner and cross-origin rejection, input validation, live revocation, real Team shell and mobile overflow. Isolated records only.');
  } finally {
    await browser.close();
    if (process.platform === 'win32' && server.pid) await new Promise<void>(resolve => { const child = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); child.on('exit', () => resolve()); }); else server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
