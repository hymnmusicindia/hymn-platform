"use client";

import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import { CheckCircle2,Clock3,ExternalLink,LoaderCircle,ShieldCheck,X } from 'lucide-react';
import { CustomerOverlay } from './customer-overlay';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import { loadBioRazorpay } from '@/lib/client-razorpay';
import { OAC_RETRY_AMOUNT,oacChannelUrl } from '@/lib/youtube-oac-contract';

type Artist={id:number;artistName:string};
type State={artist:{id:number;name:string};status:'not_applied'|'under_review'|'approved'|'rejected'|'needs_attention';liveCount:number;requiredLiveCount:number;verified:boolean;eligible:boolean;requestId:number|null;channelUrl:string|null;reason:string;retryAmount:number;legacy:boolean;paymentPending?:boolean};
const labels={not_applied:'Official Artist Channel',under_review:'Under review',approved:'Approved',rejected:'Application rejected',needs_attention:'HYMN assistance needed'};
const fieldStyle={background:'var(--input)',color:'var(--text)',borderColor:'var(--border)'};

export function YoutubeOacCard({initialArtistId,standalone=false}:{initialArtistId?:number;standalone?:boolean}){
  const [open,setOpen]=useState(false),[artists,setArtists]=useState<Artist[]>([]),[artistId,setArtistId]=useState(initialArtistId||0);
  const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [checkoutOpen,setCheckoutOpen]=useState(false);
  const [busy,setBusy]=useState(false),[changing,setChanging]=useState(false),[channel,setChannel]=useState(''),[reason,setReason]=useState(''),[consent,setConsent]=useState(false);
  const [ticketId,setTicketId]=useState<number|null>(null),[paymentPending,setPaymentPending]=useState(false);
  const proof=useRef<{orderId:string;paymentId:string;signature:string}|null>(null);
  const key=useRef(''),sequence=useRef(0),selected=useRef(artistId),busyRef=useRef(false);
  selected.current=artistId;busyRef.current=busy;
  const close=useCallback(()=>{if(!busyRef.current)setOpen(false);},[]),dialog=useAccessibleDialog(open&&!checkoutOpen,close);
  useEffect(()=>{key.current=crypto.randomUUID();},[]);
  useEffect(()=>{if(initialArtistId&&initialArtistId!==selected.current){choose(initialArtistId);}},[initialArtistId]);
  const refresh=useCallback(async(id:number,signal?:AbortSignal)=>{
    const current=++sequence.current;
    try{
      const response=await fetch(`/api/distribution/oac${id?`?artistId=${id}`:''}`,{cache:'no-store',signal}),data=await response.json();
      if(!response.ok)throw Error(data.error||'Could not load OAC status.');
      if(current!==sequence.current)return;
      setArtists(data.artists);setState(data.state);setError('');
      if(!id&&data.state)setArtistId(data.state.artist.id);
    }catch(err){if(signal?.aborted||current!==sequence.current)return;setError(err instanceof Error?err.message:'Could not load OAC status.');setState(null);}
    finally{if(current===sequence.current&&!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{setLoading(true);const controller=new AbortController();void refresh(artistId,controller.signal);const timer=setInterval(()=>{if(!document.hidden&&!busyRef.current)void refresh(selected.current,controller.signal);},30000);return()=>{controller.abort();clearInterval(timer);};},[artistId,refresh]);
  function choose(id:number){setArtistId(id);setState(null);setLoading(true);setChannel('');setReason('');setConsent(false);setChanging(false);setTicketId(null);setMessage('');setPaymentPending(false);key.current=crypto.randomUUID();}
  async function post(body:unknown){const response=await fetch('/api/distribution/oac',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not save the OAC application.');return data;}
  async function submit(event:FormEvent){
    event.preventDefault();event.stopPropagation();if(busy||!state)return;
    const parsed=oacChannelUrl.safeParse(channel);if(!parsed.success){setMessage(parsed.error.issues[0].message);return;}
    if(!consent||reason.trim().length<10){setMessage('Confirm channel ownership and provide a note of at least 10 characters.');return;}
    setBusy(true);setMessage('');
    try{
      const result=await post({...(changing?{action:'change-channel'}:{}),artistId:state.artist.id,channelUrl:parsed.data,reason:reason.trim(),rightsConfirmed:true,requestKey:key.current});
      if(changing){setTicketId(result.ticketId);setMessage(`Channel-change request #${result.ticketId} saved. HYMN will confirm the supported process before making changes.`);return;}
      if(result.requiresPayment){
        await loadBioRazorpay();
        setCheckoutOpen(true);
        await new Promise<void>((resolve,reject)=>{
          if(!window.Razorpay){reject(Error('Payment checkout is unavailable.'));return;}
          const checkout=new window.Razorpay({key:result.key,order_id:result.orderId,amount:result.amount,currency:result.currency,name:'HYMN Music',description:`YouTube OAC resubmission - INR ${OAC_RETRY_AMOUNT}`,handler:async(payment:any)=>{
            proof.current={orderId:payment.razorpay_order_id,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature};setPaymentPending(true);
            try{await post({action:'verify-payment',orderId:payment.razorpay_order_id,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature});setPaymentPending(false);resolve();}
            catch(err){reject(err);}
          },modal:{ondismiss:()=>reject(Error('Checkout closed. No application was resubmitted. If payment completed, refresh status before trying again.'))}});
          (checkout as any).on?.('payment.failed',()=>{setMessage('Payment was not completed. Close checkout and try again. Do not retry if your bank shows a charge until status is verified.');});
          checkout.open();
        });
      }
      setMessage('Your application is under review. You do not need to apply after every release.');key.current=crypto.randomUUID();await refresh(state.artist.id);
    }catch(err){setMessage(err instanceof Error?err.message:'Could not save the application.');await refresh(selected.current);}
    finally{setBusy(false);setCheckoutOpen(false);}
  }
  async function confirmAgain(){
    if(!proof.current||busy)return;setBusy(true);setMessage('');
    try{await post({action:'verify-payment',...proof.current});setPaymentPending(false);await refresh(selected.current);}
    catch(err){setMessage(err instanceof Error?err.message:'Confirmation is pending. Do not pay again.');await refresh(selected.current);}
    finally{setBusy(false);}
  }
  async function resume(){
    if(!state||busy)return;setBusy(true);setMessage('');
    try{await post({action:'resume-payment',artistId:state.artist.id});setPaymentPending(false);setMessage('Paid application recovered. No extra charge.');await refresh(state.artist.id);}
    catch(err){setMessage(err instanceof Error?err.message:'Contact HYMN to recover this payment. Do not pay again.');}
    finally{setBusy(false);}
  }
  const approved=state?.status==='approved',reviewing=state?.status==='under_review';
  const canApply=state?.eligible&&!state.legacy&&['not_applied','rejected','needs_attention'].includes(state.status);
  const channelValid=oacChannelUrl.safeParse(channel).success;
  return <section className="mt-5 rounded-2xl border p-5" aria-labelledby={`oac-title-${initialArtistId||'artist'}`} style={{borderColor:'var(--border)',background:'var(--bg-soft)'}}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={`oac-title-${initialArtistId||'artist'}`} className="font-semibold">YouTube OAC</h3><p className="mt-1 text-sm" style={{color:'var(--text-muted)'}}>One application per artist channel. Future releases do not need a new OAC application.</p></div>{state?<span className="status-pill inline-flex items-center gap-2" style={{color:approved?'var(--success)':state.status==='rejected'?'var(--danger)':'var(--text-muted)'}}>{approved?<CheckCircle2 size={15}/>:reviewing?<Clock3 size={15}/>:null}{labels[state.status]}</span>:null}</div>
    {state?<p className="mt-3 text-sm"><strong>{state.artist.name}</strong>{reviewing?' · Your application is under review. Allow 4–8 weeks after partner submission.':approved?' · Your Official Artist Channel application is approved.':` · ${state.liveCount} of ${state.requiredLiveCount} required live releases.`}</p>:null}
    {state?.status==='rejected'?<p className="mt-3 rounded-xl border p-3 text-sm" style={{borderColor:'var(--border)'}}><strong>Reason: </strong>{state.reason||'A detailed rejection reason is not available. Ask HYMN support before paying to resubmit.'}</p>:null}
    {loading?<p role="status" className="mt-3 text-sm">Checking OAC status…</p>:null}
    {error?<p role="alert" className="mt-3 text-sm">{error} <button type="button" className="underline" onClick={()=>void refresh(artistId)}>Retry status</button></p>:null}
    <div className="mt-4 flex flex-wrap gap-3">{approved&&state.channelUrl?<a className="btn-outline inline-flex items-center gap-2" href={state.channelUrl} target="_blank" rel="noopener noreferrer">View channel <ExternalLink size={14}/></a>:null}<button type="button" className="btn-outline" disabled={loading} onClick={()=>{setOpen(true);setChanging(false);setMessage('');}}>{reviewing?'View application':approved?'Manage OAC':state?.status==='rejected'?`Review & resubmit · INR ${OAC_RETRY_AMOUNT}`:'Set up YouTube OAC'}</button></div>
    <CustomerOverlay open={open}><div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section ref={node=>{dialog.current=node;}} role="dialog" aria-modal="true" aria-labelledby="oac-dialog-title" tabIndex={-1} className="w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-7" style={{maxHeight:'calc(100dvh - 2rem)',background:'var(--card)',borderColor:'var(--border)'}}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest" style={{color:'var(--text-muted)'}}>Artist services</p><h2 id="oac-dialog-title" className="mt-2 text-xl font-semibold">{changing?'Request a channel change':'YouTube Official Artist Channel'}</h2></div><button type="button" aria-label="Close OAC popup" className="rounded-lg p-2" disabled={busy} onClick={close}><X size={20}/></button></div>
      <p className="mt-3 text-sm" style={{color:'var(--text-muted)'}}>OAC brings your artist channel and official music together. It is separate from Content ID.</p>
      <label className="mt-5 grid gap-2 text-sm font-semibold">Artist profile<select className="field" style={fieldStyle} value={artistId} disabled={busy||loading} onChange={e=>choose(Number(e.target.value))}><option value={0} disabled>Select an artist</option>{artists.map(artist=><option key={artist.id} value={artist.id}>{artist.artistName}</option>)}</select></label>
      {!artists.length&&!loading?<p className="mt-4 text-sm">Create an artist profile in the wizard’s Artist step first. Then reopen this popup.</p>:null}
      {loading?<p className="mt-4 text-sm" role="status">Loading application…</p>:null}
      {error?<p role="alert" className="mt-4 text-sm">{error} <button type="button" className="underline" onClick={()=>void refresh(artistId)}>Retry</button></p>:null}
      {state&&!loading?<>
        <div className="mt-4 rounded-xl border p-4 text-sm" style={{borderColor:'var(--border)'}}><strong>{labels[state.status]}</strong><p className="mt-2">{state.verified?'Artist identity verified.':'HYMN must verify this artist profile before submission.'} {state.liveCount}/{state.requiredLiveCount} fully live releases.</p>{state.requestId?<p className="mt-2">Application #{state.requestId}</p>:null}</div>
        {reviewing?<div className="mt-4 text-sm"><p>Your application is in progress. Do not submit another application for this artist.</p><p className="mt-2">Review normally takes 4–8 weeks after partner submission. You can close this popup and continue distributing music.</p>{state.reason?<p className="mt-3 whitespace-pre-wrap">HYMN update: {state.reason}</p>:null}</div>:null}
        {approved&&!changing?<div className="mt-5 grid gap-3 text-sm"><p>Approved for this artist. New releases should map to the same channel; missing releases need support rather than a new application.</p>{state.channelUrl?<a href={state.channelUrl} target="_blank" rel="noopener noreferrer" className="btn-outline inline-flex items-center gap-2">View approved channel <ExternalLink size={14}/></a>:<p>HYMN needs to verify the earlier channel link. Include it in a support request.</p>}<button type="button" className="btn-outline" onClick={()=>{setChanging(true);setChannel('');setReason('');setConsent(false);setMessage('');}}>Request channel change</button></div>:null}
        {changing?<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm"><li>Confirm you own the new artist channel and keep access to the current channel.</li><li>Provide the new channel-ID link and explain the change below.</li><li>HYMN will confirm the supported amendment process with the distribution partner. There is no documented automatic OAC change endpoint.</li><li>Wait for written confirmation. Your existing approved channel remains in place during review; do not file a second OAC application.</li></ol>:null}
        {state.status==='rejected'?<div className="mt-4 rounded-xl border p-4 text-sm" style={{borderColor:'var(--danger)'}}><strong>Rejection reason</strong><p className="mt-2 whitespace-pre-wrap">{state.reason||'No detailed reason is recorded. Contact HYMN before resubmitting.'}</p><p className="mt-3">Fix the issue first. Each resubmission after rejection costs INR {OAC_RETRY_AMOUNT}; payment does not guarantee approval.</p></div>:null}
        {state.status==='needs_attention'?<p className="mt-4 whitespace-pre-wrap text-sm">{state.reason||'HYMN needs to review the earlier application.'}{state.legacy?' Contact support before applying again.':' A technical failure does not incur a rejection resubmission fee.'}</p>:null}
        {!state.eligible&&!approved&&!reviewing?<p className="mt-4 text-sm">You can review these instructions now. Submission unlocks after HYMN verifies this artist profile and five releases are fully live.</p>:null}
        {state.paymentPending?<div className="mt-4 rounded-xl border p-4 text-sm" style={{borderColor:'var(--warning)'}}><p>A payment was captured but the application needs recovery. Do not pay again.</p><button type="button" className="btn-primary mt-3" disabled={busy} onClick={resume}>Resume paid application</button></div>:null}
        {(canApply||changing)&&!ticketId&&!state.paymentPending&&!paymentPending?<form onSubmit={submit} className="mt-5 grid gap-4">
          <div className="rounded-xl border p-4 text-sm" style={{borderColor:'var(--border)'}}><p className="flex items-center gap-2 font-semibold"><ShieldCheck size={17}/>Use the channel-ID link only</p><p className="mt-2 break-all font-mono text-xs">https://www.youtube.com/channel/UC…</p><p className="mt-2">@handle, custom, video and shortened links are rejected. Remove tracking parameters and trailing slashes.</p><details className="mt-3"><summary className="cursor-pointer font-semibold">How to find your channel ID</summary><p className="mt-2">Switch to your artist channel in YouTube. Open Settings → Advanced settings and copy the Channel ID: UC plus 22 characters. Paste it after /channel/.</p><a className="mt-2 inline-block underline" href="https://www.youtube.com/account_advanced" target="_blank" rel="noopener noreferrer">Open YouTube advanced settings <span className="sr-only">(new tab)</span></a></details></div>
          <label className="grid gap-2 text-sm font-semibold">{changing?'New channel-ID URL':'Your channel-ID URL'}<input className="field" style={fieldStyle} type="url" required maxLength={200} autoComplete="off" value={channel} disabled={busy} onChange={e=>setChannel(e.target.value)} placeholder="https://www.youtube.com/channel/UC…" aria-describedby="oac-link-help"/></label>
          <p id="oac-link-help" className="-mt-2 text-xs" style={{color:channel&&!channelValid?'var(--danger)':'var(--text-muted)'}}>{channel&&!channelValid?'This link is not accepted. Use the exact channel-ID format shown above.':channelValid?'Channel ID detected automatically. No separate ID entry is needed.':'Use the channel owned by this artist, not a Topic or another artist’s channel.'}</p>
          <label className="grid gap-2 text-sm font-semibold">{changing?'Why are you changing the channel?':state.status==='rejected'?'How did you fix the rejection issue?':'Application note'}<textarea className="field" style={fieldStyle} required minLength={10} maxLength={2000} rows={3} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I own or manage this artist’s channel and authorize HYMN to review and submit these details. Approval is subject to eligibility.</label>
          <button className="btn-primary inline-flex items-center justify-center gap-2" type="submit" disabled={busy||!channelValid||!consent||reason.trim().length<10}>{busy?<><LoaderCircle className="animate-spin" size={16}/>Processing…</>:changing?'Send channel-change request':state.retryAmount?`Pay INR ${state.retryAmount} & resubmit`:'Submit for HYMN review'}</button>
        </form>:null}
        {ticketId?<p className="mt-4 text-sm">Track support request #{ticketId} in <a className="underline" href="/dashboard?tab=support" target="_blank" rel="noopener noreferrer">Support (new tab)</a>.</p>:null}
      </>:null}
      {paymentPending?<div className="mt-4 text-sm"><p>Payment confirmation is pending. Do not pay again. The signed payment webhook can complete your application if this window closes.</p>{!state?.paymentPending?<button type="button" className="btn-outline mt-3" disabled={busy} onClick={confirmAgain}>Retry payment confirmation</button>:null}</div>:null}
      <p role="status" aria-live="polite" className="mt-4 whitespace-pre-wrap text-sm">{message}</p>
      <button type="button" className="btn-outline mt-5" disabled={busy} onClick={close}>{standalone?'Done':'Close & continue distribution'}</button>
    </section></div></CustomerOverlay>
  </section>;
}
