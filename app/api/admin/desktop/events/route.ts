import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminAccessForPage } from '@/lib/access';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { consumeRateLimit } from '@/lib/rate-limit';
import { desktopTaskScope, desktopTaskAlert, desktopTaskContexts } from '@/lib/admin-desktop-feed';
import {desktopReleaseLabels,desktopReleaseAlert} from '@/lib/desktop-alert-text';
import type {ReleaseStatus} from '@prisma/client';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers });
    const access = await getAdminAccessForPage();
    if (!access?.permissions.length) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403, headers });
    const rate = await consumeRateLimit({ scope: 'admin-desktop-events', identity: String(session.sub), limit: 120, windowSeconds: 60 });
    if (!rate.allowed) return NextResponse.json({ error: 'Please wait.' }, { status: 429, headers });
    const q = new URL(request.url).searchParams, inbox=q.get('view')==='inbox', now = Date.now() - 3000;
    const until = new Date(q.get('until') ?? now), since = new Date(q.get('since') ?? until.getTime() - (inbox?7*86400000:120000)), after = Number(q.get('after') ?? 0);
    if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || until.getTime() > Date.now() + 5000 || since > until || until.getTime() - since.getTime() > 7 * 86400000 || !Number.isSafeInteger(after) || after < 0) return NextResponse.json({ error: 'Invalid event window.' }, { status: 400, headers });
    // Even IDs represent tasks; odd IDs represent immutable submission transitions.
    // Both sources share one stable timestamp/sequence pagination order.
    const [tasks, submissions] = await Promise.all([
      prisma.adminTask.findMany({ where: { AND: [desktopTaskScope(access.permissions), { updatedAt: { lte: until }, OR: [{ updatedAt: { gt: since } }, { updatedAt: since, id: { gt: Math.floor(after / 2) } }] }] }, orderBy: [{ updatedAt: inbox?'desc':'asc' }, { id: inbox?'desc':'asc' }], take: 101, select: { id: true, entityId:true,type:true,title:true,body:true,href:true,entityType: true, status: true, priority: true, updatedAt: true, snoozedUntil: true } }),
      access.permissions.some(p => ['releases.read', 'releases.review', 'distribution.retry'].includes(p)) ? prisma.releaseStatusTransition.findMany({ where: { newStatus: { in: Object.keys(desktopReleaseLabels) as ReleaseStatus[] }, release: { archivedAt: null }, createdAt: { lte: until }, OR: [{ createdAt: { gt: since } }, { createdAt: since, id: { gt: Math.floor((after - 1) / 2) } }] }, orderBy: [{ createdAt: inbox?'desc':'asc' }, { id: inbox?'desc':'asc' }], take: 101, select: { id: true, releaseId: true, createdAt: true, newStatus: true,reason:true,release:{select:{title:true,artistName:true,artworkUrl:true}} } }) : []
    ]);
    const contexts=await desktopTaskContexts(tasks);
    const candidates = [
      ...tasks.map(task => ({ sequence: task.id * 2, at: task.updatedAt, event: !['resolved', 'snoozed'].includes(task.status) && (!task.snoozedUntil || task.snoozedUntil <= new Date()) ? desktopTaskAlert(task, access.permissions,contexts.get(`${task.entityType}:${task.entityId}`)) : null })),
      ...submissions.map(row => ({ sequence: row.id * 2 + 1, at: row.createdAt, event: desktopReleaseAlert(row) }))
    ].sort((a, b) => (inbox?-1:1)*(a.at.getTime() - b.at.getTime() || a.sequence - b.sequence));
    const page = candidates.slice(0, 100), last = page.at(-1);
    return NextResponse.json({ identity: createHash('sha256').update(`${session.sub}:${[...access.permissions].sort().join(',')}`).digest('hex'), events: page.map(item => item.event).filter(Boolean), until: until.toISOString(), next: !inbox && candidates.length > 100 && last ? { since: last.at.toISOString(), after: last.sequence } : null }, { headers });
  } catch { return NextResponse.json({ error: 'Admin alerts are temporarily unavailable.' }, { status: 503, headers }); }
}
