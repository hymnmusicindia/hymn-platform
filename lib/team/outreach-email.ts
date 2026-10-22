import 'server-only';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserSessionSecret } from '@/lib/env';
import { getPublicAppUrl } from '@/lib/public-app-url';
import { getEmailConfig } from '@/lib/email/email-client';
import { sendTransactionalEmail } from '@/lib/email/send-transactional-email';
import { can, TeamError, type Actor } from './policy';
import { personalTeamMessage, teamEmailTemplates, teamSenderRole } from './outreach-content';
import { customerBrandText } from '@/lib/customer-message';

async function eligibleContact(tx: Prisma.TransactionClient, workspaceId: string, clientId: string, recipient?: string) {
  const client = await tx.teamClient.findFirst({ where: { id: clientId, workspaceId, status: 'ACTIVE' }, include: { prospect: true, user: { select: { status: true } } } });
  if (!client || !z.string().email().safeParse(client.email).success || recipient && recipient !== client.email.toLowerCase() || client.user && client.user.status !== 'ACTIVE' || client.prospect && (client.prospect.suppressed || !client.prospect.verified || !['CONSENTED', 'LEGITIMATE_INTEREST'].includes(client.prospect.contactEligibility))) throw new TeamError('Choose an active, eligible contact with a usable email. Research contacts must be verified before outreach.', 403);
  const email = client.email.toLowerCase();
  if (await tx.teamOutreachSuppression.findUnique({ where: { email } }) || await tx.newsletterSubscriber.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, OR: [{ unsubscribedAt: { not: null } }, { status: { not: 'subscribed' } }] } })) throw new TeamError('This contact has opted out of email outreach.', 403);
  return client;
}
export async function outreachRead(a: Actor, resource: string, params: URLSearchParams) {
  // teamActor verifies active membership. Shared contact access includes all team roles.
  if (resource === 'team-email-options') {
    const member = await prisma.teamMember.findUniqueOrThrow({ where: { id: a.id }, include: { role: true, user: { select: { name: true } } } });
    const q = (params.get('q') || '').slice(0, 160);
    const clientId = params.get('clientId');
    const clients = await prisma.teamClient.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', email: { not: '' }, ...(clientId && !q ? { id: clientId } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 50 });
    return { clients, templates: teamEmailTemplates, sender: { name: member.user.name, role: teamSenderRole(member) }, configured: getEmailConfig().enabled, canReview: a.role.owner || can(a, 'crm.all') };
  }
  if (resource === 'team-email-history') return { items: await prisma.teamOutreachEmail.findMany({ where: { workspaceId: a.workspaceId, ...(!can(a, 'crm.all') ? { memberId: a.id } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 }) };
  throw new TeamError('Unknown email resource.', 404);
}
export async function outreachMutation(tx: Prisma.TransactionClient, a: Actor, resource: string, input: unknown) {
  if (resource === 'team-email-retry') {
    if (!a.role.owner && !can(a, 'crm.all')) throw new TeamError('An authorised outreach manager must review uncertain delivery.', 403);
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(10).max(1000), confirmedNotSent: z.literal(true) }).parse(input);
    const row = await tx.teamOutreachEmail.findFirst({ where: { id: data.id, workspaceId: a.workspaceId, status: 'REVIEW' } });
    if (!row) throw new TeamError('Email is not awaiting review.', 409);
    const key = `team-outreach:${row.id}${row.attempt ? `:retry:${row.attempt}` : ''}`;
    if (await tx.emailLog.findFirst({ where: { eventKey: key, status: 'sent' } })) throw new TeamError('The provider already accepted this email; do not retry.', 409);
    await eligibleContact(tx, a.workspaceId, row.clientId, row.recipient);
    const updated = await tx.teamOutreachEmail.update({ where: { id: row.id }, data: { status: 'QUEUED', error: null, attempt: { increment: 1 } } });
    await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'email.retry_reviewed', entityId: row.id, detail: { reason: data.reason, attempt: updated.attempt, confirmedNotSent: true } } });
    return updated;
  }
  if (resource !== 'team-email-send') throw new TeamError('Unknown email action.', 404);
  const data = z.object({ clientId: z.string().min(1).max(100), requestKey: z.string().uuid(), template: z.string().max(80), subject: z.string().trim().min(3).max(200).regex(/^[^\r\n]+$/), body: z.string().trim().min(10).max(8000), reviewed: z.literal(true) }).parse(input);
  if (!teamEmailTemplates.some(template => template.id === data.template) || /\[Add the actual|{{|}}/.test(data.body)) throw new TeamError('Review a complete message using an available template.');
  const requestKey = `${a.workspaceId}:${a.id}:${data.requestKey}`;
  const prior = await tx.teamOutreachEmail.findUnique({ where: { requestKey } });
  if (prior) { if (prior.clientId !== data.clientId || prior.subject !== data.subject || prior.body !== data.body || prior.template !== data.template) throw new TeamError('This send key belongs to a different message. Start a new message.', 409); return prior; }
  const client = await eligibleContact(tx, a.workspaceId, data.clientId);
  if (await tx.teamOutreachEmail.count({ where: { memberId: a.id, createdAt: { gte: new Date(Date.now() - 3600000) } } }) >= 5) throw new TeamError('You can send up to five individual emails per hour.', 429);
  if (await tx.teamOutreachEmail.findFirst({ where: { recipient: client.email.toLowerCase(), status: { in: ['QUEUED', 'SENDING', 'SENT', 'REVIEW'] }, createdAt: { gte: new Date(Date.now() - 3 * 86400000) } } })) throw new TeamError('A teammate already queued or sent outreach to this contact in the last three days. Review the contact history first.', 429);
  const member = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id }, include: { role: true, user: { select: { name: true } } } });
  const row = await tx.teamOutreachEmail.create({ data: { workspaceId: a.workspaceId, memberId: a.id, clientId: client.id, requestKey, template: data.template, subject: data.subject, body: data.body, recipient: client.email.toLowerCase(), senderName: member.user.name, senderRole: teamSenderRole(member) } });
  await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'email.individual_queued', entityId: row.id, detail: { clientId: client.id, recipient: row.recipient, senderName: row.senderName, senderRole: row.senderRole } } });
  return row;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export async function processTeamOutreachEmail(id?: string, limit = 10, deliver = sendTransactionalEmail) {
  await prisma.teamOutreachEmail.updateMany({ where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 5 * 60000) } }, data: { status: 'REVIEW', error: 'Delivery was interrupted. Inspect the email log before retrying; do not send a duplicate.' } });
  const jobs = await prisma.teamOutreachEmail.findMany({ where: { status: 'QUEUED', ...(id ? { id } : {}) }, orderBy: { createdAt: 'asc' }, take: Math.min(limit, 20) });
  const results = [];
  const deadline = Date.now() + 40000;
  for (const job of jobs) {
    if (Date.now() + 11000 > deadline) break;
    if (deliver === sendTransactionalEmail && !getEmailConfig().enabled) { await prisma.teamOutreachEmail.updateMany({ where: { id: job.id, status: 'QUEUED' }, data: { error: 'Email sender is not configured. The message remains queued.' } }); results.push({ id: job.id, status: 'QUEUED', error: 'Email sender is not configured.' }); continue; }
    if (!(await prisma.teamOutreachEmail.updateMany({ where: { id: job.id, status: 'QUEUED' }, data: { status: 'SENDING', error: null } })).count) continue;
    try {
      const member = await prisma.teamMember.findFirst({ where: { id: job.memberId, workspaceId: job.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' } } });
      if (!member) throw new TeamError('Sender is no longer an active team member.');
      const client = await eligibleContact(prisma, job.workspaceId, job.clientId, job.recipient);
      const token = jwt.sign({ purpose: 'team_outreach_unsubscribe', email: job.recipient }, getUserSessionSecret(), { expiresIn: '365d' });
      const unsubscribe = `${getPublicAppUrl()}/api/team-outreach/unsubscribe?token=${encodeURIComponent(token)}`;
      const text = customerBrandText(personalTeamMessage({ recipientName: client.name, senderName: job.senderName, senderRole: job.senderRole, body: job.body }));
      const html = `<div style="background:#11161c;padding:28px;font-family:Arial,sans-serif;color:#eef2f8;max-width:620px"><div style="font-weight:700;letter-spacing:3px;margin-bottom:28px">HYMN</div><p style="font-size:12px;color:#b9c2cf">${escape(job.senderName)} &middot; ${escape(job.senderRole)}</p><div style="white-space:pre-wrap;line-height:1.8;font-size:14px">${escape(text)}</div><p style="margin-top:30px;font-size:11px;color:#b9c2cf">You can reply to this email, or <a style="color:#b9c2cf" href="${escape(unsubscribe)}">stop HYMN team outreach emails</a>.</p></div>`;
      const eventKey = `team-outreach:${job.id}${job.attempt ? `:retry:${job.attempt}` : ""}`;
      const result = await deliver({ to: job.recipient, subject: customerBrandText(job.subject), template: 'team_outreach', html, text: `${text}\n\nStop HYMN team outreach emails: ${unsubscribe}`, eventKey, entityType: 'team_outreach', entityId: job.id, senderName: `${job.senderName} | HYMN`, timeoutMs: 10000 });
      const sent = result.status === 'sent' || result.status === 'duplicate_skipped' && (await prisma.emailLog.findUnique({ where: { eventKey } }))?.status === 'sent';
      await prisma.teamOutreachEmail.update({ where: { id: job.id }, data: { status: sent ? 'SENT' : 'REVIEW', error: sent ? null : result.error || 'Check email delivery logs before retrying.' } });
      results.push({ id: job.id, status: sent ? 'SENT' : 'REVIEW' });
    } catch (error) { await prisma.teamOutreachEmail.update({ where: { id: job.id }, data: { status: error instanceof TeamError ? 'CANCELLED' : 'REVIEW', error: error instanceof Error ? error.message : 'Email is no longer eligible.' } }); }
  }
  return results;
}
