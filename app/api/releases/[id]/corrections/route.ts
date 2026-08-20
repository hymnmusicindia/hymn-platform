import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId } from "@/lib/distribution-db";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const release = await getDetailedReleaseByUserId(user.session.sub, Number((await params).id));
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  return NextResponse.json({ correction: { releaseId: release.id, status: release.status, reason: release.status === "rejected" ? release.rejectionReason : release.correctionReason, issues: release.reviewIssues?.fields ?? [], issueType: release.reviewIssues?.type ?? null, severity: release.reviewIssues?.severity ?? null } });
}
