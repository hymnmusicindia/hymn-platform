import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("direnote-revenue-sync", runJob);
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDireNoteTrackRevenue } from "@/lib/direnote-service";
import { isDireNoteRateLimit } from "@/lib/direnote-rate-limit";

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

async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_REVENUE_SYNC_ENABLED === "false") return NextResponse.json({ success: true, skipped: "disabled" });
  let actorId: number;
  try { actorId = await resolveAutomationActorId(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Revenue automation audit attribution failed." }, { status: 503 }); }
  // Recheck daily because providers can revise the current accounting period
  // after an earlier successful lookup. Import fingerprints remain idempotent.
  const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.direNoteLog.findMany({
    where: { action: "revenue_report", createdAt: { gte: periodStart } },
    select: { requestPayloadRedacted: true, success: true, createdAt: true }
  });
  const checkedIsrcs = new Set(recent.filter(row => row.success || row.createdAt.getTime() > Date.now() - 30 * 60000).flatMap(row => {
    const payload = row.requestPayloadRedacted as { isrc?: unknown } | null;
    return typeof payload?.isrc === "string" ? [payload.isrc.replace(/[\s-]/g, "").toUpperCase()] : [];
  }));
  // Exclude checked ISRCs BEFORE limiting. The previous first-100 window starved
  // later catalogue rows even though their reports had never been requested.
  const candidates = await prisma.$queryRaw<Array<{ id: number; isrc: string; releaseId: number }>>`
    SELECT t.id, t.isrc, t.release_id AS "releaseId" FROM tracks t JOIN releases r ON r.id=t.release_id
    LEFT JOIN LATERAL (
      SELECT MAX(l.created_at) AS checked_at FROM direnote_logs l
      WHERE l.action='revenue_report' AND l.request_payload_redacted->>'isrc'=t.isrc
    ) observed ON TRUE
    WHERE t.isrc IS NOT NULL AND r.archived_at IS NULL
    AND r.status::text IN ('SENT_TO_DISTRIBUTOR','PROCESSING','DISTRIBUTOR_PROCESSING','SCHEDULED','AWAITING_LIVE_CONFIRMATION','PARTIALLY_LIVE','DELIVERED','LIVE')
    AND NOT EXISTS (
      SELECT 1 FROM direnote_logs l WHERE l.action='revenue_report' AND l.request_payload_redacted->>'isrc'=t.isrc
      AND ((l.success=TRUE AND l.created_at >= ${periodStart}) OR l.created_at >= ${new Date(Date.now() - 30 * 60000)})
    )
    ORDER BY observed.checked_at ASC NULLS FIRST, t.id LIMIT 10`;
  const tracks = candidates.filter(track => !checkedIsrcs.has(track.isrc.replace(/[\s-]/g, "").toUpperCase()));
  const deadline = Date.now() + 40000;
  let retryAfterSeconds = 0;
  const results: Array<{ trackId: number; success: boolean; imported?: number; unmatched?: number; duplicatesIgnored?: number; error?: string }> = [];
  for (const track of tracks) {
    if (Date.now() >= deadline) break;
    try {
      const imported = await getDireNoteTrackRevenue(track.isrc!, actorId, true, { timeoutMs: Math.max(1000, Math.min(12000, deadline - Date.now())) });
      results.push({ trackId: track.id, success: true, imported: imported.ingestion?.imported ?? 0, unmatched: imported.ingestion?.unmatched ?? 0, duplicatesIgnored: imported.ingestion?.duplicatesIgnored ?? 0 });
    } catch (error) {
      if (isDireNoteRateLimit(error)) { retryAfterSeconds = error.retryAfterSeconds; break; }
      results.push({ trackId: track.id, success: false, error: error instanceof Error ? error.message : "Revenue sync failed." });
    }
  }
  return NextResponse.json({ success: true, rateLimited: retryAfterSeconds > 0, retryAfterSeconds, deferredCount: tracks.length - results.length, eligible: candidates.length, checked: results.length, imported: results.reduce((sum, row) => sum + (row.imported ?? 0), 0), unmatched: results.reduce((sum, row) => sum + (row.unmatched ?? 0), 0), duplicatesIgnored: results.reduce((sum, row) => sum + (row.duplicatesIgnored ?? 0), 0), results });
}
