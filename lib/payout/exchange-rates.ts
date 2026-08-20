import "server-only";
import { prisma } from "@/lib/prisma";
import { PAYOUT_CONFIG } from "@/lib/payout/config";
import { logAuditEvent } from "@/lib/audit-log";
import { createAdminTaskOnce } from "@/lib/task-queue";

export type PublicPayoutConfig = {
  minimumPayoutUsd: number;
  approximateMinimumInr: number | null;
  usdToInrRate: number | null;
  rateUpdatedAt: string | null;
  rateStatus: "active" | "stale" | "unavailable";
  payoutServiceFeePercent: number;
};

function n(value: unknown) { return Number(value) || 0; }

export async function getLatestUsdInrRate() {
  const row = await (prisma as any).exchangeRate.findFirst({ where: { baseCurrency: "USD", quoteCurrency: "INR", status: "ACTIVE" }, orderBy: { fetchedAt: "desc" } });
  if (!row) return null;
  const staleAfter = new Date(row.fetchedAt.getTime() + PAYOUT_CONFIG.exchangeRateRefreshHours * 3_600_000);
  return { id: row.id, rate: n(row.rate), provider: row.provider, fetchedAt: row.fetchedAt as Date, stale: staleAfter <= new Date() };
}

export async function getPublicPayoutConfig(): Promise<PublicPayoutConfig> {
  const latest = await getLatestUsdInrRate();
  return {
    minimumPayoutUsd: PAYOUT_CONFIG.minimumPayoutUsd,
    approximateMinimumInr: latest ? Math.round(PAYOUT_CONFIG.minimumPayoutUsd * latest.rate) : null,
    usdToInrRate: latest?.rate ?? null,
    rateUpdatedAt: latest?.fetchedAt.toISOString() ?? null,
    rateStatus: !latest ? "unavailable" : latest.stale ? "stale" : "active",
    payoutServiceFeePercent: PAYOUT_CONFIG.payoutServiceFeePercent
  };
}

async function fetchProviderRate() {
  const provider = process.env.FX_RATE_PROVIDER || "Frankfurter";
  const endpoint = process.env.FX_RATE_PROVIDER_URL || "https://api.frankfurter.app/latest?from=USD&to=INR";
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`FX provider returned ${response.status}.`);
  const body = await response.json() as { rates?: { INR?: number } };
  const rate = Number(body.rates?.INR);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX provider returned an invalid USD/INR rate.");
  return { provider, rate };
}

export async function refreshUsdInrRate(actor: { type: "cron" | "admin"; id?: number | null }) {
  const previous = await getLatestUsdInrRate();
  try {
    const fetched = await fetchProviderRate();
    const movementPercent = previous ? Math.abs((fetched.rate - previous.rate) / previous.rate) * 100 : 0;
    const row = await (prisma as any).exchangeRate.create({ data: { baseCurrency: "USD", quoteCurrency: "INR", rate: fetched.rate, provider: fetched.provider, status: "ACTIVE", fetchedAt: new Date(), metadata: { movementPercent, suspicious: movementPercent >= 5 } } });
    await logAuditEvent({ actorType: actor.type, actorId: actor.id ?? null, entityType: "exchange_rate", entityId: row.id, action: "exchange_rate.refreshed", newValue: { pair: "USD/INR", rate: fetched.rate, provider: fetched.provider }, metadata: { movementPercent } });
    if (movementPercent >= 5) await createAdminTaskOnce({ eventKey: `fx:suspicious:${row.id}`, type: "Exchange Rate Review", priority: "high", title: "Unusual USD/INR movement", body: `The refreshed rate moved ${movementPercent.toFixed(2)}%. Review before processing payouts.`, href: "/admin?tab=payouts", entityType: "exchange_rate", entityId: row.id });
    return { id: row.id, rate: fetched.rate, provider: fetched.provider, fetchedAt: row.fetchedAt, movementPercent };
  } catch (error) {
    const failed = await (prisma as any).exchangeRate.create({ data: { baseCurrency: "USD", quoteCurrency: "INR", rate: previous?.rate ?? 0, provider: process.env.FX_RATE_PROVIDER || "Frankfurter", status: "FAILED", fetchedAt: new Date(), metadata: { error: error instanceof Error ? error.message : "Unknown provider error" } } });
    const recentFailures = await (prisma as any).exchangeRate.count({ where: { baseCurrency: "USD", quoteCurrency: "INR", status: "FAILED", fetchedAt: { gte: new Date(Date.now() - 72 * 3_600_000) } } });
    if (recentFailures >= 2) await createAdminTaskOnce({ eventKey: `fx:repeated-failure:${new Date().toISOString().slice(0, 10)}`, type: "Exchange Rate Failure", priority: "high", title: "USD/INR refresh is failing", body: `${recentFailures} refresh attempts failed in the last 72 hours. The last successful rate remains preserved.`, href: "/admin?tab=payouts", entityType: "exchange_rate", entityId: failed.id });
    throw error;
  }
}

// vercel trigger 12
