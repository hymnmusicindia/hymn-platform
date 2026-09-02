import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import { missingImageResponseHeaders, missingImageSvg } from "@/lib/media-placeholder";
import { storedAssetIdFromUrl } from "@/lib/release-media";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const [user, admin] = await Promise.all([getSession(), getAdminSession()]);
  if (!user && !admin) return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-HYMN-Release-Asset": "unauthorized" } });
  const releaseId = Number((await context.params).id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-HYMN-Release-Asset": "invalid-release" } });

  const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { id: true, userId: true, ownerUserId: true, artworkUrl: true } });
  if (!release) return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-HYMN-Release-Asset": "missing-release" } });
  const ownerUserId = release.ownerUserId ?? release.userId;
  const userRecord = user ? await prisma.user.findUnique({ where: { id: user.sub }, select: { role: true, status: true } }) : null;
  const userIsAdmin = userRecord?.role === "ADMIN" && userRecord.status === "ACTIVE";
  if (!admin && !userIsAdmin && user?.sub !== ownerUserId && user?.sub !== release.userId) return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-HYMN-Release-Asset": "forbidden" } });

  const linkedAssetId = storedAssetIdFromUrl(release.artworkUrl);
  const releaseCoverAsset = await prisma.storedAsset.findFirst({
    where: { releaseId, ownerUserId, assetType: "private_unreleased_artwork", mimeType: { startsWith: "image/" }, deletedAt: null, uploadStatus: "ready" },
    select: { id: true, releaseId: true, ownerUserId: true },
    orderBy: { createdAt: "desc" }
  });
  const linkedAsset = linkedAssetId ? await prisma.storedAsset.findFirst({
    where: {
      id: linkedAssetId,
      mimeType: { startsWith: "image/" },
      deletedAt: null,
      uploadStatus: "ready",
      OR: [{ releaseId }, { ownerUserId }]
    },
    select: { id: true, releaseId: true, ownerUserId: true }
  }) : null;
  const legacyReleaseAsset = await prisma.storedAsset.findFirst({
    where: { releaseId, ownerUserId, mimeType: { startsWith: "image/" }, deletedAt: null, uploadStatus: "ready" },
    select: { id: true, releaseId: true, ownerUserId: true },
    orderBy: [{ assetType: "asc" }, { createdAt: "desc" }]
  });
  const releaseAsset = releaseCoverAsset ?? linkedAsset ?? legacyReleaseAsset;

  if (releaseAsset) {
    try {
      const asset = await localPrivateStorage.createAuthorizedRead({ assetId: releaseAsset.id, requesterUserId: user?.sub ?? 0, isAdmin: Boolean(admin) || userIsAdmin || releaseAsset.releaseId === releaseId });
      return new NextResponse(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(asset.bytes.length), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "X-HYMN-Release-Asset": String(releaseAsset.id) } });
    } catch (error) {
      console.error("Release artwork source could not be read", { releaseId, assetId: releaseAsset.id, error: error instanceof Error ? error.message : "Unknown storage error" });
    }
  }

  return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-HYMN-Release-Asset": releaseAsset ? String(releaseAsset.id) : "unlinked" } });
}
