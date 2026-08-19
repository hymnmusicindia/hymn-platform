import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRecentAdminPermission("payouts.mark_paid"); if ("error" in admin) return admin.error;
  if (!("sub" in admin)) return NextResponse.json({ error: "Database-backed administrator session required." }, { status: 403 });
  const id = Number((await context.params).id);
  const payout = await prisma.payoutRequest.findUnique({ where: { id } });
  if (!payout || !["APPROVED", "PROCESSING"].includes(payout.status)) return NextResponse.json({ error: "Proof can only be attached to an approved or processing payout." }, { status: 409 });
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A PDF, JPEG, or PNG payment proof is required." }, { status: 400 });
    const stored = await localPrivateStorage.upload({ ownerUserId: payout.userId, assetType: "private_payout_proof", fileName: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    try {
      await prisma.$transaction(async tx => { await tx.payoutRequest.update({ where: { id }, data: { proofAssetId: stored.id } }); await tx.payoutRequestEvent.create({ data: { payoutRequestId: id, actorType: "admin", actorId: Number(admin.sub), previousStatus: payout.status.toLowerCase(), newStatus: payout.status.toLowerCase(), note: "Private payment proof attached.", metadata: { proofAssetId: stored.id } } }); await tx.auditLog.create({ data: { actorId: Number(admin.sub), action: "PAYOUT_PROOF_ATTACHED", entity: "payout_request", entityId: String(id), metadata: { proofAssetId: stored.id } } }); });
    } catch (error) { await localPrivateStorage.delete({ assetId: stored.id, requesterUserId: Number(admin.sub), isAdmin: true }).catch(() => undefined); throw error; }
    return NextResponse.json({ proof: { assetId: stored.id, downloadPath: stored.downloadPath } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Payment proof upload failed." }, { status: 400 }); }
}
// vercel trigger 9
