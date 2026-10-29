import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { can, demand, TeamError, type Actor } from './policy';
import { recordCallbackOutcome } from './customer-followups';

const action = 'contact.call_report';
type ReportDetail = { occurredAt: string; discussion: string; authorName: string; outcome: string; source: string; needs: string; commitments: string; nextAction: string; nextAt?: string; amendsReportId?: string };
const schema = z.object({
  clientId: z.string().min(1), requestKey: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.enum(['PERSONAL_PHONE', 'BUSINESS_PHONE', 'OTHER']),
  outcome: z.enum(['TALKED', 'NO_ANSWER', 'CALLBACK', 'INTERESTED', 'RESOLVED', 'NOT_INTERESTED', 'DO_NOT_CONTACT']),
  discussion: z.string().trim().min(10).max(2000),
  needs: z.string().trim().max(2000).default(''),
  commitments: z.string().trim().max(2000).default(''),
  nextAction: z.string().trim().max(2000).default(''),
  nextAt: z.string().datetime({ offset: true }).optional(),
  taskId: z.string().min(1).optional(), taskVersion: z.number().int().positive().optional(),
  amendsReportId: z.string().min(1).optional(),
});

async function family(db: Pick<Prisma.TransactionClient, 'teamClient'>, a: Actor, id: string) {
  const contact = await db.teamClient.findFirst({ where: { id, workspaceId: a.workspaceId }, select: { id: true, name: true, phone: true, email: true, mergedIntoId: true } });
  if (!contact) throw new TeamError('Contact not found.', 404);
  if (contact.mergedIntoId) throw new TeamError('This contact was merged. Open the retained contact card.', 409);
  const sources = await db.teamClient.findMany({ where: { workspaceId: a.workspaceId, mergedIntoId: id }, select: { id: true } });
  return { contact, ids: [id, ...sources.map(row => row.id)] };
}

export async function readCallReports(a: Actor, params: URLSearchParams) {
  demand(a, 'clients.view');
  const { contact, ids } = await family(prisma, a, params.get('clientId') || '');
  const offset = Math.max(0, Math.min(100000, Number(params.get('offset')) || 0));
  const where = { workspaceId: a.workspaceId, action, entityId: { in: ids } };
  const [items, total] = await Promise.all([
    prisma.teamAudit.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: Math.floor(offset), take: 30 }),
    prisma.teamAudit.count({ where }),
  ]);
  return { contact, items: items.map(row => ({ id: row.id, createdAt: row.createdAt, ...row.detail as ReportDetail })), total, canWrite: can(a, 'crm.outreach.manage') };
}

// Append-only shared reports live alongside the contact audit trail. Private contact
// notes and task comments are deliberately not exposed through this shared reader.
export async function saveCallReport(tx: Prisma.TransactionClient, a: Actor, input: unknown, now = new Date()) {
  demand(a, 'clients.view'); demand(a, 'crm.outreach.manage');
  const data = schema.parse(input);
  const id = 'call-report:' + createHash('sha256').update(`${a.workspaceId}:${a.id}:${data.requestKey}`).digest('hex');
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const existing = await tx.teamAudit.findUnique({ where: { id } });
  if (existing) {
    if ((existing.detail as { fingerprint?: string }).fingerprint !== fingerprint) throw new TeamError('This save request changed. Start a new report.', 409);
    return { id: existing.id };
  }
  const { ids } = await family(tx, a, data.clientId);
  const occurredAt = new Date(data.occurredAt);
  if (occurredAt.getTime() > now.getTime() + 300000 || occurredAt.getUTCFullYear() < 2000) throw new TeamError('Enter the actual past call date and time.');
  if (data.nextAt && new Date(data.nextAt) <= now) throw new TeamError('Choose a future follow-up time.');
  if (data.outcome === 'CALLBACK' && !data.nextAt) throw new TeamError('Enter the requested callback time.');
  if (data.amendsReportId && !await tx.teamAudit.findFirst({ where: { id: data.amendsReportId, workspaceId: a.workspaceId, action, entityId: { in: ids } } })) throw new TeamError('Original report not found.', 404);
  if (data.taskId) {
    const task = await tx.teamTask.findFirst({ where: { id: data.taskId, workspaceId: a.workspaceId, clientId: { in: ids } } });
    if (!task) throw new TeamError('This callback does not belong to the contact.', 404);
    await recordCallbackOutcome(tx, a, { id: task.id, version: data.taskVersion, outcome: data.outcome, notes: data.discussion, nextAt: data.nextAt }, now, { queueEmail: false });
  } else if (data.outcome === 'DO_NOT_CONTACT') {
    throw new TeamError('Use the assigned callback to record a do-not-contact request so all outreach is stopped.');
  }
  const member = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id }, select: { user: { select: { name: true } } } });
  await tx.teamAudit.create({ data: { id, workspaceId: a.workspaceId, actorId: a.id, action, entityId: data.clientId, detail: { ...data, fingerprint, authorName: member.user.name || 'Team member' } } });
  return { id };
}
