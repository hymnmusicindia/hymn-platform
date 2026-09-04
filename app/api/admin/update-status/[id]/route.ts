import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { adminStatusSchema } from "@/lib/validation";
import { createDistributionQueueEntry, createReleaseAuditLog, getDetailedReleaseById, listDistributionQueueEntries, transitionDistributionQueueEntry, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import type { DistributionQueueStage, ReleaseStatus } from "@/lib/types";

import { submitRelease } from "@/lib/distribution-service";
import { getPublicAppUrl } from "@/lib/public-app-url";

const statusStageMap: Partial<Record<ReleaseStatus, DistributionQueueStage>> = {
  submitted: "draft_submitted",
  in_queue: "quality_check",
  under_review: "awaiting_approval",
  approved: "approved",
  sent: "sent_to_direnote",
  live: "completed",
  rejected: "rejected"
};

async function syncQueueStage(releaseId: number, nextStage: DistributionQueueStage, actorId: number | null, note?: string, options?: { syncReleaseStatus?: boolean }) {
  const queueEntry = (await listDistributionQueueEntries()).find((item) => item.releaseId === releaseId);
  if (!queueEntry) {
    return createDistributionQueueEntry({ releaseId, initialStage: nextStage, operatorId: actorId, notes: note ?? "Admin status update." });
  }
  return transitionDistributionQueueEntry({ entryId: queueEntry.id, nextStage, operatorId: actorId, notes: note ?? "Admin status update.", syncReleaseStatus: options?.syncReleaseStatus });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminPermission("releases.review");
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = adminStatusSchema.parse(await request.json());
    const actorId = "sub" in result ? result.sub : null;
    if (payload.status !== "approved" && payload.status !== "sent" && !payload.note?.trim() && !payload.reason?.trim()) {
      return NextResponse.json({ error: "A reason is required for a manual status override." }, { status: 400 });
    }
    if (payload.status === "approved") {
      const release = await updateDetailedReleaseStatus(Number(id), "approved", payload.note || "HYMN review approved.");
      if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
      const queueEntry = await syncQueueStage(Number(id), "approved", actorId, payload.note || "HYMN review approved.");
      await createReleaseAuditLog({ releaseId: Number(id), userId: actorId, action: "RELEASE_APPROVED_BY_HYMN", details: { newStatus: "approved", note: payload.note ?? null } });
      return NextResponse.json({ release, queueEntry });
    }
    if (payload.status === "sent") {
      const origin = getPublicAppUrl(request.url);
      const currentRelease = await getDetailedReleaseById(Number(id));
      if (!currentRelease) return NextResponse.json({ error: "Release not found." }, { status: 404 });
      const retry = ["failed", "delivery_failed", "queued_for_distribution", "submitting_to_distributor"].includes(currentRelease.status);
      const distributionPermission = await requireAdminPermission(retry ? "distribution.retry" : "distribution.submit");
      if ("error" in distributionPermission) return distributionPermission.error;
      if (!retry) {
        await syncQueueStage(Number(id), "approved", actorId, payload.note || "HYMN review approved; DireNote submission started.", { syncReleaseStatus: currentRelease.status !== "approved" });
        await createReleaseAuditLog({ releaseId: Number(id), userId: actorId, action: "RELEASE_APPROVED_AND_DIRENOTE_STARTED", details: { previousStatus: currentRelease.status, note: payload.note ?? null } });
      }
      const submission = await submitRelease(Number(id), { actorId, siteUrl: origin, retry });
      if (!submission.submitted) {
        const messages = submission.validation.issues.map((issue) => issue.message);
        return NextResponse.json(
          { release: submission.release, error: submission.error ?? messages[0] ?? "Distributor submission did not complete.", validation: submission.validation, retryable: submission.retryable, retryAfterSeconds: submission.retryAfterSeconds },
          { status: submission.validation.ok ? 502 : 400 }
        );
      }
      return NextResponse.json({ release: submission.release, validation: submission.validation, warnings: submission.warnings ?? [] });
    }
    const requiresReview = payload.status === "rejected" || payload.status === "changes_requested";
    const statusReason = payload.note?.trim() || payload.reason?.trim();
    const release = await updateDetailedReleaseStatus(Number(id), payload.status, statusReason, requiresReview ? {
      reason: payload.reason!,
      issueType: payload.issueType!,
      severity: payload.severity ?? "required_correction",
      fields: payload.fields ?? [],
      adminInternalNote: payload.adminInternalNote,
      reviewedBy: actorId == null ? "local-admin" : String(actorId)
    } : undefined);
    if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    const nextStage = statusStageMap[payload.status];
    const queueEntry = nextStage ? await syncQueueStage(Number(id), nextStage, actorId, statusReason) : null;
    await createReleaseAuditLog({ releaseId: Number(id), userId: actorId, action: "ADMIN_MANUAL_STATUS_OVERRIDE", details: { status: payload.status, reason: payload.reason ?? payload.note ?? "Admin override", adminNote: payload.adminInternalNote ?? null } });
    return NextResponse.json({ release, queueEntry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 7
// vercel trigger 9

// vercel trigger 12
