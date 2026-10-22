import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSession } from '@/lib/session';
import { requireCurrentPolicyAcceptance } from '@/lib/policy-agreement';
import { distributionEditSchema } from '@/lib/validation';
import { deserializeRelease, getDetailedReleaseById } from '@/lib/distribution-db';
import { amendmentSourceRevision, matchesAmendmentSourceRevision } from '@/lib/release-amendment-revision';
import { assertAmendmentIdentifiers } from '@/lib/release-amendment-identifiers';
import { assertDireNoteAssetFormat } from '@/lib/distribution-asset-format';
import { resolvePrivateReleaseArtworkUrl } from '@/lib/release-asset-resolution';
import { selectedReleaseArtistIds } from '@/lib/release-artist-verification';
import { prisma } from '@/lib/prisma';
import { enqueueAmendmentUpdate, amendmentTransactionOptions } from '@/lib/release-amendment-notifications';
import { summarizeAmendment } from '@/lib/release-amendment-presentation';

class ActiveAmendmentError extends Error {
  constructor(readonly releaseId: number, readonly request: { id: number; status: string }) { super('Your earlier amendment was received and is being reviewed. Open its details to track progress.'); }
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const policy = await requireCurrentPolicyAcceptance(user.sub); if (policy) return policy;
  try {
    const form = await request.formData();
    const { metadata } = distributionEditSchema.parse(JSON.parse(String(form.get('payload') || '{}')));
    const release = await getDetailedReleaseById(metadata.editReleaseId);
    if (!release || release.userId !== user.sub) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
    if (!['live', 'partially_live', 'scheduled', 'awaiting_live_confirmation', 'sent_to_distributor', 'distributor_processing'].includes(release.status)) throw Error('This release is not eligible for an amendment.');
    assertAmendmentIdentifiers(release, metadata);
    const ids = selectedReleaseArtistIds(metadata.tracks);
    if (!ids.length || await prisma.artistCard.count({ where: { id: { in: ids }, userId: user.sub, archivedAt: null } }) !== ids.length) throw Error('Use active artist cards from your account.');
    const artwork = await resolvePrivateReleaseArtworkUrl({ userId: user.sub, releaseId: release.id, value: metadata.uploadedArtworkUrl || metadata.existingArtworkUrl });
    if (!artwork) throw Error('Cover artwork is required.');
    await assertDireNoteAssetFormat({ userId: user.sub, url: artwork, kind: 'artwork', label: 'Cover artwork' });
    metadata.existingArtworkUrl = artwork;
    for (const track of metadata.tracks) {
      const audio = track.uploadedAudioUrl || track.existingAudioUrl;
      if (!audio) throw Error(`Restore the original master for ${track.trackTitle}.`);
      await assertDireNoteAssetFormat({ userId: user.sub, url: audio, kind: 'audio', label: track.trackTitle });
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
    const change = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${release.id}::integer)`;
      const current = await tx.release.findFirstOrThrow({ where: { id: release.id, userId: user.sub, archivedAt: null }, include: { tracks: { include: { contributions: { include: { party: true }, orderBy: { sequence: 'asc' } } }, orderBy: { trackNumber: 'asc' } } } });
      if (!['LIVE', 'PARTIALLY_LIVE', 'SCHEDULED', 'AWAITING_LIVE_CONFIRMATION', 'SENT_TO_DISTRIBUTOR', 'DISTRIBUTOR_PROCESSING'].includes(current.status)) throw Error('This release is no longer eligible for an amendment.');
      const existing = await tx.releaseChangeRequest.findFirst({ where: { releaseId: release.id, requestType: 'metadata_update', status: { in: ['submitted', 'under_review', 'information_required', 'approved', 'processing_manually', 'submitted_to_partner'] } } });
      const legacyRequest = existing && !(existing.requestedChanges as Record<string, unknown> | null)?.wizard_metadata && ['submitted', 'under_review', 'information_required', 'approved'].includes(existing.status);
      if (existing) {
        const changes = existing.requestedChanges as Record<string, unknown> | null;
        if (changes?.fingerprint === fingerprint) return existing;
        if (!legacyRequest) throw new ActiveAmendmentError(release.id, { id: existing.id, status: existing.status });
      }
      const revision = String(form.get('sourceRevision') || '');
      if (revision) {
        if (!matchesAmendmentSourceRevision(deserializeRelease(current), revision)) throw Error('Release metadata or assets changed while you were editing. Reload the amendment before submitting.');
      } else if (String(form.get('sourceUpdatedAt') || '') !== current.updatedAt.toISOString()) throw Error('Refresh the amendment editor once to load the updated version check.');
      assertAmendmentIdentifiers({ ...release, upcCode: current.upc ?? undefined, tracks: current.tracks.map(track => ({ ...release.tracks!.find(item => item.id === track.id)!, isrc: track.isrc ?? undefined })) }, metadata);
      const proposed = { wizard_metadata: { requested: metadata }, sourceRevision: amendmentSourceRevision(deserializeRelease(current)), summary: summarizeAmendment({ ...release, artworkUrl: current.artworkUrl || release.artworkUrl }, metadata), fingerprint, locked: { upc: current.upc, tracks: current.tracks.map(track => ({ id: track.id, trackNumber: track.trackNumber, isrc: track.isrc })) } };
      if (legacyRequest) {
        const item = await tx.releaseChangeRequest.update({ where: { id: existing.id }, data: { status: 'submitted', requestedChanges: JSON.parse(JSON.stringify(proposed)), reason: 'Release amendment resubmitted from the pre-filled distribution wizard.', reviewedAt: null, reviewedByAdminId: null, adminNote: null } });
        const event = await tx.releaseChangeRequestEvent.create({ data: { requestId: item.id, actorType: 'user', actorId: user.sub, previousStatus: existing.status, newStatus: 'submitted', note: 'The owner supplied a complete wizard amendment. Any earlier approval is invalidated; HYMN must review this version before delivery.' } });
        await enqueueAmendmentUpdate(tx, item.id, event.id);
        return item;
      }
      const item = await tx.releaseChangeRequest.create({ data: { releaseId: release.id, requestedByUserId: user.sub, requestType: 'metadata_update', reason: 'Release amendment submitted from the pre-filled distribution wizard.', requestedChanges: JSON.parse(JSON.stringify(proposed)) } });
      const event = await tx.releaseChangeRequestEvent.create({ data: { requestId: item.id, actorType: 'user', actorId: user.sub, newStatus: 'submitted', note: 'Amendment received for HYMN review. The existing live release and identifiers remain unchanged.' } });
      await enqueueAmendmentUpdate(tx, item.id, event.id);
      await tx.auditLog.create({ data: { actorId: user.sub, action: 'RELEASE_WIZARD_AMENDMENT_SUBMITTED', entity: 'release_change_request', entityId: String(item.id), metadata: { releaseId: release.id, fingerprint } } });
      return item;
    }, amendmentTransactionOptions);
    return NextResponse.json({ request: change, release }, { status: 201 });
  } catch (error) {
    if (error instanceof ActiveAmendmentError) return NextResponse.json({ error: error.message, code: 'AMENDMENT_ALREADY_ACTIVE', request: error.request, manageUrl: `/dashboard/releases/${error.releaseId}?tab=requests&request=${error.request.id}` }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Amendment could not be saved.' }, { status: 409 });
  }
}
