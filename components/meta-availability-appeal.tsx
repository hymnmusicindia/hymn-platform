'use client';
import { useState, type FormEvent } from 'react';
import type { Release } from '@/lib/types';
import { activeAmendmentStatuses, amendmentStatusLabel } from '@/lib/release-amendment-presentation';

type AppealRequest = { id: number; requestType: string; status: string };
export function MetaAvailabilityAppeal({ release, requests, onCreated }: { release: Release; requests: AppealRequest[]; onCreated: (request: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!['live', 'partially_live'].includes(release.status)) return null;
  const active = requests.find(request => request.requestType === 'metadata_update' && activeAmendmentStatuses.includes(request.status));
  const eligible = release.tracks?.filter(track => track.isrc) ?? [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || active) return;
    const form = event.currentTarget, fields = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/releases/${release.id}/change-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'metadata_update', reason: fields.get('reason'), requestedChanges: { supportCorrection: { action: 'request_meta_not_live', trackId: Number(fields.get('trackId')), spotifyTrackUrl: fields.get('spotifyTrackUrl'), spotifyLiveConfirmed: fields.get('spotifyLiveConfirmed') === 'on' } } }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Could not save your appeal.');
      onCreated(data.request); setMessage(`Appeal #${data.request.id} saved. Follow its progress in Request history below.`); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your appeal.'); }
    finally { setBusy(false); }
  }
  return <section id="meta-availability-appeal" tabIndex={-1} className="surface-card" aria-labelledby="meta-appeal-title">
    <p className="text-xs font-semibold uppercase tracking-wide">Store availability</p>
    <h2 id="meta-appeal-title" className="mt-2 text-2xl font-semibold">Appeal Instagram / Facebook availability</h2>
    <p className="mt-2 text-sm" style={{color:'var(--text-muted)'}}>Is your track live on Spotify but missing from Instagram or Facebook music? Submit a tracked appeal to HYMN. Choose one affected track per request.</p>
    <p className="mt-3 text-sm">A previous rejection such as NO CONTENT ID still requires review. An appeal does not override eligibility rules or guarantee delivery.</p>
    {active ? <p role="status" className="mt-4 text-sm font-semibold">Request #{active.id}: {amendmentStatusLabel(active.status)}. Follow or respond to your existing request in Request history below before submitting another.</p> : null}
    {!release.upcCode || !eligible.length ? <p className="mt-4 text-sm">HYMN must confirm your release UPC and track ISRC before you can appeal.</p> : null}
    <form onSubmit={submit} className="mt-5"><fieldset disabled={busy || Boolean(active) || !release.upcCode || !eligible.length} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid min-w-0 gap-2 text-sm">Affected track<select className="field" name="trackId" required>{eligible.map(track => <option key={track.id} value={track.id}>{track.trackNumber}. {track.trackTitle} - {track.isrc}</option>)}</select></label>
      <label className="grid min-w-0 gap-2 text-sm">Live Spotify track link<input className="field" type="url" name="spotifyTrackUrl" required placeholder="https://open.spotify.com/track/..." /></label>
      <label className="grid gap-2 text-sm sm:col-span-2">What is missing or what rejection did you receive?<textarea className="field" name="reason" rows={3} minLength={10} maxLength={2000} required placeholder="Tell us whether the track is missing from Instagram, Facebook, or both, and include any rejection reason." /></label>
      <label className="flex items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" name="spotifyLiveConfirmed" required className="mt-1" />I confirm that this exact recording is currently playable on Spotify.</label>
      <p className="text-sm sm:col-span-2" style={{color:'var(--text-muted)'}}>HYMN checks your request and tracks it through review. The usual partner review window is 7 working days after receipt; store availability may take longer. You will receive updates in HYMN and by email.</p>
      <button className="btn-primary" type="submit">{busy ? 'Saving appeal...' : 'Submit Meta availability appeal'}</button>
    </fieldset><p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p></form>
  </section>;
}
