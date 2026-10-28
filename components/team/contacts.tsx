"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ContactIntakeFields } from './contact-intake-fields';
import { contactIntakePayload } from '@/lib/team/contact-intake';
import { whatsappLink } from '@/lib/team/phone';
import styles from './calendar.module.css';
type Contact = { id: string; name: string; phone: string; email: string; secondaryEmail: string; interests: string[]; state: string; city: string; notes: string; notesVisible: boolean; ownerId: string; status: string; version: number; additionalEmails?: string[]; alternatePhones?: string[]; mergedIntoId?: string | null };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
export function TeamContacts({ api, actor, composerKey = 0, requestedId, onNavigate }: { requestedId?: string; onNavigate?: (module: string) => void; api: Api; actor: { id: string; owner: boolean; permissions: string[] }; composerKey?: number }) {
  const [items, setItems] = useState<Contact[]>([]), [query, setQuery] = useState(''), [total, setTotal] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<Contact | null>(null), [research, setResearch] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  const canCall = actor.owner || actor.permissions.includes('crm.outreach.manage');
  const mergeKey=useRef("");
  const [duplicates,setDuplicates]=useState<Contact[]>([]),[pendingDraft,setPendingDraft]=useState<Record<string,unknown>|null>(null),[keeper,setKeeper]=useState(""),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState(""),[mergedHistory,setMergedHistory]=useState<Contact[]>([]);
  const canResearch = actor.owner || actor.permissions.includes('crm.prospects.create');
  const add = () => { setDuplicates([]);setMergedHistory([]); setSelected(null); setResearch(false); setError(''); setOpen(true); };
  useEffect(() => {
    let live = true;
    if (composerKey) {
      setResearch(false); setError('');
      if (requestedId) void api<{ items: Contact[] }>(`clients?clientId=${encodeURIComponent(requestedId)}`).then(data => { if (live && data.items[0]) { setSelected(data.items[0]); setOpen(true); } }).catch(() => { if (live) setError('Contact unavailable.'); });
      else { setSelected(null); setOpen(true); }
    }
    return () => { live = false; };
  }, [composerKey, requestedId, api]);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { setLoading(true); void api<{ items: Contact[]; total: number }>(`clients?q=${encodeURIComponent(query)}`).then(data => { if (live) { setItems(data.items); setTotal(data.total); setError(''); } }).catch(e => { if (live) setError(e.message || 'Contacts unavailable.'); }).finally(() => { if (live) setLoading(false); }); }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [api, query, revision]);
  useEffect(()=>{setDuplicates([]);setConfirmed(false);setReason("");setMergedHistory([]);if(selected)void api<{items:Contact[]}>(`client-merge-history?clientId=${encodeURIComponent(selected.id)}`).then(data=>setMergedHistory(data.items)).catch(()=>{});},[selected,api]);
  async function merge() {
    if(busy||!confirmed||!reason.trim()||!pendingDraft)return;
    const target=duplicates.find(c=>c.id===keeper);if(!target)return;
    setBusy(true);setError('');
    try{const result=await api<Contact>('clients-merge',{targetId:target.id,targetVersion:target.version,...(selected?{sourceId:selected.id,sourceVersion:selected.version}:{draft:{...pendingDraft,research:undefined}}),confirmedSamePerson:true,reason,requestKey:mergeKey.current});setDuplicates([]);setSelected(result);setRevision(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:'Could not merge contacts.');}finally{setBusy(false);}
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget), text = (key: string) => String(form.get(key) || '');
    setBusy(true); setError('');
    try {
      const payload = contactIntakePayload(form, actor.id, selected, research);
      const matches=await api<{items:Contact[]}>(`client-duplicates?${new URLSearchParams({phone:text('phone'),email:text('email'),secondaryEmail:text('secondaryEmail'),...(selected?{excludeId:selected.id}:{})})}`);
      if(matches.items.length){setResearch(false);setDuplicates(matches.items);setPendingDraft(payload);setKeeper(matches.items[0].id);mergeKey.current=crypto.randomUUID();setConfirmed(false);setError('Matching contact details found. Review the cards below before saving.');return;}
      await api('clients-save',payload);
      setOpen(false); setSaved(true); setRevision(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save contact.'); } finally { setBusy(false); }
  }
  return <section className={styles.root}>
    <header className={styles.header}><div><h2>Contact database</h2><p>One shared directory for the team. Private notes, work and call history retain their access rules.</p></div><button data-team-guide="contact-add" onClick={add}>+ Add contact</button></header>
    <section className={styles.contactFlow} aria-label="Contact workflow"><div><b>1</b><strong>Find or save</strong><p>Search first. Keep one contact card per person.</p></div><div><b>2</b><strong>Check the source</strong><p>Save evidence and outreach eligibility before handoff.</p></div><div><b>3</b><strong>Call & record</strong><p>Record a real conversation and the next action.</p></div></section>
    {onNavigate && (canResearch || canCall) && <div className={styles.dayActions}><button type="button" onClick={()=>onNavigate('acquisition')}>Continue to research &amp; calls</button></div>}
    {saved && <p role="status">Contact saved. {canResearch ? 'Continue in Source checks for new prospects; existing customers stay in the shared directory.' : 'The shared card is ready. Review assigned work for the next action.'}</p>}
    <label data-team-guide="contact-search">Search shared contacts<input type="search" placeholder="Name, email, phone or location" value={query} onChange={e => setQuery(e.target.value)}/></label>
    {loading && <p role="status">Loading contacts…</p>}{error && !open && <p role="alert" className={styles.error}>{error}</p>}
    <p>{items.length} of {total} contacts</p><div className={styles.contactGrid}>{items.map(card => <article key={card.id} className={styles.contactCard}><header><span className={styles.contactAvatar}>{card.name.slice(0, 2).toUpperCase()}</span><div><h3>{card.name}</h3><small>{card.status.replaceAll('_', ' ')}</small></div></header><p>{card.email || 'No primary email'}<br/>{card.phone || 'No phone number'}</p>{card.city || card.state ? <p>{[card.city, card.state].filter(Boolean).join(', ')}</p> : null}<div className={styles.dayActions}><button onClick={() => { setSelected(card); setResearch(false); setError(''); setOpen(true); }}>Open contact card</button>{card.status === 'ACTIVE' && whatsappLink(card.phone) ? <a href={whatsappLink(card.phone)!} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}</div></article>)}</div>
    {!loading && !items.length && <p>No matching contacts. Add a contact to save it in the shared database.</p>}
    {items.length < total && <button disabled={busy} onClick={async () => { setBusy(true); try { const data = await api<{ items: Contact[] }>(`clients?q=${encodeURIComponent(query)}&offset=${items.length}`); setItems(previous => [...previous, ...data.items]); } catch { setError('Could not load more contacts.'); } finally { setBusy(false); } }}>Load more contacts</button>}
    <dialog ref={dialog} className={styles.dialog} aria-label={selected ? `Contact card: ${selected.name}` : 'Add contact'} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }}><header><h2>{selected ? 'Contact card' : 'Add contact'}</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button></header>{open && <form key={selected?.id || 'new'} onSubmit={save}><fieldset disabled={busy||duplicates.length>0} style={{display:"contents"}}><ContactIntakeFields selected={selected} api={api} canResearch={canResearch} research={research} setResearch={setResearch}/>
      </fieldset>{duplicates.length?<fieldset><legend>Review matching contacts</legend><button type="button" disabled={busy} onClick={()=>setDuplicates([])}>Edit entered details</button><p>Keep the selected card. Other phone numbers and emails will be retained, with work and call history linked to it. Private notes stay on their original records. Login accounts and acquisition credit are not merged.</p>{selected?<small>Existing cards are merged using their saved details. Apply other unsaved edits on the retained card after merging.</small>:null}{research?<p>Finish merging first, then review whether a research handoff is appropriate.</p>:null}{duplicates.map(card=><label key={card.id} className={styles.inlineCheck}><input type="radio" name="mergeTarget" checked={keeper===card.id} onChange={()=>setKeeper(card.id)}/><span><strong>{card.name}</strong><small>{card.email||'No email'} ? {card.phone||'No phone'} ? {card.status}</small><button type="button" disabled={busy} onClick={()=>{setSelected(card);setResearch(false);setDuplicates([]);setError('');}}>Open existing card</button></span></label>)}<label className={styles.inlineCheck}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I verified these details belong to the same person.</label><label>Reason for merging<input value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={1000}/></label><button type="button" disabled={busy||!confirmed||reason.trim().length<5||research} onClick={()=>void merge()}>Merge into selected card</button></fieldset>:null}
      {mergedHistory.length?<details><summary>Merged records &amp; retained private notes ({mergedHistory.length})</summary>{mergedHistory.map(card=><article key={card.id}><strong>{card.name}</strong><small>{card.email} ? {card.phone}</small>{card.notesVisible?<p style={{whiteSpace:'pre-wrap'}}>{card.notes||'No private notes.'}</p>:<small>Private notes remain restricted to their owner and authorised managers.</small>}</article>)}</details>:null}
      {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy||duplicates.length>0}>{busy ? 'Saving…' : 'Save contact'}</button></form>}</dialog>
  </section>;
}
