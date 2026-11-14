'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ClientDetailsFields} from './client-details-fields';
import {clientDetailsFromForm,type ClientDetails} from '@/lib/client-details';
import styles from './account-settings.module.css';
export function ClientDetailsPreferences(){
 const [data,setData]=useState<{details:ClientDetails;revision:number}|null>(null);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[snapshot,setSnapshot]=useState(0);
 const pending=useRef(false),loadSequence=useRef(0);
 const load=useCallback(async()=>{
  if(pending.current)return;
  const sequence=++loadSequence.current;setLoading(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/user/client-details',{cache:'no-store',signal:AbortSignal.timeout(20000)});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'Could not load project details.');
   if(sequence===loadSequence.current){setData(body);setSnapshot(v=>v+1);}
  }catch(e){if(sequence===loadSequence.current)setError(e instanceof Error?e.message:'Could not load details.');}
  finally{if(sequence===loadSequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{void load();return()=>{loadSequence.current++;};},[load]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!data||pending.current||loading)return;
  let details:ClientDetails;
  try{details=clientDetailsFromForm(new FormData(event.currentTarget));}
  catch{setError('Check the optional profile fields and try again.');return;}
  pending.current=true;loadSequence.current++;setBusy(true);setMessage('');setError('');
  try{
   const response=await fetch('/api/user/client-details',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({details,revision:data.revision}),signal:AbortSignal.timeout(30000)});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'Could not save details.');
   setData(body);setMessage('Project details saved.');
  }catch(e){setError(e instanceof Error?e.message:'Could not save.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <section className={styles.secondary}>
  <h2>Help us understand your project</h2>
  <p>These details are private to your account and authorised HYMN team members. You can leave them blank or clear them later.</p>
  {data?<form key={`${snapshot}:${data.revision}`} onSubmit={save} className={styles.fields}>
   <fieldset disabled={busy||loading}>
    <ClientDetailsFields value={data.details}/>
    <div className={styles.savebar}><span>Optional project details</span><div><button type="submit" className={styles.primary}>{busy?'Saving…':'Save project details'}</button></div></div>
   </fieldset>
  </form>:loading?<p role="status">Loading project details…</p>:null}
  {error&&<p role="alert">{error} <button type="button" disabled={busy||loading} onClick={()=>void load()}>Reload saved details (discard edits)</button></p>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
