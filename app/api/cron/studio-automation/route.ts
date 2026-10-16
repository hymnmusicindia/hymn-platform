import { NextResponse } from "next/server";
import { runStudioAutomation } from "@/lib/studio-services";
import { sendStudioBeatFollowups } from "@/lib/studio-beat-followups";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { recoverStudioPayments } from "@/lib/studio-payment-recovery";
export const maxDuration=60;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const runId = randomUUID(), leaseKey = "studio-automation";
  const leases = await prisma.$queryRaw<Array<{ run_id: string }>>`INSERT INTO cron_leases (lease_key,run_id,leased_until,updated_at) VALUES (${leaseKey},${runId},NOW()+INTERVAL '5 minutes',NOW()) ON CONFLICT (lease_key) DO UPDATE SET run_id=EXCLUDED.run_id,leased_until=EXCLUDED.leased_until,updated_at=NOW() WHERE cron_leases.leased_until<NOW() RETURNING run_id`;
  if (leases[0]?.run_id !== runId) return NextResponse.json({ skipped: "already_running" });
  const deadline = Date.now() + 45000;
  try {
    const recovery = await recoverStudioPayments(Date.now() + 15000);
    return NextResponse.json({ recovery, automation: await runStudioAutomation(new Date(), deadline - 8000), followups: await sendStudioBeatFollowups(new Date(), deadline) });
  } finally { await prisma.$executeRaw`UPDATE cron_leases SET leased_until=NOW(),updated_at=NOW() WHERE lease_key=${leaseKey} AND run_id=${runId}`; }
}
export const GET=POST;
