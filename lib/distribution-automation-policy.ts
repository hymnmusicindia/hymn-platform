import { createHash } from 'node:crypto';
import type { Release } from './types';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function automaticQcRevision(release: Release) {
  const keys = ['releaseTitle','trackName','artistName','releaseType','primaryGenre','secondaryGenre','language','mood','artworkUrl','releaseDate','originalReleaseDate','releaseTiming','copyrightOwner','publishingRights','contentType','platforms','territory','upcCode','ownershipConfirmed','noUnauthorizedSamples','collaboratorsCredited','platformCompliant','hymnNotLiable','agreedToTerms','falseMetadataAcknowledged','youtubeContentIdEnabled','monetisationAccepted','licenseDocumentUrl','licenseReceiptUrl','beatLicenseUrl','sunoReceiptUrl','sunoLink'] as const;
  const metadata = object(release.metadata);
  return createHash('sha256').update(canonical({ id:release.id,userId:release.userId,recordVersion:release.recordVersion,sensitive:automationSensitiveSnapshot(release),fields: Object.fromEntries(keys.map(key=>[key,release[key as keyof Release]])), reviewIssues:release.reviewIssues, holds:['copyrightClaim','copyrightClaimed','fraudFlag','manualQcHold','explicitContentMismatch'].map(key=>metadata[key]), artists: metadata.artistProfileIds, artistProfileId: metadata.artistProfileId, correctionKey: metadata.correctionSubmissionKey, tracks: release.tracks?.map(track=>({title:track.trackTitle,number:track.trackNumber,artist:track.primaryArtist,audio:track.audioUrl,isrc:track.isrc,language:track.language,explicit:track.explicitContent,cover:track.isCover,license:track.coverLicenseUrl,contributors:track.contributors,featured:track.featuredArtists,dolbyAtmos:track.dolbyAtmos,lyrics:track.lyrics,metadata:track.metadata})) })).digest('hex');
}

export function automationSensitiveSnapshot(release: Release) {
  return createHash('sha256').update(canonical({artist:release.artistName,ownership:release.contentType,copyrightOwner:release.copyrightOwner,publishingRights:release.publishingRights,artists:release.metadata?.artistProfileIds,artistProfileId:release.metadata?.artistProfileId,artistLinks:release.artistLinks,tracks:release.tracks?.map(track=>({artist:track.primaryArtist,featured:track.featuredArtists,contributors:track.contributors,explicit:track.explicitContent,cover:track.isCover,profiles:track.artistProfileIds,featuredProfiles:track.featuredArtistProfileIds,remixerProfiles:track.remixerProfileIds,additionalPrimaryArtists:track.additionalPrimaryArtists,songwriters:track.songwriters,composers:track.composers,producers:track.producers}))})).digest('hex');
}

export function distributionAutomationDecision(release: Release, context: { accepted: boolean; uncertainAttempt: boolean; correctionResolved: boolean; openAmendment: boolean; retryable?: boolean; fraudHold?: boolean }) {
  const hold = (reason: string, route = 'manual_review') => ({ eligible: false, route, reason });
  if (['draft','awaiting_payment'].includes(release.status)) return hold('The customer has not submitted this package.', 'draft');
  if (release.paymentStatus !== 'paid') return hold('Payment or entitlement has not been verified.', 'payment');
  if (![release.ownershipConfirmed,release.noUnauthorizedSamples,release.collaboratorsCredited,release.platformCompliant,release.hymnNotLiable,release.agreedToTerms,release.falseMetadataAcknowledged].every(value=>value===true)) return hold('The submitted package is missing required customer declarations.');
  if (context.fraudHold)return hold('An unresolved high-risk fraud alert requires review before automatic delivery.');
  if (context.uncertainAttempt) return hold('An earlier delivery has an unresolved outcome. Reconcile it before any new write.', 'reconciliation');
  if (context.openAmendment || release.liveAt || ['live','partially_live','delivered','scheduled','awaiting_live_confirmation'].includes(release.status)) return hold('Existing recordings use the amendment workflow and retain their identifiers.', 'amendment');
  if (context.accepted && !context.correctionResolved) return hold('The partner already accepted this release. Continue monitoring its current delivery.', 'monitoring');
  if (release.status==='queued_for_distribution'&&!context.retryable)return hold('A queued package has no confirmed safe retry.','reconciliation');
  if (!['queued_for_distribution','submitted','in_queue','in_qc_queue','under_review','resubmitted','approved'].includes(release.status)) return hold('This workflow state requires its existing recovery or customer correction action.');
  if (/non.?exclusive|ai.generated/i.test(String(release.contentType || '')) || release.tracks?.some(track=>track.isCover)) return hold('Licensed, AI-generated or cover content requires rights evidence review.');
  if (release.reviewIssues && (release.reviewIssues.severity === 'critical_issue' || !['metadata','artwork','audio','release_date','genre_language','platform_destination'].includes(release.reviewIssues.type))) return hold('A rights, identity, contributor or uncertain review decision needs a person.');
  const flags = object(release.metadata);
  if (['copyrightClaim','copyrightClaimed','fraudFlag','manualQcHold','explicitContentMismatch'].some(key=>Boolean(flags[key]))) return hold('A copyright, fraud, explicit-content or manual hold must be resolved by a reviewer.');
  if (release.releaseSource === 'ADMIN_MANUAL') return hold('Imported manual catalogue records are not new customer submissions.');
  return { eligible: true, route: context.correctionResolved ? 'corrected_submission' : 'new_submission', reason: context.correctionResolved ? 'The customer submitted a corrected pre-delivery package; all checks must pass again.' : 'Paid, consented submission is eligible for automatic technical QC.' };
}

export function technicalReleaseFixes(release: Release) {
  const fixes: {field:string;before:string;after:string}[] = [];
  const trim = (field:string,value:unknown) => { if(typeof value==='string' && value.trim() && value!==value.trim()) fixes.push({field,before:value,after:value.trim()}); };
  trim('releaseTitle',release.releaseTitle);
  release.tracks?.forEach((track,index)=>trim(`tracks.${index}.trackTitle`,track.trackTitle));
  return fixes;
}

export function canResolveRequestedFormatting(release: Release) {
  if(release.status!=='changes_requested'||release.reviewIssues?.type!=='metadata'||release.reviewIssues.severity==='critical_issue'||!Array.isArray(release.reviewIssues.fields)||!release.reviewIssues.fields.length)return false;
  const fixes=technicalReleaseFixes(release);
  return release.reviewIssues.fields.every(issue=>fixes.some(fix=>fix.field===issue.field||fix.field==='releaseTitle'&&issue.field==='trackName'));
}
