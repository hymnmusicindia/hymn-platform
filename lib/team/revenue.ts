import "server-only";
import { prisma } from "@/lib/prisma";
import { can, type Actor } from "./policy";
import { prospectScope } from "./service";

/** Recorded paid orders for explicitly linked CRM customers, never inferred from stage. */
export async function teamRevenue(a: Actor, from: Date, until: Date) {
  if (!can(a, "crm.prospects.view")) return { paidCustomers: 0 };
  const leads = await prisma.teamProspect.findMany({ where: prospectScope(a), select: { customerUserId: true, lead: { select: { userId: true } } } });
  const ids = [...new Set(leads.map(p => p.lead?.userId ?? p.customerUserId).filter((id): id is number => id !== null))];
  const period = { gte: from, lte: until };
  const [beats, distribution, studio] = await Promise.all([
    prisma.checkoutOrder.groupBy({ by: ["userId", "currency"], where: { userId: { in: ids }, paymentStatus: "paid", finalAmount: { gt: 0 }, createdAt: period }, _sum: { finalAmount: true }, _count: true }),
    prisma.distributionOrder.groupBy({ by: ["userId", "currency"], where: { userId: { in: ids }, paymentStatus: "paid", amount: { gt: 0 }, createdAt: period }, _sum: { amount: true }, _count: true }),
    prisma.studioServiceOrder.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, paymentStatus: "PAID", finalPrice: { gt: 0 }, paidAt: period }, _sum: { finalPrice: true }, _count: true }),
  ]);
  const paidCustomers = new Set([...beats.map(r => r.userId), ...distribution.map(r => r.userId), ...studio.map(r => r.customerId)]).size;
  if (!a.role.owner) return { paidCustomers };
  const sources = [...beats.map(r => ({ source: "Beat marketplace", currency: r.currency, amount: Number(r._sum.finalAmount), orders: r._count })), ...distribution.map(r => ({ source: "Distribution", currency: r.currency, amount: r._sum.amount || 0, orders: r._count })), ...studio.map(r => ({ source: "Studio", currency: "INR", amount: Number(r._sum.finalPrice), orders: r._count }))];
  const revenue: Record<string, number> = {};
  for (const row of sources) revenue[row.currency] = (revenue[row.currency] || 0) + row.amount;
  const costs = await prisma.teamExpense.aggregate({ where: { workspaceId: a.workspaceId, incurredAt: period, currency: "INR" }, _sum: { amountCents: true } });
  const acquisitionCostINR = (costs._sum.amountCents || 0) / 100;
  return { paidCustomers, revenue, acquisitionCostINR, costPerPaidCustomerINR: paidCustomers ? acquisitionCostINR / paidCustomers : null, sources, attribution: "Recorded positive paid orders for explicitly linked CRM customers. Beat/distribution use order creation date; studio uses payment date. Gross amounts, not profit or causal marketing attribution. Currencies are never combined. Free credits are not paid conversions." };
}
