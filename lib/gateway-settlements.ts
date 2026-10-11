import { prisma } from "@/lib/prisma";
import { gatewayPages, gatewayRequest } from "@/lib/gateway-provider";
import { minor, normalizeRecon, unixDate, validateMonth, type ReconEntity } from "@/lib/gateway-finance-domain";

type Settlement = { id: string; amount: number; status: string; utr?: string | null; created_at: number };
export async function syncSettlement(id: string) {
  if (!/^setl_[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid settlement identifier.");
  const row = await gatewayRequest<Settlement>(`v1/settlements/${id}`);
  if (row.id !== id) throw new Error("Settlement identity mismatch.");
  const data = { amountMinor: minor(row.amount), status: row.status, utr: row.utr || null, createdAt: unixDate(row.created_at), syncedAt: new Date() };
  return prisma.gatewaySettlement.upsert({ where: { id }, create: { id, ...data }, update: data });
}
export async function syncSettlementMonth(month: string) {
  const dates = validateMonth(month);
  const run = await prisma.gatewaySyncRun.create({ data: { month, status: "running" } });
  try {
    const rows = await gatewayPages<ReconEntity>(`v1/settlements/recon/combined?year=${dates.year}&month=${dates.month}`, 1000);
    // Fetch every page and validate before publishing. A truncated response cannot look reconciled.
    const normalized = rows.map(normalizeRecon);
    const settlementIds = [...new Set(normalized.map(row => row.settlementId).filter((id): id is string => Boolean(id)))];
    for (const id of settlementIds) await syncSettlement(id);
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement-month:${month}`}))`;
      if (await tx.gatewaySyncRun.count({ where: { month, id: { gt: run.id }, status: "completed" } })) {
        await tx.gatewaySyncRun.update({ where: { id: run.id }, data: { status: "superseded", completedAt: new Date() } });
        return;
      }
      for (const row of normalized) await tx.gatewayReconEntry.upsert({ where: { key: row.key }, create: { ...row, syncedAt: new Date() }, update: { ...row, syncedAt: new Date() } });
      await tx.gatewaySyncRun.update({ where: { id: run.id }, data: { status: "completed", records: normalized.length, completedAt: new Date() } });
      await tx.auditLog.create({ data: { actorType: "system", action: "RAZORPAY_SETTLEMENTS_RECONCILED", entity: "settlement_month", entityId: month, metadata: { records: normalized.length, settlements: settlementIds.length } } });
    }, { timeout: 60000 });
    return run.id;
  } catch (error) {
    await prisma.gatewaySyncRun.update({ where: { id: run.id }, data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Settlement sync failed.", completedAt: new Date() } });
    throw error;
  }
}
export async function settlementWorkspace(month: string) {
  const { start, end } = validateMonth(month);
  const [entries, settlements, latestRun] = await Promise.all([
    // Settlement reporting follows settlement month, not the original purchase month.
    prisma.gatewayReconEntry.findMany({ where: { OR: [{ settledAt: { gte: start, lt: end } }, { settledAt: null, createdAt: { gte: start, lt: end } }] }, orderBy: { createdAt: "desc" } }),
    prisma.gatewaySettlement.findMany({ where: { createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } }),
    prisma.gatewaySyncRun.findFirst({ where: { month }, orderBy: { id: "desc" } }),
  ]);
  const ids = [...new Set(entries.map(row => row.paymentId).filter((id): id is string => Boolean(id)))];
  const [subscriptions, distribution, checkout, studio] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where: { razorpayPaymentId: { in: ids } }, select: { razorpayPaymentId: true, amount: true, currency: true } }),
    prisma.distributionOrder.findMany({ where: { razorpayPaymentId: { in: ids } }, select: { razorpayPaymentId: true, amount: true, currency: true } }),
    prisma.checkoutOrder.findMany({ where: { razorpayPaymentId: { in: ids } }, select: { razorpayPaymentId: true, finalAmount: true, currency: true } }),
    prisma.studioPayment.findMany({ where: { razorpayPaymentId: { in: ids } }, select: { razorpayPaymentId: true, amount: true, currency: true } }),
  ]);
  const expected = [
    ...subscriptions.map(row => ({ id: row.razorpayPaymentId, amount: row.amount, currency: row.currency, source: "Subscription" })),
    ...distribution.map(row => ({ id: row.razorpayPaymentId, amount: row.amount * 100, currency: row.currency, source: "Distribution" })),
    ...checkout.map(row => ({ id: row.razorpayPaymentId, amount: Number(row.finalAmount.mul(100)), currency: row.currency, source: "Beat Store" })),
    ...studio.map(row => ({ id: row.razorpayPaymentId, amount: Number(row.amount.mul(100)), currency: row.currency, source: "Studio" })),
  ];
  const rows = entries.map(row => {
    const matches = expected.filter(item => item.id === row.paymentId);
    const match = matches.length === 1 ? matches[0] : null;
    const state = !matches.length ? "Unmatched" : matches.length > 1 ? "Ambiguous" : row.type === "payment" && (match!.amount !== row.amountMinor || match!.currency !== row.currency) ? "Amount mismatch" : "Matched";
    return { ...row, source: match?.source || "Review", match: state };
  });
  const inr = entries.filter(row => row.currency === "INR");
  const reconciledSettlements = settlements.map(settlement => {
    const lines = inr.filter(row => row.settlementId === settlement.id);
    const ledgerMinor = lines.reduce((sum, row) => sum + row.creditMinor - row.debitMinor, 0);
    const differenceMinor = settlement.amountMinor - ledgerMinor;
    return { ...settlement, ledgerMinor, differenceMinor, reconciliation: !lines.length ? "Report pending" : differenceMinor !== 0 ? "Difference to review" : settlement.status !== "processed" ? "Settlement pending" : "Reconciled" };
  });
  return { month, latestRun, entries: rows, settlements: reconciledSettlements, summary: {
    grossMinor: inr.filter(row => row.type === "payment").reduce((sum, row) => sum + row.amountMinor, 0),
    feeMinor: inr.reduce((sum, row) => sum + row.feeMinor, 0), taxMinor: inr.reduce((sum, row) => sum + row.taxMinor, 0),
    creditsMinor: inr.reduce((sum, row) => sum + row.creditMinor, 0), debitsMinor: inr.reduce((sum, row) => sum + row.debitMinor, 0),
    bankMinor: settlements.filter(row => row.status === "processed").reduce((sum, row) => sum + row.amountMinor, 0),
    exceptions: rows.filter(row => row.match !== "Matched").length + reconciledSettlements.filter(row => row.reconciliation !== "Reconciled").length,
    outflows: ["refund", "transfer", "adjustment"].map(type => ({ type, debitMinor: inr.filter(row => row.type === type).reduce((sum, row) => sum + row.debitMinor, 0) })),
  } };
}
