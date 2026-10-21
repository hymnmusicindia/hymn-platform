import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getEmailClient, getEmailConfig } from '@/lib/email/email-client';
import { getPublicAppUrl } from '@/lib/public-app-url';
import { buildPerformanceReport } from './performance';
import { duePerformanceWindows, indiaDay, type PerformanceReport } from './performance-model';
import { performanceEmail } from './performance-email';

const channel = 'team_performance';
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function queuePerformanceReports(now = new Date(), limit = 20) {
  const members = await prisma.teamMember.findMany({ where: { status: 'ACTIVE', role: { owner: false }, user: { status: 'ACTIVE' } }, select: { id: true, joinedAt: true, userId: true, user: { select: { email: true } } }, orderBy: { id: 'asc' } });
  const windows = duePerformanceWindows(now);
  const keys = members.flatMap(member => windows.map(window => `team-performance:${member.id}:${window.period}:${indiaDay(window.start)}`));
  const existing = new Set((await prisma.emailLog.findMany({ where: { eventKey: { in: keys } }, select: { eventKey: true } })).map(row => row.eventKey));
  let queued = 0;
  const deadline = Date.now() + 20_000;
  for (const member of members) for (const window of windows) {
    if (queued >= limit || Date.now() >= deadline) return { queued };
    if (member.joinedAt >= window.end) continue;
    const eventKey = `team-performance:${member.id}:${window.period}:${indiaDay(window.start)}`;
    if (existing.has(eventKey)) continue;
    const report = await buildPerformanceReport(member.id, window.period, indiaDay(window.start), now);
    await prisma.$transaction(async tx => {
      const row = await tx.emailLog.upsert({ where: { eventKey }, create: { userId: member.userId, toEmail: member.user.email, subject: 'HYMN Team OS performance report', template: 'team_performance_report', eventKey, entityType: 'team_member', entityId: member.id, provider: 'smtp', status: 'pending', payload: json({ channel, report }) }, update: {} });
      if (typeof object(row.payload).html === 'string') return;
      const saved = object(row.payload).report as PerformanceReport;
      const email = performanceEmail(saved, `${getPublicAppUrl()}/team/performance/${row.id}`);
      await tx.emailLog.update({ where: { id: row.id }, data: { subject: email.subject, payload: json({ channel, report: saved, html: email.html, text: email.text }) } });
      await tx.teamNotification.create({ data: { memberId: member.id, title: `Your ${window.period} performance report is ready`, href: `/team/performance/${row.id}` } });
    });
    queued++;
  }
  return { queued };
}
type Delivery = (input: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string }) => Promise<{ data: { id?: string } | null; error: { message: string } | null }>;
export async function deliverPerformanceReports(now = new Date(), deliver?: Delivery, limit = 8) {
  const config = getEmailConfig();
  if (!config.enabled && !deliver) return { enabled: false, sent: 0, failed: 0, cancelled: 0 };
  const scope = { template: 'team_performance_report', payload: { path: ['channel'], equals: channel } };
  const interrupted = await prisma.emailLog.findMany({ where: { ...scope, status: 'sending' }, select: { id: true, payload: true } });
  for (const row of interrupted) {
    const claimedAt = Date.parse(String(object(row.payload).claimedAt || ''));
    if (!Number.isFinite(claimedAt) || claimedAt < now.getTime() - 10 * 60_000) await prisma.emailLog.updateMany({ where: { id: row.id, status: 'sending' }, data: { status: 'review', errorMessage: 'Interrupted SMTP delivery. Verify delivery before resending.' } });
  }
  const rows = await prisma.emailLog.findMany({ where: { ...scope, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 100 });
  let sent = 0, failed = 0, cancelled = 0, processed = 0;
  const deadline = Date.now() + 20_000;
  for (const row of rows) {
    if (processed >= limit || Date.now() >= deadline) break;
    const payload = object(row.payload);
    if (payload.nextAttemptAt && Date.parse(String(payload.nextAttemptAt)) > now.getTime()) continue;
    if (!(await prisma.emailLog.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'sending', payload: json({ ...payload, claimedAt: now.toISOString() }) } })).count) continue;
    processed++;
    const report = payload.report as PerformanceReport;
    const member = await prisma.teamMember.findFirst({ where: { id: row.entityId || '', workspaceId: report?.workspaceId || "invalid", userId: row.userId ?? -1, status: 'ACTIVE', role: { owner: false }, user: { status: 'ACTIVE', email: { equals: row.toEmail, mode: 'insensitive' } } } });
    if (!member || typeof payload.html !== 'string' || typeof payload.text !== 'string') {
      await prisma.emailLog.update({ where: { id: row.id }, data: { status: 'cancelled', errorMessage: 'Membership, recipient or report changed before delivery.' } }); cancelled++; continue;
    }
    try {
      const result = await (deliver ?? getEmailClient({ timeoutMs: 8000 })!.emails.send)({ from: config.from, to: row.toEmail, subject: row.subject, html: payload.html, text: payload.text, ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
      if (result.error) throw new Error(result.error.message);
      await prisma.emailLog.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), providerMessageId: result.data?.id ?? null, errorMessage: null } }); sent++;
    } catch (error) {
      const e = error as { code?: string; command?: string };
      const safeRetry = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(e.code || '') || e.code === 'ETIMEDOUT' && e.command === 'CONN';
      const retryCount = row.retryCount + 1;
      await prisma.emailLog.update({ where: { id: row.id }, data: { status: safeRetry && retryCount <= 5 ? 'pending' : 'review', retryCount, errorMessage: safeRetry ? 'SMTP connection unavailable; bounded retry scheduled.' : 'Delivery outcome uncertain. Verify before resending.', payload: json({ ...payload, nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** retryCount) * 1000).toISOString() }) } }); failed++;
    }
  }
  return { enabled: true, sent, failed, cancelled, processed };
}
