"use client";
import { useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight,Check,ChevronDown,Plus } from 'lucide-react';
import type { Beat,ProducerProfile } from '@/lib/types';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import s from './producer-suggestions.module.css';

type FollowState={id:number;count:number;following:boolean;own:boolean};
const preferenceKey='hymn:producer-suggestions:collapsed';
export function ProducerSuggestions({profiles,beats}:{profiles:ProducerProfile[];beats:Pick<Beat,'producerId'|'createdAt'>[]}){
  const producers=useMemo(()=>{
    const latest=new Map<number,number>();
    for(const beat of beats)latest.set(beat.producerId,Math.max(latest.get(beat.producerId)||0,Date.parse(beat.createdAt)||0));
    return [...new Map(profiles.filter(p=>p.active&&p.status==='active'&&latest.has(p.userId)).map(p=>[p.id,p])).values()].sort((a,b)=>(latest.get(b.userId)||0)-(latest.get(a.userId)||0)||a.sortOrder-b.sortOrder||a.id-b.id).slice(0,48);
  },[profiles,beats]);
  const ids=producers.map(p=>p.id).join(',');
  const [collapsed,setCollapsed]=useState(false),[all,setAll]=useState(false);
  const [states,setStates]=useState<Record<number,FollowState>>({}),[loaded,setLoaded]=useState(false),[retry,setRetry]=useState(0);
  const [pending,setPending]=useState<number[]>([]),[message,setMessage]=useState(''),[signIn,setSignIn]=useState(false);
  useEffect(()=>{try{setCollapsed(localStorage.getItem(preferenceKey)==='1');}catch{}},[]);
  useEffect(()=>{
    if(!ids)return;
    const controller=new AbortController();setLoaded(false);setStates({});
    fetch(`/api/producer-follows?ids=${ids}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('Follower details could not load.');
      const data=await response.json();if(controller.signal.aborted)return;
      setStates(Object.fromEntries(data.producers.map((row:FollowState)=>[row.id,row])));setLoaded(true);setMessage('');
    }).catch(()=>{if(!controller.signal.aborted)setMessage('Following is unavailable right now. You can still explore their stores.');});
    return ()=>controller.abort();
  },[ids,retry]);
  function toggle(){const next=!collapsed;setCollapsed(next);try{localStorage.setItem(preferenceKey,next?'1':'0');}catch{}}
  async function follow(id:number){
    const current=states[id];if(!current||pending.includes(id))return;
    setPending(rows=>[...rows,id]);setMessage('');setSignIn(false);
    try{
      const response=await fetch('/api/producer-follows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({producerId:id,following:!current.following})});
      const data=await response.json();
      if(response.status===401){setSignIn(true);throw Error('Sign in to follow producers and keep your favourites with your account.');}
      if(!response.ok)throw Error(data.error||'Could not save your follow. Please retry.');
      setStates(rows=>({...rows,[id]:data.producer}));
      setMessage(data.producer.following?'Producer followed.':'Producer unfollowed.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not save your follow. Please retry.');}
    finally{setPending(rows=>rows.filter(row=>row!==id));}
  }
  if(!producers.length)return null;
  const visible=all?producers:producers.slice(0,8);
  return <section className={s.section} aria-labelledby="producer-suggestions-title" id="producer-suggestions">
    <header className={s.header}><button type="button" className={s.toggle} aria-expanded={!collapsed} aria-controls="producer-suggestions-content" onClick={toggle}><span><h2 id="producer-suggestions-title">Producers to follow</h2><span className={s.subtitle}>{collapsed?'Discover the people behind your next sound.':'Fresh sounds. Familiar faces. Find your next collaborator.'}</span></span><ChevronDown size={18} className={collapsed?s.closed:undefined}/></button>
      {!collapsed&&producers.length>8?<button type="button" className={s.all} onClick={()=>setAll(value=>!value)} aria-expanded={all}>{all?'Show suggestions':'All producers'}<ArrowUpRight size={14}/></button>:null}
    </header>
    <div id="producer-suggestions-content" hidden={collapsed}>
      <ul className={all?s.grid:s.rail} aria-label="Suggested producers">{visible.map(producer=>{
        const state=states[producer.id],busy=pending.includes(producer.id),photo=producer.avatarUrl||producer.imageUrl;
        return <li key={producer.id} className={s.card}>
          <Link href={`/beat-store/producers/${encodeURIComponent(producer.slug)}`} className={s.profile}>
            <span className={s.avatar}><span aria-hidden="true">{producer.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>{photo?<img src={artworkPreviewUrl(photo,192)} alt="" width={120} height={120} loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display='none';}}/>:null}</span>
            <strong title={producer.name}>{producer.name}</strong>
            <span className={s.detail} title={producer.location||producer.specialty}>{producer.location||producer.specialty||'Independent producer'}</span>
          </Link>
          <span className={s.count}>{state?`${state.count.toLocaleString()} ${state.count===1?'follower':'followers'}`:'Explore their sound'}</span>
          <button type="button" className={s.follow} data-following={state?.following||undefined} aria-pressed={state?.following||false} aria-label={state?.own?`Your producer profile: ${producer.name}`:`${state?.following?'Unfollow':'Follow'} ${producer.name}`} disabled={!loaded||!state||state.own||busy} onClick={()=>void follow(producer.id)}>{state?.following?<Check size={15}/>:state?.own?null:<Plus size={15}/>}<span>{busy?'Saving...':state?.own?'Your profile':state?.following?'Following':'Follow'}</span></button>
        </li>;
      })}</ul>
      <div className={s.status} role="status" aria-live="polite">{message}{signIn?<Link href="/login?next=%2Fbeat-store%23producer-suggestions">Sign in <ArrowUpRight size={13}/></Link>:null}{message&&!loaded?<button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button>:null}</div>
    </div>
  </section>;
}
