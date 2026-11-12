"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock3, Headphones, Search } from 'lucide-react';
import { CustomerDialog } from './customer-dialog';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import type { RecommendationContext } from '@/lib/playlist-recommendations';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import './playlist-review-marketplace.css';
import './release-curation-invitation.css';
type SuggestedPlaylist = { id: number; name: string; image: string | null; reason: string };
export function ReleaseCurationInvitation({ releaseId, context = {} }: { releaseId: number | string; context?: RecommendationContext }) {
  const [open, setOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<SuggestedPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const ref = useAccessibleDialog(open, () => setOpen(false));
  useEffect(() => {
    const key = `hymn:curation-invitation:${releaseId}`;
    try { if (sessionStorage.getItem(key)) return; } catch {}
    const timer = setTimeout(() => { try { sessionStorage.setItem(key, 'shown'); } catch {} setOpen(true); }, 3500);
    return () => clearTimeout(timer);
  }, [releaseId]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/playlist-reviews?view=recommendations&releaseId=${encodeURIComponent(releaseId)}`, { signal: controller.signal }).then(async response => response.ok ? response.json() : null).then(data => {
      const rows: SuggestedPlaylist[] = data?.recommendations || [];
      setRecommendations(rows); setSelectedId(rows[0]?.id || null);
    }).catch(() => {});
    return () => controller.abort();
  }, [open, releaseId]);
  const href = `/dashboard/playlists?releaseId=${encodeURIComponent(releaseId)}${selectedId ? `&playlistId=${selectedId}` : ''}`;
  return <CustomerDialog open={open} dialogRef={ref} titleId="curation-invite-heading" title="Your next listeners start here" eyebrow="Playlist discovery" description="Find a curator whose playlist fits your sound. Review fees do not guarantee placement or listener growth." onClose={() => setOpen(false)} closeLabel="Close playlist invitation" footer={<div className="curation-invitation-footer"><div><strong>From ₹50</strong><span>per HYMN playlist review</span></div><a className="btn-primary" href={href} onClick={() => setOpen(false)}>Find curators for my song <ArrowRight size={17} /></a><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Maybe later</button><small>Suggestions use your release tags, not audio analysis. Review fees don’t guarantee placement or listener growth.</small></div>}>
    <div className="curation-invitation-tags">{[context.genre, context.mood, context.releaseType].filter(Boolean).map(tag => <span key={tag}>{tag}</span>)}</div>
    <div className="curation-invitation-picks"><div className="curation-picks-heading"><strong>Suggested starting points</strong><span>Check the fit before submitting</span></div>{recommendations.length ? <div className="curation-picks-grid">{recommendations.map(row => <button type="button" key={row.id} className="curation-pick" aria-pressed={selectedId === row.id} onClick={() => setSelectedId(row.id)}><div className="curation-pick-art">{row.image ? <img src={artworkPreviewUrl(`/assets/playlist-images/previews/${row.image}.webp`, 192)} alt={`${row.name} playlist`} width={180} height={180} /> : <Headphones size={32} />}<span className="curation-pick-check" aria-hidden="true">{selectedId === row.id ? <Check size={13} /> : null}</span></div><div><strong>{row.name}</strong><span>{row.reason}</span></div></button>)}</div> : <div className="curation-picks-empty"><Headphones size={22} /><span>Explore available curators and choose your fit.</span></div>}</div>
    <ol className="curation-invitation-steps"><li><Search size={16} /><span>Choose your curator</span></li><li><Clock3 size={16} /><span>Starts when live</span></li><li><Headphones size={16} /><span>Get real feedback</span></li></ol>
  </CustomerDialog>;
}
