"use client";
import { useMemo, useState } from 'react';
import { ArrowDownUp, ArrowUpRight, Disc3, Search, ShieldCheck } from 'lucide-react';
import type { Release } from '@/lib/types';
import { adminReleaseStatusLabel } from '@/lib/release-status-presentation';
import { automationSummary, newestReleaseFirst, releaseBucket } from '@/lib/distribution-workspace';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import styles from './distribution-operations.module.css';

const views = [{ key: 'submitted', label: 'Submitted' }, { key: 'review', label: 'QC & review' }, { key: 'corrections', label: 'Corrections' }, { key: 'delivery', label: 'In delivery' }, { key: 'live', label: 'Live' }, { key: 'drafts', label: 'Drafts' }, { key: 'exceptions', label: 'Exceptions' }] as const;
export function DistributionReleaseCatalogue({ releases, search, onSearch, onOpen, assignment, onAssignment, status, onStatus, collection, onCollection }: { releases: Release[]; search: string; onSearch: (value: string) => void; onOpen: (id: number) => void; assignment: string; onAssignment: (value: string) => void; status: string; onStatus: (value: string) => void; collection?:string; onCollection?:(value:string)=>void }) {
  const [localView, setLocalView] = useState<string>('submitted'), [page, setPage] = useState(0), [sort, setSort] = useState('newest');
  const view=collection??localView;
  const setView=(value:string)=>{setLocalView(value);onCollection?.(value);};
  const counts = useMemo(() => Object.fromEntries(views.map(item => [item.key, releases.filter(release => item.key === 'submitted' ? releaseBucket(release) !== 'drafts' : releaseBucket(release) === item.key).length])), [releases]);
  const rows = useMemo(() => releases.filter(release => {
    const bucket = releaseBucket(release);
    const query = [release.releaseTitle, release.trackName, release.artistName, release.ownerEmail, release.upcCode, ...(release.tracks || []).map(track => track.isrc)].join(' ').toLowerCase();
    return (view === 'submitted' ? bucket !== 'drafts' : bucket === view) && query.includes(search.trim().toLowerCase()) && (status === 'all' || release.status === status) && (assignment === 'all' || (assignment === 'assigned' ? Boolean(release.ownerUserId || release.releaseSource !== 'ADMIN_MANUAL') : !release.ownerUserId && release.releaseSource === 'ADMIN_MANUAL'));
  }).sort((a,b) => sort === 'oldest' ? newestReleaseFirst(b,a) : sort === 'title' ? (a.releaseTitle || a.trackName).localeCompare(b.releaseTitle || b.trackName) : newestReleaseFirst(a,b)), [releases, view, search, status, assignment, sort]);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1));
  return <section className={styles.catalogue} aria-label="Distribution release catalogue">
    <nav className={styles.views} aria-label="Release collections">{views.map(item => <button type="button" key={item.key} aria-pressed={view === item.key} onClick={() => { setView(item.key); setPage(0); onStatus('all'); }}>{item.label}<b>{counts[item.key]}</b></button>)}</nav>
    <div className={styles.tools}><label><Search size={16}/><input type="search" aria-label="Search release catalogue" placeholder="Release, artist, email, UPC or ISRC" value={search} onChange={event => { onSearch(event.target.value); setPage(0); }}/></label><select aria-label="Release sort order" value={sort} onChange={event => {setSort(event.target.value);setPage(0);}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A-Z</option></select><details><summary>More filters</summary><div><select aria-label="Filter by assignment" value={assignment} onChange={event => {onAssignment(event.target.value);setPage(0);}}><option value="all">All assignments</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned manual</option></select><select aria-label="Filter by status" value={status} onChange={event => {onStatus(event.target.value);setPage(0);}}><option value="all">All statuses</option>{[...new Set(releases.map(release => release.status))].sort().map(item => <option key={item} value={item}>{adminReleaseStatusLabel(item)}</option>)}</select></div></details></div>
    <div className={styles.tableHead}><span>Release / artist</span><span>Status & QC</span><span>Owner / delivery</span><span>Received</span><ArrowDownUp size={14}/></div>
    <div className={styles.rows}>{rows.slice(current * 20, (current + 1) * 20).map(release => {
      const summary = automationSummary(release);
      return <button type="button" className={styles.row} key={release.id} onClick={() => onOpen(release.id)} aria-label={`Inspect ${release.releaseTitle || release.trackName}`}>
        <span className={styles.identity}>{release.artworkUrl ? <img src={artworkPreviewUrl(release.artworkUrl,120)} alt="" loading="lazy"/> : <i><Disc3 size={22}/></i>}<span><strong>{release.releaseTitle || release.trackName || 'Untitled release'}</strong><small>{release.artistName} / {release.releaseType.toUpperCase()} / {release.tracks?.length || 0} tracks</small></span></span>
        <span><b className={styles.status} data-bucket={releaseBucket(release)}>{adminReleaseStatusLabel(release.status, release.direNoteStatus)}</b><small title={summary.detail} data-tone={summary.tone}><ShieldCheck size={12}/>{summary.label}</small></span>
        <span><strong className={styles.owner}>{release.ownerEmail || 'Unassigned'}</strong><small>{release.paymentStatus === 'paid' ? 'Payment verified' : 'Payment pending'} / {release.upcCode || 'UPC pending'}</small></span>
        <span className={styles.date}>{new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(release.submittedAt || release.createdAt))}<small>#{release.id}</small></span><ArrowUpRight size={16}/>
      </button>;
    })}</div>
    {!rows.length && <div className={styles.empty}><Disc3 size={26}/><h3>{view === 'drafts' ? 'No drafts here' : 'Nothing in this collection'}</h3><p>{search ? 'Try a different search or clear the filters.' : 'New submissions appear automatically when the feed refreshes.'}</p></div>}
    <footer className={styles.pagination}><span>{rows.length ? current * 20 + 1 : 0}-{Math.min((current+1)*20, rows.length)} of {rows.length} releases</span><div><button type="button" disabled={!current} onClick={() => setPage(current-1)}>Previous</button><button type="button" disabled={(current+1)*20 >= rows.length} onClick={() => setPage(current+1)}>Next</button></div></footer>
  </section>;
}
