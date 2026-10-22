import type { Release } from './types';

export type AmendmentChange = { label: string; before: string; after: string };
export type AmendmentSummary = { id: number; status: string; submittedAt: string; updatedAt: string; changes: AmendmentChange[] };
export const activeAmendmentStatuses = ['submitted', 'under_review', 'information_required', 'approved', 'processing_manually', 'submitted_to_partner'];
export const amendmentStatusLabel = (status: string) => ({ cancelled: 'Amendment withdrawn', submitted: 'Amendment under review', under_review: 'Amendment under review', information_required: 'Amendment needs your attention', approved: 'Amendment approved', processing_manually: 'Amendment in manual review', submitted_to_partner: 'Amendment sent for delivery', completed: 'Amendment completed', rejected: 'Amendment not approved', failed: 'Amendment delivery needs attention' }[status] ?? 'Amendment update');
export const amendmentStatusCopy = (status: string) => ({ cancelled: 'This amendment was withdrawn at your request. Your live release remains unchanged, and you can submit a fresh amendment.', submitted: 'HYMN received your amendment. Your current release remains unchanged while we review the requested changes.', under_review: 'HYMN is reviewing your requested changes. You do not need to submit them again.', information_required: 'HYMN needs more information before this amendment can proceed. Read the response below.', approved: 'HYMN approved the requested changes. Approval does not yet confirm delivery to stores.', processing_manually: 'HYMN is reviewing this amendment manually. Read the recorded update for any checks that need attention.', submitted_to_partner: 'The approved amendment has been sent for delivery. Store updates are still being verified.', completed: 'HYMN confirmed completion of the amendment. See the recorded outcome and changes below.', rejected: 'HYMN did not approve this amendment. Your existing release remains unchanged.', failed: 'The amendment could not be completed. Open the request for the recorded outcome and next steps.' }[status] ?? 'Open the request for its latest recorded status.');
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const printable = (v: unknown): string => Array.isArray(v) ? v.map(item => typeof item === 'object' ? String(object(item).legalName || object(item).artistName || object(item).name || '') : String(item)).filter(Boolean).join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v ?? '').trim() || 'Not supplied';
const mediaKey = (v: unknown) => { const value = String(v ?? ''); try { const url = new URL(value, 'https://hymn.local'); const asset = url.pathname.match(/^\/api\/assets\/(\d+)\/download$/); return asset ? `asset:${asset[1]}` : value; } catch { return value; } };
export function summarizeAmendment(release: Release, input: unknown): AmendmentChange[] {
  const data = object(input), result: AmendmentChange[] = [];
  const add = (label: string, before: unknown, after: unknown) => { if (printable(before) !== printable(after)) result.push({ label, before: printable(before), after: printable(after) }); };
  const fields = [['Release title', 'releaseTitle', 'releaseTitle'], ['Artist', 'artistName', 'artistName'], ['Label', 'labelName', 'labelName'], ['Genre', 'primaryGenre', 'primaryGenre'], ['Subgenre', 'secondaryGenre', 'secondaryGenre'], ['Mood', 'mood', 'mood'], ['Language', 'language', 'language'], ['Territories', 'territory', 'territory'], ['Platforms', 'platforms', 'platforms'], ['Composition rights', 'copyrightOwner', 'copyrightOwner'], ['Recording rights', 'publishingRights', 'publishingRights'], ['Content type', 'contentType', 'contentType']] as const;
  for (const [label, before, after] of fields) if (data[after] !== undefined) add(label, release[before], data[after]);
  if (data.releaseTiming === 'schedule_release') add('Requested delivery date', release.releaseDate?.slice(0, 10), data.releaseDate);
  const artwork = data.uploadedArtworkUrl || data.existingArtworkUrl;
  if (artwork && mediaKey(artwork) !== mediaKey(release.artworkUrl)) result.push({ label: 'Cover artwork', before: 'Previous artwork', after: 'Replacement artwork supplied' });
  const tracks = Array.isArray(data.tracks) ? data.tracks.map(object) : [];
  tracks.forEach((track, index) => {
    const old = release.tracks?.find(item => item.trackNumber === track.trackNumber) ?? release.tracks?.[index];
    const prefix = `Track ${index + 1}`;
    for (const [label, field] of [['title', 'trackTitle'], ['primary artist', 'primaryArtist'], ['featured artists', 'featuredArtists'], ['songwriters', 'songwriters'], ['composers', 'composers'], ['producers', 'producers'], ['language', 'language'], ['lyrics', 'lyrics'], ['version', 'version'], ['explicit content', 'explicitContent']] as const) if (track[field] !== undefined) add(`${prefix}: ${label}`, old?.[field], track[field]);
    if (track.uploadedAudioUrl && mediaKey(track.uploadedAudioUrl) !== mediaKey(old?.audioUrl)) result.push({ label: `${prefix}: audio master`, before: 'Previous master reference', after: 'Original master restored or replacement supplied for review' });
    else if (track.existingAudioUrl && mediaKey(track.existingAudioUrl) !== mediaKey(old?.audioUrl)) result.push({ label: `${prefix}: audio master`, before: 'Previous master reference', after: 'Updated master reference supplied for review' });
  });
  return result;
}
export function amendmentChanges(value: unknown): AmendmentChange[] {
  const data = object(value);
  if (Array.isArray(data.summary)) return data.summary.filter((row): row is AmendmentChange => Boolean(row && typeof row === 'object' && typeof object(row).label === 'string' && typeof object(row).before === 'string' && typeof object(row).after === 'string'));
  return Object.entries(data).filter(([key, val]) => !['wizard_metadata', 'fingerprint', 'locked'].includes(key) && object(val).requested !== undefined).map(([key, val]) => ({ label: key === 'spotify_artist_url' ? 'Spotify artist profile' : key.replaceAll('_', ' '), before: printable(object(val).current), after: printable(object(val).requested) }));
}
