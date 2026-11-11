'use client';
import { YoutubeOacCard } from './youtube-oac-card';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { videoGenres,videoLanguages } from '@/lib/distribution-video-values';
import type { Release } from '@/lib/types';
import { distributionServiceStatusLabel,distributionServices,serviceActions,activeServiceStates,object,type DistributionServiceAction } from '@/lib/distribution-services-contract';

type Field={key:string;label:string;type?:string;optional?:boolean;hint?:string};
const spotifyFields:Field[]=[{key:'spotifyTrackUrl',label:'Live Spotify track link',type:'url'}];
export const serviceFormFields:Record<DistributionServiceAction,Field[]>={
  request_instagram_linking:[...spotifyFields,{key:'instagram_url',label:'Instagram artist profile',type:'url'},{key:'facebook_url',label:'Facebook artist profile',type:'url'}],
  request_yt_oac:[{key:'channel_url',label:'Your YouTube channel URL',type:'url'},{key:'channel_id',label:'YouTube channel ID',hint:'The 24-character ID beginning with UC. Use your own official artist channel.'}],
  request_yt_claim:[...spotifyFields,{key:'url',label:'YouTube video with the claim',type:'url'}],
  request_facebook_claim:[...spotifyFields,{key:'url',label:'Facebook video with the claim',type:'url'}],
  request_tiktok_claim:[...spotifyFields,{key:'url',label:'TikTok video with the claim',type:'url'}],
  request_soundcloud_claim:[...spotifyFields,{key:'url',label:'SoundCloud track with the claim',type:'url'}],
  request_takedown:[{key:'confirmation',label:'Type REMOVE followed by this release UPC',hint:'This requests removal from every store. For a limited takedown, use Other release requests.'}],
  ingest_video:[{key:'video_title',label:'Video title'},{key:'video_url',label:'Permanent public MP4 link',type:'url'},{key:'thumbnail_url',label:'Public JPEG thumbnail link',type:'url'},{key:'audio_url',label:'Public MP3 audio link',type:'url'},{key:'metadata_language',label:'Title and description language'},{key:'video_language',label:'Video language'},{key:'genre',label:'Video genre'},{key:'subgenre',label:'Video subgenre'},{key:'release_date',label:'Video release date',type:'date'},{key:'tags',label:'Video tags'},{key:'video_description',label:'Video description',type:'textarea'},{key:'c_line',label:'Copyright line'},{key:'p_line',label:'Phonographic copyright line'},{key:'director',label:'Director',optional:true}],
  register_master_work:[{key:'claim',label:'Your authority to collect',hint:'For example, Authorized Collection Designee. Describe only the rights you actually hold.'},{key:'claim_percent',label:'Your authorized master share (%)',type:'number'},{key:'coll_start_date',label:'Collection start date',type:'date'},{key:'coll_end_date',label:'Collection end date',type:'date'},{key:'duration',label:'Recording duration (mm:ss)',optional:true}]
};
export function DistributionServicePanel({release}:{release:Release}){
  const [action,setAction]=useState<DistributionServiceAction>('request_instagram_linking'),[requests,setRequests]=useState<any[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);
  const [videoGenre,setVideoGenre]=useState('Pop'),[selectedTrack,setSelectedTrack]=useState(release.tracks?.find(track=>track.isrc)?.id||0);
  const key=useRef<string>('');
  useEffect(()=>{key.current=crypto.randomUUID();const requested=new URL(location.href).searchParams.get('service');if(serviceActions.includes(requested as DistributionServiceAction))setAction(requested as DistributionServiceAction);},[]);
  async function refresh(){const response=await fetch(`/api/releases/${release.id}/services`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load requests.');setRequests(data.requests);setLoaded(true);}
  useEffect(()=>{let alive=true;const load=()=>{if(alive)void refresh().catch(()=>{if(alive)setMessage('Request history is unavailable. Refresh it before submitting.');});};load();const interval=setInterval(load,30000);return()=>{alive=false;clearInterval(interval);};},[release.id]);
  useEffect(()=>{if(!loaded)return;const id=new URL(location.href).searchParams.get('request');if(id&&/^\d+$/.test(id))document.getElementById(`service-request-${id}`)?.focus();},[loaded,requests.length]);
  const service=distributionServices[action],spotify=action==='request_instagram_linking'||action.endsWith('_claim');
  const eligible=['live','partially_live','scheduled','distributor_processing'].includes(release.status);
  const tracks=release.tracks?.filter(track=>track.isrc)||[];
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!loaded)return;
    const form=event.currentTarget,data=new FormData(form),fields:Record<string,any>={};
    for(const field of serviceFormFields[action]){const value=String(data.get(field.key)||'').trim();if(value)fields[field.key]=field.type==='number'?Number(value):value;}
    if(spotify)fields.spotifyLiveConfirmed=data.get('spotifyLiveConfirmed')==='on';
    if(action==='ingest_video')fields.explicit=data.get('explicit')==='on';
    setBusy(true);setMessage('');
    try{
      const response=await fetch(`/api/releases/${release.id}/services`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,trackId:Number(data.get('trackId')),reason:data.get('reason'),fields,rightsConfirmed:data.get('rightsConfirmed')==='on',requestKey:key.current})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save this request.');
      setRequests(current=>[result.request,...current.filter(row=>row.id!==result.request.id)]);setMessage(`Request #${result.request.id} saved for HYMN review. Track it below.`);form.reset();key.current=crypto.randomUUID();
    }catch(error){setMessage(error instanceof Error?error.message:'Request could not be saved.');}
    finally{setBusy(false);}
  }
  const blocked=requests.find(row=>activeServiceStates.includes(row.status)&&object(object(row.requestedChanges).serviceOperation).action===action && (action==='request_yt_oac'||object(object(row.requestedChanges).serviceOperation).trackId===selectedTrack));
  return <section id="distribution-services" className="surface-card" tabIndex={-1} aria-labelledby="distribution-services-title">
    <h2 id="distribution-services-title" className="text-2xl font-semibold">Distribution services</h2><p className="mt-2 text-sm" style={{color:'var(--text-muted)'}}>Artist profiles, claims, official video delivery, master collection and release removal. Every request has its own review and progress record.</p>
    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{serviceActions.map(kind=><button key={kind} type="button" aria-pressed={action===kind} disabled={busy} className="rounded-xl border p-3 text-left" style={{borderColor:action===kind?'var(--text)':'var(--border)'}} onClick={()=>{setAction(kind);setVideoGenre('Pop');setMessage('');key.current=crypto.randomUUID();}}><small className="block">{distributionServices[kind].group}</small><strong className="text-sm">{distributionServices[kind].label}</strong></button>)}</div>
    <h3 className="mt-6 text-xl font-semibold">{service.label}</h3><p className="mt-2 text-sm">{service.description}</p>
    {action.endsWith('_claim')?<p className="mt-3 text-sm">Releasing a claim can stop monetization of this use. Supply the exact claimed link and describe the evidence authorizing this request. HYMN reviews rights before acting.</p>:null}
    {!eligible?<p className="mt-3 text-sm">Request history remains available. New services require an eligible delivered release.</p>:null}
    {blocked?<p role="status" className="mt-3 text-sm">Request #{blocked.id} is {distributionServiceStatusLabel(blocked.status)}. Follow it below; do not submit the same request again.</p>:null}
    {action==='request_yt_oac'?<YoutubeOacCard/>:null}
    {action!=='request_yt_oac'?<form key={action} onSubmit={submit} className="mt-5">
      <label className="grid min-w-0 gap-2 text-sm">Recording<select className="field" name="trackId" required disabled={busy||!loaded} value={selectedTrack} onChange={e=>setSelectedTrack(Number(e.target.value))}>{tracks.map(track=><option key={track.id} value={track.id}>{track.trackTitle} — {track.isrc}</option>)}</select></label><fieldset disabled={busy||!loaded||!eligible||!tracks.length||Boolean(blocked)} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {serviceFormFields[action].map(field=><label key={`${action}:${field.key}`} className={`grid min-w-0 gap-2 text-sm ${field.type==='textarea'?'sm:col-span-2':''}`}>{field.label}{field.optional?' (optional)':''}{action==='ingest_video'&&['genre','subgenre','metadata_language','video_language'].includes(field.key)?<select className="field" name={field.key} required defaultValue={field.key==='genre'?'Pop':field.key==='subgenre'?'Other':'English'} key={field.key==='subgenre'?videoGenre:field.key} onChange={field.key==='genre'?event=>setVideoGenre(event.target.value):undefined}>{(field.key==='genre'?Object.keys(videoGenres):field.key==='subgenre'?videoGenres[videoGenre]:videoLanguages).map(value=><option key={value}>{value}</option>)}</select>:field.type==='textarea'?<textarea className="field" name={field.key} required={!field.optional} maxLength={5000} rows={4}/>:<input className="field" name={field.key} required={!field.optional} type={field.type||'text'} maxLength={2000} min={field.type==='number'?0.01:undefined} max={field.type==='number'?100:undefined} step={field.type==='number'?'0.01':undefined}/>}{field.hint?<small>{field.hint}</small>:null}</label>)}
      {spotify?<label className="flex gap-3 text-sm sm:col-span-2"><input type="checkbox" name="spotifyLiveConfirmed" required/>This recording is currently playable on Spotify.</label>:null}
      {action==='ingest_video'?<label className="flex gap-3 text-sm sm:col-span-2"><input type="checkbox" name="explicit"/>The video includes explicit content.</label>:null}
      <label className="grid gap-2 text-sm sm:col-span-2">Reason and supporting evidence<textarea className="field" name="reason" required minLength={10} maxLength={2000} rows={3}/></label>
      <label className="flex items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" name="rightsConfirmed" required className="mt-1"/>I control the rights needed for this request and authorize HYMN to review and act on these specific instructions.</label>
      <p className="text-sm sm:col-span-2">Submitting saves a request for HYMN review. It does not confirm partner acceptance, store completion or any earnings. HYMN will confirm any service terms requiring your agreement before proceeding.</p>
      <button type="submit" className="btn-primary">{busy?'Saving…':'Submit for HYMN review'}</button>
    </fieldset></form>:null}<p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">Service request history</h3><button className="btn-outline" type="button" disabled={busy} onClick={()=>void refresh().catch(()=>setMessage('Could not refresh history.'))}>Refresh history</button></div>
    <div className="mt-4 grid gap-3">{requests.map(row=><article key={row.id} id={`service-request-${row.id}`} tabIndex={-1} className="rounded-xl border p-4" style={{borderColor:'var(--border)'}}><h4 className="font-semibold">#{row.id} · {distributionServices[object(object(row.requestedChanges).serviceOperation).action as DistributionServiceAction]?.label||'Distribution service'}</h4><p className="mt-1 text-sm">{distributionServiceStatusLabel(row.status)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{row.reason}</p>{row.adminNote?<p className="mt-2 text-sm">HYMN: {row.adminNote}</p>:null}<ol className="mt-3 grid gap-2">{row.events?.map((event:any)=><li key={event.id} className="break-words text-sm">{event.note}</li>)}</ol></article>)}{loaded&&!requests.length?<p className="text-sm">No service requests yet.</p>:null}</div>
  </section>;
}
