import 'server-only';
import { prisma } from './prisma';
import type { LibraryAsset } from './user-library-types';

export async function getLibraryAssets(userId: number): Promise<LibraryAsset[]> {
  const assets = await prisma.storedAsset.findMany({
    where: { ownerUserId: userId, assetType: 'private_audio_master', uploadStatus: 'ready', deletedAt: null },
    select: { id: true, originalFilename: true, safeFilename: true, mimeType: true, byteSize: true, createdAt: true, release: { select: { status: true, artworkUrl: true } }, releaseAssetLinks: { select: { release: { select: { status: true, artworkUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 10 } },
    orderBy: { createdAt: 'desc' },
  });
  const active = new Set(['LIVE', 'DISTRIBUTED', 'IN_REVIEW', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_REVIEW']);
  return assets.map(asset => {
    const linked = asset.release?.artworkUrl ? asset.release : asset.releaseAssetLinks.find(link => Boolean(link.release.artworkUrl))?.release;
    return { id: asset.id, originalFilename: asset.originalFilename, safeFilename: asset.safeFilename, mimeType: asset.mimeType, byteSize: asset.byteSize, createdAt: asset.createdAt.toISOString(), audioUrl: `/api/assets/${asset.id}/download?filename=${encodeURIComponent(asset.safeFilename)}`, released: Boolean(asset.release && active.has(asset.release.status)) || asset.releaseAssetLinks.some(link => active.has(link.release.status)), coverArtUrl: linked && active.has(linked.status) ? linked.artworkUrl : null };
  });
}
