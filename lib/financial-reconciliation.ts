import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReconciliationIssue = { code: string; severity: "blocking" | "warning"; entityType: string; entityId?: string; message: string };

export async function reconcileFinancialLedger(): Promise<{ ok: boolean; issues: ReconciliationIssue[]; checkedAt: string }> {
  const issues: ReconciliationIssue[] = [];
  const [duplicateLines, orphanAllocations, unallocatedLines, payoutWithoutDebit, negativeBalances, unmatchedCount, incompleteJobs, beatSplitMismatches, beatSalesWithoutCredit] = await Promise.all([
    prisma.royaltyLineItem.groupBy({ by: ["sourceKey"], where: { sourceKey: { not: null } }, _count: true, having: { sourceKey: { _count: { gt: 1 } } } }),
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT a.id FROM royalty_allocations a LEFT JOIN royalty_line_items l ON l.id = a.royalty_line_item_id WHERE l.id IS NULL LIMIT 100`),
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT l.id FROM royalty_line_items l JOIN royalty_statements s ON s.id = l.statement_id WHERE s.status = 'imported' AND NOT EXISTS (SELECT 1 FROM royalty_allocations a WHERE a.royalty_line_item_id = l.id) LIMIT 100`),
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT p.id FROM payout_requests p WHERE p.status = 'PAID' AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.reference_type = 'payout_request' AND w.reference_id = p.id::text AND w.direction = 'debit') LIMIT 100`),
    prisma.artistPayoutBalance.findMany({ where: { OR: [{ availableBalance: { lt: 0 } }, { pendingBalance: { lt: 0 } }] }, select: { userId: true } }),
    prisma.unmatchedRoyaltyRow.count({ where: { status: "unmatched" } }),
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT j.id FROM royalty_import_jobs j WHERE j.state = 'completed' AND j.row_count <> j.matched_count + j.unmatched_count + j.error_count LIMIT 100`),
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT id FROM beat_sales WHERE status = 'paid' AND ABS(net_sale_amount - hymn_commission_amount - producer_earning_amount) > 0.01 LIMIT 100`),
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT s.id FROM beat_sales s WHERE s.status = 'paid' AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.reference_type = 'beat_sale' AND w.reference_id = s.id::text AND w.direction = 'credit') LIMIT 100`)
  ]);
  duplicateLines.forEach(row => issues.push({ code: "DUPLICATE_ROYALTY_SOURCE", severity: "blocking", entityType: "royalty_line_item", entityId: row.sourceKey ?? undefined, message: "Duplicate royalty source reference detected." }));
  orphanAllocations.forEach(row => issues.push({ code: "ORPHAN_ALLOCATION", severity: "blocking", entityType: "royalty_allocation", entityId: String(row.id), message: "Allocation has no royalty line." }));
  unallocatedLines.forEach(row => issues.push({ code: "UNALLOCATED_ROYALTY_LINE", severity: "blocking", entityType: "royalty_line_item", entityId: String(row.id), message: "Imported royalty line has no allocation." }));
  payoutWithoutDebit.forEach(row => issues.push({ code: "PAID_PAYOUT_WITHOUT_DEBIT", severity: "blocking", entityType: "payout_request", entityId: String(row.id), message: "Paid payout has no immutable wallet debit." }));
  negativeBalances.forEach(row => issues.push({ code: "NEGATIVE_BALANCE", severity: "blocking", entityType: "user", entityId: String(row.userId), message: "Persisted payout balance is negative." }));
  if (unmatchedCount) issues.push({ code: "UNMATCHED_REVENUE", severity: "warning", entityType: "unmatched_royalty_row", message: `${unmatchedCount} royalty rows require reconciliation.` });
  incompleteJobs.forEach(row => issues.push({ code: "IMPORT_ROW_COUNT_MISMATCH", severity: "blocking", entityType: "royalty_import_job", entityId: String(row.id), message: "Import job row counts do not reconcile." }));
  beatSplitMismatches.forEach(row => issues.push({ code: "BEAT_SALE_SPLIT_MISMATCH", severity: "blocking", entityType: "beat_sale", entityId: String(row.id), message: "Beat net sale does not equal HYMN share plus producer share." }));
  beatSalesWithoutCredit.forEach(row => issues.push({ code: "BEAT_SALE_WITHOUT_LEDGER_CREDIT", severity: "blocking", entityType: "beat_sale", entityId: String(row.id), message: "Paid beat sale has no producer wallet credit." }));

  const statementTotals = await prisma.$queryRaw<Array<{ statementId: number; lineTotal: Prisma.Decimal; allocationTotal: Prisma.Decimal }>>(Prisma.sql`
    SELECT s.id AS "statementId", COALESCE(SUM(l.net_revenue), 0) AS "lineTotal",
           COALESCE((SELECT SUM(a.allocated_amount + a.held_amount) FROM royalty_allocations a JOIN royalty_line_items al ON al.id = a.royalty_line_item_id WHERE al.statement_id = s.id), 0) AS "allocationTotal"
      FROM royalty_statements s LEFT JOIN royalty_line_items l ON l.statement_id = s.id
     WHERE s.status = 'imported' GROUP BY s.id`);
  statementTotals.filter(row => !new Prisma.Decimal(row.lineTotal).equals(row.allocationTotal)).forEach(row => issues.push({ code: "ALLOCATION_MISMATCH", severity: "blocking", entityType: "royalty_statement", entityId: String(row.statementId), message: `Line total ${row.lineTotal.toString()} does not equal allocated/held total ${row.allocationTotal.toString()}.` }));
  return { ok: !issues.some(issue => issue.severity === "blocking"), issues, checkedAt: new Date().toISOString() };
}

export async function assertFinanciallyReconciled() {
  const result = await reconcileFinancialLedger();
  if (!result.ok) throw new Error(`Financial reconciliation has ${result.issues.filter(issue => issue.severity === "blocking").length} blocking issue(s).`);
  return result;
}
// vercel trigger 9
