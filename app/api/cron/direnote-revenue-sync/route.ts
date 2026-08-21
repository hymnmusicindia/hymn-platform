import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDireNoteTrackRevenue } from "@/lib/direnote-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_REVENUE_SYNC_ENABLED !== "true") return NextResponse.json({ success: true, skipped: "disabled" });
  const actorId = Number(process.env.DIRENOTE_REVENUE_SYNC_ACTOR_ID);
  if (!Number.isInteger(actorId) || actorId < 1) return NextResponse.json({ error: "DIRENOTE_REVENUE_SYNC_ACTOR_ID must be a valid finance administrator ID." }, { status: 503 });
  // Revenue is monthly and DNM is capped at 100 requests/IP/hour. One bounded
  // sweep per invocation preserves request capacity for release operations.
  const tracks = await prisma.track.findMany({ where: { isrc: { not: null }, release: { status: { in: ["SENT_TO_DISTRIBUTOR", "PROCESSING", "DELIVERED", "LIVE"] } } }, select: { id: true, isrc: true }, take: 20, orderBy: { createdAt: "asc" } });
  const results: Array<{ trackId: number; success: boolean; imported?: number; unmatched?: number; duplicatesIgnored?: number; error?: string }> = [];
  for (const track of tracks) {
    try {
      const imported = await getDireNoteTrackRevenue(track.isrc!, actorId, true);
      results.push({ trackId: track.id, success: true, imported: imported.ingestion?.imported ?? 0, unmatched: imported.ingestion?.unmatched ?? 0, duplicatesIgnored: imported.ingestion?.duplicatesIgnored ?? 0 });
    } catch (error) { results.push({ trackId: track.id, success: false, error: error instanceof Error ? error.message : "Revenue sync failed." }); }
  }
  return NextResponse.json({ success: true, checked: results.length, imported: results.reduce((sum, row) => sum + (row.imported ?? 0), 0), unmatched: results.reduce((sum, row) => sum + (row.unmatched ?? 0), 0), duplicatesIgnored: results.reduce((sum, row) => sum + (row.duplicatesIgnored ?? 0), 0), results });
}
