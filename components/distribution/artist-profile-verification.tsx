"use client";

import { useEffect, useRef, useState } from 'react';
import { useAccessibleDialog } from '@/components/ui/use-accessible-dialog';
import { artistProfileFields, validateArtistProfileLinks, type ArtistProfileLinkField } from '@/lib/artist-profile-links';
import { Check, ExternalLink, Pencil, Plus, X } from 'lucide-react';
import styles from './artist-profile-verification.module.css';

type Artist = { artistCardId: number; name: string; fingerprint: string; spotifyUrl: string | null; appleUrl: string | null; youtubeUrl: string | null; instagramUrl: string | null };
type Entry = Artist & { openedSpotifyUrl: string; approved: boolean; editing: Partial<Record<ArtistProfileLinkField, boolean>> };
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
      setRequest({ releaseId, artistCardIds, artists: data.artists.map(artist => ({ ...artist, openedSpotifyUrl: '', approved: false, editing: Object.fromEntries(Object.keys(validateArtistProfileLinks(artist).errors).map(field => [field, true])) })) });
    });
  }
  function patch(id: number, values: Partial<Entry>) {
    setError(null);
    setRequest(current => current ? { ...current, artists: current.artists.map(artist => artist.artistCardId === id ? { ...artist, ...values } : artist) } : null);
  }
  async function approve() {
    if (!request || busy) return;
    if (request.artists.some(artist => Object.keys(validateArtistProfileLinks(artist).errors).length || !artist.approved)) return;
    setBusy(true); setError(null);
    try {
      const data = await api({ action: 'approve', releaseId: request.releaseId, artistCardIds: request.artistCardIds, approvals: request.artists.map(artist => ({ artistCardId: artist.artistCardId, fingerprint: artist.fingerprint, spotifyUrl: artist.spotifyUrl, appleUrl: artist.appleUrl, youtubeUrl: artist.youtubeUrl, instagramUrl: artist.instagramUrl, openedSpotifyUrl: artist.openedSpotifyUrl, approved: artist.approved })) });
      if (data.artists.length) throw Error('An artist profile changed. Close this check and retry with the latest version.');
      finish(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your approval.'); }
    finally { setBusy(false); }
  }
  const dialog = request ? (
    <div className={styles.overlay}>
      <section ref={node => { dialogRef.current = node; }} role="dialog" aria-modal="true" aria-labelledby="artist-verification-title" aria-describedby="artist-verification-description" tabIndex={-1} className={styles.dialog}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Artist profile check</p><h2 id="artist-verification-title">Your music. The right profiles.</h2></div>
          <button type="button" aria-label="Close artist profile check" disabled={busy} onClick={() => finish(false)} className={styles.iconButton}><X size={18}/></button>
          <p id="artist-verification-description" className={styles.description}>Review the saved links below. Open Spotify to confirm the artist. YouTube and the other optional links can be left empty.</p>
        </header>
        <div className={styles.body}>
          {request.artists.map(artist => {
            const validation = validateArtistProfileLinks(artist);
            const spotify = validation.links.spotifyUrl;
            const opened = Boolean(spotify && artist.openedSpotifyUrl === spotify);
            return <article key={artist.artistCardId} className={styles.artist}>
              <div className={styles.artistHeading}><h3>{artist.name}</h3><span>{artist.approved ? <><Check size={13}/> Confirmed</> : 'Review profiles'}</span></div>
              <div className={styles.links}>{artistProfileFields.map(field => {
                const value = artist[field.key] || '';
                const url = validation.links[field.key];
                const issue = validation.errors[field.key];
                const inputId = `artist-${artist.artistCardId}-${field.key}`;
                const edit = () => patch(artist.artistCardId, { editing: { ...artist.editing, [field.key]: true }, approved: false });
                return <div key={field.key} className={styles.linkRow}>
                  <div className={styles.linkHeading}><label htmlFor={inputId}>{field.label}</label><span>{field.optional ? 'Optional' : 'Confirm profile'}</span></div>
                  {artist.editing[field.key] ? <input id={inputId} type="url" inputMode="url" maxLength={500} value={value} disabled={busy} onChange={event => patch(artist.artistCardId, { [field.key]: event.target.value, approved: false, ...(field.key === 'spotifyUrl' ? { openedSpotifyUrl: '' } : {}) })} aria-label={`${field.label} link for ${artist.name}`} aria-invalid={Boolean(issue)} aria-describedby={issue ? `${inputId}-error` : undefined} className={styles.input} autoComplete="off" placeholder={field.placeholder}/> : <p className={styles.url}>{value || 'Not added'}</p>}
                  <div className={styles.linkActions}>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => { if (field.key === 'spotifyUrl') patch(artist.artistCardId, { openedSpotifyUrl: url, approved: false }); }}>Open {field.label} profile <ExternalLink size={13}/></a> : null}
                    {!artist.editing[field.key] ? <button type="button" disabled={busy} onClick={edit}>{value ? <Pencil size={13}/> : <Plus size={13}/>} {value ? 'Edit' : 'Add link'}</button> : null}
                    {field.optional && value ? <button type="button" aria-label={`Remove ${field.label} link for ${artist.name}`} disabled={busy} onClick={() => patch(artist.artistCardId, { [field.key]: '', approved: false })}><X size={13}/> Remove</button> : null}
                  </div>
                  {issue ? <p id={`${inputId}-error`} className={styles.fieldError}>{issue}</p> : null}
                </div>;
              })}</div>
              <p className={styles.note}>Approved changes apply to this and future releases. Earlier deliveries keep their saved profile mapping.</p>
              <label className={styles.confirmation}>
                <input type="checkbox" disabled={busy || !opened || Boolean(Object.keys(validation.errors).length)} checked={artist.approved} onChange={event => patch(artist.artistCardId, { approved: event.target.checked })}/>
                <span>I opened Spotify, checked this artist's links and approve the profiles shown above.</span>
              </label>
              {!opened ? <p className={styles.hint}>Open the Spotify profile above to enable confirmation.</p> : null}
            </article>;
          })}
          {error ? <p role="alert" className={styles.fieldError}>{error}</p> : null}
        </div>
        <footer className={styles.footer}>
          <button type="button" disabled={busy} onClick={() => finish(false)}>Back to release</button>
          <button type="button" className={styles.primary} disabled={busy || request.artists.some(artist => !artist.approved || Object.keys(validateArtistProfileLinks(artist).errors).length)} onClick={() => void approve()}>{busy ? 'Saving approval...' : 'Confirm and continue'}</button>
        </footer>
      </section>
    </div>
  ) : null;
  return { verify, dialog, open: Boolean(request) };
}
