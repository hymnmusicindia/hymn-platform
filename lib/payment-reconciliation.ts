import { listAllOrders } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { logAuditEvent } from "@/lib/audit-log";
import { generateBeatLicense } from "@/lib/beat-license";
import { confirmCheckoutPayment, confirmDistributionPayment } from "@/lib/payment-webhooks";
import { normalizeBeatLicenseType } from "@/lib/beat-store";
import { recoverStudioPayments } from "@/lib/studio-payment-recovery";

export type PaymentReconciliationIssue = { key: string; type: "beat" | "distribution" | "subscription" | "duplicate" | "studio"; message: string; autoRepaired: boolean };

export async function reconcilePayments() {
  const issues: PaymentReconciliationIssue[] = [];
  const studio = await recoverStudioPayments(Date.now() + 20000);
  issues.push(...studio.issues.map((message, index) => ({ key: `studio:${index}`, type: "studio" as const, message, autoRepaired: false })));
  const orders = await listAllOrders();
  const paid = orders.filter((order) => order.paymentStatus === "paid");
  const paymentIds = new Map<string, number[]>();
  for (const order of paid) {
    if (order.razorpayPaymentId) await confirmCheckoutPayment({ razorpayOrderId: order.razorpayOrderId, paymentId: order.razorpayPaymentId, source: "reconciliation" });
    if (order.razorpayPaymentId) paymentIds.set(order.razorpayPaymentId, [...(paymentIds.get(order.razorpayPaymentId) ?? []), order.id]);
    for (const item of order.items) {
      const licenseType = normalizeBeatLicenseType(item.licenseType);
      const purchase = await prisma.beatPurchase.findFirst({ where: { userId: order.userId, beatId: item.beatId, licenseType, paymentId: order.razorpayPaymentId ?? null } });
      if (!purchase) {
        const created = await prisma.beatPurchase.create({ data: { userId: order.userId, beatId: item.beatId, licenseType, paymentId: order.razorpayPaymentId ?? null, hasAccess: true } });
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
    if (order.razorpayPaymentId) await confirmDistributionPayment({ razorpayOrderId: order.razorpayOrderId, paymentId: order.razorpayPaymentId, source: "reconciliation" });
    const key = `payment:distribution:${order.id}`;
    // A ₹0 order with no credits spent was covered by the customer's plan: no
    // money changed hands, so there is nothing unfulfilled to flag. These were
    // raised as critical mismatches (e.g. plan-covered drafts later archived).
    const charged = order.amount > 0 || order.creditsUsed > 0;
    const release = charged ? await prisma.release.findFirst({ where: { id: order.releaseId ?? -1, userId: order.userId, paymentStatus: "paid" } }) : null;
    if (!charged || release) await resolveAdminTask(key, charged ? "The paid order is linked to a fulfilled release." : "Plan-covered order with no charge; nothing to fulfil.");
    else {
      issues.push({ key, type: "distribution", message: `Paid distribution order #${order.id} has no fulfilled release.`, autoRepaired: false });
      await createAdminTaskOnce({ eventKey: key, type: "Payment Mismatch", priority: "critical", title: "Paid distribution order is unfulfilled", body: issues.at(-1)!.message, href: "/admin?tab=distribution-orders", entityType: "distribution_order", entityId: order.id });
    }
    if (order.plan !== "one_time" && !order.razorpayOrderId.startsWith("sub_entitlement_")) {
      const entitlement = await prisma.subscription.findFirst({ where: { userId: order.userId, status: "active", expiryDate: { gt: new Date() } } });
      if (!entitlement) {
        const key = `payment:subscription:${order.id}`;
        // Recurring entitlements must come from verified provider subscription
        // state. A paid release order is not evidence of a recurring mandate.
        issues.push({ key, type: "subscription", message: `Paid legacy order #${order.id} has no active subscription. Verify its provider subscription before restoring access.`, autoRepaired: false });
        await createAdminTaskOnce({ eventKey: key, type: "Payment Mismatch", priority: "high", title: "Subscription entitlement needs provider verification", body: issues.at(-1)!.message, href: "/admin?tab=distribution-orders", entityType: "distribution_order", entityId: order.id });
      }
    }
  }
  await logAuditEvent({ actorType: "cron", entityType: "payment_reconciliation", entityId: new Date().toISOString().slice(0, 10), action: "payments.reconciled", metadata: { paidOrders: paid.length, issues: issues.length, repaired: issues.filter((issue) => issue.autoRepaired).length } });
  return { checkedAt: new Date().toISOString(), issues };
}
// vercel trigger 9
