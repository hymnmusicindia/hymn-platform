import { normalizeDireNoteUpc } from '@/lib/direnote-upc';
import { matchDireNoteTrack } from '@/lib/direnote-corrections';

export type QcLocalTrack = {id:number; title:string; isrc:string|null; trackNumber:number|null;providerTrackId?:string|null};
export type QcMatch = {title:string;artists:string[];isrc:string;label:string;score:number|null;startMs:number|null;endMs:number|null;referenceStartMs:number|null;referenceEndMs:number|null;durationSeconds:number|null;rightsOwners:string[];distributors:string[];policies:string[];spotifyUrl:string|null;youtubeUrl:string|null};
export type QcTrackDetail = {localTrackId:number|null;title:string;isrc:string;sourceIsrc:string;trackNumber:number;scanned:boolean;analysisAvailable:boolean;matches:QcMatch[];isrcLookup:string;upcLookup:string;aiPrediction:string;notes:string[]};
export type ReleaseQcReport = {version:1;releaseId:number;attemptId:number;currentUpc:string;sourceUpc:string;fetchedAt:string;provenance:'provider_api'|'partner_supplied';verified:boolean;tracks:QcTrackDetail[]};
export const qcObject=(v:unknown):Record<string,unknown>=>{if(typeof v==='string'){try{return qcObject(JSON.parse(v));}catch{return {};}}return v && typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};};
const text=(v:unknown)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,1000):'';
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const rows=(v:unknown)=>Array.isArray(v)?v.slice(0,500).map(qcObject):[];
const names=(v:unknown)=>rows(v).map(r=>text(r.name)).filter(Boolean);
const unique=(v:string[])=>[...new Set(v)].sort();
const titleKey=(v:string)=>v.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const isrcKey=(v:unknown)=>text(v).replace(/[\s-]/g,'').toUpperCase();

export function buildReleaseQcReport(raw:unknown, context:{releaseId:number;attemptId:number;currentUpc:string;sourceUpc:string;tracks:QcLocalTrack[];provenance?:ReleaseQcReport['provenance'];now?:string;verifiedAliases?:Record<string,number>}):ReleaseQcReport {
  const report=qcObject(raw); const receivedUpc=normalizeDireNoteUpc(report.upc_code ?? report.upc);
  if(report.success!==true || receivedUpc!==context.sourceUpc)throw Error('QC report does not confirm the requested source UPC.');
  const remote=rows(report.tracks);if(!remote.length || remote.length!==context.tracks.length || (typeof report.track_count==='number'&&report.track_count!==remote.length))throw Error('QC report track count does not match this submission.');
  const used=new Set<number>();
  const tracks=remote.map((t,index):QcTrackDetail=>{
    let local=matchDireNoteTrack(t,context.tracks,true);
    if(local && isrcKey(t.isrc) && local.isrc && isrcKey(t.isrc)!==isrcKey(local.isrc))local=undefined;
    const providerId=text(t.track_id ?? t.id);
    if(local && providerId && local.providerTrackId && providerId!==local.providerTrackId)local=undefined;
    if(!local && context.provenance==='partner_supplied')local=context.tracks.find(track=>track.id===context.verifiedAliases?.[isrcKey(t.isrc)] && titleKey(track.title)===titleKey(text(t.track_name)));
    // Older provider QC records explicitly link their source ISRC to the newly assigned ISRC.
    if(!local && context.sourceUpc!==context.currentUpc){
      const lookup=isrcKey(qcObject(t.isrc_lookup).isrc);
      const candidates=context.tracks.filter(track=>lookup && isrcKey(track.isrc)===lookup && titleKey(track.title)===titleKey(text(t.track_name)));
      if(candidates.length===1)local=candidates[0];
    }
    if(local && used.has(local.id))throw Error('QC report repeats a track identity.');
    if(local)used.add(local.id);
    const acr=qcObject(t.acr), results=qcObject(acr.results);
    const matches=rows(t.scanned===true?results.music:[]).map((entry):QcMatch=>{
      const r=qcObject(entry.result),external=qcObject(r.external_metadata),claims=rows(r.rights_claim);
      const spotify=text(qcObject(qcObject(external.spotify).track).id),youtube=text(qcObject(external.youtube).vid);
      return {title:text(r.title)||'Unlabelled recording',artists:names(r.artists),isrc:text(qcObject(r.external_ids).isrc),label:text(r.label),score:number(entry.score ?? r.score),startMs:number(r.sample_begin_time_offset_ms) ?? (number(entry.offset)===null?null:Number(entry.offset)*1000),endMs:number(r.sample_end_time_offset_ms),referenceStartMs:number(r.db_begin_time_offset_ms),referenceEndMs:number(r.db_end_time_offset_ms),durationSeconds:number(entry.played_duration),rightsOwners:unique(claims.flatMap(claim=>names(claim.rights_owners))),distributors:unique([...(Array.isArray(r.distributors)?r.distributors.map(text).filter(Boolean):[]),...claims.map(claim=>text(qcObject(claim.distributor).name)).filter(Boolean)]),policies:unique(claims.map(claim=>text(claim.rights_claim_policy)).filter(Boolean)),spotifyUrl:/^[A-Za-z0-9]{22}$/.test(spotify)?`https://open.spotify.com/track/${spotify}`:null,youtubeUrl:/^[\w-]{11}$/.test(youtube)?`https://www.youtube.com/watch?v=${youtube}`:null};
    }).sort((a,b)=>(a.startMs??Infinity)-(b.startMs??Infinity)||a.title.localeCompare(b.title)||a.isrc.localeCompare(b.isrc)||(a.score??0)-(b.score??0));
    const lookup=qcObject(t.isrc_lookup),upcLookup=qcObject(t.upc_lookup);
    return {localTrackId:local?.id ?? null,title:local?.title ?? (text(t.track_name)||`Track ${index+1}`),isrc:local?.isrc ?? '',sourceIsrc:text(t.isrc),trackNumber:local?.trackNumber ?? index+1,scanned:t.scanned===true,analysisAvailable:Object.keys(acr).length>0,matches,isrcLookup:[text(lookup.status),text(lookup.isrc)].filter(Boolean).join(' · '),upcLookup:[text(upcLookup.status),text(upcLookup.upc)].filter(Boolean).join(' · '),aiPrediction:text(rows(results.ai_detection)[0]?.prediction),notes:[]};
  });
  return {version:1,releaseId:context.releaseId,attemptId:context.attemptId,currentUpc:context.currentUpc,sourceUpc:context.sourceUpc,fetchedAt:context.now ?? new Date().toISOString(),provenance:context.provenance ?? 'provider_api',verified:used.size===context.tracks.length,tracks:tracks.sort((a,b)=>a.trackNumber-b.trackNumber)};
}

export function qcReportSummary(report:ReleaseQcReport){return report.tracks.map(t=>{
  const examples=[...t.matches].sort((a,b)=>(b.rightsOwners.length+b.distributors.length)-(a.rightsOwners.length+a.distributors.length)||(b.score??0)-(a.score??0)).slice(0,2).map(match=>{
    const artist=match.artists.length?` by ${match.artists.join(', ')}`:'';
    const end=match.endMs!==null?`–${(match.endMs/1000).toFixed(2)}s`:'';
    const segment=match.startMs!==null?` at ${(match.startMs/1000).toFixed(2)}s${end}`:'';
    const score=match.score!==null?` (match score ${match.score})`:'';
    return `${match.title}${artist}${segment}${score}`;
  });
  return `${t.title}: ${!t.scanned?'scan pending':!t.analysisAvailable?'detailed analysis not returned':`${t.matches.length} fingerprint match${t.matches.length===1?'':'es'}${examples.length?` — ${examples.join('; ')}`:''}`}`;
}).join('\n').slice(0,3500);}
export function qcMatchCorrectionNotes(report:ReleaseQcReport){return report.tracks.filter(t=>t.matches.length).map(t=>({field:`tracks.${report.tracks.indexOf(t)}.providerQc`,label:`Track ${t.trackNumber} · ${t.title} · Audio match review`,note:`DireNote reported ${t.matches.length} fingerprint match${t.matches.length===1?'':'es'}. Review the QC report for recordings, timing and rights information; a match alone does not establish infringement.`}));}

export function providerQcSourceUpc(payload:unknown):string|null{
  const candidates=new Set<string>();
  function inspect(value:unknown,depth=0){if(depth>5)return;if(typeof value==='string'){for(const match of value.matchAll(/https:\/\/dashboard\.direnotemedia\.com\/release_detection_analysis\.php\?[^\s<>"']+/g)){try{const upc=normalizeDireNoteUpc(new URL(match[0].replace(/[),.;]+$/g,'')).searchParams.get('upc'));if(upc)candidates.add(upc);}catch{ /* Invalid provider report link. */ }}}else if(Array.isArray(value))value.slice(0,200).forEach(row=>inspect(row,depth+1));else if(value&&typeof value==='object')Object.values(value).forEach(row=>inspect(row,depth+1));}
  inspect(payload);return candidates.size===1?[...candidates][0]:null;
}
