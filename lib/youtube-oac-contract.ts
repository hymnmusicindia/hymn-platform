import { z } from 'zod';

export const OAC_RETRY_PLAN = 'youtube_oac_retry';
export const OAC_RETRY_AMOUNT = 80;
export const oacChannelUrl = z.string().trim().regex(
  /^https:\/\/www\.youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/,
  'Use https://www.youtube.com/channel/UC followed by the 22 remaining channel-ID characters. Handles (@name), video, short and custom links are not accepted.',
);
export function oacChannelId(value: string) { return oacChannelUrl.parse(value).split('/').at(-1)!; }
export const oacApplication = z.object({artistId:z.number().int().positive().max(2147483647),channelUrl:oacChannelUrl,reason:z.string().trim().min(10).max(2000),rightsConfirmed:z.literal(true),requestKey:z.string().uuid()}).strict();

export function oacOutcome(row: {status:string;events?:{metadata?:unknown}[]}) {
  if(row.status==='rejected'||row.status==='failed'&&row.events?.some(e=>(e.metadata as any)?.providerRejected===true||(e.metadata as any)?.providerFailed===true&&typeof (e.metadata as any)?.providerNote==='string'))return 'rejected';
  if(row.status==='failed')return 'needs_attention';
  if(row.status==='completed'||row.events?.some(e=>(e.metadata as any)?.providerApproved===true))return 'approved';
  return 'under_review';
}
