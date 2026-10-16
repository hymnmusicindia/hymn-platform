import { prisma } from "@/lib/prisma";

export async function reviewStudioFinance(publicId: string, decision: "CLOSE_FINANCE" | "RETRY_REFUND", reason: string, actorId: number | null) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${publicId}))`;
    const order = await tx.studioServiceOrder.findUniqueOrThrow({ where: { publicId }, include: { earning: true, payments: { include: { refunds: true } } } });
    if (decision === "CLOSE_FINANCE") {
      if (!["DISPUTED", "REFUNDED", "COMPLETED"].includes(order.status) || !order.earning || order.earning.heldNetAmount.gt(0) || order.payments.some(p => p.status === "DISPUTED" || p.refunds.some(r => ["REQUESTED", "PENDING"].includes(r.status)))) throw new Error("Resolve all provider disputes and pending refunds before closing financial review.");
      const funding = order.payments.filter(p => p.capturedAt);
      const fullyRefunded = funding.length > 0 && funding.every(p => p.refundedAmount.eq(p.amount));
      await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: fullyRefunded ? "REFUNDED" : "COMPLETED", paymentStatus: fullyRefunded ? "REFUNDED" : "RELEASED" } });
      await tx.adminTask.updateMany({ where: { eventKey: `studio-finance:${order.id}` }, data: { status: "resolved", resolvedAt: new Date() } });
    } else {
      if (order.status !== "REFUND_PENDING") throw new Error("The project is not awaiting a refund.");
      let created = 0;
      for (const p of order.payments) {
        if (!p.capturedAt || !p.refunds.some(r => r.status === "FAILED") || p.refunds.some(r => ["REQUESTED", "PENDING"].includes(r.status))) continue;
        const remaining = Number(p.amount.mul(100)) - p.refunds.filter(r => r.status === "PROCESSED").reduce((sum, r) => sum + r.amountMinor, 0);
        if (remaining > 0) { await tx.studioRefund.create({ data: { paymentId: p.id, amountMinor: remaining, currency: p.currency } }); created++; }
      }
      if (!created) throw new Error("No failed refund is eligible. Ambiguous responses reuse their existing request key automatically.");
    }
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: `STUDIO_${decision}`, entity: "studio_order", entityId: String(order.id), metadata: { reason } } });
    await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body: `HYMN financial review: ${reason}` } });
  });
}
