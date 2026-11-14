'use client';
import {useRef,useState,type FormEvent} from 'react';
import {Pencil} from 'lucide-react';
import {TeamClientFields} from './client-fields';
import {contactIntakePayload} from '@/lib/team/contact-intake';
import s from './work-station.module.css';

type Contact={id:string;version:number;ownerId:string;name:string;phone:string;email:string;secondaryEmail:string;interests:string[];state:string;city:string;clientDetails?:unknown;notes:string;notesVisible:boolean;status:string;alternatePhones?:string[];additionalEmails?:string[]};
type Api=<T>(resource:string,body?:unknown)=>Promise<T>;
export function ActivityContactEditor({api,clientId,actorId,onSaved}:{api:Api;clientId:string;actorId:string;onSaved:(contact:Contact)=>void}){
 const [contact,setContact]=useState<Contact|null>(null),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const pending=useRef(false);
 async function edit(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setSaved(false);
  try{const result=await api<{items:Contact[]}>(`clients?clientId=${encodeURIComponent(clientId)}`);const row=result.items.find(item=>item.id===clientId);if(!row)throw Error('This contact is unavailable.');setContact(row);setEditing(true);}
  catch(e){setError(e instanceof Error?e.message:'Could not load contact details.');}finally{pending.current=false;setBusy(false);}
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!contact||pending.current)return;
  const form=new FormData(event.currentTarget);pending.current=true;setBusy(true);setError('');
  try{const updated=await api<Contact>('clients-save',contactIntakePayload(form,actorId,contact,false));setContact(updated);setEditing(false);setSaved(true);onSaved(updated);}
  catch(e){setError(e instanceof Error?e.message:'Could not save contact. Your entered details are kept.');}finally{pending.current=false;setBusy(false);}
 }
 return <section aria-label="Edit activity contact">
  {!editing?<button type="button" disabled={busy} onClick={()=>void edit()}><Pencil size={15}/>{busy?'Loading contact…':'Edit contact details'}</button>:contact&&<form key={`${contact.id}:${contact.version}`} onSubmit={save} className={s.editor}>
   <h3>Edit contact details</h3><p>Save updates here while keeping your activity and call notes open.</p>
   <fieldset disabled={busy} className={s.editor}>
    <label>Name<input name="name" defaultValue={contact.name} required maxLength={160}/></label>
    <label>Phone with country code<input name="phone" type="tel" defaultValue={contact.phone} maxLength={40}/></label>
    <TeamClientFields key={`${contact.id}:${contact.version}`} api={api} client={contact}/>
    {contact.notesVisible&&<label>Private contact notes<textarea name="notes" defaultValue={contact.notes} maxLength={10000}/></label>}
    <input type="hidden" name="status" value={contact.status}/>
    {!!(contact.alternatePhones?.length||contact.additionalEmails?.length)&&<small>Other saved contact details: {[...(contact.alternatePhones||[]),...(contact.additionalEmails||[])].join(' / ')}</small>}
   </fieldset>
   <div className={s.actions}><button type="submit" className={s.primary} disabled={busy}>{busy?'Saving contact…':'Save contact details'}</button><button type="button" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>Cancel</button>{error&&<button type="button" disabled={busy} onClick={()=>void edit()}>Reload contact (discard edits)</button>}</div>
  </form>}
  {error&&<p role="alert" className={s.error}>{error}</p>}{saved&&<p role="status" className={s.success}>Contact details saved. Your activity is still open.</p>}
 </section>;
}
