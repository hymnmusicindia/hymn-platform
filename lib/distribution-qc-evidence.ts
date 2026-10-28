import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getUserSessionSecret } from './env';
import { automaticQcRevision } from './distribution-automation-policy';
import type { Release } from './types';
import { prisma } from './prisma';
import { resolvePrivateReleaseArtworkUrl } from './release-asset-resolution';
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
