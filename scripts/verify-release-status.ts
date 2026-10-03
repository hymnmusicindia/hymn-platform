import assert from "node:assert/strict";
import { statusAfterDireNoteAcceptance, statusWhenScheduledDateArrives, transitionReleaseStatus } from "../lib/release-status-engine";
import { getReleaseStatusPresentation } from "../lib/release-status-presentation";
import { getReleasePortalStage, getReleasePortalStageLabel, getReleasePortalFilterLabel, getReleasePortalDateLabel } from "../lib/release-portal";
import { CUSTOMER_REVIEW_STATUSES } from "../lib/release-status-presentation";

assert.equal(transitionReleaseStatus({ currentStatus: "draft", nextStatus: "submitted" }), "submitted");
assert.equal(transitionReleaseStatus({ currentStatus: "changes_requested", nextStatus: "resubmitted" }), "resubmitted");
assert.throws(() => transitionReleaseStatus({ currentStatus: "draft", nextStatus: "live" }), /cannot move/);
for (const currentStatus of ["draft", "live", "taken_down", "archived", "rejected"] as const) {
  for (const nextStatus of ["queued_for_distribution", "submitting_to_distributor", "sent_to_distributor", "sent"] as const) {
    assert.throws(() => transitionReleaseStatus({ currentStatus, nextStatus }), /cannot move/, `${currentStatus} cannot bypass review to ${nextStatus}`);
  }
}
assert.throws(() => transitionReleaseStatus({ currentStatus: "live", nextStatus: "queued_for_distribution", manualOverride: true }), /requires a reason/);
assert.throws(() => transitionReleaseStatus({ currentStatus: "under_review", nextStatus: "changes_requested" }), /requires a reason/);
assert.equal(transitionReleaseStatus({ currentStatus: "under_review", nextStatus: "changes_requested", reason: "Missing rights proof" }), "changes_requested");
assert.equal(transitionReleaseStatus({ currentStatus: "approved", nextStatus: "changes_requested", reason: "Distributor readiness issue" }), "changes_requested");
assert.throws(() => transitionReleaseStatus({ currentStatus: "draft", nextStatus: "archived", manualOverride: true }), /requires a reason/);
assert.equal(statusWhenScheduledDateArrives(true), "awaiting_live_confirmation");
assert.equal(statusAfterDireNoteAcceptance({ releaseDate: "2020-01-01" }, new Date("2026-01-01T00:00:00Z")), "awaiting_live_confirmation");
for (const status of CUSTOMER_REVIEW_STATUSES) {
  assert.equal(getReleaseStatusPresentation(status).label, "Under Review");
  assert.equal(getReleasePortalStage({ status } as any), "review");
  assert.equal(getReleasePortalFilterLabel(status as any), "Under Review");
}
assert.equal(getReleasePortalStageLabel("partner_received"), "Under Review");
assert.equal(getReleasePortalDateLabel({ status: "live", releaseTiming: "quick_release" } as any), "Available now");
assert.equal(getReleasePortalStage({ status: "distributed" } as any), "released");
assert.equal(getReleasePortalFilterLabel("changes_requested"), "Changes Requested");
assert.equal(getReleaseStatusPresentation("distributed").label, "Live");
assert.equal(getReleasePortalStage({ status: "delivery_failed" } as any), "delivery_issue");
assert.equal(getReleasePortalStage({ status: "taken_down" } as any), "taken_down");
assert.equal(getReleasePortalStage({ status: "unknown" } as any), "unknown");
assert.equal(getReleaseStatusPresentation("distributor_changes_required").label, "Fix Required");
console.log("Release status transition verification passed.");
// vercel trigger 9
