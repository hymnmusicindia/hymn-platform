import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openPrivateAssetAudio } from "@/lib/private-storage";
import { audioFileResponse } from "@/lib/audio-file-response";

export const runtime = "nodejs";

/** Published linked audio masters also serve as fallback when a preview fails. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const beat = await prisma.beat.findFirst({
    where: { id, enabled: true, status: { in: ["PUBLISHED", "EXCLUSIVE_RESERVED"] } },
    include: { deliverableAsset: true, user: { select: { status: true } } }
  });
  const asset = beat?.deliverableAsset;
  if (!beat || beat.user.status !== "ACTIVE" || !asset
    || asset.deletedAt || (asset.retentionUntil && asset.retentionUntil <= new Date())
    || asset.ownerUserId !== beat.userId || asset.beatId !== beat.id
    || asset.assetType !== "private_beat_deliverable" || !asset.mimeType.startsWith("audio/")) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    // Published state and the linked, active owner's asset authorize streaming.
    // Original purchase downloads retain their separate entitlement/integrity checks.
    return await audioFileResponse(request, await openPrivateAssetAudio(asset), {
      mimeType: asset.mimeType, cacheControl: "private, no-cache",
      etag: `"${asset.checksum}"`
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  return GET(request, context);
}
