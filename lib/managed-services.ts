import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export type ManagedServiceType = "CRBT_CALLER_TUNE" | "YOUTUBE_OAC" | "YOUTUBE_CONTENT_ID";
const transitions: Record<string, string[]> = {
  submitted: ["eligibility_review", "cancelled"], eligibility_review: ["information_required", "approved", "rejected", "cancelled"],
  information_required: ["eligibility_review", "cancelled"], approved: ["processing_manually", "cancelled"],
  processing_manually: ["submitted_to_partner", "failed", "cancelled"], submitted_to_partner: ["completed", "partially_completed", "failed"],
  partially_completed: ["processing_manually", "completed", "failed"], failed: ["processing_manually"], completed: [], rejected: [], cancelled: [],
};
export function contentIdRiskFlags(answers: Record<string, unknown>) {
  const flags: string[] = [];
  if (answers.exclusiveRights !== true) flags.push("NON_EXCLUSIVE_RIGHTS");
  if (answers.nonExclusiveBeat === true) flags.push("NON_EXCLUSIVE_BEAT");
  if (answers.widelyLicensedLoops === true) flags.push("WIDELY_LICENSED_LOOPS");
  if (answers.coverRecording === true && answers.coverRightsConfirmed !== true) flags.push("COVER_RIGHTS_UNCONFIRMED");
  if (answers.publicDomain === true && answers.sufficientOriginality !== true) flags.push("PUBLIC_DOMAIN_ORIGINALITY_RISK");
  if (answers.enrolledElsewhere === true) flags.push("ALREADY_ENROLLED_ELSEWHERE");
  if (answers.genericAudio === true) flags.push("GENERIC_AUDIO_POLICY_RISK");
  if (answers.conflictingClaims === true) flags.push("CONFLICTING_CLAIMS");
  return flags;
}

const crbtAnswers = z.object({ telecomProviders: z.array(z.string().trim().min(2).max(100)).min(1).max(20), startPointSeconds: z.number().int().min(0).max(600), language: z.string().trim().min(2).max(80), releaseStatus: z.string().trim().min(2).max(80), isrc: z.string().trim().min(5).max(30), upc: z.string().trim().min(5).max(30), rightsConfirmed: z.literal(true), desiredCallerTuneTitle: z.string().trim().min(2).max(160), existingProviderReferences: z.array(z.string().trim().max(200)).max(20).default([]) });
const oacAnswers = z.object({ artistName: z.string().trim().min(2).max(160), artistChannelUrl: z.string().url(), topicChannelUrl: z.string().url().optional().or(z.literal("")), distributedReleaseLinks: z.array(z.string().url()).min(1).max(20), channelOwnershipConfirmed: z.literal(true), existingOacStatus: z.string().trim().min(2).max(120), supportingEvidence: z.string().trim().max(2000).optional() });
const contentIdAnswers = z.object({ ownershipType: z.string().trim().min(2).max(100), exclusiveRights: z.boolean(), samplesOrLoops: z.boolean(), widelyLicensedLoops: z.boolean(), nonExclusiveBeat: z.boolean(), beatLicenseType: z.string().trim().max(100), coverRecording: z.boolean(), coverRightsConfirmed: z.boolean(), publicDomain: z.boolean(), sufficientOriginality: z.boolean(), enrolledElsewhere: z.boolean(), conflictingClaims: z.boolean(), genericAudio: z.boolean(), territory: z.string().trim().min(2).max(100), excludedChannels: z.array(z.string().url()).max(50).default([]) });
export function validateManagedServiceAnswers(serviceType: ManagedServiceType, answers: Record<string, unknown>, trackId?: number) {
  if (serviceType === "CRBT_CALLER_TUNE" && !trackId) throw new Error("CRBT requests require a track.");
  const schema = serviceType === "CRBT_CALLER_TUNE" ? crbtAnswers : serviceType === "YOUTUBE_OAC" ? oacAnswers : contentIdAnswers;
  return schema.parse(answers) as Record<string, unknown>;
}

export async function createManagedServiceRequest(input: { userId: number; releaseId: number; trackId?: number; serviceType: ManagedServiceType; provider?: string; answers: Record<string, unknown>; declarations?: Record<string, unknown>; publicLinks?: string[]; documentAssetIds?: number[]; requestKey: string }) {
  const release = await prisma.release.findFirst({ where: { id: input.releaseId, userId: input.userId }, include: { tracks: true } });
  if (!release || (input.trackId && !release.tracks.some(track => track.id === input.trackId))) throw new Error("Release or track not found.");
  const answers = validateManagedServiceAnswers(input.serviceType, input.answers, input.trackId);
  const idempotencyKey = createHash("sha256").update(`${input.userId}:${input.requestKey.trim()}:${input.serviceType}:${input.releaseId}:${input.trackId ?? "release"}`).digest("hex");
  const keyed = await prisma.managedServiceRequest.findUnique({ where: { idempotencyKey } }); if (keyed) return keyed;
  const duplicate = await prisma.managedServiceRequest.findFirst({ where: { userId: input.userId, releaseId: input.releaseId, trackId: input.trackId ?? null, serviceType: input.serviceType, status: { notIn: ["rejected", "cancelled", "failed", "completed"] } } });
  if (duplicate) return duplicate;
  const documentAssetIds = [...new Set(input.documentAssetIds ?? [])];
  if (documentAssetIds.length) {
    const validDocuments = await prisma.storedAsset.count({ where: { id: { in: documentAssetIds }, ownerUserId: input.userId, releaseId: input.releaseId, deletedAt: null, accessClassification: "private", assetType: { in: ["private_ownership_proof", "private_cover_licence", "private_ai_receipt"] } } });
    if (validDocuments !== documentAssetIds.length) throw new Error("One or more supporting documents are unavailable or do not belong to this release.");
  }
  const riskFlags = input.serviceType === "YOUTUBE_CONTENT_ID" ? contentIdRiskFlags(answers) : [];
  return prisma.$transaction(async tx => {
    const request = await tx.managedServiceRequest.create({ data: { userId: input.userId, releaseId: input.releaseId, trackId: input.trackId, serviceType: input.serviceType, provider: input.provider, eligibilityAnswers: answers as Prisma.InputJsonObject, declarations: input.declarations as Prisma.InputJsonObject | undefined, publicLinks: input.publicLinks ?? [], riskFlags, idempotencyKey, documents: { create: documentAssetIds.map(assetId => ({ assetId })) } } });
    await tx.auditLog.create({ data: { actorId: input.userId, action: "MANAGED_SERVICE_REQUEST_SUBMITTED", entity: "managed_service_request", entityId: String(request.id), metadata: { serviceType: input.serviceType, riskFlags, processing: "manual" } } });
    return request;
  });
}

export async function updateManagedServiceRequest(input: { id: number; status: string; userVisibleUpdate: string; internalNotes?: string; externalReference?: string; actorId: number | null; providerStatuses?: Array<{ provider: string; status: string; reference?: string; note?: string }> }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM managed_service_requests WHERE id = ${input.id} FOR UPDATE`;
    const existing = await tx.managedServiceRequest.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("Request not found.");
    if (!(transitions[existing.status] ?? []).includes(input.status)) throw new Error(`Illegal managed-service transition: ${existing.status} -> ${input.status}.`);
    if (["submitted_to_partner", "completed", "partially_completed"].includes(input.status) && !input.externalReference?.trim()) throw new Error("Partner reference is required for partner submission or completion.");
    const row = await tx.managedServiceRequest.update({ where: { id: input.id }, data: { status: input.status, userVisibleUpdate: input.userVisibleUpdate.trim(), internalNotes: input.internalNotes?.trim(), externalReference: input.externalReference?.trim(), assignedAdminId: input.actorId, reviewedAt: new Date(), completedAt: ["completed", "partially_completed"].includes(input.status) ? new Date() : undefined, rejectionReason: input.status === "rejected" ? input.userVisibleUpdate.trim() : null } });
    for (const provider of input.providerStatuses ?? []) await tx.managedServiceProviderStatus.upsert({ where: { requestId_provider: { requestId: input.id, provider: provider.provider.trim() } }, create: { requestId: input.id, provider: provider.provider.trim(), status: provider.status.trim(), reference: provider.reference?.trim(), note: provider.note?.trim() }, update: { status: provider.status.trim(), reference: provider.reference?.trim(), note: provider.note?.trim() } });
    await tx.auditLog.create({ data: { actorId: input.actorId, action: "MANAGED_SERVICE_REQUEST_UPDATED", entity: "managed_service_request", entityId: String(input.id), metadata: { previousStatus: existing.status, newStatus: input.status, processing: "manual", externalReference: input.externalReference?.trim() || null } } });
    return row;
  });
}
// vercel trigger 9
