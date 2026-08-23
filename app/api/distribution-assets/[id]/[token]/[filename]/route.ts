import { NextResponse } from "next/server";
import { localPrivateStorage } from "@/lib/private-storage";
import { verifyDistributorAssetToken } from "@/lib/distributor-asset-delivery";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; token: string; filename: string }> }) {
  const { id, token } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId <= 0 || !verifyDistributorAssetToken(assetId, token)) {
    return NextResponse.json({ error: "Asset link is invalid." }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  try {
    const asset = await localPrivateStorage.createAuthorizedRead({ assetId, requesterUserId: 0, isAdmin: true, range: request.headers.get("range") });
    return new NextResponse(new Uint8Array(asset.bytes), {
      status: asset.contentRange ? 206 : 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${asset.fileName.replace(/["\\]/g, "_")}"`,
        "Content-Length": asset.contentLength || String(asset.bytes.length),
        ...(asset.contentRange ? { "Content-Range": asset.contentRange } : {}),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset is unavailable." }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
}
