import 'server-only';
import { prisma } from './prisma';
import { hubNotice } from './artist-hub';
import { requestDireNoteV24 } from './direnote/v24-client';
import { confirmsDireNoteWithdrawal } from './direnote/v24-reconciliation';
import { getDireNoteReleaseInformation } from './direnote';
import { reserveDireNoteRequest } from './direnote-rate-limit';
import { createAdminTaskOnce } from './task-queue';
import { emailLayout, emailText } from './email/email-templates';
import { sendTransactionalEmail, retryTransactionalEmail } from './email/send-transactional-email';
import { getPublicAppUrl } from './public-app-url';
import { hubNoticeHref } from './artist-hub-policy';

/** Bounded worker on the existing authenticated ingestion cron; never repeats an uncertain withdrawal. */
export async function processArtistHubInterventions(limit = 1) {
  const due = await prisma.$queryRaw<Array<{ id: number }>>`SELECT p.id FROM artist_hub_participations p WHERE p.status = 'rejected' AND (p.intervention IN ('reconcile', 'prepared', 'review_required') OR (p.intervention = 'blocked_locally' AND EXISTS (SELECT 1 FROM distribution_submission_attempts a WHERE a.release_id = p.release_id AND a.state IN ('processing', 'submitted', 'reconciliation_required')))) ORDER BY p.updated_at ASC LIMIT ${Math.max(1, Math.min(limit, 10))}`;
  const rows = await prisma.artistHubParticipation.findMany({ where: { id: { in: due.map(row => row.id) } } });
  for (const row of rows) await prisma.$transaction(async tx => {
    const acquired = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${row.releaseId}::integer) AS locked`;
    if (!acquired[0]?.locked) return;
    const current = await tx.artistHubParticipation.findUniqueOrThrow({ where: { id: row.id } });
    if (current.status !== 'rejected') return;
    const release = await tx.release.findUniqueOrThrow({ where: { id: row.releaseId } });
    const attempt = await tx.distributionSubmissionAttempt.findFirst({ where: { releaseId: row.releaseId, isCurrent: true }, orderBy: { id: 'desc' } });
    let state = current.intervention === 'blocked_locally' ? 'reconcile' : current.intervention;
    const upc = attempt?.upc;
    if (state !== 'review_required' && upc) {
      await reserveDireNoteRequest('check_release_status', row.releaseId);
      const proof = await getDireNoteReleaseInformation(upc, { timeoutMs: 8000 });
      if (!proof.success) return;
      if (confirmsDireNoteWithdrawal({ upc }, proof.data || {})) state = 'withdrawn';
      else if (state === 'prepared') state = 'review_required';
      else {
        const body = proof.data as { release?: { upc_code?: string }; tracks?: Array<{ status?: string }> };
        const pending = body.release?.upc_code === upc && Array.isArray(body.tracks) && body.tracks.length > 0 && body.tracks.every(track => track.status?.toLowerCase() === 'pending');
        if (pending) {
          // Commit intention independently before I/O. A crash is reconciled, never resent.
          await prisma.artistHubParticipation.update({ where: { id: row.id }, data: { intervention: 'prepared' } });
          await prisma.auditLog.create({ data: { action: 'ARTIST_HUB_WITHDRAWAL_PREPARED', entity: 'release', entityId: String(row.releaseId), metadata: { participationId: row.id, upc, attemptId: attempt?.id } } });
          await reserveDireNoteRequest('withdraw_release', row.releaseId);
          await requestDireNoteV24('withdraw_release', { upc }, { timeoutMs: 8000 });
          await reserveDireNoteRequest('check_release_status', row.releaseId);
          const after = await getDireNoteReleaseInformation(upc, { timeoutMs: 8000 });
          state = after.success && confirmsDireNoteWithdrawal({ upc }, after.data || {}) ? 'withdrawn' : 'prepared';
        } else state = 'review_required';
      }
    } else if (!upc && attempt?.state === 'failed') state = 'blocked_locally';
    else if (!upc && attempt && ['processing', 'submitted'].includes(attempt.state)) state = 'reconcile';
    else if (!upc) state = 'review_required';
    await tx.artistHubParticipation.update({ where: { id: row.id }, data: { intervention: state } });
    if (state === 'withdrawn') {
      await hubNotice(tx, row.ownerUserId, `artist-hub:withdrawn:${row.id}`, 'Release withdrawal confirmed', `HYMN confirmed withdrawal of “${release.title}” after an artist declined participation. This withdrawn submission will not be automatically retried.`);
      await tx.auditLog.create({ data: { action: 'ARTIST_HUB_WITHDRAWAL_CONFIRMED', entity: 'release', entityId: String(row.releaseId), metadata: { participationId: row.id, upc } } });
    }
    if (state === 'review_required') await createAdminTaskOnce({ eventKey: `artist-hub:intervention:${row.id}`, type: 'Artist participation', priority: 'critical', title: 'Resolve declined artist participation', body: `Release #${row.releaseId}; participation #${row.id}. Do not repeat ingestion or assume removal. Check provider state, withdrawal eligibility and rights-resolution options. Reason: ${current.reason || 'Declined'}`, href: `/admin/releases/${row.releaseId}`, entityType: 'release', entityId: row.releaseId });
  }, { timeout: 45000 });
  return rows.length;
}

export async function processArtistHubMail(limit = 3) {
  const rows = await prisma.artistHubMail.findMany({ where: { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: new Date() }, attempts: { lt: 4 } }, orderBy: { id: 'asc' }, take: limit });
  for (const row of rows) {
    const claimed = await prisma.artistHubMail.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: 'sending', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 10 * 60000) } });
    if (!claimed.count) continue;
    const user = await prisma.user.findFirst({ where: { id: row.userId, status: 'ACTIVE' }, select: { email: true } });
    if (!user) { await prisma.artistHubMail.update({ where: { id: row.id }, data: { status: 'skipped' } }); continue; }
    const layout = { title: row.title, body: row.body, ctaLabel: 'Open HYMN', ctaUrl: `${getPublicAppUrl()}${hubNoticeHref(row.eventKey)}` };
    const original = await prisma.emailLog.findUnique({ where: { eventKey: `${row.eventKey}:email` } });
    if (original && original.status !== 'failed') {
      await prisma.artistHubMail.update({ where: { id: row.id }, data: { status: original.status === 'sent' ? 'sent' : original.status === 'skipped' ? 'skipped' : 'review_required' } });
      continue;
    }
    const result = original?.status === 'failed' ? await retryTransactionalEmail(original.id) : await sendTransactionalEmail({ to: user.email, userId: row.userId, subject: row.title, template: 'artist_hub', eventKey: `${row.eventKey}:email`, html: emailLayout(layout), text: emailText(layout), entityType: 'artist_hub_mail', entityId: row.id, timeoutMs: 5000 });
    await prisma.artistHubMail.update({ where: { id: row.id }, data: { status: result.status === 'sent' || result.status === 'duplicate_skipped' ? 'sent' : result.status === 'skipped' ? 'skipped' : 'retry', nextAttemptAt: new Date(Date.now() + 15 * 60000) } });
  }
  // A process crash after claiming does not resend uncertain mail automatically.
  await prisma.artistHubMail.updateMany({ where: { status: 'sending', nextAttemptAt: { lt: new Date() } }, data: { status: 'review_required' } });
  return rows.length;
}

export async function processArtistHubActivity() {
  const live = await prisma.$queryRaw<Array<{ id: number; title: string; userId: number }>>`SELECT DISTINCT r.id, r.title, people.user_id AS "userId" FROM artist_hub_participations p JOIN releases r ON r.id = p.release_id CROSS JOIN LATERAL (VALUES (p.owner_user_id), (p.recipient_user_id)) AS people(user_id) LEFT JOIN notifications n ON n.event_key = 'artist-hub:live:' || r.id || ':' || people.user_id WHERE r.status = 'LIVE' AND p.status <> 'rejected' AND n.id IS NULL ORDER BY r.id LIMIT 10`;
  for (const row of live) await prisma.$transaction(tx => hubNotice(tx, row.userId, `artist-hub:live:${row.id}:${row.userId}`, 'Your collaboration is live', `“${row.title}” is live. Open HYMN artist profiles to review participation and optionally propose equal or custom royalty shares. No share is assigned without agreement.`));
  const reminders = await prisma.$queryRaw<Array<{ id: number; recipientUserId: number; title: string }>>`SELECT p.id, p.recipient_user_id AS "recipientUserId", r.title FROM artist_hub_participations p JOIN releases r ON r.id = p.release_id LEFT JOIN notifications n ON n.event_key = 'artist-hub:reminder:' || p.id WHERE p.status = 'pending' AND p.created_at < NOW() - INTERVAL '3 days' AND n.id IS NULL AND r.archived_at IS NULL ORDER BY p.created_at LIMIT 3`;
  for (const row of reminders) await prisma.$transaction(tx => hubNotice(tx, row.recipientUserId, `artist-hub:reminder:${row.id}`, 'A collaboration is awaiting your response', `Review your participation on “${row.title}” in HYMN artist profiles. A pending request does not approve a royalty share.`));
  return live.length + reminders.length;
}
