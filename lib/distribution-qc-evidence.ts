import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getUserSessionSecret } from './env';
import { automaticQcRevision } from './distribution-automation-policy';
import type { Release } from './types';
import { prisma } from './prisma';
import { resolvePrivateReleaseArtworkUrl } from './release-asset-resolution';
import type { Prisma } from '@prisma/client';
function stable(value: unknown): string {
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value && typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function signQcEvidence(evidence: Record<string, unknown>) {
  const { proof: _proof, ...body } = evidence; void _proof;
  return createHmac('sha256',getUserSessionSecret()).update('HYMN-automatic-QC-v2\n').update(stable(body)).digest('hex');
}
export function validQcEvidence(evidence: unknown): boolean {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return false;
  const value=evidence as Record<string,unknown>;
  if(typeof value.proof!=='string'||!/^[a-f0-9]{64}$/.test(value.proof))return false;
  return timingSafeEqual(Buffer.from(value.proof,'hex'),Buffer.from(signQcEvidence(value),'hex'));
}
export function assertCurrentAutomaticQc(release: Release, expectedRevision: string) {
  const qc=release.metadata?.autoQc as Record<string,unknown>|undefined;
  if (!qc || !validQcEvidence(qc) || qc.status!=='passed' || qc.revision!==expectedRevision || automaticQcRevision(release)!==expectedRevision) throw Error('This release changed or has no verified automatic QC result. Recheck the current revision before delivery.');
}

/** Human approval belongs to the package, not its transport status/version. */
export function manualQcPackageRevision(release: Release) {
  return automaticQcRevision({ ...release, recordVersion: undefined });
}
export function hasCurrentManualQcEvidence(release: Release): boolean {
  const qc = release.metadata?.manualQc as Record<string, unknown> | undefined;
  return Boolean(['approved', 'queued_for_distribution', 'submitting_to_distributor'].includes(release.status) && qc && validQcEvidence(qc) && qc.status === 'passed' && qc.releaseId === release.id &&
    (qc.packageRevision ? qc.packageRevision === manualQcPackageRevision(release) : release.status === 'approved' && qc.reviewedVersion === release.recordVersion));
}
export async function manualQcSourceRevision(release: Release, db: Pick<Prisma.TransactionClient, 'release' | 'storedAsset'> = prisma) {
  const artwork = await resolvePrivateReleaseArtworkUrl({ userId: release.userId, releaseId: release.id, value: release.artworkUrl }, db);
  const sources = [];
  for (const url of [artwork, ...(release.tracks || []).map(track => track.audioUrl)]) {
    const id = Number(new URL(url || '', 'https://hymn.local').pathname.match(/^\/api\/assets\/(\d+)\/download$/)?.[1]);
    const asset = id ? await db.storedAsset.findFirst({ where: { id, ownerUserId: release.userId, deletedAt: null, uploadStatus: 'ready' }, select: { id: true, checksum: true } }) : null;
    sources.push({ url, asset });
  }
  return createHmac('sha256', getUserSessionSecret()).update(stable(sources)).digest('hex');
}
export async function assertCurrentManualQc(release: Release, revision: string) {
  const qc = release.metadata?.manualQc as Record<string, unknown> | undefined;
  if (!hasCurrentManualQcEvidence(release) || qc?.packageRevision !== revision || !qc.sourceRevision || qc.sourceRevision !== await manualQcSourceRevision(release)) {
    throw Error('The manually approved package or its files changed. Review the current package before delivery.');
  }
}

/** Check the actual selected sources again under the delivery lock. Display URLs
 * stay stable when a customer replaces artwork, so a URL hash alone is not enough. */
export async function assertAutomaticQcSources(release: Release) {
  const qc=release.metadata?.autoQc as {assetChecks?:{id:number;checksum:string}[]} | undefined;
  const artwork=await resolvePrivateReleaseArtworkUrl({userId:release.userId,releaseId:release.id,value:release.artworkUrl});
  for(const url of [artwork,...(release.tracks||[]).map(track=>track.audioUrl)]) {
    const id=Number(new URL(url,'https://hymn.local').pathname.match(/^\/api\/assets\/(\d+)\/download$/)?.[1]);
    const asset=id?await prisma.storedAsset.findFirst({where:{id,ownerUserId:release.userId,deletedAt:null,uploadStatus:'ready'},select:{id:true,checksum:true}}):null;
    if(!asset||!qc?.assetChecks?.some(check=>check.id===asset.id&&check.checksum===asset.checksum))throw Error('The selected private files changed after automatic QC. Recheck before delivery.');
  }
}
