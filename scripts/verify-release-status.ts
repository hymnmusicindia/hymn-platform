import assert from "node:assert/strict";
import { statusAfterDireNoteAcceptance, statusWhenScheduledDateArrives, transitionReleaseStatus, automaticStatusCopy } from "../lib/release-status-engine";
import { getReleaseStatusPresentation, adminReleaseStatusLabel, effectiveReleaseStatus, releaseSyncHealth } from "../lib/release-status-presentation";
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
assert.equal(statusAfterDireNoteAcceptance({ releaseDate: "2020-01-01", releaseTiming: "quick_release" }, new Date("2026-01-01T00:00:00Z")), "distributor_processing");
assert.equal(statusAfterDireNoteAcceptance({ releaseDate: "2099-01-01", releaseTiming: "schedule_release" }, new Date("2026-01-01T00:00:00Z")), "distributor_processing");
for (const status of CUSTOMER_REVIEW_STATUSES) {
  const stage = getReleasePortalStage({ status } as any);
  assert.equal(getReleasePortalFilterLabel(status as any), getReleasePortalStageLabel(stage));
}
assert.equal(getReleasePortalStageLabel("partner_received"), "Received by Partner");
assert.equal(getReleasePortalStage({ status: "under_review", metadata: { direNote: { reconciliationInProgress: true } } } as any), "reconciling");
assert.equal(getReleasePortalStageLabel("reconciling"), "Reconciling");
assert.equal(getReleasePortalDateLabel({ status: "live", releaseTiming: "quick_release" } as any), "Available now");
assert.equal(getReleasePortalDateLabel({ status: "distributor_processing", releaseTiming: "quick_release" } as any), "Usually 2–7 days after HYMN approval");
assert.equal(getReleasePortalStage({ status: "distributed" } as any), "released");
assert.equal(getReleasePortalFilterLabel("changes_requested"), "Changes Requested");
assert.equal(getReleaseStatusPresentation("distributed").label, "Live");
assert.equal(getReleasePortalStage({ status: "delivery_failed" } as any), "delivery_issue");
assert.equal(getReleasePortalStage({ status: "taken_down" } as any), "taken_down");
assert.equal(getReleasePortalStage({ status: "unknown" } as any), "unknown");
assert.equal(getReleaseStatusPresentation("distributor_changes_required").label, "Fix Required");
const pendingMetadata = { correctionReview: { status: "pending" }, autoQc: { changeKind: "rights_review" } };
assert.equal(getReleaseStatusPresentation("under_review", "changes_required", pendingMetadata).label, "Correction awaiting rights review");
assert.equal(adminReleaseStatusLabel("under_review", "changes_required", pendingMetadata), "Correction review required");
assert.equal(getReleaseStatusPresentation("under_review", "changes_required", {}).label, "Changes Required", "An unexplained stale local review must not hide an active correction");
assert.equal(getReleasePortalStageLabel("review", {status:"under_review",direNoteStatus:"changes_required",metadata:pendingMetadata} as any), "Correction awaiting rights review");
assert.equal(effectiveReleaseStatus("live", "changes_required", {}), "live", "Historical corrections cannot override verified live availability");
assert.match(automaticStatusCopy({status:"live",direNoteStatus:"changes_required",metadata:{}} as any)!,/live/);
assert.match(automaticStatusCopy({status:"under_review",direNoteStatus:"changes_required",metadata:pendingMetadata} as any)!,/received your response/);
assert.equal(effectiveReleaseStatus("draft", "changes_required", {}), "draft", "A local draft response is not an approved delivery");
assert.equal(releaseSyncHealth({direNoteStatus:"processing",direNoteLastSyncedAt:"2026-01-01T00:00:00Z"},Date.parse("2026-01-01T00:10:00Z")),null);
assert.equal(releaseSyncHealth({direNoteStatus:"processing",direNoteLastSyncedAt:"2026-01-01T00:00:00Z"},Date.parse("2026-01-01T02:00:00Z"))?.label,"Status refresh delayed");
assert.ok(releaseSyncHealth({direNoteStatus:"processing",direNoteSyncError:"private upstream error"})?.detail.includes("last verified"));
console.log("Release status transition verification passed.");
// vercel trigger 9
