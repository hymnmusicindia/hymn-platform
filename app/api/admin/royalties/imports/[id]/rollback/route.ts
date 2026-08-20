import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("royalties.import"); if ("error" in admin) return admin.error;
  const actorId = "sub" in admin ? Number(admin.sub) : 0; const statementId = Number((await context.params).id); const body = await request.json().catch(() => ({})); const reason = String(body.reason || "").trim();
  if (!actorId || !Number.isInteger(statementId) || reason.length < 5) return NextResponse.json({ error: "A rollback reason is required." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const statement = await tx.royaltyStatement.findUnique({ where: { id: statementId }, include: { lines: { include: { allocations: true } } } });
      if (!statement || statement.status !== "imported") throw new Error("Only an active imported statement can be rolled back.");
      for (const line of statement.lines) for (const allocation of line.allocations) {
        const balance = await tx.artistPayoutBalance.findUnique({ where: { userId: allocation.userId } });
        if (!balance || balance.availableBalance.lessThan(allocation.allocatedAmount) || balance.pendingBalance.lessThan(allocation.heldAmount)) throw new Error("Rollback blocked because allocated earnings have already moved or been paid.");
        await tx.artistPayoutBalance.update({ where: { userId: allocation.userId }, data: { availableBalance: { decrement: allocation.allocatedAmount }, pendingBalance: { decrement: allocation.heldAmount }, lifetimeEarnings: { decrement: allocation.grossAmount }, lastUpdatedAt: new Date() } });
        await tx.walletTransaction.create({ data: { userId: allocation.userId, type: "royalty_import_rollback", amount: allocation.grossAmount.negated(), currency: allocation.currency, direction: "debit", referenceType: "royalty_statement_rollback", referenceId: String(statement.id), idempotencyKey: `royalty-rollback:${statement.id}:${allocation.id}`, balanceAfter: balance.availableBalance.sub(allocation.allocatedAmount), availabilityStatus: "reversed", auditMetadata: { royaltyLineItemId: line.id, reason } } });
      }
      await tx.splitEarningLineItem.updateMany({ where: { royaltyLineItem: { statementId } }, data: { status: "reversed" } });
      await tx.royaltyStatement.update({ where: { id: statement.id }, data: { status: "rolled_back", rolledBackAt: new Date(), rolledBackByUserId: actorId, rollbackReason: reason } });
      await tx.royaltyImportJob.updateMany({ where: { statementId }, data: { state: "rolled_back", phase: "rolled_back" } });
      await tx.auditLog.create({ data: { actorId, action: "ROYALTY_IMPORT_ROLLED_BACK", entity: "royalty_statement", entityId: String(statement.id), metadata: { reason, lines: statement.lines.length } } });
      return { statementId, reversedLines: statement.lines.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Rollback failed." }, { status: 409 }); }
}

// vercel trigger 14
