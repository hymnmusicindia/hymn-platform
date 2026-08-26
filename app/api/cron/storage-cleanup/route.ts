import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localStorageProvider } from "@/lib/storage-service";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const expired = await prisma.uploadSession.findMany({ where: { expiresAt: { lte: new Date() }, status: { in: ["CREATED", "UPLOADING", "PAUSED", "FAILED"] } }, select: { id: true, tempPath: true } });
  let cleaned = 0;
  for (const session of expired) {
    try {
      await localStorageProvider.removeTemp(session.tempPath);
      await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "EXPIRED", errorMessage: "Upload session expired and temporary chunks were removed." } });
      cleaned += 1;
    } catch (error) { console.error("Expired upload cleanup failed", { uploadSessionId: session.id, error }); }
  }
  console.info("Temporary upload cleanup completed", { candidates: expired.length, cleaned });
  return NextResponse.json({ candidates: expired.length, cleaned });
}
