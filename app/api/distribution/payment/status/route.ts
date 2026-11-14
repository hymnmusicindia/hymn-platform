import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId } from "@/lib/distribution-db";
import { isCompletedDistributionSubmission } from "@/lib/distribution-return";
import { matchesReceivedCorrection } from "@/lib/release-correction-workflow";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const id = Number(new URL(request.url).searchParams.get("releaseId"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Valid release ID required." }, { status: 400 });
  const release = await getDetailedReleaseByUserId(user.session.sub, id);
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const correctionKey = new URL(request.url).searchParams.get("correctionKey");
  if (correctionKey !== null) {
    if (!/^[a-f0-9]{64}$/.test(correctionKey)) return NextResponse.json({ error: "Valid correction key required." }, { status: 400 });
    const correctionReceived = matchesReceivedCorrection(release, correctionKey);
    return NextResponse.json({ correctionReceived, ...(correctionReceived ? { release } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const submitted = isCompletedDistributionSubmission(release);
  return NextResponse.json({ submitted, ...(submitted ? { release } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
}
