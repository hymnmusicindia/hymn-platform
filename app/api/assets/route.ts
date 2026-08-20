import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { localPrivateStorage, type PrivateAssetType } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

const assetTypes = new Set<PrivateAssetType>(["private_audio_master", "private_beat_deliverable", "private_cover_licence", "private_ownership_proof", "private_ai_receipt", "private_royalty_statement", "private_payout_report", "private_payout_proof", "private_kyc_document", "private_unreleased_artwork"]);

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  const rate = await consumeRateLimit({ scope: "private-asset-upload", identity: String(result.user.id), limit: 30, windowSeconds: 60 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const assetType = String(form.get("assetType") || "") as PrivateAssetType;
    const releaseId = form.get("releaseId") ? Number(form.get("releaseId")) : undefined;
    if (!(file instanceof File) || !assetTypes.has(assetType)) return NextResponse.json({ error: "A supported private asset and file are required." }, { status: 400 });
    if (releaseId) {
      const owned = await prisma.release.count({ where: { id: releaseId, userId: result.user.id } });
      if (!owned) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    }
    const asset = await localPrivateStorage.upload({ ownerUserId: result.user.id, releaseId, assetType, fileName: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ asset }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Private upload failed." }, { status: 400 });
  }
}
// vercel trigger 9
