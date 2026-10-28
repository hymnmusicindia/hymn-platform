import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getEmailClient, getEmailConfig } from '@/lib/email/email-client';
import { emailLayout, emailText, type EmailSection } from '@/lib/email/email-templates';
import { getPublicAppUrl } from '@/lib/public-app-url';
import { activeWindows } from './availability-rules';
import { nextDayPlanWindow, planTime } from './nightly-plan-model';

const channel = 'team_next_day_plan', template = 'team_next_day_plan';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Window = NonNullable<ReturnType<typeof nextDayPlanWindow>>;
type Database = typeof prisma;
type Delivery = (input: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string }) => Promise<{ data: { id?: string } | null; error: { message: string } | null }>;

export async function buildNightlyPlan(userId: number, window: Window, db: Database = prisma) {
  const members = await db.teamMember.findMany({ where: { userId, status: 'ACTIVE', user: { status: 'ACTIVE' } }, include: { user: { select: { name: true, email: true } }, workspace: { select: { name: true } } }, orderBy: { id: 'asc' } });
  const eligible = members.filter(member => object(member.preferences).nightlyPlan !== false);
  if (!eligible.length) return null;
  const sections: EmailSection[] = [];
  let scheduled = 0, due = 0, overdue = 0, undated = 0;
  for (const member of eligible) {
    const [events, tasks] = await Promise.all([
      db.teamCalendarEvent.findMany({ where: { workspaceId: member.workspaceId, assigneeId: member.id, status: 'SCHEDULED', startsAt: { lt: window.end }, OR: [{ endsAt: { gt: window.start } }, { endsAt: null, startsAt: { gte: window.start } }] }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], select: { title: true, startsAt: true, endsAt: true, kind: true, followUpTaskId: true } }),
      db.teamTask.findMany({ where: { workspaceId: member.workspaceId, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, AND: [{ OR: [{ ownerId: member.id }, { collaboratorIds: { has: member.id } }] }, { OR: [{ dueAt: { lt: window.end } }, { dueAt: null }] }] }, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], select: { id: true, title: true, dueAt: true, status: true } }),
    ]);
    const plannedIds = new Set(events.flatMap(event => event.followUpTaskId ? [event.followUpTaskId] : []));
    const remaining = tasks.filter(task => !plannedIds.has(task.id));
    const tomorrow = remaining.filter(task => task.dueAt && task.dueAt >= window.start);
    const carryover = remaining.filter(task => task.dueAt && task.dueAt < window.start);
    const noDate = remaining.filter(task => !task.dueAt);
    scheduled += events.length; due += tomorrow.length; overdue += carryover.length; undated += noDate.length;
    const prefix = eligible.length > 1 ? `${member.workspace.name} / ` : '';
    const hours = activeWindows(member.preferences, window.start, window.end).filter(slot => slot.endsAt > window.start && slot.startsAt < window.end);
    sections.push({ title: `${prefix}Working hours`, body: hours.length ? hours.map(slot => `${planTime(new Date(Math.max(slot.startsAt.getTime(), window.start.getTime())))} - ${planTime(new Date(Math.min(slot.endsAt.getTime(), window.end.getTime())))} IST`).join('\n') : 'No working hours are currently available for this day. Review your availability if this is unexpected.' });
    sections.push({ title: `${prefix}Tomorrow's schedule (${events.length})`, body: events.length ? events.map(event => `${event.startsAt < window.start ? 'Continues from today' : planTime(event.startsAt)}${event.endsAt ? ` - ${planTime(event.endsAt)}` : ''} IST: ${event.title}${event.kind === 'FOLLOW_UP' ? ' (internal callback plan)' : ''}`).join('\n') : 'No events or calls are scheduled.' });
    if (tomorrow.length) sections.push({ title: `${prefix}Other work due tomorrow (${tomorrow.length})`, body: tomorrow.map(task => `${planTime(task.dueAt!)} IST: ${task.title}${task.status === 'BLOCKED' ? ' [blocked]' : ''}`).join('\n') });
    if (carryover.length) sections.push({ title: `${prefix}Overdue work to review (${carryover.length})`, body: carryover.map(task => `${task.title}${task.status === 'BLOCKED' ? ' [blocked]' : ''}`).join('\n') });
    if (noDate.length) sections.push({ title: `${prefix}Open work without a date (${noDate.length})`, body: noDate.map(task => `${task.title}${task.status === 'BLOCKED' ? ' [blocked]' : ''}`).join('\n') });
  }
  const label = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(window.start);
  const model = { title: `Your plan for ${label}`, greeting: `Hi ${eligible[0].user.name.split(' ')[0]},`, body: `${scheduled} scheduled items, ${due} other tasks due tomorrow, ${overdue} overdue and ${undated} without a date. Everything is in India time.`, sections, ctaLabel: 'Open my workspace', ctaUrl: `${getPublicAppUrl()}/team?module=work`, notice: 'One nightly planning email. This is your current schedule, not a performance report. Changes after this email remain visible in Team OS; routine reminders stay in-app.' };
  return { email: eligible[0].user.email, subject: `Your HYMN plan - ${label}`, html: emailLayout({ ...model, audience: 'team' }), text: emailText({ ...model, audience: 'team' }) };
}

export async function queueNightlyPlans(now = new Date(), db: Database = prisma) {
  const window = nextDayPlanWindow(now);
  if (!window) return { queued: 0 };
  const members = await db.teamMember.findMany({ where: { status: 'ACTIVE', user: { status: 'ACTIVE' } }, select: { userId: true, preferences: true, user: { select: { email: true } } } });
  let queued = 0;
  for (const userId of new Set(members.filter(member => object(member.preferences).nightlyPlan !== false).map(member => member.userId))) {
    const member = members.find(item => item.userId === userId)!;
    const result = await db.emailLog.createMany({ data: [{ userId, toEmail: member.user.email, subject: `Your HYMN plan - ${window.day}`, template, eventKey: `team-next-day:${userId}:${window.day}`, entityType: 'team_next_day', entityId: window.day, provider: 'smtp', status: 'pending', payload: json({ channel, day: window.day }) }], skipDuplicates: true });
    queued += result.count;
  }
  return { queued };
}

export async function deliverNightlyPlans(now = new Date(), deliver?: Delivery, db: Database = prisma) {
  const config = getEmailConfig();
  if (!config.enabled && !deliver) return { enabled: false, sent: 0, failed: 0, cancelled: 0 };
  const scope = { template, payload: { path: ['channel'], equals: channel } };
  const sending = await db.emailLog.findMany({ where: { ...scope, status: 'sending' }, select: { id: true, payload: true }, take: 100 });
  for (const row of sending) {
    const claimed = Date.parse(String(object(row.payload).claimedAt || ''));
    if (!Number.isFinite(claimed) || claimed < now.getTime() - 600000) await db.emailLog.updateMany({ where: { id: row.id, status: 'sending' }, data: { status: 'review', errorMessage: 'Interrupted nightly email. Check delivery before resending.' } });
  }
  const window = nextDayPlanWindow(now);
  const rows = await db.emailLog.findMany({ where: { ...scope, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 100 });
  let sent = 0, failed = 0, cancelled = 0, processed = 0;
  const deadline = Date.now() + 30000;
  for (const row of rows) {
    if (processed >= 4 || Date.now() >= deadline) break;
    const payload = object(row.payload);
    if (!window || payload.day !== window.day) {
      if ((await db.emailLog.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'cancelled', errorMessage: 'Planning night has passed; do not send a stale daily plan.' } })).count) cancelled++;
      continue;
    }
    if (payload.nextAttemptAt && Date.parse(String(payload.nextAttemptAt)) > now.getTime()) continue;
    if (!(await db.emailLog.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'sending', payload: json({ ...payload, claimedAt: now.toISOString() }) } })).count) continue;
    processed++;
    let message;
    try { message = row.userId ? await buildNightlyPlan(row.userId, window, db) : null; }
    catch {
      // No SMTP call has happened, so a bounded reconstruction retry is safe.
      const retryCount = row.retryCount + 1;
      await db.emailLog.update({ where: { id: row.id }, data: { status: retryCount <= 5 ? 'pending' : 'review', retryCount, errorMessage: 'Could not collect the current agenda.', payload: json({ ...payload, nextAttemptAt: new Date(now.getTime() + 120000).toISOString() }) } }); failed++; continue;
    }
    if (!message || message.email.toLowerCase() !== row.toEmail.toLowerCase()) {
      await db.emailLog.update({ where: { id: row.id }, data: { status: 'cancelled', errorMessage: 'Active membership or recipient changed.' } }); cancelled++; continue;
    }
    try {
      await db.emailLog.update({ where: { id: row.id }, data: { subject: message.subject, payload: json({ ...payload, claimedAt: now.toISOString(), html: message.html, text: message.text }) } });
      const result = await (deliver ?? getEmailClient({ timeoutMs: 8000 })!.emails.send)({ from: config.from, to: row.toEmail, subject: message.subject, html: message.html, text: message.text, ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
      if (result.error || !result.data?.id) throw Error('SMTP acceptance was not confirmed.');
      await db.emailLog.update({ where: { id: row.id }, data: { status: 'sent', sentAt: now, providerMessageId: result.data.id, errorMessage: null } }); sent++;
    } catch (error) {
      const value = error as { code?: string; command?: string };
      const safe = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(value.code || '') || value.code === 'ETIMEDOUT' && value.command === 'CONN';
      const retryCount = row.retryCount + 1;
      await db.emailLog.update({ where: { id: row.id }, data: { status: safe && retryCount <= 5 ? 'pending' : 'review', retryCount, errorMessage: safe ? 'SMTP connection unavailable; retry later tonight.' : 'Delivery uncertain. Verify before resending.', payload: json({ ...payload, nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** retryCount) * 1000).toISOString() }) } }); failed++;
    }
  }
  return { enabled: true, sent, failed, cancelled };
}
