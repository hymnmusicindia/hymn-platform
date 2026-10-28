"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Release } from '@/lib/types';
import { newestReleaseFirst, releaseBucket } from '@/lib/distribution-workspace';

/** A mounted admin tab must observe submissions from other users and sessions. */
export function useAdminReleaseFeed(initial: Release[], enabled: boolean) {
  const [releases, write] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [arrivals, setArrivals] = useState(0), [updatedAt, setUpdatedAt] = useState<string|null>(null);
  const known = useRef(new Map(initial.map(release => [release.id, releaseBucket(release)])));
  const latest=useRef(initial);
  const cursor=useRef<{since:string;afterId:number;until?:string}|null>(null);
  const revision = useRef(0), active = useRef(false), controller = useRef<AbortController | null>(null);
  const setReleases: Dispatch<SetStateAction<Release[]>> = useCallback(value => { revision.current++; write(value); }, []);
  useEffect(() => { setReleases(initial); }, [initial, setReleases]);
  useEffect(()=>{latest.current=releases;},[releases]);
  const refresh = useCallback(async (fullSnapshot=false) => {
    if (!enabled || controller.current || !active.current) return;
    const request = new AbortController(); controller.current = request;
    const startedAt = revision.current; setRefreshing(true);
    try {
      let incoming=[...latest.current],nextCursor=fullSnapshot?null:cursor.current;
      for(let batch=0;batch<5;batch++) {
        const query=nextCursor?`?${new URLSearchParams({since:nextCursor.since,afterId:String(nextCursor.afterId),...(nextCursor.until?{until:nextCursor.until}:{})})}`:'';
        const response=await fetch(`/api/admin/releases${query}`,{cache:'no-store',signal:request.signal});
        if(!response.ok)throw Error('Release updates could not load. Retry to refresh this queue.');
        const data=await response.json();
        if(!Array.isArray(data.releases))throw Error('Release updates could not load. Retry to refresh this queue.');
        if(data.mode==='delta') {
          const removed=new Set<number>(Array.isArray(data.removedIds)?data.removedIds:[]),merged=new Map(incoming.filter(release=>!removed.has(release.id)).map(release=>[release.id,release]));
          for(const release of data.releases as Release[])merged.set(release.id,release);
          incoming=[...merged.values()];
        }else incoming=data.releases;
        nextCursor=typeof data.watermark==='string'?data.next?{since:data.next.since,afterId:data.next.afterId,until:data.watermark}:{since:new Date(Date.parse(data.watermark)-30000).toISOString(),afterId:0}:null;
        if(!data.next)break;
      }
      if (active.current && startedAt === revision.current) {
        const fresh = incoming.filter(release => releaseBucket(release) !== 'drafts' && (!known.current.has(release.id) || known.current.get(release.id) === 'drafts'));
        setArrivals(count => count + fresh.length);
        known.current = new Map(incoming.map(release => [release.id,releaseBucket(release)]));
        cursor.current=nextCursor;latest.current=incoming;
        write([...incoming].sort(newestReleaseFirst)); setUpdatedAt(new Date().toISOString());
      }
      if (active.current) setError(null);
    } catch (failure) { if (active.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not refresh releases.'); }
    finally { if(controller.current === request) controller.current = null; if(active.current) setRefreshing(false); }
  }, [enabled]);
  useEffect(() => {
    active.current = true; void refresh();
    const focus = () => { if(document.visibilityState !== 'hidden') void refresh(); };
    const timer = setInterval(focus,15000);
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',focus);
    return () => { active.current = false; controller.current?.abort(); controller.current = null; clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus); };
  }, [refresh]);
  return { releases, setReleases, refresh, refreshing, error, arrivals, dismissArrivals: () => setArrivals(0), updatedAt };
}
