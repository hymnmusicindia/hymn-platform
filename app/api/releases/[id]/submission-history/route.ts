import { NextResponse } from "next/server";
import { requireAdminPermission, requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId } from "@/lib/distribution-db";
import { prisma } from "@/lib/prisma";
import { redactDireNoteDiagnostic } from "@/lib/direnote";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const releaseId = Number((await params).id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const isAdmin = new URL(_request.url).searchParams.get("admin") === "1";
  if (isAdmin) {
    const admin = await requireAdminPermission("releases.read");
    if ("error" in admin) return admin.error;
  } else {
    const user = await requireUser();
    if ("error" in user) return user.error;
    const release = await getDetailedReleaseByUserId(user.session.sub, releaseId);
    if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  }
  const attempts = await prisma.distributionSubmissionAttempt.findMany({
    where: { releaseId, provider: "direnote", state: "submitted" }, orderBy: { id: "asc" },
    select: { id: true, upc: true, isCurrent: true, providerStatus: true, trackIdentifiers: true, startedAt: true, completedAt: true, corrections: true, payloadRedacted: isAdmin, payloadDiff: isAdmin }
  });
  return NextResponse.json({ attempts: attempts.map(attempt => {
    const correction = attempt.corrections as { status?: string; artistResolvedAt?: string } | null;
    const payload = isAdmin && attempt.payloadRedacted && typeof attempt.payloadRedacted === "object" ? Object.fromEntries(Object.entries(attempt.payloadRedacted).filter(([key]) => !["pin", "client_id"].includes(key))) : null;
    return { id: attempt.id, upc: attempt.upc, isCurrent: attempt.isCurrent, status: attempt.providerStatus, tracks: attempt.trackIdentifiers, submittedAt: attempt.completedAt ?? attempt.startedAt, correctionStatus: correction?.status, artistResolvedAt: correction?.artistResolvedAt,
      ...(isAdmin ? { payload: redactDireNoteDiagnostic(payload), payloadDiff: redactDireNoteDiagnostic(attempt.payloadDiff) } : {}) };
  }) });
}
