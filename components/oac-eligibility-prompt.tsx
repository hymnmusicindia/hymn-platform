"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {CustomerDialog} from './customer-dialog';
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
 return <CustomerDialog open={Boolean(notice)} compact titleId="oac-eligible-title" title={notice?.title} eyebrow="Your next step" dialogRef={dialog} onClose={()=>void close()} footer={<><button className="btn-outline" onClick={()=>void close()}>Remind me in notifications</button><Link className="btn-primary" href={notice?.href||'/promotion/youtube-oac'} onClick={()=>void close()}>Submit application</Link></>}><p>{notice?.body}</p>{error?<p role="alert" className="mt-3 text-sm">{error}</p>:null}</CustomerDialog>;
}
