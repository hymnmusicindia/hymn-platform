import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { getDetailedReleaseById, listDistributionLogsByRelease, listReleaseAuditLogs } from "@/lib/distribution-db";
import { retrySubmission } from "@/lib/distribution-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const { id } = await params;
  const releaseId = Number(id);
  const [release, distributionLogs, auditLogs] = await Promise.all([
    getDetailedReleaseById(releaseId),
    listDistributionLogsByRelease(releaseId),
    listReleaseAuditLogs(releaseId)
  ]);

  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  return NextResponse.json({ release, distributionLogs, auditLogs });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const { id } = await params;
  const submission = await retrySubmission(Number(id), {
    actorId: "sub" in result ? result.sub : null,
    siteUrl: new URL(request.url).origin
  });

  if (!submission.submitted) {
    return NextResponse.json(
      { release: submission.release, validation: submission.validation, retryable: submission.retryable, error: "Distribution retry did not complete." },
      { status: submission.validation.ok ? 502 : 400 }
    );
  }

  return NextResponse.json({ release: submission.release, validation: submission.validation });
}
