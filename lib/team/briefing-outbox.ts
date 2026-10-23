import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getEmailClient, getEmailConfig, type EmailAttachment } from '@/lib/email/email-client';

const channel = 'team_briefing';
const template = 'team_call_briefing';
const maximumBytes = 2 * 1024 * 1024;
const payloadSchema = z.object({
  channel: z.literal(channel), workspaceId: z.string().min(1), memberId: z.string().min(1), actorId: z.string().min(1),
  html: z.string().min(1).max(100000), text: z.string().min(1).max(50000),
  filename: z.string().regex(/^[a-zA-Z0-9_ .-]+\.pdf$/).max(160),
  pdfBase64: z.string().min(8).max(Math.ceil(maximumBytes / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  claimedAt: z.string().optional(), nextAttemptAt: z.string().optional()
});
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
type Delivery = (input: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string; attachments: EmailAttachment[] }) => Promise<{ data: { id?: string } | null; error: { message: string } | null }>;

export async function briefingAttachment(value: unknown): Promise<EmailAttachment> {
  const payload = payloadSchema.parse(value);
  const content = Buffer.from(payload.pdfBase64, 'base64');
  if (content.length > maximumBytes || content.toString('base64') !== payload.pdfBase64 || content.subarray(0, 5).toString() !== '%PDF-' || createHash('sha256').update(content).digest('hex') !== payload.sha256) throw Error('Briefing PDF is invalid or changed.');
  if (!(await PDFDocument.load(content)).getPageCount()) throw Error('Briefing PDF has no pages.');
  return { filename: payload.filename, content, contentType: 'application/pdf' };
}

/** Internal operation: an active workspace owner authorises a member-only briefing.
 * PDF bytes stay in the private outbox, never on a public download URL. */
export async function queueTeamBriefing(input: { workspaceId: string; actorId: string; memberId: string; taskId: string; eventKey: string; subject: string; html: string; text: string; filename: string; pdf: Buffer }, db = prisma) {
  const actor = await db.teamMember.findFirst({ where: { id: input.actorId, workspaceId: input.workspaceId, status: 'ACTIVE', role: { owner: true }, user: { status: 'ACTIVE' } } });
  const member = await db.teamMember.findFirst({ where: { id: input.memberId, workspaceId: input.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' } }, include: { user: { select: { id: true, email: true } } } });
  const task = await db.teamTask.findFirst({ where: { id: input.taskId, workspaceId: input.workspaceId, ownerId: input.memberId } });
  if (!actor || !member || !task || !z.string().email().safeParse(member.user.email).success) throw Error('An active owner, assigned member and matching task are required.');
  const subject = z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/).parse(input.subject);
  const eventKey = z.string().trim().min(10).max(250).parse(input.eventKey);
  const payload = payloadSchema.parse({ channel, workspaceId: input.workspaceId, memberId: input.memberId, actorId: input.actorId, html: input.html, text: input.text, filename: input.filename, pdfBase64: input.pdf.toString('base64'), sha256: createHash('sha256').update(input.pdf).digest('hex') });
  await briefingAttachment(payload);
  return db.$transaction(async tx => {
    const existing = await tx.emailLog.findUnique({ where: { eventKey } });
    if (existing) {
      const saved = payloadSchema.parse(existing.payload);
      if (existing.toEmail !== member.user.email || existing.entityId !== input.taskId || existing.subject !== subject || saved.sha256 !== payload.sha256 || saved.html !== payload.html || saved.text !== payload.text || saved.memberId !== input.memberId || saved.actorId !== input.actorId || saved.workspaceId !== input.workspaceId) throw Error('This send key belongs to a different briefing.');
      return existing;
    }
    const row = await tx.emailLog.create({ data: { userId: member.user.id, toEmail: member.user.email, subject, template, eventKey, entityType: 'team_task', entityId: task.id, provider: 'smtp', status: 'pending', payload: json(payload) } });
    await tx.teamAudit.create({ data: { workspaceId: input.workspaceId, actorId: input.actorId, action: 'member.briefing_queued', entityId: task.id, detail: { memberId: member.id, emailLogId: row.id, attachmentSha256: payload.sha256 } } });
    return row;
  });
}

export async function deliverTeamBriefings(logId?: number, deliver?: Delivery, db = prisma, now = new Date()) {
  const config = getEmailConfig();
  if (!config.enabled && !deliver) return { enabled: false, sent: 0, failed: 0, cancelled: 0 };
  const scope = { template, payload: { path: ['channel'], equals: channel } };
  const interrupted = await db.emailLog.findMany({ where: { ...scope, status: 'sending' }, select: { id: true, payload: true }, take: 100 });
  for (const row of interrupted) {
    const parsed = payloadSchema.safeParse(row.payload);
    const claimedAt = parsed.success ? Date.parse(parsed.data.claimedAt || '') : NaN;
    if (!Number.isFinite(claimedAt) || claimedAt < now.getTime() - 10 * 60000) await db.emailLog.updateMany({ where: { id: row.id, status: 'sending' }, data: { status: 'review', errorMessage: 'Interrupted briefing delivery. Verify SMTP outcome before resending.' } });
  }
  const jobs = await db.emailLog.findMany({ where: { ...scope, status: 'pending', ...(logId ? { id: logId } : {}) }, orderBy: { createdAt: 'asc' }, take: 5 });
  let sent = 0, failed = 0, cancelled = 0;
  const deadline = Date.now() + 40000;
  for (const job of jobs) {
    if (Date.now() + 11000 > deadline) break;
    const parsed = payloadSchema.safeParse(job.payload);
    if (!parsed.success) { await db.emailLog.updateMany({ where: { id: job.id, status: 'pending' }, data: { status: 'cancelled', errorMessage: 'Briefing data is invalid.' } }); cancelled++; continue; }
    const payload = parsed.data;
    if (payload.nextAttemptAt && Date.parse(payload.nextAttemptAt) > now.getTime()) continue;
    if (!(await db.emailLog.updateMany({ where: { id: job.id, status: 'pending' }, data: { status: 'sending', payload: json({ ...payload, claimedAt: now.toISOString() }) } })).count) continue;
    let attachment: EmailAttachment;
    try {
      const member = await db.teamMember.findFirst({ where: { id: payload.memberId, workspaceId: payload.workspaceId, userId: job.userId ?? -1, status: 'ACTIVE', user: { status: 'ACTIVE', email: { equals: job.toEmail, mode: 'insensitive' } } } });
      const actor = await db.teamMember.findFirst({ where: { id: payload.actorId, workspaceId: payload.workspaceId, status: 'ACTIVE', role: { owner: true }, user: { status: 'ACTIVE' } } });
      const task = await db.teamTask.findFirst({ where: { id: job.entityId || '', workspaceId: payload.workspaceId, ownerId: payload.memberId } });
      if (!member || !actor || !task || job.entityType !== 'team_task') throw Error('Briefing membership, authorisation or task changed.');
      attachment = await briefingAttachment(payload);
    } catch {
      await db.emailLog.update({ where: { id: job.id }, data: { status: 'cancelled', errorMessage: 'Briefing recipient, authorisation, task or PDF no longer valid.' } }); cancelled++; continue;
    }
    try {
      const result = await (deliver ?? getEmailClient({ timeoutMs: 10000 })!.emails.send)({ from: config.from, to: job.toEmail, subject: job.subject, html: payload.html, text: payload.text, replyTo: config.replyTo, attachments: [attachment] });
      if (result.error || !result.data?.id) throw Error('SMTP acceptance was not confirmed.');
      await db.emailLog.update({ where: { id: job.id }, data: { status: 'sent', sentAt: new Date(), providerMessageId: result.data.id, errorMessage: null } });
      sent++;
    } catch (error) {
      const e = error as { code?: string; command?: string };
      const safe = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(e.code || '') || e.code === 'ETIMEDOUT' && e.command === 'CONN';
      const retryCount = job.retryCount + 1;
      await db.emailLog.update({ where: { id: job.id }, data: { status: safe && retryCount <= 5 ? 'pending' : 'review', retryCount, errorMessage: safe ? 'SMTP connection unavailable; bounded retry scheduled.' : 'Briefing delivery outcome uncertain. Verify before resending.', payload: json({ ...payload, nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** retryCount) * 1000).toISOString() }) } }); failed++;
    }
  }
  return { enabled: true, sent, failed, cancelled };
}
