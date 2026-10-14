// Scoped operator action requested by the owner. No DireNote calls or emails.
const assert = require('node:assert/strict');
require('dotenv').config({ path: '.env.hostinger', quiet: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const releaseId = 83;
const title = 'Ye Zindagi Na Milegi Tujhe Phir Kabhi';
const reason = 'Owner requested reopening the existing DireNote track-language correction for manual review and resubmission. Hindi vocals and a Hindi title transliterated into Latin letters use Hindi language metadata.';
(async () => {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${releaseId}::integer)`;
    const release = await tx.release.findUniqueOrThrow({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: 'asc' } }, distributionSubmissions: { where: { isCurrent: true } }, distributionQueueEntry: true } });
    assert.equal(release.title, title);
    assert.equal(release.tracks.length, 1);
    assert.equal(release.tracks[0].title, title);
    assert.ok(['UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(release.status), 'Unexpected release state; do not override');
    assert.ok(release.reviewIssues?.fields?.some(issue => /INCORRECT TRACK LANGUAGE/i.test(issue.note)), 'Existing provider correction required');
    assert.equal(release.direNoteStatus, 'changes_required');
    const snapshot = { id: release.id, title: release.title, previousStatus: release.status, trackId: release.tracks[0].id, trackLanguage: release.tracks[0].metadata?.language };
    if (!process.argv.includes('--apply') || release.status === 'CHANGES_REQUESTED') return { ...snapshot, status: release.status, changed: false };
    const now = new Date();
    const changed = await tx.release.updateMany({ where: { id: releaseId, version: release.version, status: 'UNDER_REVIEW' }, data: {
      status: 'CHANGES_REQUESTED', version: { increment: 1 }, correctionReason: release.correctionReason || 'Track 1: INCORRECT TRACK LANGUAGE',
      reviewIssues: { ...release.reviewIssues, severity: 'required_correction', fields: release.reviewIssues.fields.map(issue => /INCORRECT TRACK LANGUAGE/i.test(issue.note) ? { ...issue, field: 'tracks.0.trackLanguage' } : issue) },
    } });
    assert.equal(changed.count, 1, 'Concurrent release change');
    for (const attempt of release.distributionSubmissions) await tx.distributionSubmissionAttempt.update({ where: { id: attempt.id }, data: { corrections: { ...(attempt.corrections || {}), status: 'customer_action_required', manuallyReopenedAt: now.toISOString(), manuallyReopenedReason: reason } } });
    // Keep provider rejection/status evidence untouched; hold HYMN's queue for manual action.
    if (release.distributionQueueEntry) {
      await tx.distributionQueueEntry.update({ where: { id: release.distributionQueueEntry.id }, data: { currentStage: 'awaiting_approval', approvalNotes: reason } });
      await tx.distributionQueueLog.create({ data: { queueEntryId: release.distributionQueueEntry.id, stage: 'awaiting_approval', stageStartTime: now, notes: reason, metadata: { source: 'owner_requested_correction_reopen', trackId: release.tracks[0].id } } });
    }
    await tx.releaseStatusTransition.create({ data: { releaseId, previousStatus: release.status, newStatus: 'CHANGES_REQUESTED', actorType: 'system', reason, metadata: { manualOverride: true, source: 'owner_requested_correction_reopen' } } });
    await tx.auditLog.create({ data: { action: 'RELEASE_CORRECTION_REOPENED', entity: 'release', entityId: String(releaseId), metadata: { ...snapshot, newStatus: 'CHANGES_REQUESTED', reason } } });
    return { ...snapshot, status: 'CHANGES_REQUESTED', changed: true };
  }, { timeout: 30000, maxWait: 10000 });
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
