import type { Release } from './types';

type Source = Pick<Release, 'metadata' | 'tracks' | 'licenseReceiptUrl' | 'license_receipt_url' | 'licenseDocumentUrl' | 'beatLicenseUrl' | 'sunoReceiptUrl' | 'suno_receipt_url' | 'sunoLink'>;
export type RightsEvidence = { label: string; href: string; privateFile: boolean };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function usable(value: unknown) {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  return /^\/api\/assets\/\d+\/download(?:\?[^#]*)?$/.test(href) || /^https?:\/\/[^\s]+$/i.test(href) ? href : null;
}
export function releaseRightsEvidence(release: Source): RightsEvidence[] {
  const metadata = object(release.metadata), rows: RightsEvidence[] = [];
  function add(label: string, candidates: unknown[]) {
    const href = candidates.map(usable).find(Boolean);
    if (href && !rows.some(row => row.href === href)) rows.push({ label, href, privateFile: href.startsWith('/api/assets/') });
  }
  const licence = ['licenseReceiptUrl', 'license_receipt_url', 'licenseDocumentUrl', 'beatLicenseUrl'] as const;
  add('Licence agreement', [...licence.map(key => release[key]), ...licence.map(key => metadata[key])]);
  add('AI generation receipt', [release.sunoReceiptUrl, release.suno_receipt_url, metadata.sunoReceiptUrl, metadata.suno_receipt_url]);
  add('AI source link', [release.sunoLink, metadata.sunoLink]);
  for (const track of release.tracks || []) {
    const data = object(track.metadata), nested = object(data.metadata);
    add(`Cover licence: ${track.trackTitle || `Track ${track.trackNumber}`}`, [track.coverLicenseUrl, data.coverLicenseUrl, nested.coverLicenseUrl]);
  }
  return rows;
}

export function evidenceDownloadUrl(evidence: RightsEvidence) {
  if (!evidence.privateFile) return evidence.href;
  const url = new URL(evidence.href, 'https://hymn.invalid');
  url.searchParams.set('download', '1');
  return url.pathname + url.search;
}
