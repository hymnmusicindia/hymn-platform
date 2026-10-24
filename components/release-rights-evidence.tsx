"use client";
import { useEffect, useId, useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import type { Release } from '@/lib/types';
import { evidenceDownloadUrl, releaseRightsEvidence, type RightsEvidence } from '@/lib/release-rights-evidence';

export function ReleaseCorrectionNotice({ release, review }: { release: Release; review: () => void }) {
  const attached = releaseRightsEvidence(release).length > 0;
  return <div role="status" className="rounded-xl border p-4 text-sm" style={{ borderColor:'var(--border)', background:'var(--accent-soft)' }}><strong>Corrections received - ready for review</strong><p className="mt-1">{attached ? 'Check the updated rights evidence before approving delivery.' : 'Review the updated release details before approving delivery. No licence or rights-evidence document is attached to this release.'} The earlier delivery report has not yet received this corrected version.</p><button type="button" className="btn-outline mt-3 inline-flex" onClick={review}>{attached ? 'Review attached evidence' : 'Review rights & corrections'}</button></div>;
}

export function ReleaseRightsEvidence({ release }: { release: Release }) {
  const evidence = releaseRightsEvidence(release), headingId = useId();
  const [active, setActive] = useState<RightsEvidence | null>(null), [preview, setPreview] = useState<{ url: string; image: boolean } | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); let objectUrl = '';
    setPreview(null); setError('');
    void fetch(active.href, { signal:controller.signal, cache:'no-store' }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'You do not have access to this attachment.' : response.status === 404 ? 'This attachment is unavailable. Ask the submitter to upload it again.' : 'The attachment could not be loaded. Try opening it in a new tab.');
      const blob = await response.blob();
      if (blob.type !== 'application/pdf' && !['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('This file cannot be previewed here. Use Open or Download to review it.');
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setPreview({ url:objectUrl, image:blob.type.startsWith('image/') });
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load attachment.'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [active]);
  return <section id="release-rights-evidence" tabIndex={-1} aria-labelledby={headingId} className="rounded-xl border p-4" style={{ borderColor:'var(--border)', scrollMarginTop:100 }}>
    <h3 id={headingId} className="flex items-center gap-2 font-semibold"><FileText size={18}/>Attached rights evidence</h3>
    {!evidence.length ? <p className="mt-3 text-sm" style={{ color:'var(--text-muted)' }}>No licence or rights-evidence document is attached to this release. Check the declared ownership type and request a document from the submitter if one is needed.</p> : <div className="mt-3 grid gap-3">{evidence.map(row => <article key={row.href} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor:'var(--border)' }}><strong className="text-sm">{row.label}</strong><div className="flex flex-wrap gap-2">{row.privateFile && <button type="button" className="btn-outline inline-flex min-h-10 items-center gap-2 px-3 text-xs" onClick={() => setActive(row)} aria-label={`Preview ${row.label}`}><FileText size={14}/>Preview</button>}<a href={row.href} target="_blank" rel="noopener noreferrer" className="btn-outline inline-flex min-h-10 items-center gap-2 px-3 text-xs" aria-label={`Open ${row.label}`}><ExternalLink size={14}/>Open</a>{row.privateFile && <a href={evidenceDownloadUrl(row)} className="btn-outline inline-flex min-h-10 items-center gap-2 px-3 text-xs" aria-label={`Download ${row.label}`}><Download size={14}/>Download</a>}</div></article>)}</div>}
    {active && <div className="mt-4"><header className="mb-3 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">{active.label}</h4><button type="button" className="btn-outline inline-flex min-h-10 items-center gap-2 px-3 text-xs" onClick={() => { setActive(null); setPreview(null); setError(''); }}><X size={14}/>Close preview</button></header>{error ? <p role="alert" className="rounded-lg border p-3 text-sm" style={{ color:'var(--danger)', borderColor:'var(--border)' }}>{error}</p> : preview ? preview.image ?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview.url} alt={active.label} className="max-h-[70vh] w-full rounded-lg object-contain"/> : <iframe title={`${active.label} preview`} src={preview.url} className="w-full rounded-lg border" style={{ height:'min(70vh,800px)', borderColor:'var(--border)' }}/> : <p role="status" className="p-4 text-sm">Loading attachment...</p>}</div>}
  </section>;
}
