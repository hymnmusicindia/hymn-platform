"use client";
import { useEffect } from 'react';
import { serviceForPath } from '@/lib/team/service-interest';
/** Explicit service-link clicks only; no page scraping, inferred identity or outbound messages. */
export function CustomerServiceInterestTracker() {
  useEffect(() => {
    const recorded = new Set<string>();
    function clicked(event: MouseEvent) {
      if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]'); if (!link) return;
      const url = new URL(link.href, location.origin);
      if (url.origin !== location.origin || !serviceForPath(url.pathname) || recorded.has(url.pathname)) return;
      recorded.add(url.pathname);
      void fetch('/api/team/customer-interest', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: url.pathname }), keepalive: true }).catch(() => { recorded.delete(url.pathname); });
    }
    document.addEventListener('click', clicked, true);
    return () => document.removeEventListener('click', clicked, true);
  }, []);
  return null;
}
