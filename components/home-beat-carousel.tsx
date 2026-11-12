"use client";
import { useRef,useState,useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft,ArrowRight,Pause,Play } from 'lucide-react';
import { useBeatPreviewPlayer } from './beat-preview-player';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import { exclusiveBeatEligible } from '@/lib/beat-rights-policy';
import type { StorefrontBeat } from '@/lib/beat-store';
import styles from './home-beat-carousel.module.css';

export function HomeBeatCarousel({ beats }: { beats: StorefrontBeat[] }) {
  const viewport=useRef<HTMLDivElement>(null),player=useBeatPreviewPlayer();
  const [edges,setEdges]=useState({start:true,end:true});
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const update=()=>setEdges({start:node.scrollLeft<=2,end:node.scrollLeft+node.clientWidth>=node.scrollWidth-2});
    const observer=new ResizeObserver(update);observer.observe(node);node.addEventListener('scroll',update,{passive:true});update();
    return ()=>{observer.disconnect();node.removeEventListener('scroll',update);};
  },[beats.length]);
  function move(direction:number){const node=viewport.current;if(node)node.scrollBy({left:direction*Math.max(180,node.clientWidth*.8),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(!beats.length)return <p className={styles.empty}>New beats are on their way. <Link href="/beat-store">Explore the Beatstore <ArrowRight size={14}/></Link></p>;
  return <div className={styles.root}>
    <div className={styles.viewport} ref={viewport} tabIndex={0} role="region" aria-label="Beat previews. Swipe to explore.">
      {beats.map(beat=>{
        const active=player.activeBeatId===beat.id,playing=active&&player.playing;
        const exclusive=beat.availableLicenses?.includes('exclusive')&&exclusiveBeatEligible(beat)&&beat.exclusiveRemaining!==0&&beat.status!=='EXCLUSIVE_RESERVED';
        return <article key={beat.id} className={styles.card}>
          <button type="button" className={styles.cover} onClick={()=>player.playBeat(beat,beats)} aria-label={`${playing?'Pause':'Play'} ${beat.title}`} aria-pressed={playing}>
            <img src={artworkPreviewUrl(beat.coverImage,320)} alt={`${beat.title} cover`} loading="lazy" width={200} height={200}/>
            {exclusive?<small className={styles.badge} title="Exclusive licence available">Exclusive</small>:null}
            <span className={styles.play} data-playing={playing||undefined}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</span>
          </button>
          <h3 title={beat.title}>{beat.title}</h3>
          <Link href={beat.producer.slug?`/beat-store/producers/${encodeURIComponent(beat.producer.slug)}`:"/beat-store#beat-catalog"} className={styles.producer} title={beat.producer.name}>{beat.producer.name}</Link>
        </article>;
      })}
    </div>
    <button type="button" className={`${styles.arrow} ${styles.previous}`} aria-label="Previous beats" disabled={edges.start} onClick={()=>move(-1)}><ArrowLeft size={19}/></button>
    <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label="Next beats" disabled={edges.end} onClick={()=>move(1)}><ArrowRight size={19}/></button>
    {player.error&&beats.some(beat=>beat.id===player.activeBeatId)?<p role="status" className={styles.message}>{player.error}</p>:null}
  </div>;
}
