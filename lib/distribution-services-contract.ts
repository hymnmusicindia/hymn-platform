import { oacChannelUrl } from './youtube-oac-contract';
import { z } from 'zod';
import { videoGenres,videoLanguages } from './distribution-video-values';

export const distributionServices = {
  request_instagram_linking: { label: 'Link Instagram / Facebook profiles', group: 'Profiles', description: 'Associate this recording with your artist profiles. The recording must be live on Spotify.' },
  request_yt_oac: { label: 'YouTube Official Artist Channel', group: 'Profiles', description: 'Request an Official Artist Channel. At least five live releases are required; review normally takes 4–8 weeks.' },
  request_yt_claim: { label: 'Release a YouTube claim', group: 'Rights and claims', description: 'Ask HYMN to review and release a claim on a specific video using your recording.' },
  request_facebook_claim: { label: 'Release a Facebook claim', group: 'Rights and claims', description: 'Request review of a claim on a specific Facebook video.' },
  request_tiktok_claim: { label: 'Release a TikTok claim', group: 'Rights and claims', description: 'Request review of a claim on a specific TikTok video.' },
  request_soundcloud_claim: { label: 'Release a SoundCloud claim', group: 'Rights and claims', description: 'Request review of a claim on a specific SoundCloud track.' },
  request_takedown: { label: 'Remove this release from all stores', group: 'Removal', description: 'Request a full takedown after at least 90 days live. Review and removal are separate steps. This affects every store.' },
  ingest_video: { label: 'Distribute an official music video', group: 'Video', description: 'Submit an official video for HYMN review. Supply a permanent public MP4, JPEG thumbnail (at least 1920 × 1080, up to 10 MB) and MP3 audio (up to 50 MB). Video identifiers are separate from audio.' },
  register_master_work: { label: 'Register a master for collection', group: 'Rights and claims', description: 'Register your authorized share and collection period with master collecting bodies. HYMN reviews rights authorization before submission.' }
} as const;
export type DistributionServiceAction = keyof typeof distributionServices;
export const serviceActions = Object.keys(distributionServices) as DistributionServiceAction[];
export const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const text = z.string().trim().min(1).max(255);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, 'Use a valid calendar date.');
export const publicHttps = z.string().trim().max(2000).url().refine(value => {
  const url = new URL(value), host = url.hostname.toLowerCase();
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && !host.includes(':') && !/^(?:\d+\.)+\d+$/.test(host) && host.includes('.') && !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host);
}, 'Use a permanent public HTTPS URL.');
export const hostLink = (hosts: string[]) => publicHttps.refine(value => hosts.includes(new URL(value).hostname.replace(/^www\./,'')), 'Use a link from the selected platform.');
const spotify = hostLink(['open.spotify.com']).refine(value => /^\/track\/[A-Za-z0-9]{22}\/?$/.test(new URL(value).pathname), 'Use the Spotify track link.');
export function normalizeClaimLink(action:string,value:string){
  const url=new URL(value);
  if(action==='request_yt_claim'){
    const id=url.hostname.replace(/^www\./,'')==='youtu.be'?url.pathname.slice(1):url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|live)\/([\w-]{11})\/?$/)?.[1];
    if(!id || !/^[\w-]{11}$/.test(id))throw Error('Use a valid YouTube video link.');
    return `https://youtu.be/${id}`;
  }
  if(['request_tiktok_claim','request_soundcloud_claim'].includes(action))url.search='';
  url.hash='';return url.toString().replace(/\/$/,'');
}
const youtube = hostLink(['youtube.com','youtu.be']).refine(value=>{try{normalizeClaimLink('request_yt_claim',value);return true;}catch{return false;}},'Use a valid YouTube video link.');
const instagramProfile=hostLink(['instagram.com']).refine(value=>{const path=new URL(value).pathname;return /^\/[A-Za-z0-9_.]+\/?$/.test(path)&&!/^\/(?:p|reel|reels|stories|explore|accounts|direct)\/?$/.test(path);},'Use an Instagram profile, not a post.');
const facebookProfile=hostLink(['facebook.com']).refine(value=>{const url=new URL(value);return /^\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)&&(!url.pathname.includes('profile.php')||/^\d+$/.test(url.searchParams.get('id')||''));},'Use the Facebook artist profile or page.');
const facebookVideo=hostLink(['facebook.com','fb.watch']).refine(value=>{const url=new URL(value);return url.hostname.replace(/^www\./,'')==='fb.watch'?/^\/[\w-]+\/?$/.test(url.pathname):/^\/(?:[^/]+\/videos|reel)\/\d+\/?$/.test(url.pathname)||/^\/watch\/?$/.test(url.pathname)&&/^\d+$/.test(url.searchParams.get('v')||'');},'Use a Facebook video, watch or reel link.');
const tiktokVideo=hostLink(['tiktok.com','vm.tiktok.com','vt.tiktok.com','m.tiktok.com']).refine(value=>{const url=new URL(value),host=url.hostname.replace(/^www\./,'');return host==='vm.tiktok.com'||host==='vt.tiktok.com'?/^\/[\w-]+\/?$/.test(url.pathname):/^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)||host==='m.tiktok.com'&&/^\/v\/\d+(?:\.html)?\/?$/.test(url.pathname);},'Use a TikTok video link.');
const soundcloudTrack=hostLink(['soundcloud.com','m.soundcloud.com','on.soundcloud.com']).refine(value=>{const url=new URL(value);return url.hostname==='on.soundcloud.com'?/^\/[\w-]+\/?$/.test(url.pathname):/^\/[^/]+\/[^/]+\/?$/.test(url.pathname);},'Use a SoundCloud track link.');
const fields = {
  request_instagram_linking: z.object({ instagram_url: instagramProfile, facebook_url: facebookProfile, spotifyTrackUrl: spotify, spotifyLiveConfirmed: z.literal(true) }).strict(),
  request_yt_oac: z.object({ channel_url:oacChannelUrl, channel_id:z.string().regex(/^UC[\w-]{22}$/) }).strict().refine(v=>v.channel_url.split('/').at(-1)===v.channel_id,'Channel URL and ID must agree.'),
  request_yt_claim: z.object({ url: youtube, spotifyTrackUrl: spotify, spotifyLiveConfirmed: z.literal(true) }).strict(),
  request_facebook_claim: z.object({ url: facebookVideo, spotifyTrackUrl: spotify, spotifyLiveConfirmed: z.literal(true) }).strict(),
  request_tiktok_claim: z.object({ url: tiktokVideo, spotifyTrackUrl: spotify, spotifyLiveConfirmed: z.literal(true) }).strict(),
  request_soundcloud_claim: z.object({ url: soundcloudTrack, spotifyTrackUrl: spotify, spotifyLiveConfirmed: z.literal(true) }).strict(),
  request_takedown: z.object({ confirmation: text }).strict(),
  ingest_video: z.object({ video_title: text, video_url: publicHttps, thumbnail_url: publicHttps, audio_url: publicHttps, metadata_language: text.refine(v=>(videoLanguages as readonly string[]).includes(v),'Choose a supported video language.'), video_language: text.refine(v=>(videoLanguages as readonly string[]).includes(v),'Choose a supported video language.'), genre: text.refine(v=>Boolean(videoGenres[v]),'Choose a supported video genre.'), subgenre: text, release_date: day, tags: z.string().trim().min(1).max(500), video_description: z.string().trim().min(1).max(5000), c_line: text, p_line: text, director: text.optional(), explicit: z.boolean().default(false) }).strict().refine(v=>videoGenres[v.genre]?.includes(v.subgenre),'Choose a subgenre belonging to this video genre.'),
  register_master_work: z.object({ claim: text, claim_percent: z.number().positive().max(100), coll_start_date: day, coll_end_date: day, duration: z.string().regex(/^\d{2,3}:[0-5]\d$/).optional() }).strict().refine(v => v.coll_end_date > v.coll_start_date, 'Collection end must follow collection start.')
};
export const serviceRequest = z.object({ action: z.enum(serviceActions as [DistributionServiceAction,...DistributionServiceAction[]]), trackId: z.number().int().positive(), reason: z.string().trim().min(10).max(2000), rightsConfirmed: z.literal(true), fields: z.record(z.string(),z.unknown()), requestKey: z.string().uuid(), paymentOrderId:z.string().max(100).optional() }).strict();
export function parseServiceFields(action: DistributionServiceAction, input: unknown) { return fields[action].parse(input) as Record<string, any>; }
export const activeServiceStates = ['submitted','under_review','approved','processing_manually','submitted_to_partner','information_required'];
export const distributionServiceStatusLabel=(status:string)=>({submitted:'Awaiting HYMN review',under_review:'HYMN review in progress',approved:'Approved for submission',processing_manually:'HYMN verification needed',submitted_to_partner:'Partner processing',completed:'Completed',failed:'Needs attention',rejected:'Not approved',information_required:'More information needed'}[status]||'Service update');
export const distributionServiceStatusCopy=(status:string)=>({submitted:'HYMN received your service request. Follow its review in your release workspace.',approved:'HYMN approved this request for submission. No partner result has been confirmed yet.',processing_manually:'HYMN is checking the recorded outcome. Do not repeat this submission.',submitted_to_partner:'The request has a recorded partner receipt. Processing and store availability are tracked separately.',completed:'The requested result has been verified. Read the recorded outcome for details.',failed:'This request needs attention. Read the recorded reason before submitting anything again.',rejected:'HYMN did not approve this request. Read the review note for the next step.'}[status]||'Open the service request for its latest recorded update.');
export function customerServiceRequest<T extends {requestedChanges?:unknown;providerReference?:unknown;reviewedByAdminId?:unknown}>(request:T){
  const {providerReference:_provider,reviewedByAdminId:_reviewer,...safe}=request;void _provider;void _reviewer;
  const changes=object(request.requestedChanges);
  return {...safe,requestedChanges:{serviceOperation:changes.serviceOperation,summary:changes.summary}};
}

export const analyticsActions = ['revenue_top_artists','revenue_top_releases','revenue_top_tracks','revenue_top_platforms','revenue_top_countries','revenue_top_labels','revenue_per_stream_by_platform','revenue_per_stream_by_country','revenue_per_stream_by_artist','revenue_by_platform_country','revenue_by_sales_type','revenue_by_release_type','revenue_monthly_trend','revenue_quarterly_trend','revenue_yearly_trend','revenue_platform_trend','revenue_country_trend','revenue_artist_trend','revenue_period_comparison','revenue_artist_summary','revenue_release_summary','revenue_track_summary','revenue_analytics_summary','revenue_analytics_breakdown','revenue_analytics_trend'] as const;
const month = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
export const analyticsQuery = z.object({ action: z.enum(analyticsActions), trackId:z.number().int().positive().optional(), from: month, to: month, page: z.number().int().min(1).max(10000).default(1), platform: z.string().trim().min(1).max(100).optional(), country: z.string().regex(/^[A-Z]{2}$/).optional(), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), period_basis: z.enum(['reporting_month','sales_month']).default('reporting_month'), group_by: z.enum(['platform','country','artist','release','track','label','sales_type','release_type']).optional(), interval: z.enum(['month','quarter','year']).optional() }).strict().refine(v=>v.from<=v.to,'Period end must follow start.').refine(v=>(Number(v.to.slice(0,4))-Number(v.from.slice(0,4)))*12+Number(v.to.slice(5))-Number(v.from.slice(5))<120,'Choose a reporting range shorter than ten years.');
export const customerReferenceActions = ['list_stores','list_territories','list_genres','list_languages','list_instruments','list_contributor_roles','list_video_platforms','list_master_collecting_bodies','list_mechanical_societies','list_performance_societies'] as const;
