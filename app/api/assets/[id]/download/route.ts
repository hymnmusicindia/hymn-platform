import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  const admin = user ? null : await getAdminSession();
  if (!user && !admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  try {
    const assetId = Number((await context.params).id);
    const asset = await localPrivateStorage.createAuthorizedRead({ assetId, requesterUserId: user?.sub ?? 0, isAdmin: Boolean(admin), range: request.headers.get("range") });
    if (user) {
      const stored = await prisma.storedAsset.findUnique({ where: { id: assetId }, select: { assetType: true, beatId: true, beatPurchaseId: true } });
      const purchase = stored?.beatPurchaseId ? await prisma.beatPurchase.findFirst({ where: { id: stored.beatPurchaseId, userId: user.sub, hasAccess: true }, select: { id: true } }) : stored?.assetType === "private_beat_deliverable" && stored.beatId ? await prisma.beatPurchase.findFirst({ where: { beatId: stored.beatId, userId: user.sub, hasAccess: true }, orderBy: { purchasedAt: "desc" }, select: { id: true } }) : null;
      if (purchase) await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { downloadedAt: new Date(), downloadCount: { increment: 1 } } });
    }
    const inline = asset.mimeType.startsWith("audio/") || asset.mimeType.startsWith("image/");
    return new NextResponse(new Uint8Array(asset.bytes), { status: asset.contentRange ? 206 : 200, headers: { "Content-Type": asset.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asset.fileName.replace(/["\\]/g, "_")}"`, "Content-Length": asset.contentLength || String(asset.bytes.length), ...(asset.contentRange ? { "Content-Range": asset.contentRange } : {}), "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Asset is unavailable.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden." ? 403 : 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
}
// vercel trigger 9
