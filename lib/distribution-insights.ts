import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { analyticsQuery,customerReferenceActions,object } from './distribution-services-contract';
import { callDistributionEndpoint } from './distribution-services';
import { direNoteV24Schemas, type DireNoteV24Action } from './direnote/v24-contract';
import { redactDireNoteDiagnostic } from './direnote';
import { z } from 'zod';
import { getDireNoteConfig } from './direnote/direnote-config';
const getClientCacheIdentity=()=>createHash('sha256').update(getDireNoteConfig().clientId||'not-configured').digest('hex');

const json=(value:unknown)=>JSON.parse(JSON.stringify(value));
async function owned(releaseId:number,userId:number){
  const release=await prisma.release.findFirstOrThrow({where:{id:releaseId,userId,archivedAt:null,user:{status:'ACTIVE'}},include:{tracks:true,artistProfile:true}});
  if(!release.upc || !/^\d{12,14}$/.test(release.upc))throw Error('A confirmed release UPC is required.');
  return release;
}
async function cachedRead(action:string,payload:Record<string,unknown>,releaseId?:number,ttl=15*60000){
  const key=createHash('sha256').update(JSON.stringify({action,payload,releaseId,client:getClientCacheIdentity()})).digest('hex');
  const cached=await prisma.direNoteLog.findFirst({where:{action:'distribution_insights',success:true,createdAt:{gte:new Date(Date.now()-ttl)},requestPayloadRedacted:{path:['key'],equals:key}},orderBy:{id:'desc'}});
  if(cached)return {data:object(cached.responseJson),fetchedAt:cached.createdAt.toISOString()};
  const result=await callDistributionEndpoint(action,payload,releaseId);
  if(!result.success)throw Error('HYMN reporting is temporarily unavailable. Try again later.');
  const data=json(redactDireNoteDiagnostic(result.data));
  const log=await prisma.direNoteLog.create({data:{releaseId,action:'distribution_insights',success:true,httpStatus:result.httpStatus,requestPayloadRedacted:{key,operation:action},responseJson:data}});
  return {data:object(data),fetchedAt:log.createdAt.toISOString()};
}
export function verifyAnalyticsScope(data:Record<string,any>,upc:string,isrcs:string[]){
  const filters=object(data.filters),list=(value:unknown)=>Array.isArray(value)?value.map(String):typeof value==='string'?[value]:[];
  const upcs=list(filters.upc),tracks=list(filters.isrc);
  if(upcs.length!==1 || upcs[0].replace(/[ -]/g,'')!==upc || tracks.length!==isrcs.length || tracks.some(isrc=>!isrcs.includes(isrc.replace(/[ -]/g,'').toUpperCase())))throw Error('The reporting scope could not be verified. Account-wide data was withheld.');
  const rows=Array.isArray(data.results)?data.results:[];
  if(rows.some(row=>object(row).upc && String(row.upc)!==upc || object(row).isrc && !isrcs.includes(String(row.isrc).replace(/[ -]/g,'').toUpperCase())))throw Error('A reporting row belongs to another recording.');
}
// No arbitrary provider commentary, credentials or account filters are sent to customers.
const allowedKeys=new Set(['currency','period','basis','from','to','months_with_data','first_month','last_month','summary','totals','net_revenue','quantity','per_stream','platforms','countries','artists','releases','tracks','results','points','series','split','name','split_by','artist_name','release_title','track_title','upc','isrc','platform','country','label_name','sales_type','release_type','rank','share_of_net_revenue_pct','net_revenue_change_pct','comparison','previous_period','previous','change_pct','pagination','page','per_page','total','total_pages','has_more','month','quarter','year','reporting_month','sales_month']);
export function safeAnalytics(value:unknown,depth=0):any{
  if(depth>8)return null;
  if(value===null || typeof value==='boolean' || typeof value==='number' && Number.isFinite(value))return value;
  if(typeof value==='string')return value.slice(0,500);
  if(Array.isArray(value))return value.slice(0,500).map(row=>safeAnalytics(row,depth+1));
  return Object.fromEntries(Object.entries(object(value)).filter(([key])=>allowedKeys.has(key)).map(([key,v])=>[key,safeAnalytics(v,depth+1)]));
}
export async function readDistributionAnalytics(releaseId:number,userId:number,raw:unknown){
  const query=analyticsQuery.parse(raw),release=await owned(releaseId,userId);
  const isrcs=release.tracks.map(track=>track.isrc?.replace(/[ -]/g,'').toUpperCase()).filter((value):value is string=>Boolean(value));
  if(!isrcs.length || isrcs.length>100)throw Error('Confirmed track ISRCs are required for scoped reporting.');
  // Both identifiers are server-bound, even for artist/group summaries.
  const {action,group_by,interval,trackId,...base}=query;
  const selected=trackId?release.tracks.find(track=>track.id===trackId)?.isrc?.replace(/[ -]/g,'').toUpperCase():undefined;
  if(trackId&&!selected)throw Error('Select a recording belonging to this release.');
  const scopedIsrcs=selected?[selected]:action==='revenue_track_summary'?[isrcs[0]]:isrcs;
  const payload:Record<string,unknown>={...base,upc:release.upc,isrc:action==='revenue_track_summary'?scopedIsrcs[0]:scopedIsrcs};
  if(action==='revenue_artist_summary')payload.artist_name=release.artistProfile?.artistName || release.artistName;
  if(action==='revenue_analytics_breakdown')payload.group_by=group_by || 'platform';
  if(action==='revenue_analytics_trend')payload.interval=interval || 'month';
  const result=await cachedRead(action,payload,releaseId);
  verifyAnalyticsScope(result.data,release.upc!,scopedIsrcs);
  if(result.data.currency!==query.currency)throw Error('The reporting currency did not match the requested currency.');
  return {data:safeAnalytics(result.data),fetchedAt:result.fetchedAt,notice:'Reporting amounts are not wallet credits. Reporting periods, currency and partner statements govern reconciliation.'};
}
const adminScope=z.object({upc:z.string().regex(/^\d{12,14}$/).optional(),isrc:z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/).optional(),artist_name:z.string().trim().min(1).max(255).optional()}).strict();
export async function readAdminDistributionAnalytics(raw:unknown,scopeInput:unknown){
  const query=analyticsQuery.parse(raw),scope=adminScope.parse(scopeInput);
  if(query.action==='revenue_release_summary'&&!scope.upc || query.action==='revenue_track_summary'&&!scope.isrc || query.action==='revenue_artist_summary'&&!scope.artist_name)throw Error('Select the release, track or artist identifier required by this summary.');
  const {action,group_by,interval,trackId:_trackId,...base}=query;void _trackId;
  const payload={...base,...scope,...(action==='revenue_analytics_breakdown'?{group_by:group_by||'platform'}:{}),...(action==='revenue_analytics_trend'?{interval:interval||'month'}:{})};
  const result=await cachedRead(action,payload);
  return {data:safeAnalytics(result.data),fetchedAt:result.fetchedAt,notice:'Administrative partner-account reporting. This read does not import royalties, change balances or mark settlements paid.'};
}
export async function readCustomerSmartLink(releaseId:number,userId:number){
  const release=await owned(releaseId,userId),result=await cachedRead('get_smartlink',{upc:release.upc},releaseId,3600000);
  const data=result.data,url=new URL(String(data.smartlink));
  if(data.upc_code!==release.upc || url.protocol!=='https:' || url.hostname!=='dnm.link' || url.username || url.password || url.port)throw Error('HYMN could not verify this release link.');
  return {url:url.toString(),fetchedAt:result.fetchedAt};
}
export async function readCustomerReference(action:typeof customerReferenceActions[number],search=''){
  if(!customerReferenceActions.includes(action))throw Error('Unsupported reference list.');
  const input=direNoteV24Schemas[action as DireNoteV24Action].parse(search?{search}:{});
  const result=await cachedRead(action,input,undefined,86400000);
  // Reference values are public catalogue vocabulary; exclude transport/status commentary.
  const values:string[]=[];
  const walk=(v:unknown,depth=0)=>{if(depth>4)return;if(typeof v==='string'){if(v.length<=200&&!/^https?:/i.test(v))values.push(v);}else if(Array.isArray(v))v.slice(0,1000).forEach(row=>walk(row,depth+1));else for(const[k,item]of Object.entries(object(v)))if(!['message','status','client_id','pin','success'].includes(k))walk(item,depth+1);};
  walk(result.data);
  return {values:[...new Set(values)].slice(0,1000),fetchedAt:result.fetchedAt};
}
