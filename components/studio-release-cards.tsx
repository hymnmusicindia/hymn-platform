"use client";

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ReleaseSummaryCard } from './release-summary-card';
import { getReleasePortalAction } from '@/lib/release-portal';
import type { Release } from '@/lib/types';
import styles from './studio-release-cards.module.css';

export function StudioReleaseCards({ releases }: { releases: Release[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = releases.filter(release => terms.every(term => `${release.releaseTitle || release.trackName || ''} ${release.artistName} ${release.status} ${release.upcCode || ''}`.toLocaleLowerCase().includes(term)));
  const lastPage = Math.max(0, Math.ceil(matches.length / 10) - 1);
  const current = Math.min(page, lastPage);
  return <div>
    <div className={styles.toolbar}><label><Search size={16} aria-hidden="true"/><input aria-label="Search releases" placeholder="Search releases" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/></label><span role="status">{matches.length} releases</span></div>
    {matches.length ? <div className={`release-library-grid ${styles.grid}`}>{matches.slice(current * 10, current * 10 + 10).map(release => {
      const action = getReleasePortalAction(release);
      return <ReleaseSummaryCard key={release.id} release={release} href={release.status === 'draft' ? `/distribution/start?edit=${release.id}` : action.href} actionLabel={action.label} compact/>;
    })}</div> : <div className={styles.empty}><strong>{search ? 'No matching releases' : 'No releases here yet'}</strong><p>{search ? 'Try another search or clear your filters.' : 'Your releases and drafts will appear here.'}</p>{search ? <button className="btn-outline" onClick={() => { setSearch(''); setPage(0); }}>Clear search</button> : null}</div>}
    {matches.length > 10 ? <nav className={styles.pagination} aria-label="Release pages"><span>{current * 10 + 1}–{Math.min((current + 1) * 10, matches.length)} of {matches.length}</span><button aria-label="Previous release page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button><button aria-label="Next release page" disabled={current === lastPage} onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button></nav> : null}
  </div>;
}
