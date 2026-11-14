import { DISTRIBUTION_CHANNELS } from './distribution-capabilities';

export function correctionSocialRestricted(release: { status?: string | null }) {
  return ['rejected', 'changes_requested', 'resubmitted'].includes(String(release.status).toLowerCase());
}
export function assertCorrectionSocialSelection(release: { status?: string | null }, metadata: { platforms?: string[]; youtubeContentIdEnabled?: boolean }) {
  if (correctionSocialRestricted(release) && (metadata.youtubeContentIdEnabled || metadata.platforms?.some(name => name === 'YouTube Content ID' || DISTRIBUTION_CHANNELS[name as keyof typeof DISTRIBUTION_CHANNELS]?.kind === 'ugc'))) {
    throw Error('Disputed recordings cannot be submitted to social platforms or fingerprinting during corrections. Remove these destinations; contact HYMN support about a post-release appeal.');
  }
}

export function metaAppealUsed(requests: { requestedChanges?: unknown }[], trackId: number) {
  return requests.some(request => {
    const data = request.requestedChanges as { supportCorrection?: { action?: string; trackId?: number } } | null;
    return data?.supportCorrection?.action === 'request_meta_not_live' && data.supportCorrection.trackId === trackId;
  });
}
