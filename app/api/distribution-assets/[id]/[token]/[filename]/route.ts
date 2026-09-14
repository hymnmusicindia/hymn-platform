import { NextResponse } from "next/server";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; token: string; filename: string }> }) {
  const { id, token } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId <= 0) {
    return NextResponse.json({ error: "Asset link is invalid." }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  try {
    const assetRecord = await prisma.storedAsset.findFirst({ where: { id: assetId, providerDeliveryToken: token, deletedAt: null, uploadStatus: "ready" }, select: { id: true } });
    if (!assetRecord) return NextResponse.json({ error: "Asset link is invalid." }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
    const asset = await localPrivateStorage.createAuthorizedRead({ assetId, requesterUserId: 0, isAdmin: true, range: request.headers.get("range") });
    return new NextResponse(new Uint8Array(asset.bytes), {
      status: asset.contentRange ? 206 : 200,
      headers: {
        "Content-Type": asset.mimeType,
        // DireNote downloads evidence as a file; attachment avoids HTML/viewer
        // negotiation that can make a valid PDF look like a malformed response.
        "Content-Disposition": `attachment; filename="${asset.fileName.replace(/["\\]/g, "_")}"`,
        "Content-Length": asset.contentLength || String(asset.bytes.length),
        ...(asset.contentRange ? { "Content-Range": asset.contentRange } : {}),
        "Accept-Ranges": "bytes",
        // The URL contains an unguessable HMAC token, so it can be fetched by
        // DireNote without a HYMN session. Keep the cache window short so an
        // asset revoked in HYMN does not remain provider-readable for long.
        "Cache-Control": "public, max-age=900, s-maxage=900",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset is unavailable." }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string; token: string; filename: string }> }) {
  const response = await GET(request, context);
  return new NextResponse(null, { status: response.status, headers: response.headers });
}
