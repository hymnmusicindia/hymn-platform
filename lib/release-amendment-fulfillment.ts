import 'server-only';
import { Prisma, type ReleaseChangeRequest } from '@prisma/client';
import { distributionEditSchema } from './validation';
import { deserializeRelease } from './distribution-db';
import { assertAmendmentIdentifiers } from './release-amendment-identifiers';
import { matchesAmendmentSourceRevision } from './release-amendment-revision';
import { syncReleaseContributions } from './release-contributor-sync';

const without = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/** Apply a reviewed wizard proposal only after recorded partner completion. */
export async function applyCompletedWizardAmendment(tx: Prisma.TransactionClient, request: ReleaseChangeRequest) {
  const changes = request.requestedChanges as Record<string, unknown> | null;
  const wizard = changes?.wizard_metadata as { requested?: unknown } | undefined;
  if (!wizard) return;
  const { metadata } = distributionEditSchema.parse({ metadata: wizard.requested });
  const current = await tx.release.findUniqueOrThrow({ where: { id: request.releaseId }, include: { tracks: { include: { contributions: { include: { party: true }, orderBy: { sequence: 'asc' } } }, orderBy: { trackNumber: 'asc' } } } });
  const detailed = deserializeRelease(current);
  assertAmendmentIdentifiers(detailed, metadata);
  if (typeof changes?.sourceRevision === 'string' && !matchesAmendmentSourceRevision(detailed, changes.sourceRevision)) throw Error('The original release content changed. Review the current release before recording completion.');
  const statusSnapshot = await tx.distributionSubmissionAttempt.findFirst({ where: { releaseId: current.id, isCurrent: true }, select: { id: true, rawStatusPayload: true, lastCheckedAt: true } });
  const previous = { title: current.title, artistName: current.artistName, genre: current.genre, artworkUrl: current.artworkUrl, audioUrl: current.audioUrl, metadata: current.metadata, statusSnapshot, tracks: current.tracks.map(track => ({ id: track.id, title: track.title, primaryArtist: track.primaryArtist, audioUrl: track.audioUrl, isrc: track.isrc, metadata: track.metadata })) };
  const oldMetadata = current.metadata && typeof current.metadata === 'object' ? current.metadata as Record<string, unknown> : {};
  const { tracks, legal } = metadata;
  const fields = without(metadata, ['tracks', 'editReleaseId', 'legal', 'artworkFileKey', 'uploadedArtworkUrl', 'existingArtworkUrl', 'upcCode']);
  const artworkUrl = metadata.uploadedArtworkUrl || metadata.existingArtworkUrl || current.artworkUrl;
  for (const proposed of tracks) {
    const track = current.tracks.find(item => item.trackNumber === proposed.trackNumber)!;
    const oldTrackMetadata = track.metadata && typeof track.metadata === 'object' ? track.metadata as Record<string, unknown> : {};
    const trackMetadata = without(proposed, ['audioFileKey', 'existingAudioUrl', 'uploadedAudioUrl', 'isrc']);
    await tx.track.update({ where: { id: track.id }, data: { title: proposed.trackTitle, primaryArtist: proposed.primaryArtist, audioUrl: proposed.uploadedAudioUrl || proposed.existingAudioUrl || track.audioUrl, metadata: JSON.parse(JSON.stringify({ ...oldTrackMetadata, ...trackMetadata })) } });
  }
  const updatedTracks = tracks.map(proposed => ({ trackId: current.tracks.find(item => item.trackNumber === proposed.trackNumber)!.id, contributions: proposed.contributors }));
  for (const track of updatedTracks) if (track.contributions) await syncReleaseContributions(tx, { actorUserId: request.requestedByUserId, tracks: [{ trackId: track.trackId, contributions: track.contributions }] });
  await tx.release.update({ where: { id: current.id }, data: { title: metadata.releaseTitle || tracks[0].trackTitle, artistName: metadata.artistName, genre: metadata.primaryGenre, artworkUrl, audioUrl: tracks[0].uploadedAudioUrl || tracks[0].existingAudioUrl || current.audioUrl, version: { increment: 1 }, metadata: JSON.parse(JSON.stringify({ ...oldMetadata, ...fields, artworkUrl, releaseDate: oldMetadata.releaseDate || current.releaseDate.toISOString().slice(0, 10), releasePreviouslyReleased: oldMetadata.releasePreviouslyReleased, upcCode: current.upc, ownershipConfirmed: legal.ownershipConfirmation, noUnauthorizedSamples: legal.noInfringement, collaboratorsCredited: legal.collaboratorsCredited, platformCompliant: legal.platformGuidelines, hymnNotLiable: legal.hymnNotLiable, agreedToTerms: legal.termsAccepted, falseMetadataAcknowledged: legal.falseMetadataAcknowledged, completedAmendmentId: request.id })) } });
  // A cached pre-amendment title must not block the next fresh status lookup.
  // The immutable submission payload and acknowledgement remain untouched.
  if (statusSnapshot) await tx.distributionSubmissionAttempt.update({ where: { id: statusSnapshot.id }, data: { rawStatusPayload: Prisma.DbNull, lastCheckedAt: null } });
  await tx.auditLog.create({ data: { actorType: 'system', action: 'RELEASE_AMENDMENT_APPLIED', entity: 'release', entityId: String(current.id), metadata: JSON.parse(JSON.stringify({ requestId: request.id, previous, retainedUpc: current.upc, retainedIsrcs: current.tracks.map(track => ({ id: track.id, isrc: track.isrc })) })) } });
}
