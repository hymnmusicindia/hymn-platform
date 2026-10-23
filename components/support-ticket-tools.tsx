"use client";
/* eslint-disable @next/next/no-img-element -- Private screenshots require the viewer's session cookie. */
import { useEffect, useRef, useState } from 'react';
import type { SupportTicket } from '@/lib/types';
import { supportTemplate } from '@/lib/support-content';
import { Paperclip, Mail, Phone, Send } from 'lucide-react';

export function SupportScreenshots({ onChange, onBusy }: {onChange:(ids:number[])=>void; onBusy:(busy:boolean)=>void}) {
  const [items,setItems]=useState<{id:number;name:string}[]>([]), [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function upload(files:FileList|null) {
    if (!files || busy) return;
    const selected=Array.from(files);
    if (selected.length+items.length>3) {setError('Attach up to three screenshots.');return;}
    if (selected.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024)) {setError('Use PNG, JPG or WebP, up to 5 MB each.');return;}
    setBusy(true);onBusy(true);setError(''); const uploaded=[...items];
    try {
      for (const file of selected) {
        const form=new FormData();form.set('file',file);form.set('assetType','private_support_screenshot');
        const response=await fetch('/api/assets',{method:'POST',body:form});const data=await response.json();
        if(!response.ok||!data.asset)throw new Error(data.error||'Screenshot upload failed.');
        uploaded.push({id:data.asset.id,name:file.name});setItems([...uploaded]);onChange(uploaded.map(i=>i.id));
      }
    } catch(e) {setError(e instanceof Error?e.message:'Upload failed.');} finally {setBusy(false);onBusy(false);}
  }
  return <div className="support-attachments"><label><Paperclip size={15}/> Screenshots <span>(optional)</span><input aria-label="Attach screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy||items.length>=3} onChange={e=>{void upload(e.target.files);e.target.value='';}}/><small>Up to 3 images, 5 MB each. Visible only to you and HYMN support.</small></label>{busy?<p role="status">Uploading screenshots…</p>:null}{items.map(item=><div key={item.id}><a href={`/api/assets/${item.id}/download`} target="_blank" rel="noreferrer">{item.name}</a> <button type="button" disabled={busy} aria-label={`Remove ${item.name}`} onClick={()=>{const next=items.filter(i=>i.id!==item.id);setItems(next);onChange(next.map(i=>i.id));}}>Remove</button></div>)}{error?<p role="alert">{error}</p>:null}</div>;
}
export function CallbackFields({ phone='' }: {phone?:string}) {
  return <div className="support-callback-fields"><label>Callback number<input name="callbackPhone" type="tel" required defaultValue={phone} placeholder="+91 98765 43210" pattern="\+[0-9 ().-]{8,22}"/><small>Include your country code.</small></label><label>When can we reach you? <span>(optional)</span><input name="callbackPreference" maxLength={300} placeholder="e.g. Tomorrow, 2–4 PM IST"/></label><small>This is a request, not a confirmed appointment. HYMN will arrange an available representative.</small></div>;
}
export function SupportTicketTools({ ticket, reviewer=false, fallbackEmail='', onUpdated }: {ticket:SupportTicket;reviewer?:boolean;fallbackEmail?:string;onUpdated:(ticket:SupportTicket)=>void}) {
  const [kind,setKind]=useState('solution'), [subject,setSubject]=useState(''), [body,setBody]=useState(''), [reviewed,setReviewed]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState(''), [callback,setCallback]=useState(false), [notes,setNotes]=useState(''), [retryReason,setRetryReason]=useState(''), [retryConfirmed,setRetryConfirmed]=useState(false);
  const requestKey=useRef(''), fingerprint=useRef('');
  useEffect(()=>{const t=supportTemplate({id:ticket.id,subject:ticket.subject},kind);setSubject(t.subject);setBody(t.body);setReviewed(false);setError('');setNotice('');},[ticket.id,ticket.subject,kind]);
  useEffect(()=>{if(kind==='missed-call'&&ticket.details?.callbackStatus!=='NO_ANSWER')setKind('solution');},[kind,ticket.details?.callbackStatus]);
  // Keep callback outcomes and pending email delivery visible while the ticket is open.
  useEffect(()=>{if(!ticket.replies?.some(r=>['QUEUED','SENDING'].includes(r.status))&&!['REQUESTED','ASSIGNED'].includes(ticket.details?.callbackStatus||''))return;const timer=setInterval(async()=>{try{const res=await fetch('/api/support-tickets',{cache:'no-store'});const data=await res.json();const updated=data.tickets?.find((t:SupportTicket)=>t.id===ticket.id);if(res.ok&&updated)onUpdated(updated);}catch{}},5000);return()=>clearInterval(timer);},[ticket.id,ticket.replies,ticket.details?.callbackStatus,onUpdated]);
  async function mutate(data:Record<string,unknown>) {
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try {const response=await fetch('/api/support-tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticketId:ticket.id,...data})});const result=await response.json();if(!response.ok||!result.ticket)throw new Error(result.error||'Could not save this update.');onUpdated(result.ticket);return true;}
    catch(e){setError(e instanceof Error?e.message:'Connection lost. Try again.');return false;}finally{setBusy(false);}
  }
  const details=ticket.details||{}, recipient=details.email||fallbackEmail;
  const pending=['REQUESTED','ASSIGNED'].includes(details.callbackStatus||'');
  return <div className="support-ticket-tools">
    <div className="support-ticket-meta">{recipient?<span><Mail size={14}/> {recipient}</span>:null}{details.upc?<span>UPC {details.upc}</span>:null}</div>
    {details.screenshotIds?.length?<div className="support-screenshot-grid">{details.screenshotIds.map((id,i)=><a key={id} href={`/api/assets/${id}/download`} target="_blank" rel="noreferrer">{/* Private, cookie-authorized assets must use their authenticated endpoint. */}<img src={`/api/assets/${id}/download?width=240`} alt={`Attached screenshot ${i+1}`} loading="lazy"/><span>Screenshot {i+1} ↗</span></a>)}</div>:null}
    {details.callbackRequestedAt?<div className="support-callback-status"><Phone size={15}/><div><strong>Callback: {(details.callbackStatus||'REQUESTED').replaceAll('_',' ').toLowerCase()}</strong><p>{details.callbackPhone} · {details.callbackPreference||'No preferred time supplied'}</p>{details.callbackAttemptAt?<small>Last attempt: {new Date(details.callbackAttemptAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</small>:null}</div></div>:null}
    {!reviewer&&!['closed','resolved'].includes(ticket.status)?<><button type="button" className="btn-outline" disabled={busy||pending} onClick={()=>setCallback(!callback)}>{pending?'Callback requested':details.callbackRequestedAt?'Reschedule callback':'Request a callback'}</button>{callback?<form className="support-inline-form" onSubmit={async e=>{e.preventDefault();const values=new FormData(e.currentTarget);if(await mutate({action:'request-callback',callbackPhone:values.get('callbackPhone'),callbackPreference:values.get('callbackPreference')})){setCallback(false);setNotice('Callback requested. HYMN will arrange an available representative.');}}}><CallbackFields phone={details.callbackPhone}/><button disabled={busy} className="btn-primary">Request callback</button></form>:null}</>:null}
    {reviewer&&pending?<form className="support-inline-form" onSubmit={async e=>{e.preventDefault();if(await mutate({action:'callback-no-answer',notes})){setKind('missed-call');setNotice('Unanswered call recorded. Review the email below before sending.');}}}><a className="btn-outline" href={`tel:${details.callbackPhone}`}>Call {details.callbackPhone}</a><label>Actual call attempt notes<input aria-label="Actual call attempt notes" required minLength={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Record when you called and what happened"/></label><div className="record-actions"><button disabled={busy} className="btn-outline">Record no answer</button><button type="button" disabled={busy||notes.trim().length<3} className="btn-outline" onClick={()=>void mutate({action:"callback-contacted",notes})}>Mark contacted</button></div></form>:null}
    {reviewer?<form className="support-mailbox" onSubmit={async e=>{e.preventDefault();const next=JSON.stringify({kind,subject,body});if(fingerprint.current!==next){requestKey.current=crypto.randomUUID();fingerprint.current=next;}if(await mutate({action:'send-reply',kind,subject,body,reviewed,requestKey:requestKey.current})){setNotice('Email queued. Delivery status will update in the conversation below.');setReviewed(false);}}}>
      <h4><Mail size={17}/> Reply by email</h4><p>To: <strong>{recipient||'Account email on file'}</strong></p>{details.callbackStatus==='NO_ANSWER'&&kind!=='missed-call'?<button type="button" className="btn-outline" onClick={()=>setKind('missed-call')}>Prepare rescheduling email</button>:null}
      <label>Template<select aria-label="Template" value={kind} onChange={e=>setKind(e.target.value)}><option value="solution">Solution / next steps</option><option value="missed-call" disabled={details.callbackStatus!=='NO_ANSWER'}>We tried calling — reschedule</option></select></label>
      <label>Subject<input aria-label="Subject" required minLength={3} maxLength={200} value={subject} onChange={e=>{setSubject(e.target.value);setReviewed(false);}}/></label>
      <label>Message<textarea aria-label="Message" required minLength={10} maxLength={10000} rows={10} value={body} onChange={e=>{setBody(e.target.value);setReviewed(false);}}/></label>
      <label className="support-check"><input type="checkbox" required checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I checked the recipient and message.</label><button className="btn-primary" disabled={busy||!reviewed}><Send size={15}/> {busy?'Saving…':'Send email'}</button>
    </form>:null}
    {error?<p role="alert" className="support-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {ticket.replies?.length?<div className="support-conversation"><h4>HYMN support updates</h4>{ticket.replies.map(reply=><article key={reply.id}><header><strong>{reply.subject}</strong><small>{new Date(reply.createdAt).toLocaleString('en-IN')} · {reply.status==='REVIEW'?'Delivery needs review':reply.status==='SENT'?'Email sent':reply.status==='SENDING'?'Sending email':'Email queued'}</small></header><p>{reply.body}</p>{reviewer&&reply.status==='REVIEW'?<form className="support-inline-form" onSubmit={async e=>{e.preventDefault();if(await mutate({action:'retry-reply',replyId:reply.id,reason:retryReason,confirmedNotSent:retryConfirmed})){setRetryConfirmed(false);setRetryReason('');setNotice('Reviewed retry queued.');}}}><a href="/admin/email-logs">Inspect email delivery logs</a><label>Delivery review notes<input required minLength={10} maxLength={2000} value={retryReason} onChange={e=>setRetryReason(e.target.value)}/></label><label className="support-check"><input type="checkbox" required checked={retryConfirmed} onChange={e=>setRetryConfirmed(e.target.checked)}/> I checked that this message was not delivered.</label><button disabled={busy||!retryConfirmed} className="btn-outline">Retry reviewed email</button></form>:null}</article>)}</div>:null}
  </div>;
}
