"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {CustomerOverlay} from './customer-overlay';
import {useAccessibleDialog} from './ui/use-accessible-dialog';
type Notice={id:number;title:string;body:string;href:string|null};
export function OacEligibilityPrompt(){
 const [notice,setNotice]=useState<Notice|null>(null);
 const [error,setError]=useState('');
 const dismissed=useRef(new Set<number>());
 const close=useCallback(async()=>{
   if(!notice)return;
   try{const response=await fetch('/api/distribution/oac/eligibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:notice.id})});if(!response.ok)throw Error();dismissed.current.add(notice.id);setNotice(null);setError('');}
   catch{setError('Could not dismiss this reminder. Please try again.');}
 },[notice]);
 const dialog=useAccessibleDialog(Boolean(notice),()=>void close());
 useEffect(()=>{const controller=new AbortController();async function check(){if(document.hidden)return;try{const response=await fetch('/api/distribution/oac/eligibility',{cache:'no-store',signal:controller.signal});if(response.ok){const data=await response.json();if(!data.notification||!dismissed.current.has(data.notification.id))setNotice(data.notification);}}catch{}}
 void check();const timer=setInterval(()=>void check(),120000);return()=>{controller.abort();clearInterval(timer);};},[]);
 return <CustomerOverlay open={Boolean(notice)}><div className="fixed inset-0 flex items-center justify-center p-4" style={{background:"var(--overlay)"}}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="oac-eligible-title" tabIndex={-1} className="w-full max-w-md rounded-2xl border p-6" style={{background:'var(--card)',color:'var(--text)',borderColor:'var(--border)',fontFamily:'"HYMN Inter",Inter,system-ui,sans-serif'}}><p className="text-xs uppercase tracking-widest">Your next step</p><h2 id="oac-eligible-title" className="mt-3 text-xl font-semibold">{notice?.title}</h2><p className="mt-3 text-sm leading-relaxed">{notice?.body}</p><div className="mt-5 flex flex-wrap gap-3"><Link className="btn-primary" href={notice?.href||'/promotion/youtube-oac'} onClick={()=>void close()}>Submit application</Link><button className="btn-outline" onClick={()=>void close()}>Remind me in notifications</button></div>{error?<p role="alert" className="mt-3 text-sm">{error}</p>:null}</section></div></CustomerOverlay>;
}
