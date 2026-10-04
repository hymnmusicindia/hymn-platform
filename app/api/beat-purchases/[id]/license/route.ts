import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const purchase = await prisma.beatPurchase.findUnique({ where: { id: Number((await params).id) }, include: { licenseAsset: true } });
  if (!purchase || (purchase.userId !== user.user.id && user.user.role !== "admin")) return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  if (!purchase.hasAccess) return NextResponse.json({ error: "License access has been revoked." }, { status: 403 });
  if (!purchase.licenseAsset || purchase.licenseAsset.deletedAt) return NextResponse.json({ error: purchase.licenseUrl ? "This legacy licence must be regenerated before download." : "Licence is still processing." }, { status: 409 });
  const asset = await localPrivateStorage.createAuthorizedRead({ assetId: purchase.licenseAsset.id, requesterUserId: user.user.id, isAdmin: user.user.role === "admin", range: _request.headers.get("range") });
  await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { downloadedAt: new Date(), downloadCount: { increment: 1 } } });
  return new NextResponse(new Uint8Array(asset.bytes), { status: asset.contentRange ? 206 : 200, headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${asset.fileName.replace(/["\\]/g, "_")}"`,
    "Content-Length": asset.contentLength || String(asset.bytes.length), ...(asset.contentRange ? { "Content-Range": asset.contentRange } : {}),
    "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow"
  } });
}
// vercel trigger 9
