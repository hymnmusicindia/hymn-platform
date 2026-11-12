'use client';
import { useState } from 'react';
export function KycReviewEvidence({ userId }: { userId: number }) {
  const [evidence, setEvidence] = useState<{ status: string; documentType: string; identityAssetId: number | null; beneficiaryAssetId: number | null } | null>(null), [error, setError] = useState('');
  async function load() { setError(''); try { const response = await fetch(`/api/admin/payout-profiles/${userId}/evidence`, { cache: 'no-store' }); if (!response.ok) throw Error('Evidence could not be loaded.'); setEvidence(await response.json()); } catch { setError('Evidence could not be loaded.'); } }
  return <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><button className="btn-outline" onClick={load}>Review supporting documents</button>{evidence && <><span>{evidence.status.replaceAll('_', ' ')} · {evidence.documentType.replaceAll('_', ' ')}</span>{evidence.identityAssetId && <a href={`/api/assets/${evidence.identityAssetId}/download`} target="_blank" rel="noopener noreferrer">Identity document ↗</a>}{evidence.beneficiaryAssetId && <a href={`/api/assets/${evidence.beneficiaryAssetId}/download`} target="_blank" rel="noopener noreferrer">Beneficiary evidence ↗</a>}</>}{error && <span role="alert">{error}</span>}</div>;
}
