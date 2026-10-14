import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshSpotifyArtistPhoto } from "@/lib/spotify-artist-photos";

export const runtime = "nodejs";
export const maxDuration = 300;
const leaseKey = "spotify-artist-photos";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const runId = crypto.randomUUID();
  const started = Date.now();
  const leases = await prisma.$queryRaw<Array<{ run_id: string }>>`
    INSERT INTO "cron_leases" ("lease_key", "run_id", "leased_until", "updated_at")
    VALUES (${leaseKey}, ${runId}, NOW() + INTERVAL '5 minutes', NOW())
    ON CONFLICT ("lease_key") DO UPDATE SET "run_id" = EXCLUDED."run_id", "leased_until" = EXCLUDED."leased_until", "updated_at" = NOW()
    WHERE "cron_leases"."leased_until" < NOW() RETURNING "run_id"`;
  if (leases[0]?.run_id !== runId) return NextResponse.json({ success: true, skipped: "already_running" });
  const results: Array<{ id: number; outcome: string; error?: string }> = [];
  try {
    // Oldest updated profiles first prevents a time-limited run starving later profiles.
    const cards = await prisma.artistCard.findMany({ where: { archivedAt: null, spotifyProfileUrl: { not: null } }, select: { id: true }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
    for (const card of cards) {
      if (Date.now() - started > 250_000) break;
      try { results.push({ id: card.id, ...(await refreshSpotifyArtistPhoto(card.id)) }); }
      catch (error) {
        results.push({ id: card.id, outcome: "failed", error: error instanceof Error ? error.message : "Spotify photo lookup failed." });
        const status = (error as { status?: number })?.status;
        if (status === 429 || status === 401 || status === 403 || (error as { spotifyAuthenticationFailed?: boolean })?.spotifyAuthenticationFailed) break;
      }
    }
    const summary = { runId, eligible: cards.length, processed: results.length, updated: results.filter(item => item.outcome === "updated").length, errors: results.filter(item => item.outcome === "failed").length, deferred: cards.length - results.length, durationMs: Date.now() - started, results };
    await prisma.auditLog.create({ data: { actorType: "system", action: "SPOTIFY_ARTIST_PHOTOS_REFRESHED", entity: "cron", entityId: runId, metadata: summary } });
    return NextResponse.json({ success: summary.errors === 0 && summary.deferred === 0, ...summary }, { status: summary.errors || summary.deferred ? 503 : 200 });
  } finally {
    await prisma.$executeRaw`UPDATE "cron_leases" SET "leased_until" = NOW(), "updated_at" = NOW() WHERE "lease_key" = ${leaseKey} AND "run_id" = ${runId}`;
  }
}
