import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { adminStatusSchema } from "@/lib/validation";
import { createDistributionQueueEntry, createReleaseAuditLog, listDistributionQueueEntries, transitionDistributionQueueEntry, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import type { DistributionQueueStage, ReleaseStatus } from "@/lib/types";

import { submitRelease } from "@/lib/distribution-service";

const statusStageMap: Partial<Record<ReleaseStatus, DistributionQueueStage>> = {
  submitted: "draft_submitted",
  in_queue: "quality_check",
  under_review: "awaiting_approval",
  approved: "approved",
  sent: "sent_to_direnote",
  live: "completed",
  rejected: "rejected"
};

async function syncQueueStage(releaseId: number, nextStage: DistributionQueueStage, actorId: number | null, note?: string) {
  const queueEntry = (await listDistributionQueueEntries()).find((item) => item.releaseId === releaseId);
  if (!queueEntry) {
    return createDistributionQueueEntry({ releaseId, initialStage: nextStage, operatorId: actorId, notes: note ?? "Admin status update." });
  }
  return transitionDistributionQueueEntry({ entryId: queueEntry.id, nextStage, operatorId: actorId, notes: note ?? "Admin status update." });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = adminStatusSchema.parse(await request.json());
    const actorId = "sub" in result ? result.sub : null;
    if (payload.status !== "approved" && payload.status !== "sent" && !payload.note?.trim() && !payload.reason?.trim()) {
      return NextResponse.json({ error: "A reason is required for a manual status override." }, { status: 400 });
    }
    if (payload.status === "approved" || payload.status === "sent") {
      const origin = new URL(request.url).origin;
      await syncQueueStage(Number(id), statusStageMap[payload.status]!, actorId, payload.note);
      const submission = await submitRelease(Number(id), { actorId, siteUrl: origin });
      if (!submission.submitted) {
        const messages = submission.validation.issues.map((issue) => issue.message);
        return NextResponse.json(
          { release: submission.release, error: messages[0] ?? "Distributor submission did not complete.", validation: submission.validation, retryable: submission.retryable },
          { status: submission.validation.ok ? 502 : 400 }
        );
      }
      return NextResponse.json({ release: submission.release, validation: submission.validation, warnings: submission.warnings ?? [] });
    }
    const requiresReview = payload.status === "rejected" || payload.status === "changes_requested";
    const release = await updateDetailedReleaseStatus(Number(id), payload.status, payload.note, requiresReview ? {
      reason: payload.reason!,
      issueType: payload.issueType!,
      severity: payload.severity ?? "required_correction",
      fields: payload.fields ?? [],
      adminInternalNote: payload.adminInternalNote,
      reviewedBy: actorId == null ? "local-admin" : String(actorId)
    } : undefined);
    if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    const nextStage = statusStageMap[payload.status];
    const queueEntry = nextStage ? await syncQueueStage(Number(id), nextStage, actorId, payload.note) : null;
    await createReleaseAuditLog({ releaseId: Number(id), userId: actorId, action: "ADMIN_MANUAL_STATUS_OVERRIDE", details: { status: payload.status, reason: payload.reason ?? payload.note ?? "Admin override", adminNote: payload.adminInternalNote ?? null } });
    return NextResponse.json({ release, queueEntry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
