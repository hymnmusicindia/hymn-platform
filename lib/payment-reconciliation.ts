import { listAllOrders } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { logAuditEvent } from "@/lib/audit-log";
import { generateBeatLicense } from "@/lib/beat-license";

export type PaymentReconciliationIssue = { key: string; type: "beat" | "distribution" | "subscription" | "duplicate"; message: string; autoRepaired: boolean };

export async function reconcilePayments() {
  const issues: PaymentReconciliationIssue[] = [];
  const orders = await listAllOrders();
  const paid = orders.filter((order) => order.paymentStatus === "paid");
  const paymentIds = new Map<string, number[]>();
  for (const order of paid) {
    if (order.razorpayPaymentId) paymentIds.set(order.razorpayPaymentId, [...(paymentIds.get(order.razorpayPaymentId) ?? []), order.id]);
    for (const item of order.items) {
      const purchase = await prisma.beatPurchase.findUnique({ where: { userId_beatId_licenseType: { userId: order.userId, beatId: item.beatId, licenseType: item.licenseType } } });
      if (!purchase) {
        const created = await prisma.beatPurchase.create({ data: { userId: order.userId, beatId: item.beatId, licenseType: item.licenseType, paymentId: order.razorpayPaymentId ?? null, hasAccess: true } });
        const license = await generateBeatLicense(created.id, order.userId).catch(() => null);
        issues.push({ key: `beat-order:${order.id}:${item.beatId}`, type: "beat", message: `Created missing beat purchase #${created.id}${license ? " and generated its license" : "; license generation still needs attention"}.`, autoRepaired: Boolean(license) });
        if (!license) await createAdminTaskOnce({ eventKey: `license:${created.id}:missing`, type: "License Missing", priority: "high", title: `License missing for purchase #${created.id}`, body: "Payment reconciliation restored the purchase, but license generation failed.", href: `/admin?tab=orders&purchaseId=${created.id}`, entityType: "beat_purchase", entityId: created.id });
      } else if (!purchase.licenseUrl) {
        await createAdminTaskOnce({ eventKey: `license:${purchase.id}:missing`, type: "License Missing", priority: "high", title: `License missing for purchase #${purchase.id}`, body: "A paid purchase exists without a generated license.", href: `/admin?tab=orders&purchaseId=${purchase.id}`, entityType: "beat_purchase", entityId: purchase.id });
      }
      await resolveAdminTask(`payment:beat:${order.id}:${item.beatId}`, "Missing purchase was repaired.");
    }
  }
  for (const [paymentId, ids] of paymentIds) if (ids.length > 1) {
    const key = `payment:duplicate:${paymentId}`;
    issues.push({ key, type: "duplicate", message: `Payment ${paymentId} appears on orders ${ids.join(", ")}.`, autoRepaired: false });
    await createAdminTaskOnce({ eventKey: key, type: "Payment Mismatch", priority: "critical", title: "Duplicate payment ID", body: issues.at(-1)!.message, href: "/admin?tab=orders", entityType: "payment", entityId: paymentId });
  }
  const distributionOrders = await prisma.distributionOrder.findMany({ where: { paymentStatus: "paid" } });
  for (const order of distributionOrders) {
    const release = await prisma.release.findFirst({ where: { userId: order.userId, paymentStatus: "paid", createdAt: { gte: new Date(order.createdAt.getTime() - 60_000) } } });
    if (!release) {
      const key = `payment:distribution:${order.id}`;
      issues.push({ key, type: "distribution", message: `Paid distribution order #${order.id} has no fulfilled release.`, autoRepaired: false });
      await createAdminTaskOnce({ eventKey: key, type: "Payment Mismatch", priority: "critical", title: "Paid distribution order is unfulfilled", body: issues.at(-1)!.message, href: "/admin?tab=distribution-orders", entityType: "distribution_order", entityId: order.id });
    }
    if (order.plan !== "one_time") {
      const entitlement = await prisma.subscription.findFirst({ where: { userId: order.userId, status: "active", expiryDate: { gt: new Date() } } });
      if (!entitlement) {
        const key = `payment:subscription:${order.id}`;
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + (order.plan === "half_yearly" ? 6 : 12));
        await prisma.subscription.upsert({ where: { userId: order.userId }, create: { userId: order.userId, plan: order.plan, planName: order.plan, expiryDate, status: "active", artistLimit: order.plan === "yearly_plus" ? 15 : order.plan === "yearly" ? 7 : 5 }, update: { plan: order.plan, planName: order.plan, expiryDate, status: "active", artistLimit: order.plan === "yearly_plus" ? 15 : order.plan === "yearly" ? 7 : 5 } });
        issues.push({ key, type: "subscription", message: `Restored missing ${order.plan} entitlement from paid order #${order.id}.`, autoRepaired: true });
        await resolveAdminTask(key, "Subscription entitlement was restored automatically.");
      }
    }
  }
  await logAuditEvent({ actorType: "cron", entityType: "payment_reconciliation", entityId: new Date().toISOString().slice(0, 10), action: "payments.reconciled", metadata: { paidOrders: paid.length, issues: issues.length, repaired: issues.filter((issue) => issue.autoRepaired).length } });
  return { checkedAt: new Date().toISOString(), issues };
}
