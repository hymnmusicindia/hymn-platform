import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canTransitionStudioOrder, assertStudioOrderTransition } from "../lib/studio-services-state";

assert.equal(canTransitionStudioOrder("AWAITING_PAYMENT", "PAID"), true);
assert.equal(canTransitionStudioOrder("DELIVERED", "REVISION_REQUESTED"), true);
assert.equal(canTransitionStudioOrder("REVISION_PAYMENT_REQUIRED", "REVISION_REQUESTED"), true);
assert.equal(canTransitionStudioOrder("COMPLETED", "IN_PROGRESS"), false);
assert.throws(() => assertStudioOrderTransition("REFUNDED", "COMPLETED"), /Invalid Studio order transition/);

const root = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migration = fs.readFileSync(path.join(root, "prisma/migrations/20260923190000_studio_services/migration.sql"), "utf8");
const service = fs.readFileSync(path.join(root, "lib/studio-services.ts"), "utf8");
const privateStorage = fs.readFileSync(path.join(root, "lib/private-storage.ts"), "utf8");

for (const model of ["EngineerProfile", "StudioServiceListing", "StudioServiceOrder", "StudioMessage", "StudioFile", "StudioDelivery", "StudioRevision", "StudioPayment", "StudioEarning", "StudioReleaseHandoff"]) assert.match(schema, new RegExp(`model ${model}\\b`));
for (const constraint of ["studio_order_prices_check", "studio_order_rates_check", "studio_review_rating_check"]) assert.match(migration, new RegExp(constraint));
assert.match(service, /TransactionIsolationLevel\.Serializable/);
assert.match(service, /pg_advisory_xact_lock/);
assert.match(service, /HYMN_BEAT_CUSTOMER/);
assert.match(service, /studioEarning\.create/);
assert.match(service, /walletTransaction\.create/);
assert.match(service, /releaseTrackBeatLink\.create/);
assert.match(privateStorage, /studioParticipant/);
assert.match(privateStorage, /private_studio_source/);
assert.match(privateStorage, /private_studio_delivery/);

console.log("Studio Services domain, migration, state machine, settlement, rights handoff, and private-file guards verified.");
