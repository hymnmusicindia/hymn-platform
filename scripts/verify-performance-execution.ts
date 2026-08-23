import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const dashboard = source("app/dashboard/page.tsx");
assert(!/direnote|reconcile|fraud|excel|getAnalyticsByUserId/i.test(dashboard), "Customer dashboard must not import background maintenance services or full analytics history.");

const analytics = source("components/analytics-overview.tsx");
assert(!analytics.includes("setInterval(refresh"), "Analytics must not poll on a fixed interval.");
assert(!analytics.includes('fetch("/api/analytics"'), "Analytics must use its server-rendered report rather than refetching on page load.");

const workspace = source("components/workspace-shells.tsx");
assert(workspace.includes('if (activeTab !== "purchases" && activeTab !== "support") return;'), "Beat purchases must be loaded on demand.");

const releaseCron = source("app/api/cron/direnote-release-sync/route.ts");
assert(releaseCron.includes('status: { in: ["SENT_TO_DISTRIBUTOR", "PROCESSING", "DELIVERED", "LIVE"] }'), "The DireNote status worker must include distributed catalogue releases.");
assert(releaseCron.includes("nextStatusCheckDelay"), "DireNote status polling must be adaptive.");

const revenueCron = source("app/api/cron/direnote-revenue-sync/route.ts");
assert(revenueCron.includes("checkedIsrcs"), "Revenue sync must skip ISRCs already checked for the reporting month.");

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
assert(draftCreateRoute.includes("select: { id: true }"), "Draft creation must not return unavailable optional Release columns.");
assert(draftUpdateRoute.includes("select: { metadata: true }") && draftUpdateRoute.includes("select: { id: true, updatedAt: true }"), "Draft autosave must use legacy-schema-compatible Release projections.");

console.log("Performance execution guard verification passed.");
