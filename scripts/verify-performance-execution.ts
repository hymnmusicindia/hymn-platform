import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const dashboard = source("app/(authenticated)/dashboard/page.tsx");
assert(!/direnote|reconcile|fraud|excel|getAnalyticsByUserId/i.test(dashboard), "Customer dashboard must not import background maintenance services or full analytics history.");

const analytics = source("components/analytics-overview.tsx");
assert(!analytics.includes("setInterval(refresh"), "Analytics must not poll on a fixed interval.");
assert(!analytics.includes('fetch("/api/analytics"'), "Analytics must use its server-rendered report rather than refetching on page load.");

const workspace = source("components/customer-dashboard-shell.tsx");
assert(workspace.includes('if (activeTab !== "purchases" && activeTab !== "support") return;'), "Beat purchases must be loaded on demand.");

const releaseCron = source("app/api/cron/direnote-release-sync/route.ts");
const polledProviderStates = releaseCron.match(/providerStatus:\s*\{\s*in:\s*\[([^\]]+)/)?.[1] ?? "";
for (const state of ["scheduled", "awaiting_live_confirmation", "partially_live"]) assert(polledProviderStates.includes(JSON.stringify(state)), "The DireNote status worker must continue polling every post-review lifecycle state.");
assert.equal(JSON.parse(source("vercel.json")).crons.find((cron: { path: string }) => cron.path === "/api/cron/direnote-release-sync").schedule, "0 * * * *", "DireNote review polling must run hourly.");

const revenueCron = source("app/api/cron/direnote-revenue-sync/route.ts");
assert(revenueCron.includes("checkedIsrcs"), "Revenue sync must skip ISRCs already checked for the reporting month.");
assert(revenueCron.includes('DIRENOTE_REVENUE_SYNC_ENABLED === "false"'), "DireNote revenue automation must default to enabled while retaining an emergency disable switch.");
assert(revenueCron.includes('role: "ADMIN", status: "ACTIVE"'), "Automated revenue imports must resolve a valid active administrator for audit attribution.");

const database = source("lib/db.ts");
assert(database.includes("function listPostgresArtistCards"), "Artist-card reads must use a legacy-schema-compatible projection.");
assert(!database.includes("const cards = await prisma.artistCard.findMany({ where: { archivedAt: null }, orderBy: { updatedAt: \"desc\" } });"), "Admin artist-card reads must not select unavailable DireNote columns.");

const distributionDatabase = source("lib/distribution-db.ts");
assert(distributionDatabase.includes("legacyCompatibleReleaseForUser(userId, releaseId)"), "Single-release reads must tolerate pending optional DireNote columns.");
assert(distributionDatabase.includes("legacyCompatibleReleaseById(releaseId)"), "Administrative single-release reads must tolerate pending optional DireNote columns.");
assert(distributionDatabase.includes("select: { id: true }"), "Release mutations must not return unavailable optional DireNote columns by default.");
assert(!distributionDatabase.includes("prisma.release.findUnique({ where: { id: input.releaseId } })"), "Release submission must not select unavailable DireNote columns while entering the distribution queue.");
assert(!distributionDatabase.includes("include: { tracks: true, user: { select: { email: true } } }"), "Detailed release reads must not implicitly select unavailable DireNote columns.");

const draftCreateRoute = source("app/api/distribution/drafts/route.ts");
const draftUpdateRoute = source("app/api/distribution/drafts/[id]/route.ts");
assert(draftCreateRoute.includes("select: { id: true, updatedAt: true }"), "Draft creation must return only its identity and optimistic-concurrency timestamp.");
assert(draftUpdateRoute.includes("select: { metadata: true, status: true, updatedAt: true, tracks: { select: { id: true, trackNumber: true } } }") && draftUpdateRoute.includes("select: { id: true, updatedAt: true }"), "Draft autosave must select only its required status, metadata, concurrency timestamp and track identities, without optional Release columns.");

const adminControlCenter = source("components/admin-control-center.tsx");
const adminStatusRoute = source("app/api/admin/update-status/[id]/route.ts");
assert(adminControlCenter.includes('"Approve & Send to DireNote"') && adminControlCenter.includes('setConfirmStatusAction("sent")'), "HYMN approval must submit to DireNote in one admin action.");
const providerSubmitAt = adminStatusRoute.indexOf("const submission = await submitRelease");
const failedSubmissionGateAt = adminStatusRoute.indexOf("if (!submission.submitted)", providerSubmitAt);
const sentQueueAt = adminStatusRoute.indexOf('syncQueueStage(Number(id), "sent_to_direnote"', providerSubmitAt);
assert(providerSubmitAt >= 0 && failedSubmissionGateAt > providerSubmitAt && sentQueueAt > failedSubmissionGateAt && adminStatusRoute.includes("{ syncReleaseStatus: false }"), "The queue must not be marked sent before DireNote accepts the release.");

console.log("Performance execution guard verification passed.");
