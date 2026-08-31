import "server-only";

import { prisma } from "@/lib/prisma";
import { storedAssetIdFromUrl } from "@/lib/release-media";

function releaseArtworkRouteId(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const pathname = new URL(value, "https://hymn.local").pathname;
    const id = Number(pathname.match(/^\/api\/releases\/(\d+)\/artwork$/)?.[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function assetDownloadPath(asset: { id: number; safeFilename: string }) {
  return `/api/assets/${asset.id}/download?filename=${encodeURIComponent(asset.safeFilename)}`;
}

export async function resolvePrivateReleaseArtworkUrl(input: { userId: number; releaseId?: number | null; value?: string | null }) {
  const value = input.value?.trim();
  if (!value) return "";
  if (storedAssetIdFromUrl(value)) return value;

  const routedReleaseId = releaseArtworkRouteId(value);
  const releaseId = input.releaseId ?? routedReleaseId;
  if (!routedReleaseId || !releaseId || routedReleaseId !== releaseId) return value;

  const release = await prisma.release.findFirst({
    where: { id: releaseId, OR: [{ userId: input.userId }, { ownerUserId: input.userId }] },
    select: { id: true, userId: true, ownerUserId: true, artworkUrl: true },
  });
  if (!release) return value;

  const linkedAssetId = storedAssetIdFromUrl(release.artworkUrl);
  if (linkedAssetId) {
    const linked = await prisma.storedAsset.findFirst({
      where: { id: linkedAssetId, deletedAt: null, uploadStatus: "ready", mimeType: "image/jpeg" },
      select: { id: true, safeFilename: true },
    });
    if (linked) return assetDownloadPath(linked);
  }

  const ownerUserId = release.ownerUserId ?? release.userId;
  const latest = await prisma.storedAsset.findFirst({
    where: { releaseId, ownerUserId, assetType: "private_unreleased_artwork", mimeType: "image/jpeg", deletedAt: null, uploadStatus: "ready" },
    select: { id: true, safeFilename: true },
    orderBy: { createdAt: "desc" },
  });
  return latest ? assetDownloadPath(latest) : value;
}
