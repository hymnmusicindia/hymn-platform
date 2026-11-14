'use client';
import { useEffect, useState } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { CustomerOverlay } from '@/components/customer-overlay';
import { useAccessibleDialog } from '@/components/ui/use-accessible-dialog';

export function CorrectionStoreNotice({ releaseId }: { releaseId: number }) {
  const [open, setOpen] = useState(false);
  const [appeals, setAppeals] = useState<number | null>(null);
  const ref = useAccessibleDialog(open, () => setOpen(false));
  useEffect(() => {
    const controller = new AbortController();
    setAppeals(null);
    fetch(`/api/releases/${releaseId}/change-requests`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!controller.signal.aborted) setAppeals(Array.isArray(data.metaAppealedTrackIds) ? data.metaAppealedTrackIds.length : null);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [releaseId]);
  return <><aside className="correction-store-notice">
    <strong>Social delivery is paused for disputed recordings</strong>
    <p>Disputed tracks cannot be set for these stores or fingerprinting during correction submission.</p>
    <p>{appeals === 0 ? 'You have 1 Instagram / Facebook availability appeal per track remaining, available after the track is live on Spotify.' : 'One Instagram / Facebook availability appeal is allowed per track after it is live on Spotify. Previously submitted appeals remain in Request history.'} An appeal requires review and does not guarantee availability.</p>
    <button type="button" className="correction-support-link" onClick={() => setOpen(true)}>Contact support <ArrowUpRight size={14}/></button>
  </aside>{open ? <CustomerOverlay><div className="release-dialog-layer correction-support-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="correction-support-title" className="correction-support-dialog">
      <header><h2 id="correction-support-title">Let’s resolve your store availability</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close support options"><X size={20}/></button></header>
      <p>Your existing release and payment stay in place. Include your release ID <strong>#{releaseId}</strong> and the affected track when contacting HYMN.</p>
      <p>Once the recording is live on Spotify, open its release workspace → Requests to submit the single Instagram / Facebook availability appeal. For TikTok, Snapchat or fingerprinting eligibility, ask support to review the recorded dispute.</p>
      <a href={`/contact?releaseId=${releaseId}`}>Open HYMN support <ArrowUpRight size={16}/></a>
      <a href={`mailto:hymnmusicindia@gmail.com?subject=${encodeURIComponent(`Store availability — release #${releaseId}`)}`}>Email the support team <ArrowUpRight size={16}/></a>
    </section>
  </div></CustomerOverlay> : null}</>;
}
