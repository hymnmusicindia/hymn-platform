import { prisma } from "@/lib/prisma";
import type { RevenueEntry } from "@/lib/revenue-report";
import { distributionFunding } from "@/lib/revenue-report";
import type { SubscriptionRevenueRow } from "@/lib/subscription-revenue";
import type { DistributionOrder, Order } from "@/lib/types";

export async function listPlatformRevenue(distribution: DistributionOrder[], orders: Order[], subscriptions: SubscriptionRevenueRow[]): Promise<RevenueEntry[]> {
  const entries: RevenueEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: RevenueEntry, payment?: string | null) => { if (payment && seen.has(payment)) return; if (payment) seen.add(payment); entries.push(entry); };
  // Subscription amounts are stored in paise; order and commission amounts are rupees.
  for (const row of subscriptions.filter(row => row.status === "captured" || row.status === "merchant_confirmed")) add({ id: row.id, channel: "Subscriptions", date: row.createdAt, receipt: row.amountMinor / 100, hymn: row.amountMinor / 100, currency: row.currency, reference: row.reference, customer: row.email, evidence: row.verification }, row.verification === "gateway" ? row.reference : null);
  for (const row of distribution.filter(row => row.paymentStatus === "paid")) add({ id: `distribution:${row.id}`, channel: "Distribution", date: row.createdAt, receipt: row.amount, hymn: row.amount, currency: "INR", reference: row.razorpayPaymentId || row.razorpayOrderId, customer: `User #${row.userId}`, evidence: row.amount > 0 ? "gateway" : "ledger", funding: distributionFunding(row), creditsUsed: row.creditsUsed }, row.razorpayPaymentId);
  if (!process.env.DATABASE_URL) {
    for (const row of orders.filter(row => row.paymentStatus === "paid")) add({ id: `commerce:${row.id}`, channel: "Beat Store", date: row.createdAt, receipt: row.amount, hymn: null, currency: "INR", reference: row.razorpayPaymentId || row.razorpayOrderId, customer: row.buyerEmail || `User #${row.userId}`, evidence: "gateway" }, row.razorpayPaymentId);
    return entries;
  }
  const [sales, studioPayments, studioEarnings, royalties, payoutFees] = await Promise.all([
    prisma.beatSale.findMany({ where: { status: "paid" }, select: { orderId: true, hymnCommissionAmount: true, refundedAmount: true, currency: true } }),
    prisma.studioPayment.findMany({ where: { status: "CAPTURED" }, select: { id: true, orderId: true, amount: true, currency: true, capturedAt: true, createdAt: true, razorpayPaymentId: true, razorpayOrderId: true } }),
    prisma.studioEarning.findMany({ where: { status: { notIn: ["REVERSED", "REFUNDED", "CANCELLED"] } }, select: { id: true, orderId: true, commissionAmount: true, currency: true, createdAt: true } }),
    prisma.royaltyLineItem.findMany({ where: { hymnServiceFee: { not: 0 }, OR: [{ statementId: null }, { statement: { rolledBackAt: null } }] }, select: { id: true, hymnServiceFee: true, statementMonth: true, userId: true, statement: { select: { currency: true } }, allocations: { select: { currency: true }, take: 1 } } }),
    prisma.payoutRequest.findMany({ where: { status: "PAID", serviceFee: { gt: 0 } }, select: { id: true, serviceFee: true, currency: true, paidAt: true, requestedAt: true, userId: true } })
  ]);
  for (const row of orders.filter(row => row.paymentStatus === "paid")) {
    const allocated = sales.filter(sale => sale.orderId === row.id && sale.currency === "INR");
    // Partial refunds require the actual reversal ledger, never an inferred percentage.
    const hymn = allocated.length === row.items.length && allocated.length > 0 && allocated.every(sale => Number(sale.refundedAmount) === 0) ? allocated.reduce((sum, sale) => sum + Number(sale.hymnCommissionAmount), 0) : null;
    add({ id: `commerce:${row.id}`, channel: "Beat Store", date: row.createdAt, receipt: row.amount, hymn, currency: "INR", reference: row.razorpayPaymentId || row.razorpayOrderId, customer: row.buyerEmail || `User #${row.userId}`, evidence: "gateway" }, row.razorpayPaymentId);
  }
  for (const row of studioPayments) add({ id: `studio-payment:${row.id}`, channel: "Studio", date: (row.capturedAt || row.createdAt).toISOString(), receipt: Number(row.amount), hymn: studioEarnings.some(earning => earning.orderId === row.orderId && earning.currency === row.currency) ? 0 : null, currency: row.currency, reference: row.razorpayPaymentId || row.razorpayOrderId, customer: `Studio order #${row.orderId}`, evidence: "gateway" }, row.razorpayPaymentId);
  for (const row of studioEarnings) entries.push({ id: `studio-earning:${row.id}`, channel: "Studio", date: row.createdAt.toISOString(), receipt: 0, hymn: Number(row.commissionAmount), currency: row.currency, reference: `Studio earning #${row.id}`, customer: `Studio order #${row.orderId}`, evidence: "ledger" });
  for (const row of royalties) entries.push({ id: `royalty-fee:${row.id}`, channel: "Royalty fees", date: row.statementMonth.toISOString(), receipt: 0, hymn: Number(row.hymnServiceFee), currency: row.statement?.currency || row.allocations[0]?.currency || "UNKNOWN", reference: `Royalty line #${row.id}`, customer: `User #${row.userId}`, evidence: "ledger" });
  for (const row of payoutFees) entries.push({ id: `payout-fee:${row.id}`, channel: "Payout fees", date: (row.paidAt || row.requestedAt).toISOString(), receipt: 0, hymn: Number(row.serviceFee), currency: row.currency, reference: `Payout #${row.id}`, customer: `User #${row.userId}`, evidence: "ledger" });
  return entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
