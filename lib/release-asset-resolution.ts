import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from '@prisma/client';
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

type AssetDb = Pick<Prisma.TransactionClient, 'release' | 'storedAsset'>;
async function ownedReleaseArtwork(releaseId: number, userId: number, db:AssetDb, visited=new Set<number>()):Promise<string|null> {
  if(visited.has(releaseId) || visited.size>=12)return null;
  visited.add(releaseId);
  const release = await db.release.findFirst({
    where: { id: releaseId, OR: [{ ownerUserId: userId }, { ownerUserId:null,userId,releaseSource:{not:'ADMIN_MANUAL'} }] },
    select: { id: true, userId: true, ownerUserId: true, artworkUrl: true },
  });
  if (!release) return null;
  const linkedAssetId = storedAssetIdFromUrl(release.artworkUrl);
  if (linkedAssetId) {
    const linked = await db.storedAsset.findFirst({ where: { id: linkedAssetId, ownerUserId: userId, deletedAt: null, uploadStatus: "ready", mimeType: "image/jpeg" }, select: { id: true, safeFilename: true } });
    if (linked) return assetDownloadPath(linked);
  }
  const ownerUserId = release.ownerUserId ?? release.userId;
  const latest = await db.storedAsset.findFirst({ where: { releaseId, ownerUserId, assetType: "private_unreleased_artwork", mimeType: "image/jpeg", deletedAt: null, uploadStatus: "ready" }, select: { id: true, safeFilename: true }, orderBy: { createdAt: "desc" } });
  if (latest) return assetDownloadPath(latest);
  const sourceId=releaseArtworkRouteId(release.artworkUrl);
  if(sourceId)return ownedReleaseArtwork(sourceId,userId,db,visited);
  if (release.artworkUrl && !releaseArtworkRouteId(release.artworkUrl) && !storedAssetIdFromUrl(release.artworkUrl)) return release.artworkUrl;
  return null;
}

export async function resolvePrivateReleaseArtworkUrl(input: { userId: number; releaseId?: number | null; value?: string | null },db:AssetDb=prisma) {
  const value = input.value?.trim();
  if (!value) return "";
  const existingAssetId = storedAssetIdFromUrl(value);
  if (existingAssetId) {
    const existing = await db.storedAsset.findFirst({
      where: { id: existingAssetId, ownerUserId: input.userId, deletedAt: null, uploadStatus: "ready" },
      select: { id: true, safeFilename: true },
    });
    return existing ? assetDownloadPath(existing) : value;
  }

  const routedReleaseId = releaseArtworkRouteId(value);
  const releaseId = input.releaseId ?? routedReleaseId;
  if (!routedReleaseId || !releaseId || routedReleaseId !== releaseId) {
    // A legacy/public display URL can remain on an older draft even after the
    // artist uploads a private replacement. Prefer the owned draft asset so
    // submit never falls back to an unauthenticated artwork URL.
    if (input.releaseId) {
      const latest = await db.storedAsset.findFirst({
        where: {
          releaseId: input.releaseId,
          ownerUserId: input.userId,
          assetType: "private_unreleased_artwork",
          mimeType: "image/jpeg",
          deletedAt: null,
          uploadStatus: "ready",
        },
        select: { id: true, safeFilename: true },
        orderBy: { createdAt: "desc" },
      });
      if (latest) return assetDownloadPath(latest);
    }
    // Duplicates created before the repair stored the source release's display
    // route. Resolve it only when that source belongs to the same customer.
    if (routedReleaseId) {
      const inherited = await ownedReleaseArtwork(routedReleaseId, input.userId,db);
      if (inherited) return inherited;
    }
    return value;
  }
  return await ownedReleaseArtwork(releaseId, input.userId,db) ?? value;
}
