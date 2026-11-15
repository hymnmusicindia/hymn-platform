"use client";
import { RefreshCw, Radio, ShieldCheck, X, Library, ClipboardCheck, Send, CircleAlert } from 'lucide-react';
import type { Release } from '@/lib/types';
import { releaseBucket } from '@/lib/distribution-workspace';
import styles from './distribution-operations.module.css';

export function DistributionOperationsHeader({ releases, active, navigate, can, refresh, refreshing, error, arrivals, dismissArrivals, updatedAt }: { releases: Release[]; active: string; navigate: (view: string, collection?:string) => void; can: (permission: 'releases.read'|'releases.review'|'distribution.retry') => boolean; refresh: () => void; refreshing: boolean; error: string|null; arrivals: number; dismissArrivals: () => void; updatedAt: string|null }) {
  const count = (bucket: string) => releases.filter(release => releaseBucket(release) === bucket).length;
  const views = [
    {key:'releases',label:'All releases',count:releases.length,icon:Library,permission:'releases.read'},
    {key:'distribution-queue',label:'QC queue',count:count('review'),icon:ClipboardCheck,permission:'releases.review'},
    {key:'delivery',label:'Delivery monitor',count:count('delivery'),icon:Send,permission:'releases.read'},
    {key:'delivery-failed',label:'Delivery exceptions',count:count('exceptions'),icon:CircleAlert,permission:'distribution.retry'}
  ] as const;
  return <section className={styles.header} aria-label="Distribution operations">
    <div className={styles.heading}><div><span className={styles.eyebrow}>HYMN / DISTRIBUTION</span><h1>Release operations</h1><p>Review the package. Approve delivery. Follow its progress.</p></div><button type="button" className={styles.refresh} onClick={refresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? styles.spinning : ''}/>{refreshing ? 'Refreshing' : 'Refresh section'}</button></div>
    <nav className={styles.workspaceNav} aria-label="Release workspace views">{views.filter(item=>can(item.permission)).map(item=><button type="button" key={item.key} aria-pressed={active===item.key} onClick={()=>navigate(item.key)}><item.icon size={17}/><span>{item.label}</span><b aria-hidden="true">{item.count}</b></button>)}</nav>
    <div className={styles.health}><ShieldCheck size={14}/><span>HYMN approval and partner acceptance are tracked separately</span><small><Radio size={12}/>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST` : 'Connecting to live updates'}</small></div>
    {arrivals > 0 && <div role="status" aria-live="polite" className={styles.arrivals}><Radio size={17}/><span><strong>{arrivals} new submission{arrivals===1?'':'s'}</strong> received. The release list is updated.</span><button type="button" onClick={()=>{navigate(can('releases.read')?'releases':'distribution-queue');dismissArrivals();}}>View releases</button><button type="button" onClick={dismissArrivals} aria-label="Dismiss new release notification"><X size={15}/></button></div>}
    {error && <p role="alert" className={styles.error}>{error} Your last successful snapshot is retained.</p>}
  </section>;
}
