import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import { audioRange } from "@/lib/audio-range";

export const runtime = "nodejs";

/** Published linked audio masters also serve as fallback when a preview fails. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const beat = await prisma.beat.findFirst({
    where: { id, enabled: true, status: { in: ["PUBLISHED", "EXCLUSIVE_RESERVED"] } },
    include: { deliverableAsset: true }
  });
  const asset = beat?.deliverableAsset;
  if (!beat || !asset || asset.assetType !== "private_beat_deliverable" || !asset.mimeType.startsWith("audio/")) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    // Public state and the beat/asset relation authorize playback; never elevate to admin.
    const audio = await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: asset.ownerUserId, isAdmin: false });
    const size = audio.bytes.length;
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? audioRange(rangeHeader, size) : undefined;
    const headers = { "Content-Type": audio.mimeType, "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    if (range === null) return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    const bytes = range ? audio.bytes.subarray(range.start, range.end + 1) : audio.bytes;
    return new NextResponse(new Uint8Array(bytes), { status: range ? 206 : 200, headers: {
      ...headers, "Content-Length": String(bytes.length), ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {})
    } });
  } catch {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
