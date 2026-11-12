"use client";

import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import { CheckCircle2,Clock3,ExternalLink,LoaderCircle,ShieldCheck,X } from 'lucide-react';
import { CustomerDialog } from './customer-dialog';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import { loadBioRazorpay } from '@/lib/client-razorpay';
import { OAC_RETRY_AMOUNT,oacChannelUrl } from '@/lib/youtube-oac-contract';
import styles from './youtube-oac-page.module.css';
import { OacArtistSelect } from './oac-artist-select';

type Artist={id:number;artistName:string;imageUrl?:string|null};
type State={artist:{id:number;name:string};status:'not_applied'|'under_review'|'approved'|'rejected'|'needs_attention';liveCount:number;requiredLiveCount:number;verified:boolean;eligible:boolean;requestId:number|null;channelUrl:string|null;reason:string;retryAmount:number;legacy:boolean;paymentPending?:boolean;access?:{owned:boolean;amount:number;orderId:number|null;pendingCheckout?:boolean}};
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
  useEffect(()=>{key.current=crypto.randomUUID();if(standalone&&!initialArtistId){const id=Number(new URL(window.location.href).searchParams.get('artistId'));if(Number.isSafeInteger(id)&&id>0&&id<=2147483647)choose(id);}},[]);
  useEffect(()=>{if(initialArtistId&&initialArtistId!==selected.current){choose(initialArtistId);}},[initialArtistId]);
  const refresh=useCallback(async(id:number,signal?:AbortSignal)=>{
    const current=++sequence.current;
    try{
      const response=await fetch(`/api/distribution/oac${id?`?artistId=${id}`:''}`,{cache:'no-store',signal}),data=await response.json();
      if(!response.ok)throw Error(data.error||'Could not load OAC status.');
      if(current!==sequence.current)return;
      setArtists(data.artists);setState(standalone&&!id?null:data.state);setError('');
      if(!standalone&&!id&&data.state)setArtistId(data.state.artist.id);
    }catch(err){if(signal?.aborted||current!==sequence.current)return;setError(err instanceof Error?err.message:'Could not load OAC status.');setState(null);}
    finally{if(current===sequence.current&&!signal?.aborted)setLoading(false);}
  },[standalone]);
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
        await checkoutPayment(result, `YouTube OAC resubmission - INR ${OAC_RETRY_AMOUNT}`);
      }
      setMessage('Your application is under review. You do not need to apply after every release.');key.current=crypto.randomUUID();await refresh(state.artist.id);
    }catch(err){setMessage(err instanceof Error?err.message:'Could not save the application.');await refresh(selected.current);}
    finally{setBusy(false);setCheckoutOpen(false);}
  }
  async function checkoutPayment(result:any, description:string) {
        await loadBioRazorpay();
        setCheckoutOpen(true);
        await new Promise<void>((resolve,reject)=>{
          if(!window.Razorpay){reject(Error('Payment checkout is unavailable.'));return;}
          const checkout=new window.Razorpay({key:result.key,order_id:result.orderId,amount:result.amount,currency:result.currency,name:'HYMN Music',description,handler:async(payment:any)=>{
            proof.current={orderId:payment.razorpay_order_id,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature};setPaymentPending(true);
            try{await post({action:'verify-payment',orderId:payment.razorpay_order_id,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature});setPaymentPending(false);resolve();}
            catch(err){reject(err);}
          },modal:{ondismiss:()=>reject(Error('Checkout closed. If payment completed, refresh status before trying again; access is restored after verification.'))}});
          (checkout as any).on?.('payment.failed',()=>{setMessage('Payment was not completed. Close checkout and try again. Do not retry if your bank shows a charge until status is verified.');});
          checkout.open();
        });
  }
  async function purchaseAccess(){
    if(!state||busy)return;
    const id=state.artist.id;setBusy(true);setMessage('');
    try{
      const result=await post({action:'purchase-access',artistId:id});
      if(result.requiresPayment)await checkoutPayment(result,'YouTube OAC access for '+state.artist.name);
      setMessage('OAC submission is unlocked for this artist. Submit once five songs distributed by HYMN are live and the artist profile is verified.');
      await refresh(id);
    }catch(err){setMessage(err instanceof Error?err.message:'Could not complete your OAC purchase.');await refresh(id);}
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
  const canApply=state?.eligible&&(state.access?.owned||state.status!=='not_applied')&&!state.legacy&&['not_applied','rejected','needs_attention'].includes(state.status);
  const channelValid=oacChannelUrl.safeParse(channel).success;
  return <section className={standalone?styles.artistPicker:"mt-5 rounded-2xl border p-5"} aria-labelledby={`oac-title-${initialArtistId||'artist'}`} style={{borderColor:'var(--border)',background:'var(--bg-soft)'}}>
    {standalone?<OacArtistSelect artists={artists} value={artistId} disabled={loading||busy} loading={loading} onChange={choose}/>:null}
    {standalone&&!loading&&!artists.length?<p className="mt-3 text-sm">No artist profiles yet. <a className="underline" href="/distribution/start">Create an artist profile</a> to get started.</p>:null}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={`oac-title-${initialArtistId||'artist'}`} className="font-semibold">YouTube OAC</h3><p className="mt-1 text-sm" style={{color:'var(--text-muted)'}}>One application per artist channel. Future releases do not need a new OAC application.</p></div>{state?<span className="status-pill inline-flex items-center gap-2" style={{color:approved?'var(--success)':state.status==='rejected'?'var(--danger)':'var(--text-muted)'}}>{approved?<CheckCircle2 size={15}/>:reviewing?<Clock3 size={15}/>:null}{labels[state.status]}</span>:null}</div>
    {state?<p className="mt-3 text-sm"><strong>{state.artist.name}</strong>{reviewing?' · Your application is under review. Allow 4–8 weeks after partner submission.':approved?' · Your Official Artist Channel application is approved.':` · ${state.liveCount} of ${state.requiredLiveCount} required live songs distributed by HYMN.`}</p>:null}
    {state?.status==='rejected'?<p className="mt-3 rounded-xl border p-3 text-sm" style={{borderColor:'var(--border)'}}><strong>Reason: </strong>{state.reason||'A detailed rejection reason is not available. Ask HYMN support before paying to resubmit.'}</p>:null}
    {loading?<p role="status" className="mt-3 text-sm">Checking OAC status…</p>:null}
    {error?<p role="alert" className="mt-3 text-sm">{error} <button type="button" className="underline" onClick={()=>void refresh(artistId)}>Retry status</button></p>:null}
    <div className="mt-4 flex flex-wrap gap-3">{approved&&state.channelUrl?<a className="btn-outline inline-flex items-center gap-2" href={state.channelUrl} target="_blank" rel="noopener noreferrer">View channel <ExternalLink size={14}/></a>:null}<button type="button" className="btn-outline" disabled={loading||busy||(standalone&&!artistId)} onClick={()=>{setOpen(true);setChanging(false);setMessage('');}}>{reviewing?'View application':approved?'Manage OAC':state?.status==='rejected'?`Review & resubmit · INR ${OAC_RETRY_AMOUNT}`:'Set up YouTube OAC'}</button></div>
    {state&&!reviewing&&!approved&&state.status==='not_applied'?<div className="mt-4 rounded-xl border p-4 text-sm" style={{borderColor:'var(--border)'}}>
      {state.access?.owned?<p><strong>OAC submission unlocked for {state.artist.name}.</strong> {state.eligible?'You can submit now.':'We will notify you when this artist becomes eligible.'}</p>:<><p><strong>{state.access?.amount===0?'Included with Yearly+':`YouTube OAC submission - INR ${state.access?.amount??200}`}</strong></p><p className="mt-2">INR 200 standard / INR 150 with active Yearly / FREE with active Yearly+. Buy now for this artist and apply when eligible. Submission requires five live songs in this artist’s catalogue distributed by HYMN and a verified artist profile. This one-time purchase covers OAC submission for this artist only; approval is not guaranteed.{state.access?.pendingCheckout?' Your existing checkout keeps the price quoted when it was opened.':''}</p><button type="button" className="btn-primary mt-3" disabled={busy||loading} onClick={purchaseAccess}>{busy?'Processing...':state.access?.amount===0?'Activate included OAC submission':`Buy OAC submission for ${state.artist.name} - INR ${state.access?.amount??200}`}</button></>}
    </div>:null}
    {!open&&message?<p role="status" className="mt-3 text-sm">{message}</p>:null}
    {!open&&paymentPending?<button className="btn-outline mt-3" type="button" disabled={busy} onClick={confirmAgain}>Retry payment confirmation</button>:null}
    <CustomerDialog open={open} titleId="oac-dialog-title" title={changing?'Request a channel change':'YouTube Official Artist Channel'} description="Bring your artist channel and official music together. One application per artist; separate from Content ID." dialogRef={dialog} onClose={close} closeLabel="Close OAC popup" busy={busy} footer={<><button type="button" className="btn-outline" disabled={busy} onClick={close}>{standalone?'Done':'Close & continue distribution'}</button>{(canApply||changing)&&!ticketId&&!state?.paymentPending&&!paymentPending?<button form="oac-application-form" className="btn-primary" type="submit" disabled={busy||!channelValid||!consent||reason.trim().length<10}>{busy?'Processing...':changing?'Send channel-change request':state?.retryAmount?`Pay INR ${state.retryAmount} & resubmit`:'Submit for HYMN review'}</button>:null}</>}>
      <div className="mt-5"><OacArtistSelect label="Artist profile" artists={artists} value={artistId} disabled={busy||loading} loading={loading} onChange={choose}/></div>
      {!artists.length&&!loading?<p className="mt-4 text-sm">Create an artist profile in the wizard’s Artist step first. Then reopen this popup.</p>:null}
      {loading?<p className="mt-4 text-sm" role="status">Loading application…</p>:null}
      {error?<p role="alert" className="mt-4 text-sm">{error} <button type="button" className="underline" onClick={()=>void refresh(artistId)}>Retry</button></p>:null}
      {state&&!loading?<>
        <div className={styles.eligibilityBox}>
          <div className={styles.eligibilityHeading}><strong>{approved?'Approved':reviewing?'Under review':state.eligible?'Catalogue ready':'Your submission checklist'}</strong><span>{state.requestId?`Application #${state.requestId}`:'Two requirements'}</span></div>
          {!approved&&!reviewing?<div className={styles.requirementsList}>
            <div><CheckCircle2 size={18} data-ready={state.verified}/><span><strong>Verified artist profile</strong><small>{state.verified?'Artist identity verified.':'HYMN verification needed before submission.'}</small></span><span className={styles.requirementState}>{state.verified?'Ready':'Needed'}</span></div>
            <div><CheckCircle2 size={18} data-ready={state.liveCount>=state.requiredLiveCount}/><span><strong>Five live songs</strong><small>{state.liveCount}/{state.requiredLiveCount} live songs distributed by HYMN.</small></span><span className={styles.requirementState}>{Math.min(state.liveCount,state.requiredLiveCount)} / {state.requiredLiveCount}</span></div>
            <progress max={state.requiredLiveCount} value={Math.min(state.liveCount,state.requiredLiveCount)} aria-label="Live songs distributed by HYMN"/>
          </div>:null}
        </div>
        {reviewing?<div className="mt-4 text-sm"><p>Your application is in progress. Do not submit another application for this artist.</p><p className="mt-2">Review normally takes 4–8 weeks after partner submission. You can close this popup and continue distributing music.</p>{state.reason?<p className="mt-3 whitespace-pre-wrap">HYMN update: {state.reason}</p>:null}</div>:null}
        {approved&&!changing?<div className="mt-5 grid gap-3 text-sm"><p>Approved for this artist. New releases should map to the same channel; missing releases need support rather than a new application.</p>{state.channelUrl?<a href={state.channelUrl} target="_blank" rel="noopener noreferrer" className="btn-outline inline-flex items-center gap-2">View approved channel <ExternalLink size={14}/></a>:<p>HYMN needs to verify the earlier channel link. Include it in a support request.</p>}<button type="button" className="btn-outline" onClick={()=>{setChanging(true);setChannel('');setReason('');setConsent(false);setMessage('');}}>Request channel change</button></div>:null}
        {changing?<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm"><li>Confirm you own the new artist channel and keep access to the current channel.</li><li>Provide the new channel-ID link and explain the change below.</li><li>HYMN will confirm the supported amendment process with the distribution partner. There is no documented automatic OAC change endpoint.</li><li>Wait for written confirmation. Your existing approved channel remains in place during review; do not file a second OAC application.</li></ol>:null}
        {state.status==='rejected'?<div className="mt-4 rounded-xl border p-4 text-sm" style={{borderColor:'var(--danger)'}}><strong>Rejection reason</strong><p className="mt-2 whitespace-pre-wrap">{state.reason||'No detailed reason is recorded. Contact HYMN before resubmitting.'}</p><p className="mt-3">Fix the issue first. Each resubmission after rejection costs INR {OAC_RETRY_AMOUNT}; payment does not guarantee approval.</p></div>:null}
        {state.status==='needs_attention'?<p className="mt-4 whitespace-pre-wrap text-sm">{state.reason||'HYMN needs to review the earlier application.'}{state.legacy?' Contact support before applying again.':' A technical failure does not incur a rejection resubmission fee.'}</p>:null}
        {!state.eligible&&!approved&&!reviewing?<p className={styles.eligibilityNote}>To submit: five live songs in this artist's catalogue distributed by HYMN, plus a verified artist profile.</p>:null}
        {state.status==='not_applied'?<div className={styles.accessOffer}>
          <div><span className={styles.offerEyebrow}>{state.access?.owned?'OAC submission unlocked':'YouTube OAC submission'}</span><strong>{state.access?.owned?state.artist.name:state.access?.amount===0?'Included with Yearly+':`INR ${state.access?.amount??200}`}</strong><p>{state.access?.owned?(state.eligible?'You can submit your application now.':'We will notify you when your artist is eligible.'):`${state.access?.amount===0?'Included OAC submission':'One-time purchase'} for ${state.artist.name}. ${state.access?.amount===0?'Activate':'Buy'} now and apply once five songs in this artist's catalogue distributed by HYMN are live and their profile is verified. Approval is not guaranteed.`}</p></div>
          {!state.access?.owned?<button type="button" className="btn-primary" disabled={busy} onClick={purchaseAccess}>{state.access?.amount===0?'Activate included OAC submission':`Buy OAC submission - INR ${state.access?.amount??200}`}</button>:<CheckCircle2 size={24} aria-hidden="true"/>}
        </div>:null}
        {state.paymentPending?<div className="mt-4 rounded-xl border p-4 text-sm" style={{borderColor:'var(--warning)'}}><p>A payment was captured but the application needs recovery. Do not pay again.</p><button type="button" className="btn-primary mt-3" disabled={busy} onClick={resume}>Resume paid application</button></div>:null}
        {(canApply||changing)&&!ticketId&&!state.paymentPending&&!paymentPending?<form id="oac-application-form" onSubmit={submit} className="mt-5 grid gap-4">
          <div className="rounded-xl border p-4 text-sm" style={{borderColor:'var(--border)'}}><p className="flex items-center gap-2 font-semibold"><ShieldCheck size={17}/>Use the channel-ID link only</p><p className="mt-2 break-all font-mono text-xs">https://www.youtube.com/channel/UC…</p><p className="mt-2">@handle, custom, video and shortened links are rejected. Remove tracking parameters and trailing slashes.</p><details className="mt-3"><summary className="cursor-pointer font-semibold">How to find your channel ID</summary><p className="mt-2">Switch to your artist channel in YouTube. Open Settings → Advanced settings and copy the Channel ID: UC plus 22 characters. Paste it after /channel/.</p><a className="mt-2 inline-block underline" href="https://www.youtube.com/account_advanced" target="_blank" rel="noopener noreferrer">Open YouTube advanced settings <span className="sr-only">(new tab)</span></a></details></div>
          <label className="grid gap-2 text-sm font-semibold">{changing?'New channel-ID URL':'Your channel-ID URL'}<input className="field" style={fieldStyle} type="url" required maxLength={200} autoComplete="off" value={channel} disabled={busy} onChange={e=>setChannel(e.target.value)} placeholder="https://www.youtube.com/channel/UC…" aria-describedby="oac-link-help"/></label>
          <p id="oac-link-help" className="-mt-2 text-xs" style={{color:channel&&!channelValid?'var(--danger)':'var(--text-muted)'}}>{channel&&!channelValid?'This link is not accepted. Use the exact channel-ID format shown above.':channelValid?'Channel ID detected automatically. No separate ID entry is needed.':'Use the channel owned by this artist, not a Topic or another artist’s channel.'}</p>
          <label className="grid gap-2 text-sm font-semibold">{changing?'Why are you changing the channel?':state.status==='rejected'?'How did you fix the rejection issue?':'Application note'}<textarea className="field" style={fieldStyle} required minLength={10} maxLength={2000} rows={3} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I own or manage this artist’s channel and authorize HYMN to review and submit these details. Approval is subject to eligibility.</label>

        </form>:null}
        {ticketId?<p className="mt-4 text-sm">Track support request #{ticketId} in <a className="underline" href="/dashboard?tab=support" target="_blank" rel="noopener noreferrer">Support (new tab)</a>.</p>:null}
      </>:null}
      {paymentPending?<div className="mt-4 text-sm"><p>Payment confirmation is pending. Do not pay again. The signed payment webhook can complete your application if this window closes.</p>{!state?.paymentPending?<button type="button" className="btn-outline mt-3" disabled={busy} onClick={confirmAgain}>Retry payment confirmation</button>:null}</div>:null}
      <p role="status" aria-live="polite" className={message?"mt-4 whitespace-pre-wrap text-sm":"sr-only"}>{message}</p>

    </CustomerDialog>
  </section>;
}
