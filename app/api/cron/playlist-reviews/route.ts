import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runPlaylistReviewAutomation } from "@/lib/playlist-reviews";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const runId = crypto.randomUUID(); const leaseKey = "playlist-reviews";
  const leases = await prisma.$queryRaw<Array<{ run_id: string }>>`INSERT INTO cron_leases (lease_key,run_id,leased_until,updated_at) VALUES (${leaseKey},${runId},NOW()+INTERVAL '10 minutes',NOW()) ON CONFLICT (lease_key) DO UPDATE SET run_id=EXCLUDED.run_id,leased_until=EXCLUDED.leased_until,updated_at=NOW() WHERE cron_leases.leased_until<NOW() RETURNING run_id`;
  if (leases[0]?.run_id !== runId) return NextResponse.json({ success: true, skipped: "already_running" });
  try { const summary = await runPlaylistReviewAutomation(); await prisma.auditLog.create({ data: { actorType: "system", action: "PLAYLIST_REVIEW_AUTOMATION", entity: "cron", entityId: runId, metadata: summary } }); return NextResponse.json({ success: !summary.errors.length, ...summary }, { status: summary.errors.length ? 503 : 200 }); }
  finally { await prisma.$executeRaw`UPDATE cron_leases SET leased_until=NOW(),updated_at=NOW() WHERE lease_key=${leaseKey} AND run_id=${runId}`; }
}
