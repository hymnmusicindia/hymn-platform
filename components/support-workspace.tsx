"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Disc3, Headphones, HelpCircle, LifeBuoy, LoaderCircle, Plus, Search, Send, ShieldCheck, Wallet, X } from "lucide-react";
import type { SupportTicket } from "@/lib/types";

type Reference = { id:number; label:string };
const topics = [
  {id:"release_correction",title:"Music & releases",hint:"Delivery, stores or corrections",icon:Disc3,reference:"release"},
  {id:"payment",title:"Payments",hint:"Checkout or a charge",icon:Wallet,reference:"purchase"},
  {id:"payout",title:"Royalties & payouts",hint:"Your balance or withdrawal",icon:Wallet,reference:"payout"},
  {id:"beat_license",title:"Beats & licenses",hint:"Purchases or usage rights",icon:Headphones,reference:"purchase"},
  {id:"account_access",title:"Your account",hint:"Access, profile or security",icon:ShieldCheck,reference:null},
  {id:"general",title:"Something else",hint:"We’ll help you find an answer",icon:LifeBuoy,reference:null}
];
const statuses: Record<string,string> = {open:"Received",in_progress:"In progress",resolved:"Resolved",closed:"Closed"};
const date = (value:string) => Number.isNaN(new Date(value).getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(value));

export function SupportWorkspace({ tickets, releases, purchases, payouts, error, onRetry, onCreated, externalSearch="", loading=false }: {
  tickets:SupportTicket[]; releases:Reference[]; purchases:Reference[]; payouts:Reference[];
  loading?:boolean; error?:string; onRetry:()=>void; onCreated:(ticket:SupportTicket)=>void; externalSearch?:string;
}) {
  const [composing,setComposing]=useState(false);
  const [category,setCategory]=useState("release_correction");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [busy,setBusy]=useState(false);
  const [submitError,setSubmitError]=useState("");
  const [receipt,setReceipt]=useState<number|null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  const createRef=useRef<HTMLButtonElement>(null);
  const historyRef=useRef<HTMLElement>(null);
  const topic=topics.find(item=>item.id===category)!;
  const references=topic.reference==="release" ? releases : topic.reference==="purchase" ? purchases : payouts;
  const referenceName=topic.reference==="release" ? "relatedReleaseId" : topic.reference==="purchase" ? "relatedPurchaseId" : "relatedPayoutId";
  const active=tickets.filter(ticket=>["open","in_progress"].includes(ticket.status)).length;
  const visible=[...tickets].sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime()).filter(ticket=>{
    const text=`${ticket.id} ${ticket.subject} ${ticket.message} ${topics.find(item=>item.id===ticket.category)?.title || ticket.category || ""} ${statuses[ticket.status]}`.toLowerCase();
    return [query,externalSearch].every(term=>text.includes(term.trim().toLowerCase())) && (filter==="all" || (filter==="active" ? ["open","in_progress"].includes(ticket.status) : ["resolved","closed"].includes(ticket.status)));
  });
  function start(id="release_correction") {
    setCategory(id);setComposing(true);setSubmitError("");setReceipt(null);
    requestAnimationFrame(()=>formRef.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",block:"start"}));
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setBusy(true);setSubmitError("");
    const values=new FormData(event.currentTarget);
    try {
      const response=await fetch("/api/support-tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category,subject:String(values.get("subject")||"").trim(),message:String(values.get("message")||"").trim(),priority:values.get("priority") || "normal",relatedReleaseId:values.get("relatedReleaseId") || null,relatedPurchaseId:values.get("relatedPurchaseId") || null,relatedPayoutId:values.get("relatedPayoutId") || null})});
      const data=await response.json();
      if(!response.ok || !data.ticket)throw new Error(data.error || "We couldn’t send your request. Please try again.");
      onCreated(data.ticket);setReceipt(data.ticket.id);setComposing(false);setQuery("");setFilter("all");
      requestAnimationFrame(()=>historyRef.current?.focus());
    } catch(cause) {setSubmitError(cause instanceof Error ? cause.message : "Connection lost. Your details are still here; please try again.");}
    finally {setBusy(false);}
  }
  return <div className="support-workspace">
    <header className="support-intro"><div><span className="support-kicker"><LifeBuoy size={14}/> HYMN CARE</span><h2>Keep your music moving.</h2><p>A question, a setback, a next step. We’re here for it.</p></div><button ref={createRef} type="button" className="support-primary" onClick={()=>start()}><Plus size={16}/> New request</button></header>
    <div className="support-topics" role="group" aria-label="What do you need help with?">{topics.map(item=><button key={item.id} type="button" className="support-topic" aria-pressed={composing && category===item.id} onClick={()=>start(item.id)}><item.icon size={22} strokeWidth={1.5}/><span><strong>{item.title}</strong><small>{item.hint}</small></span><ArrowRight size={15}/></button>)}</div>
    {composing ? <form ref={formRef} className="support-composer" aria-label="New support request" onSubmit={submit}>
      <header><div><span className="support-kicker">LET’S SORT IT OUT</span><h3>Tell us what’s happening.</h3></div><button type="button" className="support-icon-button" aria-label="Close new request" disabled={busy} onClick={()=>{setComposing(false);createRef.current?.focus();}}><X size={19}/></button></header>
      <div className="support-form-layout"><div className="support-form-fields"><label>Topic<select value={category} onChange={event=>setCategory(event.target.value)} disabled={busy}>{topics.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>What do you need help with?<input autoFocus name="subject" required minLength={3} maxLength={200} placeholder="A short, specific summary" disabled={busy}/></label>
      <label>The details<textarea name="message" required minLength={10} maxLength={10000} rows={5} placeholder="What happened, what you expected, and anything you’ve already tried." disabled={busy}/><small>Include any error message. Never share passwords or payment card details.</small></label></div>
      <aside className="support-form-context"><span className="support-kicker">HELP US FIND THE CONTEXT</span>{topic.reference ? <label>Related {topic.reference} <span>(optional)</span><select key={referenceName} name={referenceName} defaultValue="" disabled={busy}><option value="">Choose a {topic.reference}</option>{references.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <p>Describe the issue and we’ll route it to the right team.</p>}<label>Priority<select name="priority" defaultValue="normal" disabled={busy}><option value="normal">Normal</option><option value="high">Urgent — blocking my work</option></select></label><p><ShieldCheck size={16}/> Only you and the HYMN support team can view your request.</p><Link href="/faq">Explore the FAQ <ArrowRight size={14}/></Link></aside></div>
      {submitError ? <p className="support-error" role="alert">{submitError}</p> : null}<footer><span>Track your request here after sending.</span><button type="submit" className="support-primary" disabled={busy}>{busy ? <LoaderCircle className="support-spinner" size={16}/> : <Send size={16}/>} {busy ? "Sending…" : "Send request"}</button></footer>
    </form> : null}
    <section ref={historyRef} className="support-history" aria-labelledby="support-history-title" tabIndex={-1}>
      {receipt ? <div className="support-receipt" role="status"><Check size={18}/><div><strong>Request #{receipt} received.</strong><span>You can follow its status below.</span></div><button type="button" aria-label="Dismiss confirmation" onClick={()=>setReceipt(null)}><X size={16}/></button></div> : null}
      <header><div><span className="support-kicker">YOUR SUPPORT HISTORY</span><h3 id="support-history-title">My requests <span>{tickets.length}</span></h3></div><span className="support-active-count">{active} active</span></header>
      <div className="support-history-tools"><div className="support-filters" role="group" aria-label="Filter requests">{[["all","All requests"],["active","Active"],["complete","Completed"]].map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div><label className="support-search"><Search size={16}/><input type="search" aria-label="Search requests" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search requests"/></label></div>
      {error ? <div className="support-error" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></div> : loading ? <div className="support-empty" role="status"><LoaderCircle className="support-spinner" size={22}/><p>Loading your requests?</p></div> : visible.length ? <div className="support-ticket-list">{visible.map(ticket=><details className="support-ticket" key={ticket.id} open={receipt===ticket.id}><summary><span className="support-ticket-mark"><LifeBuoy size={19}/></span><span className="support-ticket-title"><strong>{ticket.subject}</strong><small>#{ticket.id} · {topics.find(item=>item.id===ticket.category)?.title || "Support"} · {date(ticket.createdAt)}</small></span><span className="support-status" data-status={ticket.status}>{statuses[ticket.status] || ticket.status}</span><ChevronDown className="support-ticket-chevron" size={16}/></summary><div className="support-ticket-detail"><div className="support-ticket-meta"><span>Updated {date(ticket.updatedAt)}</span>{ticket.priority==="high" ? <span>Urgent priority</span> : null}{ticket.relatedReleaseId ? <Link href={`/dashboard/releases?releaseId=${ticket.relatedReleaseId}`}>Release #{ticket.relatedReleaseId}</Link> : null}{ticket.relatedPurchaseId ? <Link href="/dashboard?tab=purchases">Purchase #{ticket.relatedPurchaseId}</Link> : null}{ticket.relatedPayoutId ? <Link href="/payout">Payout #{ticket.relatedPayoutId}</Link> : null}</div><span className="support-kicker">YOUR REQUEST</span><p>{ticket.message}</p><div className="support-ticket-update"><span className="support-status" data-status={ticket.status}>{statuses[ticket.status] || ticket.status}</span><span>{ticket.status==="open" ? "Your request has reached HYMN support." : ticket.status==="in_progress" ? "The team is working on your request." : ticket.status==="resolved" ? "This request has been marked resolved." : "This request is closed."}</span></div></div></details>)}</div> : <div className="support-empty"><span><LifeBuoy size={28} strokeWidth={1.3}/></span><h4>{tickets.length ? "No matching requests." : "A little help, whenever you need it."}</h4><p>{tickets.length ? "Try another search or filter." : "Your requests and their progress will live here."}</p>{tickets.length ? <button type="button" onClick={()=>{setQuery("");setFilter("all");}}>Reset filters</button> : <button type="button" onClick={()=>start()}>Create your first request <ArrowRight size={15}/></button>}</div>}
    </section>
    <footer className="support-help-footer"><HelpCircle size={17}/><span>Looking for a quick answer?</span><Link href="/faq">Visit the FAQ <ArrowRight size={14}/></Link></footer>
  </div>;
}
