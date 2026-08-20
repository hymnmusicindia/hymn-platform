import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
import { logAuditEvent } from "@/lib/audit-log";
import { generatePayoutWorkbook, recordReportFailure } from "@/lib/payout/reports";

export type Quarter = 1 | 2 | 3 | 4;
export function getQuarterFromDate(date: Date): Quarter { return (Math.floor(date.getUTCMonth() / 3) + 1) as Quarter; }
export function getQuarterStartEnd(year: number, quarter: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2200 || ![1,2,3,4].includes(quarter)) throw new Error("Invalid payout quarter.");
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59, 999));
  return { start, end };
}
export function getCurrentQuarter(date = new Date()) { const quarter = getQuarterFromDate(date); return { quarter, year: date.getUTCFullYear(), ...getQuarterStartEnd(date.getUTCFullYear(), quarter) }; }
export function getPreviousQuarter(date = new Date()) { const current = getCurrentQuarter(date); const quarter = current.quarter === 1 ? 4 : current.quarter - 1; const year = current.quarter === 1 ? current.year - 1 : current.year; return { quarter: quarter as Quarter, year, ...getQuarterStartEnd(year, quarter) }; }
export function getNextQuarter(year: number, quarter: number) { return quarter === 4 ? { quarter: 1 as Quarter, year: year + 1 } : { quarter: (quarter + 1) as Quarter, year }; }

const n = (value: any) => typeof value?.toNumber === "function" ? value.toNumber() : Number(value || 0);
export async function ensurePayoutPeriod(type: "monthly" | "quarterly", year: number, value: number) {
  const month = type === "monthly" ? value : null; const quarter = type === "quarterly" ? value : null;
  const start = type === "monthly" ? new Date(Date.UTC(year, value - 1, 1)) : getQuarterStartEnd(year, value).start;
  const end = type === "monthly" ? new Date(Date.UTC(year, value, 0)) : getQuarterStartEnd(year, value).end;
  return (prisma as any).payoutPeriod.upsert({ where: { type_month_quarter_year: { type, month, quarter, year } }, create: { type, month, quarter, year, startDate: start, endDate: end }, update: {} });
}

export async function closeQuarter(quarter: number, year: number, options: { actorId?: number | null; force?: boolean; note?: string } = {}) {
  const { start, end } = getQuarterStartEnd(year, quarter); const next = getNextQuarter(year, quarter);
  const period = await ensurePayoutPeriod("quarterly", year, quarter);
  if (["closed", "locked"].includes(period.status)) return period;
  const unmatched = await (prisma as any).unmatchedRoyaltyRow.count({ where: { status: "unmatched", statementMonth: { gte: start, lte: end } } });
  if (unmatched && !options.force) throw new Error("There are unmatched royalty rows in this quarter. Resolve them before closing or force close with an admin note.");
  if (options.force && !options.note?.trim()) throw new Error("An admin note is required to force close a quarter.");
  const claim = await (prisma as any).payoutPeriod.updateMany({ where: { id: period.id, status: "open" }, data: { status: "closing", closeNote: options.note?.trim() || null } });
  if (claim.count !== 1) throw new Error("This quarter is already being closed by another process.");
  const [royalty, split, requests, balances] = await Promise.all([
    (prisma as any).royaltyLineItem.findMany({ where: { statementMonth: { gte: start, lte: end } } }),
    (prisma as any).splitEarningLineItem.findMany({ where: { royaltyLineItem: { statementMonth: { gte: start, lte: end } } } }),
    (prisma as any).payoutRequest.findMany({ where: { requestedAt: { gte: start, lte: end } } }),
    (prisma as any).artistPayoutBalance.findMany({ where: { availableBalance: { gt: 0 } } })
  ]);
  const totals = { gross: royalty.reduce((s:any,r:any)=>s+n(r.grossRevenue),0), pool: royalty.reduce((s:any,r:any)=>s+n(r.netRevenue),0), split: split.reduce((s:any,r:any)=>s+n(r.netShareAmount),0), held: split.filter((r:any)=>["held","pending_payout_details"].includes(r.status)).reduce((s:any,r:any)=>s+n(r.netShareAmount),0), requested: requests.reduce((s:any,r:any)=>s+n(r.amount),0), paid: requests.filter((r:any)=>r.status==="PAID").reduce((s:any,r:any)=>s+n(r.netAmount),0), carry: balances.reduce((s:any,r:any)=>s+n(r.availableBalance),0) };
  let report;
  try {
    report = await generatePayoutWorkbook({ type: "quarterly", quarter, year, actorId: options.actorId ?? null });
  } catch (error) {
    await recordReportFailure({ type: "quarterly", quarter, year, actorId: options.actorId ?? null }, error);
    await (prisma as any).payoutPeriod.update({ where: { id: period.id }, data: { status: "open" } });
    throw new Error("Payout data remains safe, but the quarterly Excel report failed. Regenerate it before closing the quarter.");
  }
  let closed;
  try {
    closed = await (prisma as any).$transaction(async (tx: any) => {
      for (const balance of balances) await tx.quarterCarryForward.upsert({ where: { userId_fromQuarter_fromYear_toQuarter_toYear: { userId: balance.userId, fromQuarter: quarter, fromYear: year, toQuarter: next.quarter, toYear: next.year } }, create: { userId: balance.userId, fromQuarter: quarter, fromYear: year, toQuarter: next.quarter, toYear: next.year, amount: balance.availableBalance, reason: `Unpaid available balance carried from Q${quarter} ${year}` }, update: { amount: balance.availableBalance } });
      const updated = await tx.payoutPeriod.update({ where: { id: period.id }, data: { status: "locked", totalGrossRevenue: totals.gross, totalArtistPool: totals.pool, totalSplitEarnings: totals.split, totalHeldAmount: totals.held, totalRequestedPayout: totals.requested, totalPaidAmount: totals.paid, totalCarryForward: totals.carry, closedAt: new Date(), closedByAdminId: options.actorId ?? null, generatedReportUrl: `/api/payout/reports/${report.id}/download` } });
      await tx.payoutPeriod.upsert({ where: { type_month_quarter_year: { type: "quarterly", month: null, quarter: next.quarter, year: next.year } }, create: { type: "quarterly", quarter: next.quarter, year: next.year, startDate: getQuarterStartEnd(next.year, next.quarter).start, endDate: getQuarterStartEnd(next.year, next.quarter).end }, update: {} });
      return updated;
    });
  } catch (error) {
    await Promise.allSettled([
      (prisma as any).payoutPeriod.updateMany({ where: { id: period.id, status: "closing" }, data: { status: "open" } }),
      (prisma as any).payoutReport.updateMany({ where: { id: report.id }, data: { status: "orphaned" } }),
      logAuditEvent({ actorType: options.actorId ? "admin" : "system", actorId: options.actorId ?? null, entityType: "payout_period", entityId: period.id, action: "quarter.close_failed", metadata: { quarter, year, reportId: report.id, error: error instanceof Error ? error.message : "Unknown transaction failure" } })
    ]);
    throw new Error("Quarter closing failed and was safely reopened. Review the audit log before retrying.");
  }
  const userIds = [...new Set(split.map((row:any)=>row.recipientUserId).filter(Boolean))] as number[];
  await Promise.all(userIds.flatMap((userId) => [createNotificationOnce({ eventKey: `quarter:${userId}:closed:Q${quarter}:${year}`, userId, title: "Quarterly payout cycle closed", body: `HYMN has closed Q${quarter} ${year}. Your quarterly payout statement is now available.`, type: "payout", href: "/payout?tab=quarterly" }), createNotificationOnce({ eventKey: `statement:${userId}:Q${quarter}:${year}`, userId, title: "Quarterly statement ready", body: `Your Q${quarter} ${year} payout statement is ready to download.`, type: "payout", href: "/payout?tab=statements" })]));
  await logAuditEvent({ actorType: options.actorId ? "admin" : "system", actorId: options.actorId ?? null, entityType: "payout_period", entityId: closed.id, action: options.force ? "quarter.force_closed" : "quarter.closed", newValue: { quarter, year, totals, reportId: report.id, unmatched }, metadata: { note: options.note ?? null } });
  return closed;
}
// vercel trigger 5
