import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateFirstReleasePrice, FIRST_RELEASE_BASE_DISCOUNT } from "../lib/first-release-promotion";

const noAddon = calculateFirstReleasePrice({ plan: "one_time", releaseType: "single", trackCount: 1, normalAmount: 99 });
assert.deepEqual(noAddon, { originalAmount: 99, discountAmount: 99, finalAmount: 0 });

const withAddons = calculateFirstReleasePrice({ plan: "one_time", releaseType: "single", trackCount: 1, normalAmount: 349 });
assert.equal(withAddons.discountAmount, FIRST_RELEASE_BASE_DISCOUNT);
assert.equal(withAddons.finalAmount, 250, "Paid add-ons must remain payable.");

for (const invalid of [
  { plan: "yearly", releaseType: "single", trackCount: 1, normalAmount: 700 },
  { plan: "one_time", releaseType: "album", trackCount: 1, normalAmount: 99 },
  { plan: "one_time", releaseType: "single", trackCount: 2, normalAmount: 198 }
]) assert.throws(() => calculateFirstReleasePrice(invalid), /only to one new Single/);

const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260825090000_first_release_free_funnel/migration.sql"), "utf8");
assert.match(migration, /UNIQUE INDEX "promotion_redemptions_promotion_id_user_id_key"/);
assert.match(migration, /FIRST_RELEASE_FREE/);
const repairMigration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261003120000_restore_first_release_promotion/migration.sql"), "utf8");
assert.match(repairMigration, /INSERT INTO "promotions"/, "Deployments must restore the promotion configuration if the original seed row is missing.");
assert.match(repairMigration, /ON CONFLICT \("code"\) DO UPDATE/, "The promotion repair must be safe to deploy more than once.");
const promotionSource = fs.readFileSync(path.join(process.cwd(), "lib/first-release-promotion.ts"), "utf8");
assert.match(promotionSource, /submittedReleaseCount/);
assert.match(promotionSource, /release_already_submitted/);
const releaseFormSource = fs.readFileSync(path.join(process.cwd(), "components/release-form.tsx"), "utf8");
assert.match(releaseFormSource, /edit=\$\{id\}\$\{campaignQuery\}/, "Autosave must preserve the first-release campaign on the draft URL.");
assert.match(releaseFormSource, /storePlatforms\.map\(\(platform\) => platform\.name\)/, "Default delivery must contain store platforms only and must not preselect paid social add-ons.");
assert.match(releaseFormSource, /if \(firstReleaseOffer\) return;/, "The free funnel must prevent adding tracks beyond one Single.");
assert.match(releaseFormSource, /FIRST_RELEASE_BASE_DISCOUNT/, "The review price must use the shared server-aligned first-release discount.");
assert.match(releaseFormSource, /Submit your release/, "A zero-due first release must be presented as a direct submission, not checkout.");
const distributionStartSource = fs.readFileSync(path.join(process.cwd(), "app/(authenticated)/distribution/start/page.tsx"), "utf8");
assert.match(distributionStartSource, /campaignDraftEligible/, "An eligible campaign draft must retain its offer while being edited.");
const verifySubmitSource = fs.readFileSync(path.join(process.cwd(), "app/api/distribution/payment/verify-submit/route.ts"), "utf8");
assert.match(verifySubmitSource, /promotionCode: FIRST_RELEASE_PROMOTION_CODE/, "Submitted free releases must retain their promotion marker for corrections and account history.");
const summaryCardSource = fs.readFileSync(path.join(process.cwd(), "components/release-summary-card.tsx"), "utf8");
assert.match(summaryCardSource, /\["draft", "changes_requested"\]/, "Free-release cards must be tagged while drafted or awaiting corrections.");
assert.match(summaryCardSource, />Free release</, "The account card must use the concise FREE RELEASE tag.");
console.log("First Release Free pricing, add-on, qualification, and database uniqueness guards passed.");
