import assert from "node:assert/strict";
import { statusAfterDireNoteAcceptance, statusWhenScheduledDateArrives, transitionReleaseStatus } from "../lib/release-status-engine";
import { getReleaseStatusPresentation } from "../lib/release-status-presentation";
import { getReleasePortalStage } from "../lib/release-portal";

assert.equal(transitionReleaseStatus({ currentStatus: "draft", nextStatus: "submitted" }), "submitted");
assert.equal(transitionReleaseStatus({ currentStatus: "changes_requested", nextStatus: "resubmitted" }), "resubmitted");
assert.throws(() => transitionReleaseStatus({ currentStatus: "draft", nextStatus: "live" }), /cannot move/);
assert.throws(() => transitionReleaseStatus({ currentStatus: "under_review", nextStatus: "changes_requested" }), /requires a reason/);
assert.equal(transitionReleaseStatus({ currentStatus: "under_review", nextStatus: "changes_requested", reason: "Missing rights proof" }), "changes_requested");
assert.equal(transitionReleaseStatus({ currentStatus: "approved", nextStatus: "changes_requested", reason: "Distributor readiness issue" }), "changes_requested");
assert.throws(() => transitionReleaseStatus({ currentStatus: "draft", nextStatus: "archived", manualOverride: true }), /requires a reason/);
assert.equal(statusWhenScheduledDateArrives(true), "awaiting_live_confirmation");
assert.equal(statusAfterDireNoteAcceptance({ releaseDate: "2020-01-01" }, new Date("2026-01-01T00:00:00Z")), "awaiting_live_confirmation");
for (const status of ["approved", "sent_to_distributor", "distributor_processing"] as const) {
  assert.equal(getReleaseStatusPresentation(status).label, "Under Review");
  assert.equal(getReleasePortalStage({ status } as any), "review");
}
assert.equal(getReleaseStatusPresentation("distributor_changes_required").label, "Fix Required");
console.log("Release status transition verification passed.");
// vercel trigger 9
