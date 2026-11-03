'use client';
import {useState} from 'react';
import {Check,Copy,Link2,Send} from 'lucide-react';
import styles from './referral-link.module.css';
type Api=<T>(resource:string,body?:unknown)=>Promise<T>;
export function TeamReferralLink({api}:{api:Api}){
  const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  return <section aria-label="Your referral link" className={styles.card}>
    <header className={styles.header}><span className={styles.icon}><Link2 size={22} aria-hidden="true"/></span><div><h3>Your referral link</h3><p>Invite new or existing clients. They approve before commission can accrue.</p></div></header>
    <div className={styles.actions}>
      {!link?<button className={styles.primary} disabled={busy} aria-busy={busy} onClick={async()=>{setBusy(true);setError('');try{const data=await api<{url:string}>('acquisition-referral-link');setLink(data.url);}catch(e){setError(e instanceof Error?e.message:'Could not create your link.');}finally{setBusy(false);}}}>{busy?'Preparing…':'Get my referral link'}</button>:<>
        <input className={styles.link} aria-label="Your employee referral link" value={link} readOnly onFocus={e=>e.target.select()}/>
        <div className={styles.buttons}><button className={styles.primary} onClick={async()=>{setError('');setNotice('');try{await navigator.clipboard.writeText(link);setNotice('Link copied.');}catch{setError('Select the link and copy it manually.');}}}><Copy size={16}/>Copy link</button><a className={styles.secondary} href={`https://wa.me/?text=${encodeURIComponent(`Connect with me on HYMN Music. Please review and approve the invitation: ${link}`)}`} target="_blank" rel="noopener noreferrer"><Send size={16}/>WhatsApp</a></div>
      </>}
    </div>
    <details className={styles.rules}><summary>Commission & approval rules</summary><p>Clients must approve your invitation. Eligible net revenue, refund checks and payout rules apply. Clients can remove attribution after 45 days. Clicks or signup alone do not earn commission or research credit.</p></details>
    {notice&&<p role="status" className={styles.success}><Check size={16}/>{notice}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
