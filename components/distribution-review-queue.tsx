"use client";
import { useState } from 'react';
import { ArrowUpRight, Disc3 } from 'lucide-react';
import type { Release } from '@/lib/types';
import { automationSummary, newestReleaseFirst } from '@/lib/distribution-workspace';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import { adminReleaseStatusLabel } from '@/lib/release-status-presentation';
import styles from './distribution-operations.module.css';
export function DistributionReviewQueue({ releases, selectedId, onSelect }: { releases: Release[]; selectedId?: number; onSelect: (id: number) => void }) {
  const [page,setPage] = useState(0);
  const sorted = [...releases].sort(newestReleaseFirst), current = Math.min(page,Math.max(0,Math.ceil(sorted.length/15)-1));
  return <div className={styles.reviewQueue}><div className={styles.reviewRows}>{sorted.slice(current*15,(current+1)*15).map(release => {
    const summary=automationSummary(release);
    return <button type="button" className={styles.reviewRow} key={release.id} aria-pressed={selectedId===release.id} onClick={()=>onSelect(release.id)}><span className={styles.identity}>{release.artworkUrl?<img src={artworkPreviewUrl(release.artworkUrl,120)} alt="" loading="lazy"/>:<i><Disc3 size={20}/></i>}<span><strong>{release.releaseTitle||release.trackName}</strong><small>{release.artistName} / {release.tracks?.length||0} tracks</small></span></span><span className={styles.reviewState}><small>{adminReleaseStatusLabel(release.status,release.direNoteStatus)}</small><b data-tone={summary.tone}>{summary.label}</b></span><ArrowUpRight size={14}/></button>;
  })}</div>{!sorted.length&&<p className={styles.empty}>No releases need attention in this queue.</p>}<footer className={styles.pagination}><span>{sorted.length} matching submissions / newest first</span><div><button type="button" disabled={!current} onClick={()=>setPage(current-1)}>Previous</button><button type="button" disabled={(current+1)*15>=sorted.length} onClick={()=>setPage(current+1)}>Next</button></div></footer></div>;
}
