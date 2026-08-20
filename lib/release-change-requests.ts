import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateDetailedReleaseStatus } from "@/lib/distribution-db";

export type ReleaseChangeRequestType = "correction" | "metadata_update" | "asset_update" | "takedown";
const allowedRequestTransitions: Record<string, string[]> = {
  submitted: ["approved", "information_required", "rejected"],
  information_required: ["submitted", "rejected"],
  approved: ["processing_manually", "submitted_to_partner", "rejected"],
  processing_manually: ["submitted_to_partner", "completed", "failed"],
  submitted_to_partner: ["completed", "failed"],
  rejected: [], completed: [], failed: []
};

export async function createReleaseChangeRequest(input: { releaseId: number; userId: number; requestType: ReleaseChangeRequestType; reason: string; desiredEffectiveAt?: Date; requestedChanges?: Prisma.InputJsonValue }) {
  if (input.reason.trim().length < 10) throw new Error("Provide a reason of at least 10 characters.");
  const release = await prisma.release.findFirst({ where: { id: input.releaseId, userId: input.userId } });
  if (!release) throw new Error("Release not found.");
  if (input.requestType !== "correction" && !["LIVE", "PARTIALLY_LIVE", "SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING"].includes(release.status)) throw new Error("This release is not eligible for a post-delivery change request.");
  const existing = await prisma.releaseChangeRequest.findFirst({ where: { releaseId: input.releaseId, requestType: input.requestType, status: { in: ["submitted", "under_review", "approved", "processing_manually", "submitted_to_partner"] } } });
  if (existing) return existing;
  return prisma.$transaction(async tx => {
    const request = await tx.releaseChangeRequest.create({ data: { releaseId: input.releaseId, requestedByUserId: input.userId, requestType: input.requestType, reason: input.reason.trim(), desiredEffectiveAt: input.desiredEffectiveAt, requestedChanges: input.requestedChanges } });
    await tx.releaseChangeRequestEvent.create({ data: { requestId: request.id, actorType: "user", actorId: input.userId, previousStatus: null, newStatus: "submitted", note: input.reason.trim(), metadata: { desiredEffectiveAt: input.desiredEffectiveAt?.toISOString() ?? null, requestedChanges: input.requestedChanges ?? null } } });
    await tx.auditLog.create({ data: { actorId: input.userId, action: "RELEASE_CHANGE_REQUEST_SUBMITTED", entity: "release_change_request", entityId: String(request.id), metadata: { releaseId: input.releaseId, requestType: input.requestType, reason: input.reason.trim() } } });
    return request;
  });
}

export async function reviewReleaseChangeRequest(input: { id: number; adminId?: number | null; decision: "approved" | "information_required" | "rejected" | "processing_manually" | "submitted_to_partner" | "completed" | "failed"; note: string; providerReference?: string }) {
  if (!input.note.trim()) throw new Error("An administrative reason is required.");
  const current = await prisma.releaseChangeRequest.findUnique({ where: { id: input.id } });
  if (!current) throw new Error("Change request not found.");
  if (!allowedRequestTransitions[current.status]?.includes(input.decision)) throw new Error(`Change request cannot move from ${current.status} to ${input.decision}.`);
  if (["submitted_to_partner", "completed"].includes(input.decision) && current.status === "submitted_to_partner" && !input.providerReference?.trim() && !current.providerReference) throw new Error("Partner execution reference is required.");
  if (input.decision === "submitted_to_partner" && !input.providerReference?.trim()) throw new Error("Partner submission reference is required.");
  const updated = await prisma.$transaction(async tx => {
    const request = await tx.releaseChangeRequest.update({ where: { id: input.id }, data: { status: input.decision, adminNote: input.note.trim(), providerReference: input.providerReference?.trim() || undefined, reviewedByAdminId: input.adminId, reviewedAt: new Date(), completedAt: input.decision === "completed" ? new Date() : undefined } });
    await tx.releaseChangeRequestEvent.create({ data: { requestId: input.id, actorType: "admin", actorId: input.adminId, previousStatus: current.status, newStatus: input.decision, note: input.note.trim(), providerReference: input.providerReference?.trim() || current.providerReference } });
    await tx.auditLog.create({ data: { actorId: input.adminId, action: "RELEASE_CHANGE_REQUEST_REVIEWED", entity: "release_change_request", entityId: String(input.id), metadata: { previousStatus: current.status, newStatus: input.decision, note: input.note.trim() } } });
    return request;
  });
  if (current.requestType === "takedown" && input.decision === "approved") await updateDetailedReleaseStatus(current.releaseId, "takedown_requested", input.note);
  if (current.requestType === "takedown" && ["processing_manually", "submitted_to_partner"].includes(input.decision)) await updateDetailedReleaseStatus(current.releaseId, "takedown_processing", input.note);
  if (current.requestType === "takedown" && input.decision === "completed") await updateDetailedReleaseStatus(current.releaseId, "taken_down", input.note);
  return updated;
}
// vercel trigger 9
