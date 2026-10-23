import 'server-only';
import { prisma } from '@/lib/prisma';
/** Membership plus a release assignment is required for every private read. */
export async function canReadAssignedQcAsset(userId: number, assetId: number) {
  const asset = await prisma.storedAsset.findFirst({ where: { id: assetId, deletedAt: null, assetType: { in: ['private_audio_master', 'private_unreleased_artwork', 'private_ownership_proof', 'private_cover_licence', 'private_ai_receipt'] } }, select: { releaseId: true, ownerUserId: true, releaseAssetLinks: { select: { releaseId: true } } } });
  if (!asset) return false;
  const ids = [...new Set([asset.releaseId, ...asset.releaseAssetLinks.map(l => l.releaseId)].filter((v): v is number => Boolean(v)))];
  if (!ids.length) return false;
  return Boolean(await prisma.teamTask.findFirst({ where: { recordType: 'release', recordId: { in: ids }, eventKey: { startsWith: 'release-qc:' }, archivedAt: null, status: { not: 'CANCELLED' }, owner: { userId, status: 'ACTIVE', user: { status: 'ACTIVE' }, role: { permissions: { has: 'operations.distribution.qc' } } } }, select: { id: true } }));
}
