"use client";
import Link from 'next/link';
import { Check, Disc3, Eye, Heart, ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import { beatLicensePrice, type BeatStoreLicenseType } from '@/lib/beat-store';
import type { ExtendedBeatCardData } from './beat-card';
import { useBeatEngagement } from './beat-engagement-provider';
import styles from './beat-store-card.module.css';

export function BeatStoreCard({beat,active=false,playing=false,onPlay,onAdd,onLicense,selectedLicenses=[]}:{beat:ExtendedBeatCardData;active?:boolean;playing?:boolean;onPlay?:()=>void;onAdd?:(license:BeatStoreLicenseType)=>void;onLicense?:(license:BeatStoreLicenseType)=>void;selectedLicenses?:BeatStoreLicenseType[]}) {
  const [failed,setFailed]=useState(false),[liking,setLiking]=useState(false),[error,setError]=useState('');
  const viewed=useRef(false),{counts,ready,act}=useBeatEngagement(),count=counts[beat.id];
  useEffect(()=>setFailed(false),[beat.coverImage,beat.artworkUrl]);
  useEffect(()=>{viewed.current=false;},[beat.id]);
  useEffect(()=>{if(!playing||!ready||viewed.current)return;viewed.current=true;void act(beat.id,'view').catch(()=>{viewed.current=false;});},[beat.id,playing,ready,act]);
  const artwork=!failed&&(beat.coverImage||beat.artworkUrl),entry=beatLicensePrice(beat,'mp3')<=beatLicensePrice(beat,'wav')?'mp3':'wav';
  const price=beatLicensePrice(beat,entry);
  const cover=(size:number)=>artwork?<img src={artworkPreviewUrl(artwork,size)} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<Disc3 aria-hidden="true" size={36}/>;
  return <article className={styles.card} id={`beat-${beat.id}`} data-active={active} data-playing={playing}>
    <button type="button" className={styles.artwork} onClick={onPlay} aria-label={`${playing?'Pause':'Play'} ${beat.title}`} aria-pressed={playing}>
      <span className={styles.stage} aria-hidden="true">
        <span className={styles.record}><span className={styles.disc}><span className={styles.label}>{cover(120)}<i/></span></span></span>
        <span className={styles.sleeve}>{cover(480)}<span className={styles.sleeveEdge}/></span>
      </span>
      {active&&<span className={styles.nowPlaying}>{playing?'Now playing':'Paused'}</span>}
    </button>
    <h3 title={beat.title}>{beat.title}</h3>
    <p className={styles.producer}>{beat.producer?.slug?<Link href={`/beat-store/producers/${encodeURIComponent(beat.producer.slug)}`}>{beat.producer.name}</Link>:beat.producer?.name||beat.producerName||'Producer'}</p>
    <div className={styles.details}><span>{beat.bpm} BPM</span><span>{beat.keySignature||beat.genre}</span></div>
    <div className={styles.engagement}>
      <span title="Unique preview listeners. Each browser or device counts once." aria-label={`${count?.views??'Unavailable'} views`}><Eye size={14}/>{count?.views.toLocaleString('en-IN')??'—'}</span>
      <button type="button" aria-label={`${count?.liked?'Unlike':'Like'} ${beat.title}`} aria-pressed={count?.liked===true} disabled={!ready||liking} title={count?'Like this beat':'Counts unavailable; click to retry your like'} onClick={async()=>{setLiking(true);setError('');try{await act(beat.id,'like',!count?.liked);}catch{setError('Could not save your like. Try again.');}finally{setLiking(false);}}}><Heart size={14} fill={count?.liked?'currentColor':'none'}/>{count?.likes.toLocaleString('en-IN')??'—'}</button>
    </div>
    <div className={styles.actions}><button type="button" className={styles.price} aria-label={`Choose licence for ${beat.title}`} onClick={()=>onLicense?.(entry)}><ShoppingBag size={14}/><span>₹{price.toLocaleString('en-IN')}</span></button><button type="button" className={styles.cart} onClick={()=>onAdd?.(selectedLicenses[0]??entry)} aria-label={`${selectedLicenses.length?'Remove':'Add'} ${beat.title} ${selectedLicenses.length?'from':'to'} cart`}>{selectedLicenses.length?<Check size={16}/>:<ShoppingBag size={16}/>}</button></div>
    {error&&<p role="status" className={styles.error}>{error}</p>}
  </article>;
}
