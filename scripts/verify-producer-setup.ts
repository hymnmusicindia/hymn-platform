import assert from "node:assert/strict";
import { producerSetup, producerSetupTab } from "../lib/producer-setup";

const profile = { displayName: "Test Producer", avatarUrl: "/avatar.png", coverPhotoUrl: "/cover.png", status: "active", active: true };
const fresh = producerSetup(null, []);
assert.equal(fresh.complete, false);
assert.equal(fresh.completedSteps, 0);
assert.deepEqual(fresh.missing, ["Producer name", "Profile image", "Cover image"]);
for (const tab of ["analytics", "earnings", "sales", "payout", "ledger", "collaborations", "placements", "contracts", "licensing"]) assert.equal(producerSetupTab(tab, fresh), "overview");
assert.equal(producerSetupTab("upload", fresh), "profile");
assert.equal(producerSetupTab("settings", fresh), "settings");
assert.equal(producerSetupTab("messages", fresh), "messages");
const ready = producerSetup(profile, []);
assert.equal(ready.completedSteps, 1);
assert.equal(ready.complete, false);
assert.equal(producerSetupTab("upload", ready), "upload");
assert.equal(producerSetup({ ...profile, avatarUrl: null }, [{ status: "PUBLISHED" }]).complete, false);
assert.equal(producerSetup(profile, [{ status: "DRAFT" }, { status: "ARCHIVED" }]).complete, false);
for (const status of ["PENDING_REVIEW", "CHANGES_REQUESTED", "PUBLISHED", "EXCLUSIVELY_SOLD"]) {
  const completed = producerSetup(profile, [{ status }]);
  assert.equal(completed.complete, true, `${status} is an uploaded listing; approval is separate`);
  assert.equal(producerSetupTab("analytics", completed), "analytics");
}
assert.equal(producerSetup(profile, [{ enabled: true }]).complete, true, "Legacy listed beats remain recognised");
for (const status of ["suspended", "disabled"]) assert.equal(producerSetup({ ...profile, status }, [{ status: "PUBLISHED" }]).complete, false);
assert.equal(producerSetup({ ...profile, status: "pending_setup", active: false }, []).restricted, false, "Incomplete setup must remain editable");
console.log("PASS persisted producer readiness, deep-link gating, pending review, legacy listings and restrictions");
