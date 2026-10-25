"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TeamClientFields } from './client-fields';
import { whatsappLink } from '@/lib/team/phone';
import styles from './calendar.module.css';
type Contact = { id: string; name: string; phone: string; email: string; secondaryEmail: string; interests: string[]; state: string; city: string; notes: string; notesVisible: boolean; ownerId: string; status: string; version: number; additionalEmails?: string[]; alternatePhones?: string[]; mergedIntoId?: string | null };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
export function TeamContacts({ api, actor, composerKey = 0, requestedId }: { requestedId?: string; api: Api; actor: { id: string; owner: boolean; permissions: string[] }; composerKey?: number }) {
  const [items, setItems] = useState<Contact[]>([]), [query, setQuery] = useState(''), [total, setTotal] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<Contact | null>(null), [research, setResearch] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
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
      const payload={ ...(selected ? { id: selected.id, version: selected.version } : {}), ownerId: selected?.ownerId || actor.id, name: text('name'), phone: text('phone'), email: text('email'), secondaryEmail: text('secondaryEmail'), interests: form.getAll('interests').map(String), state: text('state'), city: text('city'), notes: text('notes'), status: text('status') || 'ACTIVE', ...(research ? { research: { sourceUrl: text('sourceUrl'), evidence: text('evidence'), contactEligibility: text('contactEligibility'), verified: form.has('verified') } } : {}) };
      const matches=await api<{items:Contact[]}>(`client-duplicates?${new URLSearchParams({phone:text('phone'),email:text('email'),secondaryEmail:text('secondaryEmail'),...(selected?{excludeId:selected.id}:{})})}`);
      if(matches.items.length){setResearch(false);setDuplicates(matches.items);setPendingDraft(payload);setKeeper(matches.items[0].id);mergeKey.current=crypto.randomUUID();setConfirmed(false);setError('Matching contact details found. Review the cards below before saving.');return;}
      await api('clients-save',payload);
      setOpen(false); setRevision(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save contact.'); } finally { setBusy(false); }
  }
  return <section className={styles.root}>
    <header className={styles.header}><div><h2>Contact database</h2><p>One shared directory for the team. Private notes, work and call history retain their access rules.</p></div><button onClick={add}>+ Add contact</button></header>
    <label>Search shared contacts<input type="search" placeholder="Name, email, phone or location" value={query} onChange={e => setQuery(e.target.value)}/></label>
    {loading && <p role="status">Loading contacts…</p>}{error && !open && <p role="alert" className={styles.error}>{error}</p>}
    <p>{items.length} of {total} contacts</p><div className={styles.contactGrid}>{items.map(card => <article key={card.id} className={styles.contactCard}><header><span className={styles.contactAvatar}>{card.name.slice(0, 2).toUpperCase()}</span><div><h3>{card.name}</h3><small>{card.status.replaceAll('_', ' ')}</small></div></header><p>{card.email || 'No primary email'}<br/>{card.phone || 'No phone number'}</p>{card.city || card.state ? <p>{[card.city, card.state].filter(Boolean).join(', ')}</p> : null}<div className={styles.dayActions}><button onClick={() => { setSelected(card); setResearch(false); setError(''); setOpen(true); }}>Open contact card</button>{card.status === 'ACTIVE' && whatsappLink(card.phone) ? <a href={whatsappLink(card.phone)!} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}</div></article>)}</div>
    {!loading && !items.length && <p>No matching contacts. Add a contact to save it in the shared database.</p>}
    {items.length < total && <button disabled={busy} onClick={async () => { setBusy(true); try { const data = await api<{ items: Contact[] }>(`clients?q=${encodeURIComponent(query)}&offset=${items.length}`); setItems(previous => [...previous, ...data.items]); } catch { setError('Could not load more contacts.'); } finally { setBusy(false); } }}>Load more contacts</button>}
    <dialog ref={dialog} className={styles.dialog} aria-label={selected ? `Contact card: ${selected.name}` : 'Add contact'} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }}><header><h2>{selected ? 'Contact card' : 'Add contact'}</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button></header>{open && <form key={selected?.id || 'new'} onSubmit={save}><fieldset disabled={busy||duplicates.length>0} style={{display:"contents"}}><label>Name<input name="name" defaultValue={selected?.name} required maxLength={160}/></label><label>Phone with country code<input name="phone" type="tel" defaultValue={selected?.phone} maxLength={40} placeholder="+91…"/></label><TeamClientFields client={selected || undefined} api={api}/>{selected?.alternatePhones?.length||selected?.additionalEmails?.length?<p>Other saved contact details: {[...(selected.alternatePhones||[]),...(selected.additionalEmails||[])].join(' ? ')}</p>:null}<label>Contact status<select name="status" defaultValue={selected?.status || 'ACTIVE'}><option value="ACTIVE">Active</option><option value="DO_NOT_CONTACT">Do not contact</option><option value="ARCHIVED">Archived</option></select></label>{!selected || selected.notesVisible ? <label>Private notes<textarea name="notes" defaultValue={selected?.notes} maxLength={10000}/><small>Visible to the responsible teammate and authorised managers.</small></label> : <p>Private notes are restricted to the responsible teammate and authorised managers.</p>}
      {canResearch && !selected && <fieldset><legend>Research verification (optional)</legend><label className={styles.inlineCheck}><input type="checkbox" checked={research} onChange={e => setResearch(e.target.checked)}/>Add verified research details</label><small>New contacts automatically appear in Research. Existing HYMN customers and duplicate leads are excluded. Verify the source before outreach or research target credit.</small>{research && <><label>Public source URL<input name="sourceUrl" type="url" required/></label><label>Source evidence<textarea name="evidence" required minLength={10} maxLength={10000}/></label><label>Outreach eligibility<select name="contactEligibility" defaultValue="UNVERIFIED"><option value="UNVERIFIED">Not verified</option><option value="LEGITIMATE_INTEREST">Relevant professional contact</option><option value="CONSENTED">Contact consent recorded</option><option value="DO_NOT_CONTACT">Do not contact</option></select></label><label className={styles.inlineCheck}><input type="checkbox" name="verified"/>I verified the source and contact details</label></>}</fieldset>}
      </fieldset>{duplicates.length?<fieldset><legend>Review matching contacts</legend><button type="button" disabled={busy} onClick={()=>setDuplicates([])}>Edit entered details</button><p>Keep the selected card. Other phone numbers and emails will be retained, with work and call history linked to it. Private notes stay on their original records. Login accounts and acquisition credit are not merged.</p>{selected?<small>Existing cards are merged using their saved details. Apply other unsaved edits on the retained card after merging.</small>:null}{research?<p>Finish merging first, then review whether a research handoff is appropriate.</p>:null}{duplicates.map(card=><label key={card.id} className={styles.inlineCheck}><input type="radio" name="mergeTarget" checked={keeper===card.id} onChange={()=>setKeeper(card.id)}/><span><strong>{card.name}</strong><small>{card.email||'No email'} ? {card.phone||'No phone'} ? {card.status}</small><button type="button" disabled={busy} onClick={()=>{setSelected(card);setResearch(false);setDuplicates([]);setError('');}}>Open existing card</button></span></label>)}<label className={styles.inlineCheck}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I verified these details belong to the same person.</label><label>Reason for merging<input value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={1000}/></label><button type="button" disabled={busy||!confirmed||reason.trim().length<5||research} onClick={()=>void merge()}>Merge into selected card</button></fieldset>:null}
      {mergedHistory.length?<details><summary>Merged records &amp; retained private notes ({mergedHistory.length})</summary>{mergedHistory.map(card=><article key={card.id}><strong>{card.name}</strong><small>{card.email} ? {card.phone}</small>{card.notesVisible?<p style={{whiteSpace:'pre-wrap'}}>{card.notes||'No private notes.'}</p>:<small>Private notes remain restricted to their owner and authorised managers.</small>}</article>)}</details>:null}
      {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy||duplicates.length>0}>{busy ? 'Saving…' : 'Save contact'}</button></form>}</dialog>
  </section>;
}
