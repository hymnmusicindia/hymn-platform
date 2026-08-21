import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDireNoteRelease } from "@/lib/direnote-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_RELEASE_SYNC_ENABLED === "false") return NextResponse.json({ success: true, skipped: "disabled" });
  // DNM permits 100 requests/IP/hour. A bounded sweep leaves capacity for operators and ingestion.
  const releases = await prisma.release.findMany({ where: { upc: { not: null }, status: { in: ["SENT_TO_DISTRIBUTOR", "PROCESSING", "DELIVERED", "LIVE"] } }, select: { id: true }, take: 25, orderBy: { updatedAt: "asc" } });
  const results: Array<{ releaseId: number; success: boolean; error?: string }> = [];
  for (const release of releases) {
    try { await syncDireNoteRelease(release.id); results.push({ releaseId: release.id, success: true }); }
    catch (error) { results.push({ releaseId: release.id, success: false, error: error instanceof Error ? error.message : "Sync failed." }); }
  }
  return NextResponse.json({ success: true, checked: results.length, results });
}
