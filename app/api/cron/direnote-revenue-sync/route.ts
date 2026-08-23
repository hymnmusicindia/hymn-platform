import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDireNoteTrackRevenue } from "@/lib/direnote-service";

export const runtime = "nodejs";

async function resolveAutomationActorId() {
  const configured = Number(process.env.DIRENOTE_REVENUE_SYNC_ACTOR_ID);
  if (Number.isInteger(configured) && configured > 0) {
    const user = await prisma.user.findFirst({ where: { id: configured, role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
    if (user) return user.id;
  }
  const fallback = await prisma.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true }, orderBy: { id: "asc" } });
  if (!fallback) throw new Error("Revenue automation requires at least one active HYMN administrator for audit attribution.");
  return fallback.id;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_REVENUE_SYNC_ENABLED === "false") return NextResponse.json({ success: true, skipped: "disabled" });
  let actorId: number;
  try { actorId = await resolveAutomationActorId(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Revenue automation audit attribution failed." }, { status: 503 }); }
  // Revenue is accounting-period data. A monthly sweep reads only tracks that
  // have not already produced a revenue lookup during this reporting month.
  const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const candidates = await prisma.track.findMany({
    where: { isrc: { not: null }, release: { status: { in: ["SENT_TO_DISTRIBUTOR", "PROCESSING", "DELIVERED", "LIVE"] } } },
    select: { id: true, isrc: true, releaseId: true },
    take: 100,
    orderBy: { createdAt: "asc" }
  });
  const releaseIds = [...new Set(candidates.map((track) => track.releaseId))];
  const checkedIsrcs = releaseIds.length ? new Set((await prisma.direNoteLog.findMany({
    where: { releaseId: { in: releaseIds }, action: "revenue_report", success: true, createdAt: { gte: periodStart } },
    select: { requestPayloadRedacted: true }
  })).flatMap((row) => {
    const value = row.requestPayloadRedacted;
    return value && typeof value === "object" && "isrc" in value && typeof (value as { isrc?: unknown }).isrc === "string" ? [(value as { isrc: string }).isrc] : [];
  })) : new Set<string>();
  // Revenue reports are retrieved per ISRC; cap each scheduled invocation to
  // protect both the provider quota and Vercel function resources.
  const tracks = candidates.filter((track) => !checkedIsrcs.has(track.isrc!.replace(/[\s-]+/g, "").toUpperCase())).slice(0, 10);
  const results: Array<{ trackId: number; success: boolean; imported?: number; unmatched?: number; duplicatesIgnored?: number; error?: string }> = [];
  for (const track of tracks) {
    try {
      const imported = await getDireNoteTrackRevenue(track.isrc!, actorId, true);
      results.push({ trackId: track.id, success: true, imported: imported.ingestion?.imported ?? 0, unmatched: imported.ingestion?.unmatched ?? 0, duplicatesIgnored: imported.ingestion?.duplicatesIgnored ?? 0 });
    } catch (error) { results.push({ trackId: track.id, success: false, error: error instanceof Error ? error.message : "Revenue sync failed." }); }
  }
  return NextResponse.json({ success: true, eligible: candidates.length, checked: results.length, imported: results.reduce((sum, row) => sum + (row.imported ?? 0), 0), unmatched: results.reduce((sum, row) => sum + (row.unmatched ?? 0), 0), duplicatesIgnored: results.reduce((sum, row) => sum + (row.duplicatesIgnored ?? 0), 0), results });
}
