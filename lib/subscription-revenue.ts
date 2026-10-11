import { prisma } from "@/lib/prisma";

export type SubscriptionRevenueRow = {
  id: string; userId: number; email: string; plan: string; subscriptionStatus: string;
  amountMinor: number; currency: string; status: string; verification: "gateway" | "merchant_confirmation";
  reference: string; subscriptionReference: string | null; createdAt: string;
};

/** Read existing financial evidence only; never fabricate a gateway payment ID. */
export async function listSubscriptionRevenue(): Promise<SubscriptionRevenueRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const [payments, confirmations] = await Promise.all([
    prisma.subscriptionPayment.findMany({ include: { subscription: { include: { user: { select: { id: true, email: true } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { action: "SUBSCRIPTION_MERCHANT_CONFIRMED_PAYMENT", entity: "subscriptions" }, orderBy: { createdAt: "asc" } })
  ]);
  const rows: SubscriptionRevenueRow[] = payments.map(p => ({ id: `payment:${p.id}`, userId: p.subscription.userId, email: p.subscription.user.email, plan: p.subscription.plan, subscriptionStatus: p.subscription.status, amountMinor: p.amount, currency: p.currency, status: p.status, verification: "gateway", reference: p.razorpayPaymentId, subscriptionReference: p.subscription.razorpaySubscriptionId, createdAt: p.createdAt.toISOString() }));
  const captured = new Set(payments.filter(p => p.status === "captured").map(p => p.subscriptionId));
  const seen = new Set<number>();
  for (const audit of confirmations) {
    const id = Number(audit.entityId);
    if (!Number.isSafeInteger(id) || captured.has(id) || seen.has(id)) continue;
    const metadata = audit.metadata as Record<string, unknown> | null;
    const amountMinor = Number(metadata?.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || typeof metadata?.currency !== "string") continue;
    const subscription = await prisma.subscription.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
    if (!subscription || Number(metadata?.userId) !== subscription.userId) continue;
    seen.add(id);
    rows.push({ id: `confirmation:${audit.id}`, userId: subscription.userId, email: subscription.user.email, plan: subscription.plan, subscriptionStatus: subscription.status, amountMinor, currency: metadata.currency, status: "merchant_confirmed", verification: "merchant_confirmation", reference: `HYMN-MR-${audit.id}`, subscriptionReference: subscription.razorpaySubscriptionId, createdAt: audit.createdAt.toISOString() });
  }
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
