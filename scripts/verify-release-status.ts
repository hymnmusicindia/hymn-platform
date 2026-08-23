import assert from "node:assert/strict";
import { statusAfterDireNoteAcceptance, statusWhenScheduledDateArrives, transitionReleaseStatus } from "../lib/release-status-engine";

assert.equal(transitionReleaseStatus({ currentStatus: "draft", nextStatus: "submitted" }), "submitted");
assert.equal(transitionReleaseStatus({ currentStatus: "changes_requested", nextStatus: "resubmitted" }), "resubmitted");
assert.throws(() => transitionReleaseStatus({ currentStatus: "draft", nextStatus: "live" }), /cannot move/);
assert.throws(() => transitionReleaseStatus({ currentStatus: "under_review", nextStatus: "changes_requested" }), /requires a reason/);
assert.equal(transitionReleaseStatus({ currentStatus: "under_review", nextStatus: "changes_requested", reason: "Missing rights proof" }), "changes_requested");
assert.equal(transitionReleaseStatus({ currentStatus: "approved", nextStatus: "changes_requested", reason: "Distributor readiness issue" }), "changes_requested");
assert.throws(() => transitionReleaseStatus({ currentStatus: "draft", nextStatus: "archived", manualOverride: true }), /requires a reason/);
assert.equal(statusWhenScheduledDateArrives(true), "awaiting_live_confirmation");
assert.equal(statusAfterDireNoteAcceptance({ releaseDate: "2020-01-01" }, new Date("2026-01-01T00:00:00Z")), "awaiting_live_confirmation");
console.log("Release status transition verification passed.");
// vercel trigger 9
