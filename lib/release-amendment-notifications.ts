import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { amendmentChanges, amendmentStatusCopy, amendmentStatusLabel, summarizeAmendment } from './release-amendment-presentation';
import { deserializeRelease } from './distribution-db';
import { customerBrandText } from './customer-message';
import { emailLayout, emailText } from './email/email-templates';
import { getPublicAppUrl } from './public-app-url';
import { amendmentSourceRevision } from './release-amendment-revision';

export const amendmentTransactionOptions = { timeout: 30000, maxWait: 10000 };

/** Durable notification + retryable email are written in the business transaction. */
export async function enqueueAmendmentUpdate(tx: Prisma.TransactionClient, requestId: number, eventId: number) {
  const request = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId }, include: { release: { include: { user: true, tracks: true } } } });
  if (request.requestType !== 'metadata_update' && request.requestType !== 'asset_update') return null;
  const event = await tx.releaseChangeRequestEvent.findFirstOrThrow({ where: { id: eventId, requestId } });
  const changes = request.requestedChanges && typeof request.requestedChanges === 'object' ? request.requestedChanges as Record<string, unknown> : {};
  let summary = amendmentChanges(changes);
  if (!summary.length && changes.wizard_metadata) summary = summarizeAmendment({ ...deserializeRelease(request.release), artworkUrl: request.release.artworkUrl || '' }, (changes.wizard_metadata as { requested?: unknown }).requested);
  const title = amendmentStatusLabel(event.newStatus), copy = amendmentStatusCopy(event.newStatus);
  const path = `/dashboard/releases/${request.releaseId}?tab=requests&request=${request.id}`;
  const eventKey = `amendment:${request.id}:event:${event.id}`;
  const user = request.release.user;
  if (request.requestedByUserId !== request.release.userId) return null;
  const sections = [
    { title: 'Release and request', body: `${request.release.title}\nAmendment #${request.id}\n${title}` },
    { title: 'Requested changes', body: summary.length ? summary.map(row => `${row.label}: ${row.before.slice(0, 400)} → ${row.after.slice(0, 400)}`).join('\n') : 'The submitted amendment details are available in your HYMN release workspace.' },
    { title: 'Recorded update', body: customerBrandText(event.note) },
    { title: 'What happens next', body: copy }
  ];
  const preserveNames = [request.release.artistName, request.release.title, ...summary.filter(row => /artist|songwriter|composer|producer|rights/i.test(row.label)).flatMap(row => [row.before, row.after])].filter(name => name && name !== 'Not supplied');
  const model = { preserveNames, title, greeting: `Hi ${user.name || 'there'},`, body: `HYMN recorded an update for “${request.release.title}”. ${copy}`, sections, notice: 'A request receipt or approval does not mean the changes are already live. Delivery and completion are confirmed separately in HYMN.', ctaLabel: 'View amendment details', ctaUrl: `${getPublicAppUrl()}${path}` };
  await tx.notification.upsert({ where: { eventKey: `${eventKey}:notification` }, create: { userId: request.requestedByUserId, title, body: customerBrandText(`${request.release.title}: ${copy}`), type: 'release_amendment', href: path, actionLabel: 'View amendment', priority: ['failed', 'information_required'].includes(event.newStatus) ? 'high' : 'normal', metadata: { releaseId: request.releaseId, requestId, status: event.newStatus }, eventKey: `${eventKey}:notification` }, update: {} });
  const log = await tx.emailLog.upsert({ where: { eventKey: `${eventKey}:email` }, create: { userId: request.requestedByUserId, toEmail: user.email, subject: `${title}: ${request.release.title}`, template: 'release_amendment_update', entityType: 'release', entityId: String(request.releaseId), provider: 'smtp', status: 'pending', eventKey: `${eventKey}:email`, payload: { channel: 'release_outbox', preserveNames, html: emailLayout(model), text: emailText(model), amendmentRequestId: request.id, amendmentEventId: event.id, amendmentStatus: event.newStatus, amendmentFingerprint: String(changes.fingerprint ?? ''), expectedStatus: request.release.status } }, update: {} });
  return log.id;
}

/** Heal missing acknowledgements for existing requests without duplicating delivery. */
export async function ensureAmendmentAcknowledgement(requestId: number) {
  return prisma.$transaction(async tx => {
    const identity = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId }, select: { releaseId: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${identity.releaseId}::integer)`;
    const request = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId }, include: { release: { include: { tracks: { include: { contributions: { include: { party: true }, orderBy: { sequence: 'asc' } } }, orderBy: { trackNumber: 'asc' } } } } } });
    const changes = request.requestedChanges && typeof request.requestedChanges === 'object' ? request.requestedChanges as Record<string, unknown> : {};
    if ((!Array.isArray(changes.summary) || !changes.sourceRevision) && changes.wizard_metadata && ['submitted', 'under_review', 'information_required', 'approved'].includes(request.status)) {
      const detailed = deserializeRelease(request.release);
      const summary = Array.isArray(changes.summary) ? changes.summary : summarizeAmendment({ ...detailed, artworkUrl: request.release.artworkUrl || '' }, (changes.wizard_metadata as { requested?: unknown }).requested);
      await tx.releaseChangeRequest.update({ where: { id: request.id }, data: { requestedChanges: JSON.parse(JSON.stringify({ ...changes, summary, sourceRevision: changes.sourceRevision || amendmentSourceRevision(detailed) })) } });
    }
    const event = await tx.releaseChangeRequestEvent.findFirst({ where: { requestId }, orderBy: { id: 'desc' } });
    return event ? enqueueAmendmentUpdate(tx, requestId, event.id) : null;
  }, amendmentTransactionOptions);
}

export async function repairRecentAmendmentAcknowledgements() {
  const missing = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT r.id FROM release_change_requests r
    JOIN LATERAL (SELECT e.id FROM release_change_request_events e WHERE e.request_id=r.id ORDER BY e.id DESC LIMIT 1) latest ON true
    LEFT JOIN email_logs mail ON mail.event_key=('amendment:' || r.id || ':event:' || latest.id || ':email')
    LEFT JOIN notifications notice ON notice.event_key=('amendment:' || r.id || ':event:' || latest.id || ':notification')
    WHERE r.request_type IN ('metadata_update','asset_update') AND r.updated_at >= ${new Date(Date.now() - 7 * 86400000)}
      AND (mail.id IS NULL OR notice.id IS NULL)
    ORDER BY r.updated_at ASC LIMIT 3`;
  for (const request of missing) await ensureAmendmentAcknowledgement(request.id);
  return missing.length;
}
