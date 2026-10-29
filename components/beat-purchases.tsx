import Link from 'next/link';
import {ArrowRight,Disc3,RefreshCw,ShoppingBag} from 'lucide-react';
import type {BeatPurchase} from '@/lib/types';
import {beatLicenseLabel} from '@/lib/beat-store';
import {artworkPreviewUrl} from '@/lib/artwork-preview';
import s from './beat-purchases.module.css';

export function BeatPurchases({purchases,compact=false,error,onRefresh}:{purchases:BeatPurchase[];compact?:boolean;error?:string;onRefresh?:()=>void}){
  const rows=compact?purchases.slice(0,3):purchases;
  return <section className={s.section} aria-labelledby="beat-purchases-heading"><header className={s.header}><div><p className={s.eyebrow}>YOUR SOUND LIBRARY</p><h2 id="beat-purchases-heading">Beat purchases <span>{purchases.length}</span></h2><p>Purchased beats, downloads and licence agreements.</p></div><div className={s.headerActions}>{onRefresh&&<button type="button" onClick={onRefresh} aria-label="Refresh beat purchases"><RefreshCw size={15}/></button>}{compact?<Link href="/dashboard/purchases">View all <ArrowRight size={15}/></Link>:<Link href="/beat-store">Browse beats <ArrowRight size={15}/></Link>}</div></header>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    <div className={s.list}>{rows.map(p=><Link key={p.id} href={`/dashboard/purchases/${p.id}`} className={s.purchase}><span className={s.art}>{p.artworkUrl?<img src={artworkPreviewUrl(p.artworkUrl,160)} alt="" loading="lazy"/>:<Disc3 size={25}/>}</span><span className={s.copy}><strong>{p.beatTitle||`Beat #${p.beatId}`}</strong><small>{p.producerName||'HYMN Beatstore'} · {beatLicenseLabel(p.licenseType)}</small><span className={s.meta}>Purchase #{p.id} · {new Date(p.purchasedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'})}</span></span><span className={s.status}>{p.licenseUrl?'Agreement ready':'Preparing agreement'}</span><ArrowRight size={17} className={s.arrow}/></Link>)}</div>
    {!rows.length&&!error&&<div className={s.empty}><ShoppingBag size={27}/><strong>Your beats belong here</strong><p>Every purchased or complimentary beat is saved to this account.</p><Link href="/beat-store">Find your next beat <ArrowRight size={15}/></Link></div>}
  </section>;
}
