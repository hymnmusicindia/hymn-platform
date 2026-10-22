import 'server-only';
import type { Release } from './types';
import { distributionEditSchema } from './validation';
import { assertAmendmentIdentifiers } from './release-amendment-identifiers';
import { matchesAmendmentSourceRevision } from './release-amendment-revision';

/** Build the proposed delivery without overwriting the currently delivered catalogue. */
export function projectWizardAmendment(release: Release, changes: Record<string, unknown>): Release {
  const wizard = changes.wizard_metadata as { requested?: unknown } | undefined;
  if (!wizard) return release;
  const { metadata } = distributionEditSchema.parse({ metadata: wizard.requested });
  assertAmendmentIdentifiers(release, metadata);
  if (typeof changes.sourceRevision !== 'string' || !matchesAmendmentSourceRevision(release, changes.sourceRevision)) throw Error('The release content changed. Review and resubmit the amendment before delivery.');
  const tracks = metadata.tracks.map(proposed => {
    const original = release.tracks!.find(track => track.trackNumber === proposed.trackNumber)!;
    return { ...original, ...proposed, id: original.id, isrc: original.isrc, audioUrl: proposed.uploadedAudioUrl || proposed.existingAudioUrl || original.audioUrl };
  });
  const legal = metadata.legal;
  return { ...release, ...metadata, id: release.id, userId: release.userId, status: release.status,
    releaseDate: release.releaseDate, originalReleaseDate: release.originalReleaseDate,
    upcCode: release.upcCode, releasePreviouslyReleased: release.releasePreviouslyReleased,
    releaseTitle: metadata.releaseTitle || tracks[0].trackTitle, trackName: metadata.releaseTitle || tracks[0].trackTitle,
    artworkUrl: metadata.uploadedArtworkUrl || metadata.existingArtworkUrl || release.artworkUrl,
    youtubeContentIdChannelUrl: metadata.youtubeContentIdChannelUrl ?? undefined,
    audioUrl: tracks[0].audioUrl, tracks,
    ownershipConfirmed: legal.ownershipConfirmation, noUnauthorizedSamples: legal.noInfringement,
    collaboratorsCredited: legal.collaboratorsCredited, platformCompliant: legal.platformGuidelines,
    hymnNotLiable: legal.hymnNotLiable, agreedToTerms: legal.termsAccepted, falseMetadataAcknowledged: legal.falseMetadataAcknowledged };
}
