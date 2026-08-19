import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { logAuditEvent } from "@/lib/audit-log";
import { creditSplitRecipients } from "@/lib/payout/split-engine";
import { syncPayoutRequestToSheet, syncRoyaltyLineItemToSheet, syncSplitEarningLineItemsToSheet } from "@/lib/payout/sheets-sync";
import { ensurePayoutPeriod, getCurrentQuarter } from "@/lib/payout/quarters";
import { emailAppUrl, sendPayoutEmailEvent } from "@/lib/email/email-events";
import { PAYOUT_CONFIG } from "@/lib/payout/config";
import { getLatestUsdInrRate, getPublicPayoutConfig } from "@/lib/payout/exchange-rates";
import { inrToUsd } from "@/lib/payout/currency";

const PAYOUT_SERVICE_FEE_RATE = PAYOUT_CONFIG.payoutServiceFeePercent / 100;

type PayoutRequestStatus = "requested" | "under_review" | "approved" | "processing" | "paid" | "failed" | "rejected" | "cancelled";
type PayoutMethod = "UPI" | "BANK";

export type PayoutSummary = {
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  paidTillDate: number;
  currentMonthEarnings: number;
  currentMonthSplitEarnings: number;
  currentMonthHeldAmount: number;
  currentMonthPaidAmount: number;
  currentQuarterEarnings: number;
  currentQuarterPaid: number;
  currentQuarterHeld: number;
  currentQuarterPending: number;
  carryForwardBalance: number;
  quarter: { quarter: number; year: number; status: string; startDate: string; endDate: string; payoutRequestsOpen: boolean };
  monthlyBreakdown: Array<{ id: number; month: string; release: string; track: string; platform: string; upc: string; isrc: string; grossRevenue: number; artistPool: number; sharePercent: number; myEarnings: number; heldAmount: number; paidAmount: number; status: string }>;
  reports: Array<{ id: number; type: string; month: number | null; quarter: number | null; year: number; fileName: string; status: string; generatedAt: string }>;
  nextPayoutStatus: string;
  minimumPayoutAmount: number;
  minimumPayoutUsd: number;
  availableBalanceUsd: number | null;
  payoutEligible: boolean;
  exchangeRate: Awaited<ReturnType<typeof getPublicPayoutConfig>>;
  serviceFeeRate: number;
  monthlyEarnings: Array<{ month: string; grossEarnings: number; hymnServiceFee: number; netPayable: number; payoutStatus: string }>;
  releaseBreakdown: Array<{ releaseTitle: string; upc: string; grossEarnings: number; hymnFee: number; netEarnings: number; payoutStatus: string }>;
  trackBreakdown: Array<{ trackTitle: string; isrc: string; streamsDownloads: number | null; netEarnings: number }>;
  platformBreakdown: Array<{ platform: string; earnings: number }>;
  payoutHistory: Array<{
    id: number;
    requestDate: string;
    requestedAmount: number;
    requestedAmountUsd: number | null;
    usdToInrRate: number | null;
    exchangeRateProvider: string | null;
    exchangeRateFetchedAt: string | null;
    serviceFee: number;
    netPayout: number;
    method: "UPI" | "Bank Transfer";
    status: PayoutRequestStatus;
    processedDate: string | null;
    adminNote: string | null;
    paymentReference: string | null;
    paymentMethod: string | null;
    paymentDate: string | null;
    receiptPath: string | null;
    proofPath: string | null;
    events: Array<{ id: number; actorType: string; previousStatus: string | null; newStatus: string; note: string | null; createdAt: string }>;
  }>;
};

export type AdminPayoutRequest = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  requestedAmount: number;
  requestedAmountUsd: number | null;
  usdToInrRate: number | null;
  exchangeRateProvider: string | null;
  serviceFee: number;
  netAmount: number;
  method: "UPI" | "Bank Transfer";
  payoutDetails: string;
  requestedAt: string;
  status: PayoutRequestStatus;
  adminNote: string | null;
  proofPath: string | null;
  events: Array<{ id: number; actorType: string; previousStatus: string | null; newStatus: string; note: string | null; createdAt: string }>;
};

export type AdminEarningsEntryInput = {
  actorId?: number | null;
  userId: number;
  releaseId: number;
  statementMonth: number;
  statementYear: number;
  platform: string;
  territory?: string;
  grossEarning: number;
  distributorDeduction: number;
  hymnCommission: number;
  artistNetPayable: number;
  streamsDownloads?: number | null;
  sourceReference?: string | null;
  adminNote?: string | null;
  statementId?: number;
  sourceLineNumber?: number;
  originalValues?: Record<string, unknown>;
};

function usesPostgresPrisma() {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL?.trim() ?? "");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") return value.toNumber();
  return Number(value) || 0;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function statusFromPrisma(value: string | null | undefined): PayoutRequestStatus {
  const normalized = String(value ?? "REQUESTED").toLowerCase();
  if (["under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"].includes(normalized)) return normalized as PayoutRequestStatus;
  return "requested";
}

function statusToPrisma(value: PayoutRequestStatus) {
  return value.toUpperCase();
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function emptySummary(): PayoutSummary {
  return {
    totalEarnings: 0,
    availableBalance: 0,
    pendingBalance: 0,
    paidTillDate: 0,
    currentMonthEarnings: 0,
    currentMonthSplitEarnings: 0, currentMonthHeldAmount: 0, currentMonthPaidAmount: 0,
    currentQuarterEarnings: 0, currentQuarterPaid: 0, currentQuarterHeld: 0, currentQuarterPending: 0, carryForwardBalance: 0,
    quarter: { quarter: 1, year: new Date().getUTCFullYear(), status: "open", startDate: "", endDate: "", payoutRequestsOpen: false }, monthlyBreakdown: [], reports: [],
    nextPayoutStatus: "No royalty statement imported",
    minimumPayoutAmount: 0,
    minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd,
    availableBalanceUsd: null,
    payoutEligible: false,
    exchangeRate: { minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd, approximateMinimumInr: null, usdToInrRate: null, rateUpdatedAt: null, rateStatus: "unavailable", payoutServiceFeePercent: PAYOUT_CONFIG.payoutServiceFeePercent },
    serviceFeeRate: PAYOUT_SERVICE_FEE_RATE,
    monthlyEarnings: [],
    releaseBreakdown: [],
    trackBreakdown: [],
    platformBreakdown: [],
    payoutHistory: []
  };
}

function aggregate<T extends Record<string, unknown>>(
  rows: T[],
  keyFor: (row: T) => string,
  base: (key: string, row: T) => Record<string, unknown>,
  add: (target: Record<string, unknown>, row: T) => void
) {
  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = keyFor(row);
    const target = grouped.get(key) ?? base(key, row);
    add(target, row);
    grouped.set(key, target);
  }
  return Array.from(grouped.values());
}

function mapRequest(row: any): PayoutSummary["payoutHistory"][number] {
  return {
    id: row.id,
    requestDate: row.requestedAt.toISOString(),
    requestedAmount: toNumber(row.amount),
    requestedAmountUsd: row.requestedAmountUsd == null ? null : toNumber(row.requestedAmountUsd),
    usdToInrRate: row.usdToInrRate == null ? null : toNumber(row.usdToInrRate),
    exchangeRateProvider: row.exchangeRateProvider ?? null,
    exchangeRateFetchedAt: row.exchangeRateFetchedAt?.toISOString() ?? null,
    serviceFee: toNumber(row.serviceFee),
    netPayout: toNumber(row.netAmount),
    method: row.method === "BANK" ? "Bank Transfer" : "UPI",
    status: statusFromPrisma(row.status),
    processedDate: (row.paidAt ?? row.processedAt)?.toISOString() ?? null,
    adminNote: row.adminNote ?? null,
    paymentReference: row.paymentReference ?? null,
    paymentMethod: row.paymentMethod ?? null,
    paymentDate: row.paymentDate?.toISOString() ?? null,
    receiptPath: row.status === "PAID" ? `/api/payout/requests/${row.id}/receipt` : null,
    proofPath: row.proofAssetId ? `/api/assets/${row.proofAssetId}/download` : null,
    events: (row.events ?? []).map((event: any) => ({ id: event.id, actorType: event.actorType, previousStatus: event.previousStatus, newStatus: event.newStatus, note: event.note, createdAt: event.createdAt.toISOString() }))
  };
}

export async function getPayoutSummary(userId: number): Promise<PayoutSummary> {
  if (!usesPostgresPrisma()) return emptySummary();

  const currentQuarter = getCurrentQuarter();
  const [balance, lineItems, requests, splitEarnings, carryForward, period, reports] = await Promise.all([
    (prisma as any).artistPayoutBalance.findUnique({ where: { userId } }),
    (prisma as any).royaltyLineItem.findMany({
      where: { userId },
      include: { release: true, track: true },
      orderBy: { statementMonth: "asc" }
    }),
    (prisma as any).payoutRequest.findMany({
      where: { userId },
      include: { events: { orderBy: { createdAt: "asc" } } },
      orderBy: { requestedAt: "desc" }
    }),
    (prisma as any).splitEarningLineItem.findMany({ where: { recipientUserId: userId }, include: { release: true, track: true, royaltyLineItem: true }, orderBy: { createdAt: "desc" } }),
    (prisma as any).quarterCarryForward.findFirst({ where: { userId, toYear: currentQuarter.year, toQuarter: currentQuarter.quarter }, orderBy: { createdAt: "desc" } }),
    (prisma as any).payoutPeriod.findFirst({ where: { type: "quarterly", year: currentQuarter.year, quarter: currentQuarter.quarter } }),
    (prisma as any).payoutReport.findMany({ where: { userId }, orderBy: { generatedAt: "desc" }, take: 30 })
  ]);

  const requestHistory = requests.map(mapRequest);
  const heldRequests = requestHistory.filter((request: PayoutSummary["payoutHistory"][number]) => ["requested", "approved", "processing"].includes(request.status));
  const paidRequests = requestHistory.filter((request: PayoutSummary["payoutHistory"][number]) => request.status === "paid");
  const lineNet = money(lineItems.reduce((sum: number, item: any) => sum + toNumber(item.netRevenue), 0));
  const lineGross = money(lineItems.reduce((sum: number, item: any) => sum + toNumber(item.grossRevenue), 0));
  const heldAmount = money(heldRequests.reduce((sum: number, request: PayoutSummary["payoutHistory"][number]) => sum + request.requestedAmount, 0));
  const paidAmount = money(paidRequests.reduce((sum: number, request: PayoutSummary["payoutHistory"][number]) => sum + request.netPayout, 0));
  const availableBalance = balance ? toNumber(balance.availableBalance) : Math.max(0, lineNet - heldAmount - paidAmount);
  const pendingBalance = balance ? toNumber(balance.pendingBalance) : heldAmount;
  const totalEarnings = balance ? toNumber(balance.lifetimeEarnings) : lineNet;
  const paidTillDate = balance ? toNumber(balance.lifetimePaid) : paidAmount;
  const currentKey = monthKey(new Date());
  const currentMonthEarnings = money(lineItems
    .filter((item: any) => monthKey(item.statementMonth) === currentKey)
    .reduce((sum: number, item: any) => sum + toNumber(item.netRevenue), 0));
  const currentMonthSplitRows = splitEarnings.filter((item: any) => monthKey(item.royaltyLineItem.statementMonth) === currentKey);
  const currentMonthSplitEarnings = money(currentMonthSplitRows.reduce((sum: number, item: any) => sum + toNumber(item.netShareAmount), 0));
  const currentMonthHeldAmount = money(currentMonthSplitRows.filter((item: any) => ["held", "pending_payout_details"].includes(item.status)).reduce((sum: number, item: any) => sum + toNumber(item.netShareAmount), 0));
  const currentMonthPaidAmount = money(requests.filter((item: any) => item.status === "PAID" && item.paidAt && monthKey(item.paidAt) === currentKey).reduce((sum: number, item: any) => sum + toNumber(item.netAmount), 0));
  const quarterRows = splitEarnings.filter((item: any) => item.royaltyLineItem.statementMonth >= currentQuarter.start && item.royaltyLineItem.statementMonth <= currentQuarter.end);
  const currentQuarterEarnings = money(quarterRows.reduce((sum: number, item: any) => sum + toNumber(item.netShareAmount), 0));
  const currentQuarterHeld = money(quarterRows.filter((item: any) => ["held", "pending_payout_details"].includes(item.status)).reduce((sum: number, item: any) => sum + toNumber(item.netShareAmount), 0));
  const currentQuarterRequests = requests.filter((item: any) => item.requestedAt >= currentQuarter.start && item.requestedAt <= currentQuarter.end);
  const currentQuarterPaid = money(currentQuarterRequests.filter((item: any) => item.status === "PAID").reduce((sum: number, item: any) => sum + toNumber(item.netAmount), 0));
  const currentQuarterPending = money(currentQuarterRequests.filter((item: any) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(item.status)).reduce((sum: number, item: any) => sum + toNumber(item.amount), 0));
  const payoutRequestsOpen = process.env.ALLOW_PAYOUT_REQUESTS_DURING_OPEN_QUARTER === "true" || Boolean(carryForward);
  const monthlyBreakdown = splitEarnings.map((item: any) => ({ id: item.id, month: monthLabel(item.royaltyLineItem.statementMonth), release: item.release?.title ?? "Release", track: item.track?.title ?? "Release level", platform: item.royaltyLineItem.platform, upc: item.royaltyLineItem.upc ?? "-", isrc: item.royaltyLineItem.isrc ?? "-", grossRevenue: toNumber(item.royaltyLineItem.grossRevenue), artistPool: toNumber(item.royaltyLineItem.netRevenue), sharePercent: toNumber(item.sharePercent), myEarnings: toNumber(item.netShareAmount), heldAmount: ["held", "pending_payout_details"].includes(item.status) ? toNumber(item.netShareAmount) : 0, paidAmount: 0, status: item.status }));

  const monthlyEarnings = aggregate(
    lineItems,
    (item: any) => monthKey(item.statementMonth),
    (_key, item: any) => ({
      month: monthLabel(item.statementMonth),
      grossEarnings: 0,
      hymnServiceFee: 0,
      netPayable: 0,
      payoutStatus: "Cleared"
    }),
    (target, item: any) => {
      target.grossEarnings = money(toNumber(target.grossEarnings) + toNumber(item.grossRevenue));
      target.hymnServiceFee = money(toNumber(target.hymnServiceFee) + toNumber(item.hymnServiceFee));
      target.netPayable = money(toNumber(target.netPayable) + toNumber(item.netRevenue));
    }
  ) as PayoutSummary["monthlyEarnings"];

  const releaseBreakdown = aggregate(
    lineItems,
    (item: any) => String(item.releaseId ?? item.upc ?? "unassigned"),
    (_key, item: any) => ({
      releaseTitle: item.release?.title ?? "Unassigned release",
      upc: item.upc ?? item.release?.upc ?? "-",
      grossEarnings: 0,
      hymnFee: 0,
      netEarnings: 0,
      payoutStatus: "Cleared"
    }),
    (target, item: any) => {
      target.grossEarnings = money(toNumber(target.grossEarnings) + toNumber(item.grossRevenue));
      target.hymnFee = money(toNumber(target.hymnFee) + toNumber(item.hymnServiceFee));
      target.netEarnings = money(toNumber(target.netEarnings) + toNumber(item.netRevenue));
    }
  ) as PayoutSummary["releaseBreakdown"];

  const trackBreakdown = aggregate(
    lineItems,
    (item: any) => String(item.trackId ?? item.isrc ?? "unassigned"),
    (_key, item: any) => ({
      trackTitle: item.track?.title ?? "Unassigned track",
      isrc: item.isrc ?? item.track?.isrc ?? "-",
      streamsDownloads: 0,
      netEarnings: 0
    }),
    (target, item: any) => {
      const activity = (item.streams ?? 0) + (item.downloads ?? 0);
      target.streamsDownloads = toNumber(target.streamsDownloads) + activity;
      target.netEarnings = money(toNumber(target.netEarnings) + toNumber(item.netRevenue));
    }
  ) as PayoutSummary["trackBreakdown"];

  const platformBreakdown = aggregate(
    lineItems,
    (item: any) => item.platform || "Other platforms",
    (key) => ({ platform: key, earnings: 0 }),
    (target, item: any) => {
      target.earnings = money(toNumber(target.earnings) + toNumber(item.netRevenue));
    }
  ) as PayoutSummary["platformBreakdown"];

  const exchangeRate = await getPublicPayoutConfig();
  const availableBalanceUsd = exchangeRate.usdToInrRate ? new Prisma.Decimal(availableBalance).div(exchangeRate.usdToInrRate).toNumber() : null;
  return {
    totalEarnings: money(totalEarnings || lineGross),
    availableBalance: money(availableBalance),
    pendingBalance: money(pendingBalance),
    paidTillDate: money(paidTillDate),
    currentMonthEarnings,
    currentMonthSplitEarnings, currentMonthHeldAmount, currentMonthPaidAmount,
    currentQuarterEarnings, currentQuarterPaid, currentQuarterHeld, currentQuarterPending,
    carryForwardBalance: toNumber(carryForward?.amount),
    quarter: { quarter: currentQuarter.quarter, year: currentQuarter.year, status: period?.status ?? "open", startDate: currentQuarter.start.toISOString(), endDate: currentQuarter.end.toISOString(), payoutRequestsOpen },
    monthlyBreakdown,
    reports: reports.map((report: any) => ({ id: report.id, type: report.type, month: report.month, quarter: report.quarter, year: report.year, fileName: report.fileName, status: report.status, generatedAt: report.generatedAt.toISOString() })),
    nextPayoutStatus: heldRequests[0] ? `Request ${heldRequests[0].status}` : "No active payout request",
    minimumPayoutAmount: exchangeRate.approximateMinimumInr ?? 0,
    minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd,
    availableBalanceUsd,
    payoutEligible: availableBalanceUsd !== null && new Prisma.Decimal(availableBalanceUsd).gte(PAYOUT_CONFIG.minimumPayoutUsd),
    exchangeRate,
    serviceFeeRate: PAYOUT_SERVICE_FEE_RATE,
    monthlyEarnings,
    releaseBreakdown,
    trackBreakdown,
    platformBreakdown,
    payoutHistory: requestHistory
  };
}

export async function createAdminEarningsEntry(input: AdminEarningsEntryInput) {
  if (!usesPostgresPrisma()) throw new Error("Earnings entry requires a persistent database.");

  const userId = Number(input.userId);
  const releaseId = Number(input.releaseId);
  const statementMonth = Number(input.statementMonth);
  const statementYear = Number(input.statementYear);
  const platform = input.platform.trim();
  const grossEarning = money(Number(input.grossEarning));
  const distributorDeduction = money(Number(input.distributorDeduction) || 0);
  const hymnCommission = money(Number(input.hymnCommission) || 0);
  const artistNetPayable = money(Number(input.artistNetPayable));
  const streamsDownloads = input.streamsDownloads === null || input.streamsDownloads === undefined || Number.isNaN(Number(input.streamsDownloads))
    ? null
    : Math.max(0, Math.floor(Number(input.streamsDownloads)));

  if (!Number.isInteger(userId) || userId <= 0) throw new Error("Select a valid user first.");
  if (!Number.isInteger(releaseId) || releaseId <= 0) throw new Error("Select a valid release.");
  if (!Number.isInteger(statementMonth) || statementMonth < 1 || statementMonth > 12) throw new Error("Select a valid statement month.");
  if (!Number.isInteger(statementYear) || statementYear < 2020 || statementYear > 2100) throw new Error("Select a valid statement year.");
  if (!platform) throw new Error("Platform/DSP is required.");
  if (!Number.isFinite(grossEarning) || grossEarning < 0) throw new Error("Gross earning must be 0 or higher.");
  if (!Number.isFinite(artistNetPayable) || artistNetPayable < 0) throw new Error("Artist net payable must be 0 or higher.");
  if (artistNetPayable > grossEarning) throw new Error("Artist net payable cannot exceed gross earning.");

  const release = await (prisma as any).release.findFirst({
    where: { id: releaseId, userId },
    include: { tracks: true, user: true }
  });
  if (!release) throw new Error("The selected release does not belong to the selected user.");

  const statementDate = new Date(Date.UTC(statementYear, statementMonth - 1, 1));
  const sourceKey = input.sourceReference?.trim() ? createHash("sha256").update(JSON.stringify({ source: input.sourceReference.trim(), releaseId, statementMonth, statementYear, platform, territory: input.territory?.trim() || null, grossEarning, distributorDeduction, hymnCommission, artistNetPayable })).digest("hex") : null;
  if (sourceKey) {
    const duplicate = await (prisma as any).royaltyLineItem.findUnique({ where: { sourceKey } });
    if (duplicate) return { id: duplicate.id, userId, releaseId, releaseName: release.title || "your release", platform, statementMonth: statementDate.toISOString(), grossEarning, distributorDeduction, hymnCommission, artistNetPayable, duplicate: true };
  }
  const activeSplit = await (prisma as any).splitRecord.findFirst({
    where: { releaseId, trackId: null, status: { in: ["active", "pending_acceptance", "locked"] } },
    select: { id: true }
  });
  const created = await (prisma as any).$transaction(async (tx: any) => {
    const lineItem = await tx.royaltyLineItem.create({
      data: {
        userId,
        releaseId,
        trackId: null,
        upc: release.upc ?? null,
        isrc: release.tracks?.[0]?.isrc ?? null,
        platform,
        territory: input.territory?.trim() || null,
        grossRevenue: grossEarning,
        hymnServiceFee: hymnCommission,
        netRevenue: artistNetPayable,
        streams: streamsDownloads,
        downloads: null,
        statementMonth: statementDate,
        sourceKey,
        statementId: input.statementId,
        sourceLineNumber: input.sourceLineNumber,
        originalValues: input.originalValues as any,
        rawMetadata: {
          distributorDeduction,
          sourceReference: input.sourceReference?.trim() || null,
          adminNote: input.adminNote?.trim() || null,
          enteredVia: "admin_earnings_entry"
        }
      }
    });

    if (!activeSplit) await tx.artistPayoutBalance.upsert({
      where: { userId },
      create: {
        userId,
        availableBalance: artistNetPayable,
        pendingBalance: 0,
        lifetimeEarnings: artistNetPayable,
        lifetimePaid: 0,
        lastUpdatedAt: new Date()
      },
      update: {
        availableBalance: { increment: artistNetPayable },
        lifetimeEarnings: { increment: artistNetPayable },
        lastUpdatedAt: new Date()
      }
    });

    return lineItem;
  });

  const splitResult = activeSplit ? await creditSplitRecipients(created.id, input.actorId) : { applied: false };
  const monthlyPeriod = await ensurePayoutPeriod("monthly", statementYear, statementMonth);
  const splitRows = splitResult.applied && "earnings" in splitResult ? splitResult.earnings as any[] : [];
  await (prisma as any).payoutPeriod.update({ where: { id: monthlyPeriod.id }, data: {
    totalGrossRevenue: { increment: grossEarning }, totalArtistPool: { increment: artistNetPayable },
    totalSplitEarnings: { increment: splitRows.reduce((sum, row) => sum + toNumber(row.netShareAmount), 0) },
    totalHeldAmount: { increment: splitRows.filter((row) => ["held", "pending_payout_details"].includes(row.status)).reduce((sum, row) => sum + toNumber(row.netShareAmount), 0) }
  } });
  await syncRoyaltyLineItemToSheet(created);
  if (splitResult.applied && "earnings" in splitResult) await syncSplitEarningLineItemsToSheet(splitResult.earnings);
  const releaseName = release.title || "your release";
  await Promise.all([createNotificationOnce({
    eventKey: `earnings:${userId}:${statementMonth}:${statementYear}`,
    userId,
    title: "Monthly earnings updated",
    body: `Your earnings for ${statementDate.toLocaleString("en", { month: "long", timeZone: "UTC" })} ${statementYear} have been updated.`,
    type: "payout",
    href: "/payout?tab=monthly"
  }), prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }).then((user) => user ? sendPayoutEmailEvent({ event: "payout_earnings_updated", to: user.email, userId, payoutId: `earnings-${statementMonth}-${statementYear}`, userName: user.name, month: statementDate.toLocaleString("en", { month: "long", timeZone: "UTC" }), year: statementYear, url: emailAppUrl("/payout") }) : undefined), logAuditEvent({ actorType: "admin", actorId: input.actorId ?? null, entityType: "royalty_line_item", entityId: created.id, action: "earnings.created", newValue: { userId, releaseId, grossEarning, distributorDeduction, hymnCommission, artistNetPayable } })]);

  return {
    id: created.id,
    userId,
    releaseId,
    releaseName,
    platform,
    statementMonth: statementDate.toISOString(),
    grossEarning,
    distributorDeduction,
    hymnCommission,
    artistNetPayable
  };
}

export async function createPayoutRequest(userId: number, input: {
  amount: number;
  method: PayoutMethod;
  upiId?: string;
  accountHolderName?: string;
  bankAccountNumber?: string;
  ifsc?: string;
  userNote?: string;
  sourceType?: "artist_royalty" | "producer_beat_sales" | "mixed";
}) {
  if (!usesPostgresPrisma()) throw new Error("Payout requests require a persistent database.");

  const amount = money(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than 0.");
  const exchangeRate = await getLatestUsdInrRate();
  if (!exchangeRate) throw new Error("Payout requests are temporarily unavailable while the exchange rate is refreshed.");
  if (exchangeRate.stale) throw new Error("Payout requests are temporarily unavailable because the exchange rate is stale.");
  const requestedAmountUsd = inrToUsd(amount, exchangeRate.rate);
  if (requestedAmountUsd.lt(PAYOUT_CONFIG.minimumPayoutUsd)) throw new Error(`HYMN's minimum payout threshold is $${PAYOUT_CONFIG.minimumPayoutUsd} USD (approximately Rs ${Math.round(PAYOUT_CONFIG.minimumPayoutUsd * exchangeRate.rate).toLocaleString("en-IN")}).`);
  if ((process.env.PAYOUT_CYCLE ?? "quarterly") === "quarterly" && process.env.ALLOW_PAYOUT_REQUESTS_DURING_OPEN_QUARTER !== "true") {
    const current = getCurrentQuarter();
    const payoutWindow = await (prisma as any).quarterCarryForward.findFirst({ where: { userId, toQuarter: current.quarter, toYear: current.year } });
    if (!payoutWindow) throw new Error("Payout requests open after the current quarter closes.");
  }
  const credential = await (prisma as any).payoutCredential.findUnique({ where: { userId } });
  if (!credential) throw new Error("Add payout details before requesting a withdrawal.");
  if (credential.status !== "verified") throw new Error("HYMN must manually verify your payout profile before withdrawals are enabled.");
  const method: PayoutMethod = credential.method === "BANK" ? "BANK" : "UPI";

  const serviceFee = money(amount * PAYOUT_SERVICE_FEE_RATE);
  const netAmount = money(amount - serviceFee);

  const request = await (prisma as any).$transaction(async (tx: any) => {
    const active = await tx.payoutRequest.findFirst({ where: { userId, status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } } });
    if (active) throw new Error("You already have a payout request in progress.");
    await tx.$queryRaw`SELECT id FROM artist_payout_balances WHERE user_id = ${userId} FOR UPDATE`;
    const current = await tx.artistPayoutBalance.findUnique({ where: { userId } });
    if (!current || new Prisma.Decimal(current.availableBalance).lt(amount)) throw new Error("Amount cannot exceed available balance.");
    const balance = await tx.artistPayoutBalance.update({ where: { userId }, data: { availableBalance: { decrement: amount }, pendingBalance: { increment: amount }, lastUpdatedAt: new Date() } });
    const created = await tx.payoutRequest.create({
      data: {
        userId,
        amount,
        serviceFee,
        netAmount,
        requestedAmountInr: amount,
        requestedAmountUsd,
        minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd,
        usdToInrRate: exchangeRate.rate,
        exchangeRateId: exchangeRate.id,
        exchangeRateProvider: exchangeRate.provider,
        exchangeRateFetchedAt: exchangeRate.fetchedAt,
        method,
        sourceType: input.sourceType ?? "artist_royalty",
        upiId: null,
        accountHolderName: null,
        bankAccountNumber: null,
        ifsc: null,
        userNote: input.userNote?.trim() || null
      }
    });
    await tx.walletTransaction.create({ data: { userId, type: "payout_reservation", amount: 0, direction: "hold", idempotencyKey: `payout:${created.id}:reservation`, referenceType: "payout_request", referenceId: String(created.id), balanceAfter: balance.availableBalance, availabilityStatus: "held", auditMetadata: { reservedAmount: String(amount), pendingBalance: balance.pendingBalance.toString() }, note: "Funds reserved for payout request." } });
    await tx.payoutRequestEvent.create({ data: { payoutRequestId: created.id, actorType: "user", actorId: userId, previousStatus: null, newStatus: "requested", note: input.userNote?.trim() || "Payout requested.", metadata: { requestedAmountInr: String(amount), requestedAmountUsd: requestedAmountUsd.toString(), minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd, usdToInrRate: exchangeRate.rate, exchangeRateId: exchangeRate.id, serviceFee: String(serviceFee), netAmount: String(netAmount) } } });
    return created;
  });

  await syncPayoutRequestToSheet(request);

  await Promise.all([createNotificationOnce({
    eventKey: `payout:${request.id}:requested`,
    userId,
    title: "Payout request submitted",
    body: `Your payout request of Rs ${amount.toLocaleString("en-IN")} has been submitted. Processing usually takes 24-48 hours.`,
    type: "payout",
    href: "/payout"
  }), prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }).then((user) => user ? sendPayoutEmailEvent({ event: "payout_request_submitted", to: user.email, userId, payoutId: request.id, userName: user.name, requestedAmount: amount, serviceFee, netAmount, url: emailAppUrl("/payout") }) : undefined), createAdminTaskOnce({ eventKey: `payout:${request.id}:pending`, type: "Payout Pending", priority: "high", title: `Payout #${request.id} needs review`, body: `User #${userId} requested Rs ${amount.toLocaleString("en-IN")} ($${requestedAmountUsd.toFixed(2)} at ${exchangeRate.rate} INR/USD); net after the separate 2% fee is Rs ${netAmount.toLocaleString("en-IN")}.`, href: `/admin?tab=payouts&requestId=${request.id}`, entityType: "payout_request", entityId: request.id }), logAuditEvent({ actorType: "user", actorId: userId, entityType: "payout_request", entityId: request.id, action: "payout.requested", newValue: { requestedAmountInr: amount, requestedAmountUsd: requestedAmountUsd.toString(), minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd, usdToInrRate: exchangeRate.rate, exchangeRateId: exchangeRate.id, serviceFee, netAmount, method } })]);

  return mapRequest(request);
}

export async function listAdminPayoutRequests(): Promise<AdminPayoutRequest[]> {
  if (!usesPostgresPrisma()) return [];

  const requests = await (prisma as any).payoutRequest.findMany({
    include: { user: { include: { payoutCredential: true } }, events: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }]
  });

  return requests.map((request: any) => ({
    id: request.id,
    userId: request.userId,
    userName: request.user?.name ?? `User #${request.userId}`,
    userEmail: request.user?.email ?? "",
    requestedAmount: toNumber(request.amount),
    requestedAmountUsd: request.requestedAmountUsd == null ? null : toNumber(request.requestedAmountUsd),
    usdToInrRate: request.usdToInrRate == null ? null : toNumber(request.usdToInrRate),
    exchangeRateProvider: request.exchangeRateProvider ?? null,
    serviceFee: toNumber(request.serviceFee),
    netAmount: toNumber(request.netAmount),
    method: request.method === "BANK" ? "Bank Transfer" : "UPI",
    payoutDetails: request.method === "BANK" ? (request.user?.payoutCredential?.bankAccountMasked ?? "Bank details provided") : `UPI ${request.user?.payoutCredential?.upiIdMasked ?? "provided"}`,
    requestedAt: request.requestedAt.toISOString(),
    status: statusFromPrisma(request.status),
    adminNote: request.adminNote ?? null,
    proofPath: request.proofAssetId ? `/api/assets/${request.proofAssetId}/download` : null,
    events: request.events.map((event: any) => ({ id: event.id, actorType: event.actorType, previousStatus: event.previousStatus, newStatus: event.newStatus, note: event.note, createdAt: event.createdAt.toISOString() }))
  }));
}

export async function updatePayoutRequestStatus(input: { requestId: number; status: PayoutRequestStatus; adminNote?: string | null; actorId?: number | null; paymentReference?: string; paymentMethod?: string; paymentDate?: Date; paidAmount?: number }) {
  if (!usesPostgresPrisma()) throw new Error("Payout management requires a persistent database.");
  if (!["under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"].includes(input.status)) throw new Error("Invalid payout status.");

  const existing = await (prisma as any).payoutRequest.findUnique({ where: { id: input.requestId }, include: { user: true } });
  if (!existing) throw new Error("Payout request not found.");

  const currentStatus = statusFromPrisma(existing.status);
  const nextStatus = input.status;
  const allowed: Record<string, PayoutRequestStatus[]> = { requested: ["under_review", "cancelled"], under_review: ["approved", "rejected", "cancelled"], approved: ["processing", "rejected", "cancelled"], processing: ["paid", "failed"], paid: [], failed: [], rejected: [], cancelled: [] };
  if (currentStatus === nextStatus) return mapRequest(existing);
  if (!allowed[currentStatus]?.includes(nextStatus)) throw new Error(`Payout cannot move from ${currentStatus} to ${nextStatus}.`);
  if (["failed", "rejected", "cancelled"].includes(nextStatus) && !input.adminNote?.trim()) throw new Error(`${nextStatus} payouts require an administrative reason.`);
  const requestedAmount = toNumber(existing.amount);
  const netAmount = toNumber(existing.netAmount);
  const now = new Date();
  if (nextStatus === "paid") {
    if (!input.paymentReference?.trim() || !input.paymentMethod?.trim() || !input.paymentDate || !input.paidAmount) throw new Error("Paid payouts require payment date, paid amount, payment method, and unique UTR/reference.");
    if (money(input.paidAmount) !== netAmount) throw new Error("Paid amount must equal the persisted net payout amount.");
  }

  const updated = await (prisma as any).$transaction(async (tx: any) => {
    if (nextStatus === "paid" && currentStatus !== "paid") {
      const balance = await tx.artistPayoutBalance.update({ where: { userId: existing.userId }, data: { pendingBalance: { decrement: requestedAmount }, lifetimePaid: { increment: netAmount }, lastUpdatedAt: now } });
      await tx.walletTransaction.create({ data: { userId: existing.userId, type: "payout_debit", amount: -netAmount, direction: "debit", idempotencyKey: `payout:${existing.id}:debit`, referenceType: "payout_request", referenceId: String(existing.id), balanceAfter: balance.availableBalance, effectiveAt: input.paymentDate, auditMetadata: { paymentReference: input.paymentReference, paymentMethod: input.paymentMethod, paidAmount: input.paidAmount }, note: `Manual payout ${input.paymentReference}` } });
      if (toNumber(existing.serviceFee) > 0) await tx.walletTransaction.create({ data: { userId: existing.userId, type: "payout_service_fee", amount: -toNumber(existing.serviceFee), direction: "debit", idempotencyKey: `payout:${existing.id}:fee`, referenceType: "payout_request", referenceId: String(existing.id), balanceAfter: balance.availableBalance, effectiveAt: input.paymentDate, auditMetadata: { paymentReference: input.paymentReference }, note: "HYMN payout service fee." } });
    }

    if (["rejected", "failed", "cancelled"].includes(nextStatus) && !["rejected", "failed", "cancelled"].includes(currentStatus)) {
      const balance = await tx.artistPayoutBalance.update({ where: { userId: existing.userId }, data: { availableBalance: { increment: requestedAmount }, pendingBalance: { decrement: requestedAmount }, lastUpdatedAt: now } });
      await tx.walletTransaction.create({ data: { userId: existing.userId, type: "payout_reservation_release", amount: 0, direction: "release", idempotencyKey: `payout:${existing.id}:release`, referenceType: "payout_request", referenceId: String(existing.id), balanceAfter: balance.availableBalance, auditMetadata: { releasedAmount: String(requestedAmount), reason: input.adminNote }, note: input.adminNote || `Payout ${nextStatus}` } });
    }

    const changed = await tx.payoutRequest.updateMany({
      where: { id: existing.id, status: existing.status },
      data: {
        status: statusToPrisma(nextStatus),
        adminNote: input.adminNote?.trim() || null,
        processedAt: nextStatus === "processing" || nextStatus === "paid" || nextStatus === "rejected" ? now : existing.processedAt,
        paidAt: nextStatus === "paid" ? now : existing.paidAt
        ,paymentReference: nextStatus === "paid" ? input.paymentReference?.trim() : existing.paymentReference
        ,paymentMethod: nextStatus === "paid" ? input.paymentMethod?.trim() : existing.paymentMethod
        ,paymentDate: nextStatus === "paid" ? input.paymentDate : existing.paymentDate
        ,paidAmount: nextStatus === "paid" ? input.paidAmount : existing.paidAmount
      },
    });
    if (changed.count !== 1) throw new Error("Payout changed concurrently. Refresh and retry.");
    await tx.payoutRequestEvent.create({ data: { payoutRequestId: existing.id, actorType: "admin", actorId: input.actorId ?? null, previousStatus: currentStatus, newStatus: nextStatus, note: input.adminNote?.trim() || null, metadata: nextStatus === "paid" ? { paymentReference: input.paymentReference?.trim(), paymentMethod: input.paymentMethod?.trim(), paymentDate: input.paymentDate?.toISOString(), paidAmount: String(input.paidAmount) } : undefined } });
    return tx.payoutRequest.findUniqueOrThrow({ where: { id: existing.id }, include: { user: true } });
  });

  await syncPayoutRequestToSheet(updated);

  await logAuditEvent({ actorType: "admin", actorId: input.actorId ?? null, entityType: "payout_request", entityId: existing.id, action: `payout.${nextStatus}`, oldValue: { status: currentStatus }, newValue: { status: nextStatus, amount: requestedAmount, netAmount }, metadata: { adminNote: input.adminNote ?? null } });
  if (nextStatus === "paid" || nextStatus === "rejected") await resolveAdminTask(`payout:${existing.id}:pending`, `Payout ${nextStatus}.`);

  if (nextStatus === "paid") {
    await createNotificationOnce({
      eventKey: `payout:${existing.id}:paid`,
      userId: existing.userId,
      title: "Payout completed",
      body: `Your payout of Rs ${netAmount.toLocaleString("en-IN")} has been marked as paid.`,
      type: "payout",
      href: "/payout"
    });
    await sendPayoutEmailEvent({ event: "payout_completed", to: existing.user.email, userId: existing.userId, payoutId: existing.id, userName: existing.user.name, netAmount, url: emailAppUrl("/payout") });
  }

  if (nextStatus === "rejected") {
    await createNotificationOnce({
      eventKey: `payout:${existing.id}:rejected`,
      userId: existing.userId,
      title: "Payout request rejected",
      body: "Your payout request was rejected. Check the reason or contact HYMN support.",
      type: "payout",
      href: "/payout"
    });
    await sendPayoutEmailEvent({ event: "payout_rejected", to: existing.user.email, userId: existing.userId, payoutId: existing.id, userName: existing.user.name, netAmount, url: emailAppUrl("/payout") });
  }

  return updated;
}

// vercel trigger 2
// vercel trigger 6
// vercel trigger 7
// vercel trigger 9

// vercel trigger 12
