import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getUserSessionSecret } from './env';
import type { Release } from './types';

const releaseFields = ['trackName', 'releaseTitle', 'artistName', 'releaseType', 'releaseDate', 'originalReleaseDate', 'releaseTiming', 'artworkUrl', 'audioUrl', 'upcCode', 'labelName', 'labelDisplayName', 'primaryGenre', 'secondaryGenre', 'genre', 'language', 'mood', 'territory', 'platforms', 'copyrightOwner', 'publishingRights', 'contentType', 'releasePreviouslyReleased', 'sunoReceiptUrl', 'sunoLink', 'licenseReceiptUrl', 'licenseDocumentUrl', 'beatLicenseUrl', 'youtubeContentIdEnabled', 'youtubeContentIdChannelUrl', 'monetisationAccepted', 'monetisationClauses', 'ownershipConfirmed', 'noUnauthorizedSamples', 'collaboratorsCredited', 'platformCompliant', 'hymnNotLiable', 'agreedToTerms', 'falseMetadataAcknowledged'];
const trackFields = ['id', 'trackNumber', 'trackTitle', 'version', 'isrc', 'audioUrl', 'duration', 'primaryArtist', 'featuredArtists', 'additionalPrimaryArtists', 'artistProfileIds', 'featuredArtistProfileIds', 'remixerProfileIds', 'songwriters', 'composers', 'producers', 'contributors', 'isCover', 'originalArtist', 'originalTrackLink', 'coverLicenseConfirmed', 'coverLicenseUrl', 'language', 'lyrics', 'trackLyrics', 'explicitContent', 'dolbyAtmos', 'bpm', 'musicalKey'];
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value ?? null;
}
const pick = (value: unknown, fields: string[]) => Object.fromEntries(fields.map(key => [key, (value as Record<string, unknown>)[key] ?? null]));

/** Bind concurrency to editable release content, not provider polling timestamps. */
export function amendmentSourceRevision(release: Release) {
  const content = { userId: release.userId, releaseId: release.id, release: pick(release, releaseFields), tracks: [...(release.tracks ?? [])].sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0)).map(track => pick(track, trackFields)) };
  return createHmac('sha256', getUserSessionSecret()).update(JSON.stringify(stable(content))).digest('hex');
}
export function matchesAmendmentSourceRevision(release: Release, supplied: string) {
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(amendmentSourceRevision(release), 'hex'), Buffer.from(supplied, 'hex'));
}
