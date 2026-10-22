import 'server-only';
import { projectWizardAmendment } from './release-amendment-proposal';
import { applyCompletedWizardAmendment, restoreFailedWizardAmendment } from './release-amendment-fulfillment';
import { enqueueAmendmentUpdate, amendmentTransactionOptions } from './release-amendment-notifications';
import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { attachedArtistProfileIds, verifiedArtistStoreLinks } from './artist-store-links';
import { artistIdentityFingerprint, preserveArtistReleaseMappings } from './release-artist-verification';
import type { DireNotePayload } from './direnote';
import type { Release } from './types';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export async function loadArtistAmendment(release: Release, requestId: number) {
  const request = await prisma.releaseChangeRequest.findFirst({ where: { id: requestId, releaseId: release.id, requestType: 'metadata_update' } });
  if (!request || !['approved', 'submitted_to_partner'].includes(request.status)) throw Error('Approve the artist-profile amendment before sending it.');
  const changes = record(request.requestedChanges);
  const wizard = Boolean(changes.wizard_metadata);
  if (!wizard && (Object.keys(changes).length !== 1 || !changes.spotify_artist_url)) throw Error('Automatic amendment currently supports a Spotify artist-link correction only. Other changes retain the tracked manual review workflow.');
  const spotify = verifiedArtistStoreLinks({ spotify: record(changes.spotify_artist_url).requested }).spotify;
  if (!wizard && !spotify) throw Error('The amendment requires a valid Spotify artist profile URL.');
  const ids = [...new Set((release.tracks ?? []).flatMap(track => attachedArtistProfileIds(track, (release as Release & { artistProfileId?: number }).artistProfileId ?? null)))];
  if (!ids.length || (!wizard && ids.length !== 1)) throw Error('Select one explicitly associated primary artist card before using automatic profile amendment.');
  const card = await prisma.artistCard.findFirst({ where: { id: ids[0], userId: release.userId, archivedAt: null } });
  if (!card) throw Error('The amendment artist card is unavailable.');
  if (!release.upcCode || !release.tracks?.length || release.tracks.some(track => !track.isrc)) throw Error('Lock the existing release UPC and every track ISRC before amendment.');
  const previousAttempt = await prisma.distributionSubmissionAttempt.findFirst({ where: { releaseId: release.id, isCurrent: true }, select: { id: true, state: true, providerStatus: true } });
  return { request, card, spotifyUrl: spotify?.url ?? '', projectedRelease: request.status === 'submitted_to_partner' ? release : projectWizardAmendment(release, changes), wizard, previousAttempt, previousStatus: release.status };
}
export type ArtistAmendment = Awaited<ReturnType<typeof loadArtistAmendment>>;
export function artistAmendmentRevision(amendment: ArtistAmendment, release: Release) {
  return createHash('sha256').update(JSON.stringify({ request: amendment.request.id, reviewedRevision: amendment.request.updatedAt.toISOString(), card: artistIdentityFingerprint(amendment.card), release: release.id, upc: release.upcCode, status: release.status, releaseDate: release.releaseDate, originalReleaseDate: release.originalReleaseDate, metadata: release.metadata, artwork: release.artworkUrl, tracks: release.tracks?.map(track => ({ id: track.id, isrc: track.isrc, title: track.trackTitle, audio: track.audioUrl })) })).digest('hex');
}

/** Internal transport fields only; the customer-facing release flags are untouched. */
export function artistAmendmentPayload(base: DireNotePayload, amendment: Pick<ArtistAmendment, 'request' | 'card' | 'spotifyUrl'> & { wizard?: boolean }, originalDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(originalDate) || originalDate >= now.toISOString().slice(0, 10)) throw Error('A post-release amendment needs the actual original release date in the past.');
  const payload: DireNotePayload = structuredClone(base);
  const delivery = new Date(now); delivery.setUTCDate(delivery.getUTCDate() + 3);
  payload.trackReleaseDate = delivery.toISOString().slice(0, 10);
  payload.originalReleaseDate = originalDate;
  payload.releasePreviouslyReleased = 'Yes';
  delete payload.upc; // DNM documents that omission requests an assigned UPC.
  delete payload.presaveSpotify; delete payload.presaveApple; delete payload.exclusiveSpotify; delete payload.exclusiveApple;
  if (amendment.wizard) {
    payload.tracks = payload.tracks.map(track => ({ ...track, previouslyReleased: 'Yes' }));
    payload.addrequest = [base.addrequest, `HYMN release amendment #${amendment.request.id}. Previously delivered UPC ${base.upc ?? 'recorded in submission history'}. Retain the supplied ISRCs for existing recordings; return the actual assigned identifiers.`].filter(Boolean).join('\n');
    return payload;
  }
  const name = amendment.card.artistName.trim().toLowerCase();
  let matched = false;
  const update = (artist: DireNotePayload['artists'][number]) => {
    if (artist.name.trim().toLowerCase() !== name) return artist;
    matched = true; return { ...artist, spotify_url: amendment.spotifyUrl };
  };
  payload.artists = payload.artists.map(update);
  payload.featuring_artists = payload.featuring_artists?.map(update);
  payload.tracks = payload.tracks.map(track => ({ ...track, previouslyReleased: 'Yes', artists: track.artists?.map(update), featuring_artists: track.featuring_artists?.map(update) }));
  if (!matched || payload.tracks.some(track => !track.isrc)) throw Error('The approved artist mapping or existing recording identifiers are missing from the amendment payload.');
  payload.addrequest = [base.addrequest, `HYMN artist mapping amendment #${amendment.request.id}. Previously delivered UPC ${base.upc ?? 'recorded in submission history'}. Correct Spotify artist profile: ${amendment.spotifyUrl}. Existing recordings retain their supplied ISRCs. Do not treat this as a new recording.`].filter(Boolean).join('\n');
  return payload;
}

/** Called only after provider acceptance; never redirect a historical provider artist. */
export async function acceptArtistAmendment(amendment: ArtistAmendment, attemptId: number, reference: string) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422030, ${amendment.card.id}::integer)`;
    if (amendment.wizard) {
      await applyCompletedWizardAmendment(tx, amendment.request);
      await recordAcceptedWizardAmendment(tx, amendment, attemptId, reference);
      return;
    }
    const current = await tx.artistCard.findUniqueOrThrow({ where: { id: amendment.card.id } });
    if (artistIdentityFingerprint(current) !== artistIdentityFingerprint(amendment.card)) throw Error('The artist card changed after amendment approval. Reconcile the accepted submission before another delivery.');
    if (verifiedArtistStoreLinks({ spotify: current.spotifyProfileUrl }).spotify?.url !== amendment.spotifyUrl) {
      await preserveArtistReleaseMappings(tx, current);
      await tx.artistCard.update({ where: { id: current.id }, data: { spotifyProfileUrl: amendment.spotifyUrl, spotifyArtistId: verifiedArtistStoreLinks({ spotify: amendment.spotifyUrl }).spotify!.id ?? null, direNoteArtistId: null, direNoteLastSyncedAt: null, imageUrl: null, followers: null } });
    }
    const identity = await tx.releaseArtistIdentity.findUniqueOrThrow({ where: { releaseId_artistCardId: { releaseId: amendment.request.releaseId, artistCardId: current.id } } });
    await tx.releaseArtistIdentity.update({ where: { id: identity.id }, data: { spotifyUrl: amendment.spotifyUrl, providerArtistId: null, previousProviderArtistId: identity.providerArtistId, corrected: true, sourceFingerprint: artistIdentityFingerprint({ ...current, spotifyProfileUrl: amendment.spotifyUrl, spotifyArtistId: verifiedArtistStoreLinks({ spotify: amendment.spotifyUrl }).spotify!.id ?? null }) } });
    await tx.releaseChangeRequest.update({ where: { id: amendment.request.id }, data: { status: 'submitted_to_partner', providerReference: reference } });
    const metadata = { attemptId, artistCardId: current.id, artistName: current.artistName, spotifyUrl: amendment.spotifyUrl, payloadReference: `attempt:${attemptId}`, identifierPolicy: 'provider_assigned_upc_existing_recording_isrc', previousAttemptId: amendment.previousAttempt?.id ?? null, previousStatus: amendment.previousStatus, previousProviderStatus: amendment.previousAttempt?.providerStatus ?? null, previousMapping: { spotifyUrl: identity.spotifyUrl, providerArtistId: identity.providerArtistId, sourceFingerprint: identity.sourceFingerprint, previousProviderArtistId: identity.previousProviderArtistId, corrected: identity.corrected } };
    const event = await tx.releaseChangeRequestEvent.create({ data: { requestId: amendment.request.id, actorType: 'system', previousStatus: 'approved', newStatus: 'submitted_to_partner', note: 'HYMN accepted the approved amendment for delivery. Existing identifiers remain visible until the new identifier set is confirmed.', providerReference: reference, metadata } });
    await enqueueAmendmentUpdate(tx, amendment.request.id, event.id);
    await tx.auditLog.create({ data: { action: 'ARTIST_AMENDMENT_ACCEPTED', entity: 'release', entityId: String(amendment.request.releaseId), metadata: { requestId: amendment.request.id, ...metadata } } });
  }, amendmentTransactionOptions);
}

export async function executeArtistAmendment(requestId: number, actorId?: number | null) {
  const request = await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
  const before = await prisma.release.findUniqueOrThrow({ where: { id: request.releaseId } });
  const { submitRelease } = await import('./distribution-service');
  const result = await submitRelease(request.releaseId, { amendmentRequestId: requestId, actorId });
  if (!result.submitted && !('inProgress' in result && result.inProgress)) {
    const active = await prisma.distributionSubmissionAttempt.findFirst({ where: { releaseId: request.releaseId, isCurrent: true }, select: { state: true } });
    if (active?.state === 'submitted' && ['LIVE', 'PARTIALLY_LIVE'].includes(before.status)) {
      const { updateDetailedReleaseStatus } = await import('./distribution-db');
      await updateDetailedReleaseStatus(before.id, before.status.toLowerCase() as Release['status'], 'Amendment was not confirmed. The preceding live catalogue remains current.', undefined, { manualOverride: true, actorType: 'system', notify: false });
    }
  }
  return result;
}

/** A rejected amendment cannot replace the preceding live delivery. */
export async function failArtistAmendment(requestId: number, attemptId: number) {
  await prisma.$transaction(async tx => {
    const request = await tx.releaseChangeRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'submitted_to_partner') return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${request.releaseId}::integer)`;
    const event = await tx.releaseChangeRequestEvent.findFirst({ where: { requestId, metadata: { path: ['attemptId'], equals: attemptId } }, orderBy: { id: 'desc' } });
    const receipt = record(event?.metadata);
    const previousId = Number(receipt.previousAttemptId);
    if (!Number.isSafeInteger(previousId) || previousId < 1) return;
    const previous = await tx.distributionSubmissionAttempt.findFirst({ where: { id: previousId, releaseId: request.releaseId, state: 'submitted' } });
    const otherCurrent = await tx.distributionSubmissionAttempt.findFirst({ where: { releaseId: request.releaseId, isCurrent: true, id: { not: attemptId } } });
    if (!previous || otherCurrent) return;
    await tx.distributionSubmissionAttempt.update({ where: { id: previous.id }, data: { isCurrent: true, providerStatus: typeof receipt.previousProviderStatus === 'string' ? receipt.previousProviderStatus : 'live' } });
    if (receipt.wizard === true) await restoreFailedWizardAmendment(tx, request);
    const release = await tx.release.findUniqueOrThrow({ where: { id: request.releaseId } });
    const metadata = record(release.metadata), provider = record(metadata.direNote);
    const status = receipt.previousStatus === 'partially_live' ? 'PARTIALLY_LIVE' : 'LIVE';
    await tx.release.update({ where: { id: release.id }, data: { status, direNoteStatus: typeof receipt.previousProviderStatus === 'string' ? receipt.previousProviderStatus : 'live', direNoteSyncError: null, version: { increment: 1 }, metadata: { ...metadata, direNote: { ...provider, currentAttemptId: previous.id, identifierAssignmentPending: false, reconciliationInProgress: false } } as never } });
    const mapping = record(receipt.previousMapping);
    if (Number.isSafeInteger(Number(receipt.artistCardId)) && Object.keys(mapping).length) {
      await tx.releaseArtistIdentity.updateMany({ where: { releaseId: release.id, artistCardId: Number(receipt.artistCardId) }, data: { spotifyUrl: typeof mapping.spotifyUrl === 'string' ? mapping.spotifyUrl : null, providerArtistId: typeof mapping.providerArtistId === 'string' ? mapping.providerArtistId : null, sourceFingerprint: String(mapping.sourceFingerprint), previousProviderArtistId: typeof mapping.previousProviderArtistId === 'string' ? mapping.previousProviderArtistId : null, corrected: mapping.corrected === true } });
    }
    await tx.releaseChangeRequest.update({ where: { id: requestId }, data: { status: 'failed' } });
    const failureEvent = await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'system', previousStatus: request.status, newStatus: 'failed', note: 'The amendment did not finish. Your original live release and its identifiers remain current.', metadata: { failedAttemptId: attemptId, restoredAttemptId: previous.id } } });
    await enqueueAmendmentUpdate(tx, requestId, failureEvent.id);
    await tx.releaseStatusTransition.create({ data: { releaseId: release.id, previousStatus: release.status, newStatus: status, actorType: 'system', reason: 'Amendment failed; original live delivery retained.', metadata: { requestId, attemptId } } });
  }, amendmentTransactionOptions);
}

export async function completeArtistAmendment(releaseId: number, attemptId: number, reportTracks: unknown[]) {
  const attempt = await prisma.distributionSubmissionAttempt.findFirst({ where: { id: attemptId, releaseId, isCurrent: true, state: 'submitted' } });
  if (!attempt) return;
  const requestId = Number(record(attempt?.responseRedacted).amendmentRequestId);
  if (!Number.isSafeInteger(requestId) || requestId < 1) return;
  const request = await prisma.releaseChangeRequest.findFirst({ where: { id: requestId, releaseId, status: 'submitted_to_partner' } });
  if (!request) return;
  const event = await prisma.releaseChangeRequestEvent.findFirst({ where: { requestId, metadata: { path: ['attemptId'], equals: attemptId } }, orderBy: { id: 'desc' } });
  const receipt = record(event?.metadata);
  const expected = verifiedArtistStoreLinks({ spotify: receipt.spotifyUrl }).spotify;
  const matches = reportTracks.map(record).filter(track => String(record(track.artist).name ?? '').trim().toLowerCase() === String(receipt.artistName ?? '').trim().toLowerCase());
  if (receipt.wizard !== true && (!expected || !matches.length || matches.some(track => String(track.status ?? '').toLowerCase() !== 'live' || verifiedArtistStoreLinks(record(record(track.artist).links)).spotify?.id !== expected.id))) {
    const { flagArtistMappingReview } = await import('./direnote-artist-mapping');
    await flagArtistMappingReview({ releaseId, name: String(receipt.artistName ?? 'Amended artist'), message: 'The amended package is reported live, but the approved Spotify artist profile has not been confirmed in the provider report. Verify the actual store mapping before completing the amendment; do not repeat ingestion.' });
    return;
  }
  if (receipt.wizard === true && (reportTracks.length !== (Array.isArray(record(attempt.payloadRedacted).tracks) ? (record(attempt.payloadRedacted).tracks as unknown[]).length : 0) || !reportTracks.length || reportTracks.some(track => String(record(track).status ?? '').toLowerCase() !== 'live'))) return;
  await prisma.$transaction(async tx => {
    const changed = await tx.releaseChangeRequest.updateMany({ where: { id: requestId, status: 'submitted_to_partner' }, data: { status: 'completed', completedAt: new Date() } });
    if (changed.count) { const event = await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'system', previousStatus: 'submitted_to_partner', newStatus: 'completed', note: receipt.wizard === true ? 'HYMN verified that the amended delivery is live.' : 'HYMN verified that the amended delivery is live and its Spotify artist link matches the approved profile.', metadata: { verifiedAttemptId: attemptId, spotifyUrl: expected?.url ?? null } } }); await enqueueAmendmentUpdate(tx, requestId, event.id); }
  }, amendmentTransactionOptions);
}

async function recordAcceptedWizardAmendment(tx: import('@prisma/client').Prisma.TransactionClient, amendment: ArtistAmendment, attemptId: number, reference: string) {
  const metadata = { attemptId, wizard: true, previousAttemptId: amendment.previousAttempt?.id ?? null, previousStatus: amendment.previousStatus, previousProviderStatus: amendment.previousAttempt?.providerStatus ?? null };
  await tx.releaseChangeRequest.update({ where: { id: amendment.request.id }, data: { status: 'submitted_to_partner', providerReference: reference } });
  const event = await tx.releaseChangeRequestEvent.create({ data: { requestId: amendment.request.id, actorType: 'system', previousStatus: 'approved', newStatus: 'submitted_to_partner', note: 'HYMN validated and sent your amendment for delivery. Store availability and assigned identifiers are being monitored.', providerReference: reference, metadata } });
  await enqueueAmendmentUpdate(tx, amendment.request.id, event.id);
  await tx.auditLog.create({ data: { actorType: 'system', action: 'WIZARD_AMENDMENT_ACCEPTED', entity: 'release', entityId: String(amendment.request.releaseId), metadata: { requestId: amendment.request.id, ...metadata } } });
}
