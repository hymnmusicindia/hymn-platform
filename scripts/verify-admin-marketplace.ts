import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const databaseSource = readFileSync("lib/db.ts", "utf8");
const adminSource = readFileSync("components/admin-control-center.tsx", "utf8");
const reviewSource = readFileSync("app/api/admin/beats/[id]/review/route.ts", "utf8");

const allBeatsBody = databaseSource.slice(databaseSource.indexOf("export async function listAllBeats"), databaseSource.indexOf("export async function listBeatsByProducer"));
assert(!allBeatsBody.includes("where: { enabled: true }"), "The admin catalogue must include disabled beats awaiting moderation.");
assert(adminSource.includes('fetch("/api/admin/beats", { cache: "no-store" })'), "Marketplace operations must refresh live beat data.");
assert(adminSource.includes('value="pending">Awaiting approval'), "The moderation queue must expose pending beats by default.");
assert(adminSource.includes("Approve and publish") && adminSource.includes("Request corrections"), "Beat moderation decisions must be available in the admin UI.");
assert(adminSource.includes("Beat-store orders") && adminSource.includes("Producer operations"), "Marketplace orders and producer operations must be integrated.");
assert(reviewSource.includes("Promise.allSettled"), "Non-critical review side effects must not invalidate a committed decision.");
assert(reviewSource.includes("Prisma.JsonNull"), "Approval must clear historical correction issues.");

console.log("Admin marketplace integration checks passed.");
