'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, Fingerprint, Upload, Wallet } from 'lucide-react';
import { customerMessage } from '@/lib/customer-message';
import s from './artist-hub.module.css';

type Evidence = { status: string; documentType: string; identityAssetId: number | null; beneficiaryAssetId: number | null };
export function KycEvidence() {
  const [data, setData] = useState<Evidence | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [consent, setConsent] = useState(false);
  async function load() { setError(''); try { const response = await fetch('/api/payout/verification', { cache: 'no-store' }); if (!response.ok) throw Error('Verification documents could not be loaded.'); setData(await response.json()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please retry.'); } }
  useEffect(() => { void load(); }, []);
  async function save(next: Evidence, submit = false) {
    const response = await fetch('/api/payout/verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentType: next.documentType, identityAssetId: next.identityAssetId, beneficiaryAssetId: next.beneficiaryAssetId, submit, consent }) });
    const value = await response.json(); if (!response.ok) throw Error(value.error || 'Could not save documents.');
    setData({ ...next, status: value.status }); setMessage(submit ? 'Evidence submitted. File checks passed; identity review is next.' : 'Progress saved securely. You can return later.');
  }
  async function upload(kind: 'identityAssetId' | 'beneficiaryAssetId', file?: File) {
    if (!file || !data) return; setBusy(true); setError(''); setMessage('');
    try {
      if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) throw Error('Choose a JPG, PNG or PDF up to 10 MB.');
      const form = new FormData(); form.set('file', file); form.set('assetType', 'private_kyc_document');
      const response = await fetch('/api/assets', { method: 'POST', body: form }), value = await response.json();
      if (!response.ok) throw Error(value.error || 'Upload failed.');
      await save({ ...data, [kind]: value.asset.id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }
  async function submit() { if (!data) return; setBusy(true); setError(''); try { await save(data, true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please retry.'); } finally { setBusy(false); } }
  return <section className={s.card} aria-label="Inbuilt identity verification"><div className={s.sectionHeading}><div><span className={s.eyebrow}>Secure verification</span><h2>Supporting documents</h2></div><span className={s.badge}>{data?.status.replaceAll('_', ' ') || 'Loading'}</span></div><p className={s.muted}>Save your payout details first, then add evidence for HYMN’s identity and beneficiary review.</p>{error && <div className={s.notice} role="alert">{customerMessage(error)}{!data && <button onClick={load}>Retry</button>}</div>}{message && <p role="status" className={s.success}><CheckCircle2 size={17}/>{message}</p>}{data && <div className={s.dialogBody} style={{ padding: '18px 0 0' }}><div className={s.miniSteps}><span>1 · Identity</span><span>2 · Beneficiary</span><span>3 · Review</span></div><label className={s.field}>Document type<select aria-label="Document type" value={data.documentType} disabled={busy || data.status === 'submitted'} onChange={event => { setConsent(false); setData({ ...data, documentType: event.target.value }); }}><option value="government_id">Government-issued ID</option><option value="passport">Passport</option><option value="driving_licence">Driving licence</option><option value="business_registration">Business registration</option></select></label>{[{ key: 'identityAssetId' as const, label: 'Identity document', icon: Fingerprint }, { key: 'beneficiaryAssetId' as const, label: 'Bank / UPI beneficiary evidence', icon: Wallet }].map(item => <div className={s.request} key={item.key}><item.icon size={22}/><div><strong>{item.label}</strong><p className={s.muted}>{data[item.key] ? 'Uploaded securely' : 'JPG, PNG or PDF · up to 10 MB'}</p>{data[item.key] && <a href={`/api/assets/${data[item.key]}/download`} target="_blank" rel="noopener noreferrer" className={s.textButton}>View private document</a>}</div><label className={s.secondary}><Upload size={15}/>{data[item.key] ? 'Replace' : 'Upload'}<input aria-label={`Upload ${item.label}`} type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy || data.status === 'submitted'} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={event => { void upload(item.key, event.target.files?.[0]); event.target.value = ''; }}/></label></div>)}<p className={s.footnote}>Use clear, complete documents. Mask nonessential identity numbers and unrelated transactions. Only you and authorized HYMN reviewers can access these files. File checks do not establish identity or store-profile ownership.</p>{data.status !== 'submitted' && <><label className={s.consent}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>I confirm these documents are genuine and authorize HYMN to review them for identity and payout-beneficiary verification.</label><button className={s.primary} disabled={busy || !consent || !data.identityAssetId || !data.beneficiaryAssetId} onClick={submit}><FileCheck2 size={16}/>{busy ? 'Checking documents…' : 'Submit evidence'}</button></>}{data.status === 'submitted' && <p className={s.success}><CheckCircle2 size={17}/>Evidence received. HYMN will notify you about the review.</p>}</div>}</section>;
}
