"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BeatEngagementCounts } from '@/lib/beat-engagement';

type State={counts:Record<number,BeatEngagementCounts>;ready:boolean;act:(id:number,action:'view'|'like',liked?:boolean)=>Promise<void>};
const Context=createContext<State|null>(null);
export function BeatEngagementProvider({ids,children}:{ids:number[];children:ReactNode}) {
  const [counts,setCounts]=useState<Record<number,BeatEngagementCounts>>({}),[ready,setReady]=useState(false);
  const versions=useRef(new Map<number,number>());
  const writes=useRef(new Map<number,Promise<void>>());
  const key=[...new Set(ids.filter(id=>id>0))].sort((a,b)=>a-b).join(',');
  useEffect(()=>{
    const controller=new AbortController(),selected=key?key.split(',').map(Number):[],before=new Map(versions.current);
    setReady(false);
    void(async()=>{try{
      for(let index=0;index<selected.length;index+=100){
        const response=await fetch(`/api/beats/engagement?ids=${selected.slice(index,index+100).join(',')}`,{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('Counts unavailable');
        const data=await response.json();if(!data.counts||typeof data.counts!=='object')throw Error('Counts unavailable');
        if(!controller.signal.aborted)setCounts(current=>({...current,...Object.fromEntries(Object.entries(data.counts).filter(([id])=>(before.get(Number(id))||0)===(versions.current.get(Number(id))||0)))}));
      }
    }catch{/* Keep known counts and show unavailable counts as a dash. */}finally{if(!controller.signal.aborted)setReady(true);}})();
    return ()=>controller.abort();
  },[key]);
  const act=useCallback((id:number,action:'view'|'like',liked?:boolean)=>{
    versions.current.set(id,(versions.current.get(id)||0)+1);
    const write=(writes.current.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const response=await fetch('/api/beats/engagement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({beatId:id,action,...(action==='like'?{liked}: {})})});
      const data=await response.json();if(!response.ok||!data.counts)throw Error(data.error||'Please retry.');
      setCounts(current=>({...current,[id]:data.counts}));
    });
    writes.current.set(id,write);
    const cleanup=()=>{if(writes.current.get(id)===write)writes.current.delete(id);};
    void write.then(cleanup,cleanup);
    return write;
  },[]);
  const value=useMemo(()=>({counts,ready,act}),[counts,ready,act]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBeatEngagement(){const value=useContext(Context);if(!value)throw Error('Beatstore cards need their engagement provider.');return value;}
