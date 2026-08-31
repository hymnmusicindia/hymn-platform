import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import { missingImageResponseHeaders, missingImageSvg } from "@/lib/media-placeholder";
import { storedAssetIdFromUrl } from "@/lib/release-media";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const [user, admin] = await Promise.all([getSession(), getAdminSession()]);
  if (!user && !admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const releaseId = Number((await context.params).id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) return NextResponse.json({ error: "Invalid release." }, { status: 400 });

  const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { id: true, userId: true, ownerUserId: true, artworkUrl: true } });
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const ownerUserId = release.ownerUserId ?? release.userId;
  if (!admin && user?.sub !== ownerUserId && user?.sub !== release.userId) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const linkedAssetId = storedAssetIdFromUrl(release.artworkUrl);
  const linkedAsset = linkedAssetId ? await prisma.storedAsset.findFirst({ where: { id: linkedAssetId, ownerUserId, mimeType: { startsWith: "image/" }, deletedAt: null }, select: { id: true } }) : null;
  const releaseAsset = linkedAsset ?? await prisma.storedAsset.findFirst({ where: { releaseId, ownerUserId, mimeType: { startsWith: "image/" }, deletedAt: null }, select: { id: true }, orderBy: { createdAt: "desc" } });

  if (releaseAsset) {
    try {
      const asset = await localPrivateStorage.createAuthorizedRead({ assetId: releaseAsset.id, requesterUserId: user?.sub ?? 0, isAdmin: Boolean(admin) });
      return new NextResponse(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(asset.bytes.length), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "X-HYMN-Release-Asset": String(releaseAsset.id) } });
    } catch (error) {
      console.error("Release artwork source could not be read", { releaseId, assetId: releaseAsset.id, error: error instanceof Error ? error.message : "Unknown storage error" });
    }
  }

  return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-HYMN-Release-Asset": releaseAsset ? String(releaseAsset.id) : "unlinked" } });
}
