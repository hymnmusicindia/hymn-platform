'use client';
import {useCallback,useEffect,useId,useState} from 'react';
import {Check,ChevronRight,Headphones,Link2,LockKeyhole,ShieldCheck,RefreshCw,UserRound,X} from 'lucide-react';
import {useAccessibleDialog} from './ui/use-accessible-dialog';
import type {ReferralConnection,ReferralOffer} from '@/lib/referral-consent-policy';
import styles from './referral-consent.module.css';
type Data={connections:ReferralConnection[];invitation:ReferralOffer|null;invitationError:string;hasInvitation:boolean};
const date=(value:string)=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(value));
export function ReferralConsentManager({promptOnly=false}:{promptOnly?:boolean}){
  const [data,setData]=useState<Data|null>(null),[offer,setOffer]=useState<ReferralOffer|null>(null),[open,setOpen]=useState(false),[code,setCode]=useState(''),[checked,setChecked]=useState(false),[confirm,setConfirm]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const id=useId();
  const load=useCallback(async()=>{
    try{const response=await fetch('/api/referrals/connection',{cache:'no-store'});if(response.status===401)return;const value=await response.json();if(!response.ok)throw Error(value.error||'Could not load your connections.');setData(value);setOffer(value.invitation);setOpen(promptOnly&&value.hasInvitation);setError(value.invitationError||'');setChecked(false);}catch(e){setError(e instanceof Error?e.message:'Could not load your connections.');}
  },[promptOnly]);
  useEffect(()=>{void load();const refresh=()=>void load();window.addEventListener('hymn:referral-updated',refresh);return()=>window.removeEventListener('hymn:referral-updated',refresh);},[load]);
  async function action(body:unknown){setBusy(true);setError('');try{const response=await fetch('/api/referrals/connection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error||'Your choice could not be saved.');return result;}catch(e){setError(e instanceof Error?e.message:'Could not connect. Your choice has not been changed.');return null;}finally{setBusy(false);}}
  async function close(){if(busy)return;const result=await action({action:'decline'});if(result){setOpen(false);setOffer(null);window.dispatchEvent(new Event('hymn:referral-updated'));}}
  const dialog=useAccessibleDialog(open,()=>{void close();});
  useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[open]);
  async function approve(){if(!offer||!checked)return;const result=await action({action:'approve',proof:offer.proof,confirmed:true});if(result){setNotice('Connection approved. Your confirmation email is queued.');setOpen(false);setOffer(null);window.dispatchEvent(new Event('hymn:referral-updated'));}}
  const review=<div className={styles.review}>
    <span className={styles.eyebrow}>Your approval comes first</span><h2 id={`${id}-title`}>Review your invitation</h2>
    {offer?<><div className={styles.identity}><span className={styles.avatar}>{offer.name.slice(0,1).toUpperCase()}</span><div><strong>{offer.name}</strong><small>{offer.kind==='EMPLOYEE'?'HYMN team referral':'Community referral'}</small></div><ShieldCheck size={22}/></div>
      {offer.alreadyConnected?<p className={styles.notice}>You are already connected to this inviter. Opening the link has not restarted the 45-day period.</p>:offer.conflict?<p className={styles.notice}>You already have a connection in this programme. This invitation has not replaced it. Manage your current connection below or in your referral centre.</p>:<><ol className={styles.facts}><li><Check size={16}/> Applies only to eligible future paid purchases.</li><li><LockKeyhole size={16}/> Gives no access to your account and adds no referral fee to your purchase.</li><li><Link2 size={16}/> You can remove the connection after {offer.minimumDays} days.</li></ol><label className={styles.approval}><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={busy}/>I approve {offer.name} as my {offer.kind==='EMPLOYEE'?'HYMN team referrer':'referrer'} and understand they may earn commission under the programme terms.</label><button className={styles.primary} disabled={busy||!checked} onClick={()=>void approve()}>{busy?'Saving your choice…':'Approve connection'}<ChevronRight size={17}/></button></>}
    </>:null}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <button className={styles.secondary} disabled={busy} onClick={()=>void close()}>{offer?.alreadyConnected||offer?.conflict?'Close invitation':'Decline invitation'}</button>
    <small className={styles.footnote}>Opening a link does not activate a referral. Eligible earnings are checked against real payments and refunds.</small>
  </div>;
  if(promptOnly)return open?<div className={styles.overlay}><section ref={dialog as React.RefObject<HTMLElement>} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className={styles.dialog}><button className={styles.close} aria-label="Close invitation without approving" disabled={busy} onClick={()=>void close()}><X size={19}/></button>{review}</section></div>:null;
  return <section className={styles.root} aria-labelledby={`${id}-connections`}>
    <header><div><span className={styles.eyebrow}>Attribution & consent</span><h2 id={`${id}-connections`}>Your connections. Your choice.</h2><p>See who is connected to your account and when you can stop future attribution.</p></div><button className={styles.refresh} aria-label="Refresh connections" disabled={busy} onClick={()=>void load()}><RefreshCw size={18}/></button></header>
    {notice&&<p className={styles.notice} role="status">{notice}</p>}
    {error&&!offer&&<p className={styles.error} role="alert">{error}<button onClick={()=>void load()}>Retry</button></p>}
    {!data&&!error&&<p role="status">Loading connections…</p>}
    <div className={styles.grid}>{data?.connections.map(row=><article key={`${row.kind}:${row.id}`} className={styles.card}>
      <div className={styles.cardHeading}>{row.kind==='EMPLOYEE'?<Headphones size={20}/>:<UserRound size={20}/>}<span>{row.kind==='EMPLOYEE'?'Team contact':'Community inviter'}</span><span className={styles.badge}>Connected</span></div><h3>{row.name}</h3><p>Connected {date(row.connectedAt)}{row.legacy?' · Existing attribution':''}</p><div className={styles.timing}>{row.canRemove?<><Check size={17}/> You can remove this connection now</>:<><LockKeyhole size={17}/> Removal available {date(row.removableAt)}</>}</div>
      {confirm===`${row.kind}:${row.id}`?<div className={styles.confirm}><strong>Stop future attribution?</strong><p>Earlier eligible earnings and refund checks stay in the ledger. This does not delete your account or support history.</p><div className={styles.actions}><button className={styles.danger} disabled={busy} onClick={async()=>{if(await action({action:'remove',kind:row.kind,id:row.id,confirmed:true})){setConfirm(null);setNotice('Connection removed. Future purchases will no longer contribute through it.');window.dispatchEvent(new Event('hymn:referral-updated'));}}}>Confirm removal</button><button disabled={busy} onClick={()=>setConfirm(null)}>Keep connection</button></div></div>:<button className={styles.secondary} disabled={busy||!row.canRemove} onClick={()=>setConfirm(`${row.kind}:${row.id}`)}>Remove connection</button>}
    </article>)}</div>
    {data&&!data.connections.length&&<div className={styles.empty}><Link2 size={24}/><h3>No active referral connections</h3><p>You can accept an invitation even if you already have a HYMN account.</p></div>}
    <details className={styles.entry}><summary>Have an invitation code?</summary><form onSubmit={async e=>{e.preventDefault();const result=await action({action:'preview',code});if(result){setOffer(result.invitation);setChecked(false);}}}><label>Invitation code<input value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} maxLength={64} required placeholder="Enter the shared code"/></label><button disabled={busy||code.length<2}>Review invitation <ChevronRight size={16}/></button></form></details>
    {offer&&review}
    <details className={styles.entry}><summary>How commission and removal work</summary><p>Customer and team referrals use separate programmes and ledgers. Only eligible purchases made while a connection is effective can contribute. The minimum active period is 45 days; it is not an automatic expiry. Refunds, disputes, self-referrals and duplicate claims are checked before payout. Removing a connection preserves earlier valid earnings and does not erase fraud or refund reviews.</p></details>
  </section>;
}
