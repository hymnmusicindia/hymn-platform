"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CustomerOverlay } from './customer-overlay';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import './playlist-review-marketplace.css';
export function ReleaseCurationInvitation({ releaseId }: { releaseId: number | string }) {
  const [open, setOpen] = useState(false);
  const ref = useAccessibleDialog(open, () => setOpen(false));
  useEffect(() => {
    const key = `hymn:curation-invitation:${releaseId}`;
    try { if (sessionStorage.getItem(key)) return; } catch {}
    const timer = setTimeout(() => { try { sessionStorage.setItem(key, 'shown'); } catch {} setOpen(true); }, 3500);
    return () => clearTimeout(timer);
  }, [releaseId]);
  return <CustomerOverlay open={open}><div className="playlist-dialog-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="curation-invite-heading" className="playlist-review-dialog" style={{ maxWidth: 480 }} tabIndex={-1}><header className="playlist-dialog-heading"><h2 id="curation-invite-heading">Your next listeners are out there.</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close playlist invitation">×</button></header><div className="playlist-dialog-content"><p>Looking for curators for your release? Discover playlists that fit your sound and get thoughtful feedback from ₹50.</p><p className="my-4 text-sm">Schedule your review now. We’ll remind you when your track is live and start the review once a listening link is ready. Audience growth and playlist placement aren’t guaranteed.</p><Link className="playlist-primary" href={`/dashboard/playlists?releaseId=${releaseId}`}>Explore playlists →</Link><button type="button" className="mt-4 block text-sm" onClick={() => setOpen(false)}>Maybe later</button></div></section></div></CustomerOverlay>;
}
