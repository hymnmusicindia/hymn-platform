import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { reverseReferralForTransactionInTransaction } from "@/lib/referrals";

const schema = z.object({ reason: z.string().trim().min(10).max(500), confirm: z.literal(true) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("wallets.adjust"); if ("error" in admin) return admin.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Confirmation and reason are required." }, { status: 400 });
  const id = Number((await params).id); const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  try {
    const result = await prisma.$transaction(async tx => {
      const referral = await tx.referral.findUnique({ where: { id } });
      if (!referral?.qualifyingTransactionId || !["checkout_order", "distribution_order"].includes(referral.qualifyingTransactionType || "")) throw new Error("This referral has no reversible qualifying transaction.");
      const reversal = await reverseReferralForTransactionInTransaction(tx, { transactionType: referral.qualifyingTransactionType as "checkout_order" | "distribution_order", transactionId: referral.qualifyingTransactionId, reason: "refunded" });
      await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: "admin", action: "REFERRAL_ADMIN_REVERSAL_REQUESTED", entity: "referral", entityId: String(id), reason: parsed.data.reason, riskLevel: "high", metadata: reversal } });
      return reversal;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reverse referral." }, { status: 400 }); }
}
