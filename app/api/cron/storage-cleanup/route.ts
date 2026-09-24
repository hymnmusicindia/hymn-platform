import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localStorageProvider } from "@/lib/storage-service";
import { localPrivateStorage } from "@/lib/private-storage";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const staleFinalizations = await prisma.uploadSession.findMany({ where: { updatedAt: { lte: staleCutoff }, status: { in: ["ASSEMBLING", "VERIFYING"] } }, select: { id: true, status: true } });
  let recovered = 0;
  for (const session of staleFinalizations) {
    const result = await prisma.uploadSession.updateMany({ where: { id: session.id, status: session.status, updatedAt: { lte: staleCutoff } }, data: { status: "FAILED", errorMessage: "Upload finalization was interrupted. Retry completion; uploaded chunks were retained." } });
    recovered += result.count;
  }
  const expired = await prisma.uploadSession.findMany({ where: { expiresAt: { lte: now }, status: { in: ["CREATED", "UPLOADING", "PAUSED", "FAILED", "ASSEMBLING", "VERIFYING"] } }, select: { id: true, tempPath: true, status: true } });
  let cleaned = 0;
  for (const session of expired) {
    try {
      const claimed = await prisma.uploadSession.updateMany({ where: { id: session.id, status: session.status, expiresAt: { lte: now } }, data: { status: "EXPIRED", errorMessage: "Upload session expired; temporary chunks are being removed." } });
      if (!claimed.count) continue;
      await localStorageProvider.removeTemp(session.tempPath);
      await prisma.uploadSession.update({ where: { id: session.id }, data: { errorMessage: "Upload session expired and temporary chunks were removed." } });
      cleaned += 1;
    } catch (error) {
      await prisma.uploadSession.updateMany({ where: { id: session.id, status: "EXPIRED" }, data: { status: "FAILED", errorMessage: "Expired upload cleanup failed and will be retried." } }).catch(() => undefined);
      console.error("Expired upload cleanup failed", { uploadSessionId: session.id, error });
    }
  }
  const expiredAssets = await prisma.storedAsset.findMany({ where: { retentionUntil: { lte: now }, deletedAt: null }, select: { id: true }, take: 250 });
  let assetsDeleted = 0;
  for (const asset of expiredAssets) {
    try {
      await localPrivateStorage.delete({ assetId: asset.id, requesterUserId: 0, isAdmin: true });
      assetsDeleted += 1;
    } catch (error) {
      console.error("Expired private asset cleanup failed", { assetId: asset.id, error });
    }
  }
  console.info("Storage cleanup completed", { candidates: expired.length, cleaned, staleFinalizations: staleFinalizations.length, recovered, expiredAssets: expiredAssets.length, assetsDeleted });
  return NextResponse.json({ candidates: expired.length, cleaned, staleFinalizations: staleFinalizations.length, recovered, expiredAssets: expiredAssets.length, assetsDeleted });
}
