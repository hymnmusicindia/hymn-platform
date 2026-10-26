/** Read-only provider/database audit. Never imports royalties or submits content. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";

async function main() {
  if (process.argv[2]) {
    const { parse } = await import("dotenv");
    Object.assign(process.env, parse(await readFile(process.argv[2], "utf8")));
  } else loadEnvConfig(process.cwd());
  const { prisma } = await import("../lib/prisma");
  const { getDireNoteConfig } = await import("../lib/direnote/direnote-config");
  const { getDireNoteReleaseInformation, getDireNoteRevenueReport } = await import("../lib/direnote/direnote-client");
  const { requestDireNoteV24 } = await import("../lib/direnote/v24-client");
  const { normalizeDireNoteRevenueReport } = await import("../lib/direnote-revenue");
  const { reserveDireNoteRequest } = await import("../lib/direnote-rate-limit");
  const config = getDireNoteConfig();
  const output: Record<string, unknown> = { checkedAt: new Date().toISOString(), mode: "read-only; no ledger imports or provider mutations", credentialsConfigured: config.isConfigured, revenueSyncEnabled: process.env.DIRENOTE_REVENUE_SYNC_ENABLED !== "false", cronSecretConfigured: !!process.env.CRON_SECRET };
  try {
    const tracks = await prisma.track.findMany({ where: { isrc: { not: null }, release: { archivedAt: null, direNoteStatus: { not: null } } }, select: { isrc: true, release: { select: { id: true, upc: true } } }, orderBy: { id: "desc" }, take: 1 });
    output.logs = await prisma.direNoteLog.groupBy({ by: ["action", "success"], where: { action: { in: ["revenue_report", "revenue_lookup", "release_qc_details", "release_qc_fetch", "provider_rate_limit"] }, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, _count: true, _max: { createdAt: true } });
    output.cronRuns = await prisma.auditLog.findMany({ where: { entity: "cron_job", entityId: { in: ["direnote-revenue-sync", "direnote-release-sync", "direnote-ingest-status"] }, action: "CRON_RUN_FINISHED" }, orderBy: { createdAt: "desc" }, take: 12, select: { entityId: true, createdAt: true, metadata: true } });
    output.royaltyStatements = await prisma.royaltyStatement.count();
    output.hourlyReservations = await prisma.direNoteLog.count({ where: { action: "rate_limit_reservation", createdAt: { gte: new Date(Date.now() - 3600000) } } });
    const recentRevenue = await prisma.direNoteLog.findMany({ where: { action: "revenue_report", success: true }, orderBy: { createdAt: "desc" }, take: 20, select: { responseJson: true } });
    output.recentRevenueSamples = recentRevenue.map(row => {
      try { return { valid: true, rows: normalizeDireNoteRevenueReport(row.responseJson).length }; }
      catch { return { valid: false, rows: null }; }
    });
    const { redactDireNoteDiagnostic } = await import("../lib/direnote");
    const failures = await prisma.direNoteLog.findMany({ where: { success: false, errorMessage: { not: null }, createdAt: { gte: new Date(Date.now() - 3600000) } }, orderBy: { createdAt: "desc" }, take: 10, select: { action: true, httpStatus: true, errorMessage: true } });
    output.recentFailures = failures.map(row => ({ action: row.action, httpStatus: row.httpStatus, error: redactDireNoteDiagnostic(row.errorMessage) }));
    if (!config.isConfigured) throw new Error("Provider credentials unavailable");
    const existing = tracks[0];
    const checks: Record<string, unknown> = {};
    const check = async (name: string, request: () => Promise<{ success: boolean; httpStatus: number | null; data?: any; retryAfterSeconds?: number }>, inspect?: (data: any) => unknown) => {
      await reserveDireNoteRequest("report_audit", existing?.release.id);
      const result = await request();
      checks[name] = { success: result.success, httpStatus: result.httpStatus, ...(result.success && inspect ? { verification: inspect(result.data) } : {}) };
      if (result.httpStatus === 429) throw new Error("Provider rate limit reached; audit stopped");
    };
    output.endpoints = checks;
    if (existing?.isrc) await check("check_revenue_report", () => getDireNoteRevenueReport(existing.isrc!, { timeoutMs: 15000 }), data => ({ recordingMatched: data.track?.isrc === existing.isrc, normalizedRows: normalizeDireNoteRevenueReport(data).length }));
    if (existing?.release.upc) {
      await check("check_release_status", () => getDireNoteReleaseInformation(existing.release.upc!, { timeoutMs: 15000 }), data => ({ trackCount: Array.isArray(data.tracks) ? data.tracks.length : null }));
      await check("check_qc_report", () => requestDireNoteV24("check_qc_report", { upc: existing.release.upc }, { timeoutMs: 15000 }), data => ({ trackCount: Array.isArray(data.tracks) ? data.tracks.length : null }));
    }
    if (!existing) output.catalogueSample = "No local provider-linked recording available";
    await check("list_payouts", () => requestDireNoteV24("list_payouts", { per_page: 1 }, { timeoutMs: 15000 }));
  } catch (error) {
    // Do not expose connection URLs, credentials, personal data or financial rows.
    output.incomplete = true;
    output.failureType = error instanceof Error ? error.constructor.name : "UnknownError";
    output.rateLimited = (error as { code?: string })?.code === "DIRENOTE_RATE_LIMIT";
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await mkdir("artifacts/audits", { recursive: true });
    await writeFile("artifacts/audits/distribution-reports-live.json", JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
  }
}
main().catch(() => { console.error("Read-only audit could not initialize; no credentials printed."); process.exitCode = 1; });
