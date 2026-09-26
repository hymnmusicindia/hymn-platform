import { getCurrentUserForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AudioLibraryClient } from "@/components/audio-library-client";

export default async function AudioLibraryPage() {
  const user = await getCurrentUserForPage();
  if (!user) return null;
  const assets = await (prisma.storedAsset.findMany({
    where: { ownerUserId: user.id, assetType: "private_audio_master", uploadStatus: "ready", deletedAt: null },
    select: { id: true, originalFilename: true, safeFilename: true, mimeType: true, byteSize: true, createdAt: true, release: { select: { status: true } }, releaseAssetLinks: { select: { release: { select: { status: true } } }, orderBy: { createdAt: "desc" }, take: 10 } },
    orderBy: { createdAt: "desc" }
  })) as any[];
  return <AudioLibraryClient assets={assets.map((asset) => ({ id: asset.id, originalFilename: asset.originalFilename, safeFilename: asset.safeFilename, mimeType: asset.mimeType, byteSize: asset.byteSize, createdAt: asset.createdAt.toISOString(), released: asset.release?.status === "LIVE" || asset.release?.status === "DISTRIBUTED" || asset.releaseAssetLinks.some((link: { release: { status: string } }) => link.release.status === "LIVE" || link.release.status === "DISTRIBUTED") }))} />;
}
