"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Release } from '@/lib/types';

/** A mounted admin tab must observe submissions from other users and sessions. */
export function useAdminReleaseFeed(initial: Release[], enabled: boolean) {
  const [releases, write] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const revision = useRef(0), active = useRef(false), controller = useRef<AbortController | null>(null);
  const setReleases: Dispatch<SetStateAction<Release[]>> = useCallback(value => { revision.current++; write(value); }, []);
  useEffect(() => { setReleases(initial); }, [initial, setReleases]);
  const refresh = useCallback(async () => {
    if (!enabled || controller.current || !active.current) return;
    const request = new AbortController(); controller.current = request;
    const startedAt = revision.current; setRefreshing(true);
    try {
      const response = await fetch('/api/admin/releases', {cache:'no-store',signal:request.signal});
      if (!response.ok) throw Error('Release updates could not load. Retry to refresh this queue.');
      const data = await response.json();
      if (!Array.isArray(data.releases)) throw Error('Release updates could not load. Retry to refresh this queue.');
      if (active.current && startedAt === revision.current) write(data.releases);
      if (active.current) setError(null);
    } catch (failure) { if (active.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not refresh releases.'); }
    finally { if(controller.current === request) controller.current = null; if(active.current) setRefreshing(false); }
  }, [enabled]);
  useEffect(() => {
    active.current = true; void refresh();
    const focus = () => { if(document.visibilityState !== 'hidden') void refresh(); };
    const timer = setInterval(focus,30000);
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',focus);
    return () => { active.current = false; controller.current?.abort(); controller.current = null; clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus); };
  }, [refresh]);
  return { releases, setReleases, refresh, refreshing, error };
}
