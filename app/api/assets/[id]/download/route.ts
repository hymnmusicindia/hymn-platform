import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { AudioRangeNotSatisfiableError, localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";
import { missingImageResponseHeaders, missingImageSvg } from "@/lib/media-placeholder";
import { requireAdminPermission } from "@/lib/access";
import { requestedArtworkWidth } from "@/lib/artwork-preview";
import { artworkThumbnail } from "@/lib/artwork-thumbnail";
import { canReadAssignedQcAsset } from '@/lib/team/release-qc-media';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const [user, admin] = await Promise.all([getSession(), getAdminSession()]);
  if (!user && !admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  try {
    const assetId = Number((await context.params).id);
    if (!Number.isInteger(assetId) || assetId < 1) return NextResponse.json({ error: "Invalid asset." }, { status: 400 });
    const downloadRequested = new URL(request.url).searchParams.get("download") === "1";
    let releaseAdmin = false;
    if (!admin && user) {
      const linked = await prisma.storedAsset.findUnique({ where: { id: assetId }, select: { ownerUserId: true, assetType: true, releaseId: true, category:true, entityType:true, releaseAssetLinks: { select: { id: true }, take: 1 } } });
      if (linked && linked.ownerUserId !== user.sub && ["private_audio_master", "private_ownership_proof", "private_unreleased_artwork"].includes(linked.assetType) && (linked.releaseId || linked.releaseAssetLinks.length)) {
        releaseAdmin = !('error' in await requireAdminPermission("releases.review")) || !('error' in await requireAdminPermission("releases.read"));
      }
      if (linked?.assetType === "private_support_screenshot" && linked.ownerUserId !== user.sub) {
        const ticket = await prisma.supportTicket.findFirst({where:{details:{path:["screenshotIds"],array_contains:[assetId]}},select:{id:true}});
        if (ticket) releaseAdmin = !("error" in await requireAdminPermission("services.manage"));
      }
      if(linked?.ownerUserId !== user.sub && linked?.assetType==='private_ownership_proof' && linked.entityType==='BEAT' && linked.category==='BEAT_SAMPLE_LICENSE') releaseAdmin = !('error' in await requireAdminPermission('users.manage'));
      if (!releaseAdmin && linked?.ownerUserId !== user.sub) releaseAdmin = await canReadAssignedQcAsset(user.sub, assetId);
    }
    const asset = await localPrivateStorage.createAuthorizedRead({ assetId, requesterUserId: user?.sub ?? 0, isAdmin: Boolean(admin) || releaseAdmin, range: request.headers.get("range") });
    const width = !downloadRequested && asset.mimeType.startsWith("image/") ? requestedArtworkWidth(request) : null;
    if (width) {
      const bytes = await artworkThumbnail(asset.bytes, width).catch(() => asset.bytes);
      return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": bytes === asset.bytes ? asset.mimeType : "image/webp", "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=300", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
    }
    if (user) {
      const stored = await prisma.storedAsset.findUnique({ where: { id: assetId }, select: { assetType: true, beatId: true, beatPurchaseId: true } });
      const purchase = stored?.beatPurchaseId ? await prisma.beatPurchase.findFirst({ where: { id: stored.beatPurchaseId, userId: user.sub, hasAccess: true }, select: { id: true } }) : stored?.assetType === "private_beat_deliverable" && stored.beatId ? await prisma.beatPurchase.findFirst({ where: { beatId: stored.beatId, userId: user.sub, hasAccess: true }, orderBy: { purchasedAt: "desc" }, select: { id: true } }) : null;
      if (purchase) await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { downloadedAt: new Date(), downloadCount: { increment: 1 } } });
    }
    const inline = !downloadRequested && (asset.mimeType.startsWith("audio/") || asset.mimeType.startsWith("image/"));
    return new NextResponse(new Uint8Array(asset.bytes), { status: asset.contentRange ? 206 : 200, headers: { "Content-Type": asset.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asset.fileName.replace(/["\\]/g, "_")}"`, "Content-Length": asset.contentLength || String(asset.bytes.length), ...(asset.contentRange ? { "Content-Range": asset.contentRange } : {}), "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Asset is unavailable.";
    if (error instanceof AudioRangeNotSatisfiableError) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${error.size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" } });
    const assetId = Number((await context.params).id);
    const missingImage = Number.isInteger(assetId) ? await prisma.storedAsset.findUnique({ where: { id: assetId }, select: { mimeType: true, deletedAt: true } }).catch(() => null) : null;
    if (missingImage?.mimeType.startsWith("image/") && !missingImage.deletedAt && message !== "Forbidden.") {
      return new NextResponse(missingImageSvg(), { status: 200, headers: { ...missingImageResponseHeaders(), "X-Robots-Tag": "noindex, nofollow" } });
    }
    return NextResponse.json({ error: message }, { status: message === "Forbidden." ? 403 : 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
}
// vercel trigger 9
