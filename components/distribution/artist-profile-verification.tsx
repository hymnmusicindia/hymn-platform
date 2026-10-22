"use client";

import { useEffect, useRef, useState } from 'react';
import { useAccessibleDialog } from '@/components/ui/use-accessible-dialog';
import { verifiedArtistStoreLinks } from '@/lib/artist-store-links';

type Artist = { artistCardId: number; name: string; fingerprint: string; spotifyUrl: string | null; appleUrl: string | null; youtubeUrl: string | null; instagramUrl: string | null };
type Entry = Artist & { openedSpotifyUrl: string; approved: boolean; editing: boolean };
async function api(body: unknown) {
  const response = await fetch('/api/distribution/artist-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Could not check artist profiles. Please retry.');
  return data as { artists: Artist[] };
}

export function useArtistProfileVerification() {
  const [request, setRequest] = useState<{ releaseId: number; artistCardIds: number[]; artists: Entry[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const finish = (value: boolean) => { resolveRef.current?.(value); resolveRef.current = null; setRequest(null); setError(null); };
  const dialogRef = useAccessibleDialog(Boolean(request), () => { if (!busy) finish(false); });
  useEffect(() => () => { resolveRef.current?.(false); }, []);
  async function verify(releaseId: number, artistCardIds: number[]) {
    const data = await api({ action: 'prepare', releaseId, artistCardIds });
    if (!data.artists.length) return true;
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setRequest({ releaseId, artistCardIds, artists: data.artists.map(artist => ({ ...artist, openedSpotifyUrl: '', approved: false, editing: !artist.spotifyUrl })) });
    });
  }
  function patch(id: number, values: Partial<Entry>) {
    setRequest(current => current ? { ...current, artists: current.artists.map(artist => artist.artistCardId === id ? { ...artist, ...values } : artist) } : null);
  }
  async function approve() {
    if (!request || busy) return;
    setBusy(true); setError(null);
    try {
      const data = await api({ action: 'approve', releaseId: request.releaseId, artistCardIds: request.artistCardIds, approvals: request.artists.map(artist => ({ artistCardId: artist.artistCardId, fingerprint: artist.fingerprint, spotifyUrl: artist.spotifyUrl, appleUrl: artist.appleUrl, youtubeUrl: artist.youtubeUrl, instagramUrl: artist.instagramUrl, openedSpotifyUrl: artist.openedSpotifyUrl, approved: artist.approved })) });
      if (data.artists.length) throw Error('An artist profile changed. Close this check and retry with the latest version.');
      finish(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your approval.'); }
    finally { setBusy(false); }
  }
  const dialog = request ? (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section ref={node => { dialogRef.current = node; }} role="dialog" aria-modal="true" aria-labelledby="artist-verification-title" aria-describedby="artist-verification-description" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl border p-5 shadow-2xl sm:p-7" style={{ background: 'var(--card, #1d2530)', borderColor: 'var(--border, #39414e)', color: 'var(--text, #fff)' }}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted, #c5cad2)' }}>Artist profile check</p>
        <h2 id="artist-verification-title" className="text-xl font-semibold">Send your music to the right profile</h2>
        <p id="artist-verification-description" className="mt-2 text-sm leading-6" style={{ color: 'var(--text-muted, #c5cad2)' }}>This artist card already has live music. Open the Spotify link and check that it is your intended artist page before continuing.</p>
        <div className="mt-5 space-y-5">
          {request.artists.map(artist => {
            const spotify = verifiedArtistStoreLinks({ spotify: artist.spotifyUrl }).spotify?.url;
            const opened = Boolean(spotify && artist.openedSpotifyUrl === spotify);
            return <div key={artist.artistCardId} className="border-t pt-4" style={{ borderColor: 'var(--border, #39414e)' }}>
              <h3 className="font-semibold">{artist.name}</h3>
              {artist.editing ? <div className="mt-3 space-y-3">
                {(['spotifyUrl', 'appleUrl', 'youtubeUrl', 'instagramUrl'] as const).map((field, index) => <label key={field} className="block text-sm">{['Spotify artist link', 'Apple Music artist link (optional)', 'YouTube channel (optional)', 'Instagram profile (optional)'][index]}
                  <input type="url" value={artist[field] || ''} disabled={busy} onChange={event => patch(artist.artistCardId, { [field]: event.target.value, approved: false, ...(field === 'spotifyUrl' ? { openedSpotifyUrl: '' } : {}) })} className="mt-1 block min-h-11 w-full rounded-xl border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--border, #596374)' }} autoComplete="off" placeholder={field === 'spotifyUrl' ? 'https://open.spotify.com/artist/...' : 'https://...'} />
                </label>)}
                <p className="text-xs leading-5" style={{ color: 'var(--text-muted, #c5cad2)' }}>Approved corrections update this card for this and future releases. Earlier releases keep their saved mapping; this does not move music that is already live.</p>
              </div> : <p className="mt-2 break-all text-xs" style={{ color: 'var(--text-muted, #c5cad2)' }}>{artist.spotifyUrl}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {spotify ? <a href={spotify} target="_blank" rel="noopener noreferrer" onClick={() => patch(artist.artistCardId, { openedSpotifyUrl: spotify, approved: false })} className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold" style={{ borderColor: 'var(--border, #596374)' }}>Open Spotify profile <span aria-hidden="true" className="ml-2">↗</span></a> : <span className="text-xs" style={{ color: 'var(--text-muted, #c5cad2)' }}>Enter a valid Spotify artist link to open it.</span>}
                {!artist.editing ? <button type="button" disabled={busy} onClick={() => patch(artist.artistCardId, { editing: true, approved: false })} className="min-h-11 px-1 text-sm">Wrong link? Edit</button> : null}
              </div>
              <label className={`mt-3 flex min-h-11 items-start gap-3 text-sm leading-6 ${!opened ? 'opacity-60' : ''}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-white" disabled={busy || !opened} checked={artist.approved} onChange={event => patch(artist.artistCardId, { approved: event.target.checked })} />
                <span>I opened this link and confirm it is the artist profile for this release. I approve any corrections above.</span>
              </label>
            </div>;
          })}
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} onClick={() => finish(false)} className="min-h-11 rounded-full border px-5 text-sm" style={{ borderColor: 'var(--border, #596374)' }}>Back to release</button>
          <button type="button" disabled={busy || request.artists.some(artist => !artist.approved)} onClick={() => void approve()} className="min-h-11 rounded-full bg-[#edf3fc] px-5 text-sm font-semibold text-[#17202d] disabled:opacity-40">{busy ? 'Saving approval...' : 'Confirm and continue'}</button>
        </div>
      </section>
    </div>
  ) : null;
  return { verify, dialog, open: Boolean(request) };
}
