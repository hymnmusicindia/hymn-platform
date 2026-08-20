import { NextResponse } from "next/server";
import { getDetailedReleaseById, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { transitionReleaseStatus } from "@/lib/release-status-engine";
import type { ReleaseStatus } from "@/lib/types";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const id = Number((await params).id); const body = await request.json().catch(() => ({}));
  try {
    const existing = await getDetailedReleaseById(id);
    if (!existing) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    const status = transitionReleaseStatus({ currentStatus: existing.status, nextStatus: String(body.nextStatus) as ReleaseStatus, manualOverride: false });
    const release = await updateDetailedReleaseStatus(id, status, typeof body.reason === "string" ? body.reason : "Internal automated transition.");
    if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    return NextResponse.json({ release });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid transition." }, { status: 400 }); }
}
