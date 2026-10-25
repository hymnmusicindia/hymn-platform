'use client';
import { useState, type FormEvent } from 'react';
import type { Release } from '@/lib/types';
import { correctionKinds } from '@/lib/release-correction-contract';

export function ReleaseCorrectionForm({ release, onCreated }: { release: Release; onCreated: (request: any) => void }) {
  const [action, setAction] = useState<keyof typeof correctionKinds>('request_add_artist');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  if (!['live', 'partially_live'].includes(release.status)) return null;
  const fileChange = action === 'request_cover_art_change' || action === 'request_audio_change';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, fields = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const correction: Record<string, unknown> = { action, trackId: Number(fields.get('trackId')) };
      for (const key of ['artist_name', 'artist_type', 'artist_spotify_url', 'new_artist_name', 'new_artist_spotify_url', 'direction']) if (fields.get(key)) correction[key] = fields.get(key);
      if (fileChange) {
        const upload = new FormData(); upload.set('file', fields.get('file')!); upload.set('releaseId', String(release.id));
        upload.set('assetType', action === 'request_cover_art_change' ? 'private_unreleased_artwork' : 'private_audio_master');
        setMessage('Uploading replacement securely…');
        const response = await fetch('/api/assets', { method: 'POST', body: upload }); const data = await response.json();
        if (!response.ok || !data.asset?.id) throw Error(data.error || 'Upload failed.');
        correction.assetId = data.asset.id;
      }
      const response = await fetch(`/api/releases/${release.id}/change-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'metadata_update', reason: fields.get('reason'), requestedChanges: { supportCorrection: correction } }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Could not save correction.');
      onCreated(data.request); setMessage(`Correction #${data.request.id} saved for HYMN review. Follow its progress below.`); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save correction.'); }
    finally { setBusy(false); }
  }
  return <section className="surface-card"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-semibold">Correct your live release</h2><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Choose the track and the correction. Your release stays live with its original UPC and ISRC.</p></div><span className="status-pill">UPC {release.upcCode || 'Not confirmed'}</span></div>
    <form onSubmit={submit} className="mt-5 grid gap-4"><fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm">Correction<select aria-label="Correction" className="field" value={action} onChange={event => { setAction(event.target.value as typeof action); setMessage(''); }}>{Object.entries(correctionKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="grid min-w-0 gap-2 text-sm">Track<select aria-label="Track" className="field" name="trackId" required>{release.tracks?.map(track => <option key={track.id} value={track.id}>{track.trackNumber}. {track.trackTitle} · {track.isrc || 'ISRC missing'}</option>)}</select></label>
      {['request_add_artist', 'request_remove_artist', 'request_replace_artist', 'request_swap_artist_type'].includes(action) ? <label className="grid gap-2 text-sm">{action === 'request_add_artist' ? 'Artist to add' : 'Current credited artist'}<input className="field" name="artist_name" required maxLength={255}/></label> : null}
      {action === 'request_add_artist' ? <><label className="grid gap-2 text-sm">Artist role<select name="artist_type" className="field"><option value="primary">Primary artist</option><option value="featuring">Featured artist</option></select></label><label className="grid gap-2 text-sm">Spotify artist URL (optional)<input className="field" name="artist_spotify_url" type="url" placeholder="https://open.spotify.com/artist/…"/></label></> : null}
      {action === 'request_replace_artist' ? <><label className="grid gap-2 text-sm">Replacement artist name<input className="field" name="new_artist_name" required maxLength={255}/></label><label className="grid gap-2 text-sm">Replacement Spotify artist URL (optional)<input className="field" name="new_artist_spotify_url" type="url"/></label><p className="text-sm sm:col-span-2">For the same artist linked to the wrong Spotify profile, use Other release requests below. Replacing an artist requires a different artist.</p></> : null}
      {action === 'request_swap_artist_type' ? <label className="grid gap-2 text-sm">New role<select className="field" name="direction"><option value="primary_to_featuring">Primary → featured</option><option value="featuring_to_primary">Featured → primary</option></select></label> : null}
      {fileChange ? <label className="grid gap-2 text-sm sm:col-span-2">{action === 'request_cover_art_change' ? 'JPEG · 3000 × 3000 pixels · under 10 MB' : 'WAV · 44.1 kHz · stereo · 24-bit · under 100 MB'}<input className="field" type="file" name="file" required accept={action === 'request_cover_art_change' ? 'image/jpeg' : '.wav,audio/wav'}/><small>Submit a correction to this recording, rather than a different song.</small></label> : null}
      <label className="grid gap-2 text-sm sm:col-span-2">What needs correcting?<textarea name="reason" className="field" required minLength={10} maxLength={2000} rows={3}/></label><p className="text-sm sm:col-span-2" style={{color:'var(--text-muted)'}}>HYMN reviews your request before sending it. Partner approval and a confirmed store update are separate steps.</p><button className="btn-primary" disabled={busy || !release.upcCode}>{busy ? 'Saving…' : 'Submit correction for review'}</button></fieldset><p role="status" className="text-sm">{message}</p></form></section>;
}
