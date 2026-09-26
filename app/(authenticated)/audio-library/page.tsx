import { getCurrentUserForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AudioLibraryClient } from "@/components/audio-library-client";

export default async function AudioLibraryPage() {
  const user = await getCurrentUserForPage();
  if (!user) return null;
  const assets = await (prisma.storedAsset.findMany({
    where: { ownerUserId: user.id, assetType: "private_audio_master", uploadStatus: "ready", deletedAt: null },
    select: { id: true, originalFilename: true, safeFilename: true, mimeType: true, byteSize: true, createdAt: true, release: { select: { status: true, artworkUrl: true } }, releaseAssetLinks: { select: { release: { select: { status: true, artworkUrl: true } } }, orderBy: { createdAt: "desc" }, take: 10 } },
    orderBy: { createdAt: "desc" }
  })) as any[];
  return <AudioLibraryClient assets={assets.map((asset) => { const linkedRelease = asset.release?.artworkUrl ? asset.release : asset.releaseAssetLinks.find((link: { release: { artworkUrl: string | null; status: string } }) => Boolean(link.release.artworkUrl))?.release; const activeStatuses = ["LIVE", "DISTRIBUTED", "IN_REVIEW", "SUBMITTED", "UNDER_REVIEW", "AWAITING_REVIEW"]; return { id: asset.id, originalFilename: asset.originalFilename, safeFilename: asset.safeFilename, mimeType: asset.mimeType, byteSize: asset.byteSize, createdAt: asset.createdAt.toISOString(), released: activeStatuses.includes(asset.release?.status) || asset.releaseAssetLinks.some((link: { release: { status: string } }) => activeStatuses.includes(link.release.status)), coverArtUrl: linkedRelease && activeStatuses.includes(linkedRelease.status) ? linkedRelease.artworkUrl : null }; })} />;
}
