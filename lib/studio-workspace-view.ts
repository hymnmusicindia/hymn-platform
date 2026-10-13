import type { getStudioWorkspace } from "@/lib/studio-services";
export function studioWorkspaceView(order: Awaited<ReturnType<typeof getStudioWorkspace>>) {
 return {
  publicId: order.publicId, projectTitle: order.projectTitle, status: order.status, customerId: order.customerId, engineerUserId: order.engineerParty.claimedByUserId, engineerName: order.engineerProfile.professionalName, paidAt: order.paidAt?.toISOString() ?? null,
  includedRevisions: order.includedRevisions, activeRevisionCount: order.activeRevisionCount, finalPrice: Number(order.finalPrice), additionalRevisionPrice: Number(order.additionalRevisionPrice), pendingRevisionId: order.revisions.find(r => r.status === "PAYMENT_REQUIRED")?.id ?? null,
  messages: order.messages.map(m => ({ id: m.id, senderUserId: m.senderUserId, body: m.body, kind: m.kind, metadata: m.metadata as { phone?: string; state?: string } | null, idempotencyKey: m.idempotencyKey, createdAt: m.createdAt.toISOString(), senderName: m.sender?.name ?? null })).reverse(),
  files: order.files.map(f => ({ id: f.id, uploaderId: f.uploaderId, category: f.category, version: f.version, assetId: f.asset.id, name: f.asset.safeFilename, mimeType: f.asset.mimeType, createdAt: f.createdAt.toISOString() })),
  deliveries: order.deliveries.map(d => ({ id: d.id, version: d.version, note: d.note, createdAt: d.deliveredAt.toISOString(), engineerConfirmedAt: d.engineerConfirmedAt?.toISOString() ?? null, customerConfirmedAt: d.customerConfirmedAt?.toISOString() ?? null, files: d.files.map(df => ({ studioFileId: df.studioFile.id, assetId: df.studioFile.asset.id, name: df.studioFile.asset.safeFilename, mimeType: df.studioFile.asset.mimeType })) })),
  payments: order.payments.map(p => ({ id: p.id, amount: Number(p.amount), purpose: p.purpose, status: p.status, createdAt: (p.capturedAt ?? p.createdAt).toISOString() })),
  revisions: order.revisions.map(r => ({ id: r.id, sequence: r.sequence, feedback: r.feedback, status: r.status, included: r.included, createdAt: r.createdAt.toISOString() })),
  reviewed: Boolean(order.review), amendments: order.amendments.map(a => ({ publicId: a.publicId, description: a.description, amount: Number(a.amount), status: a.status, createdAt: a.createdAt.toISOString() })),
 };
}
export type StudioWorkspaceView = ReturnType<typeof studioWorkspaceView>;
