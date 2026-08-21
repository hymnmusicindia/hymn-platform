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

console.log("Performance execution guard verification passed.");
