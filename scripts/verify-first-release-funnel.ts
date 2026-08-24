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
const promotionSource = fs.readFileSync(path.join(process.cwd(), "lib/first-release-promotion.ts"), "utf8");
assert.match(promotionSource, /submittedReleaseCount/);
assert.match(promotionSource, /release_already_submitted/);
const releaseFormSource = fs.readFileSync(path.join(process.cwd(), "components/release-form.tsx"), "utf8");
assert.match(releaseFormSource, /edit=\$\{id\}\$\{campaignQuery\}/, "Autosave must preserve the first-release campaign on the draft URL.");
assert.match(releaseFormSource, /firstReleaseOffer \? storePlatforms/, "The free funnel must not preselect paid social add-ons.");
const distributionStartSource = fs.readFileSync(path.join(process.cwd(), "app/distribution/start/page.tsx"), "utf8");
assert.match(distributionStartSource, /campaignDraftEligible/, "An eligible campaign draft must retain its offer while being edited.");
console.log("First Release Free pricing, add-on, qualification, and database uniqueness guards passed.");
