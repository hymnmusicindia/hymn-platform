import type { Release, ReleaseStatus } from "@/lib/types";

export function releaseDateReached(value?: string | null, now = new Date()) {
  if (!value) return true;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return true;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date.getTime() <= today;
}

export function statusAfterDireNoteAcceptance(release: Pick<Release, "releaseDate">, now = new Date()): ReleaseStatus {
  if (!releaseDateReached(release.releaseDate, now)) return "scheduled";
  return "awaiting_live_confirmation";
}

const allowedTransitions: Partial<Record<ReleaseStatus, ReleaseStatus[]>> = {
  draft: ["awaiting_payment", "submitted", "in_qc_queue"], awaiting_payment: ["submitted"], submitted: ["in_qc_queue", "under_review", "changes_requested", "rejected"], in_queue: ["in_qc_queue", "under_review", "changes_requested", "rejected"], in_qc_queue: ["under_review", "changes_requested", "rejected"],
  under_review: ["changes_requested", "approved", "rejected", "delivery_failed"], changes_requested: ["resubmitted", "rejected"], resubmitted: ["in_qc_queue", "under_review"], rejected: ["draft", "resubmitted"],
  approved: ["queued_for_distribution", "submitting_to_distributor", "sent_to_distributor", "failed"], queued_for_distribution: ["submitting_to_distributor", "sent_to_distributor", "delivery_failed"], submitting_to_distributor: ["queued_for_distribution", "sent_to_distributor", "changes_requested", "delivery_failed"],
  sent_to_distributor: ["queued_for_distribution", "submitting_to_distributor", "distributor_processing", "distributor_changes_required", "scheduled", "awaiting_live_confirmation", "partially_live", "delivery_failed"], distributor_processing: ["distributor_changes_required", "scheduled", "awaiting_live_confirmation", "partially_live", "delivery_failed"], distributor_changes_required: ["resubmitted", "delivery_failed"], scheduled: ["awaiting_live_confirmation", "partially_live", "delivery_failed"],
  processing: ["queued_for_distribution", "submitting_to_distributor", "awaiting_live_confirmation", "partially_live", "delivery_failed"], awaiting_live_confirmation: ["partially_live", "live", "delivery_failed"],
  delivered: ["partially_live", "live", "delivery_failed"], sent: ["queued_for_distribution", "submitting_to_distributor", "scheduled", "awaiting_live_confirmation", "partially_live", "delivery_failed"], failed: ["under_review", "queued_for_distribution"], delivery_failed: ["queued_for_distribution", "archived"], live: ["takedown_requested", "archived"], partially_live: ["live", "delivery_failed", "takedown_requested"], takedown_requested: ["takedown_processing"], takedown_processing: ["taken_down", "delivery_failed"], taken_down: ["archived"]
};

export function transitionReleaseStatus(input: { currentStatus: ReleaseStatus; nextStatus: ReleaseStatus; manualOverride?: boolean; reason?: string }) {
  if (input.currentStatus === input.nextStatus) return input.nextStatus;
  if (input.manualOverride || ["queued_for_distribution", "submitting_to_distributor", "sent_to_distributor", "sent"].includes(input.nextStatus)) {
    if (input.manualOverride && !input.reason?.trim() && !["queued_for_distribution", "submitting_to_distributor", "sent_to_distributor", "sent", "approved"].includes(input.nextStatus)) {
      throw new Error("Manual release status override requires a reason.");
    }
    return input.nextStatus;
  }
  if (["changes_requested", "rejected", "failed", "delivery_failed", "takedown_requested", "takedown_processing", "taken_down", "archived"].includes(input.nextStatus) && !input.reason?.trim()) throw new Error(`${input.nextStatus} requires a reason.`);
  if (!allowedTransitions[input.currentStatus]?.includes(input.nextStatus)) throw new Error(`Release cannot move from ${input.currentStatus} to ${input.nextStatus}.`);
  return input.nextStatus;
}

export function statusWhenScheduledDateArrives(autoMarkLive: boolean): ReleaseStatus {
  void autoMarkLive;
  return "awaiting_live_confirmation";
}

export function isDireNoteAccepted(release: Release) {
  const metadata = release.metadata && typeof release.metadata === "object" ? release.metadata : {};
  return Boolean(metadata.direnoteAcceptedAt || metadata.direnoteAccepted) || ["sent_to_distributor", "scheduled", "processing", "awaiting_live_confirmation", "partially_live", "delivered", "live"].includes(release.status);
}

export function automaticStatusCopy(release: Release) {
  if (release.status === "under_review" || release.status === "submitted" || release.status === "in_queue") return "HYMN is reviewing your metadata, artwork, audio, and rights.";
  if (release.status === "sent_to_distributor") return "Your release has cleared HYMN review and has been submitted for distribution.";
  if (release.status === "scheduled") return `Your release is accepted for distribution and scheduled for ${release.releaseDate}.`;
  if (release.status === "processing") return "Your release has cleared distribution submission. Platform availability may still take time depending on DSP processing.";
  if (release.status === "awaiting_live_confirmation") return "Your release date has arrived. HYMN is waiting for platform availability confirmation.";
  if (release.status === "partially_live") return "Your release is confirmed live on at least one platform. Availability may still vary by DSP.";
  if (release.status === "live") return "Your release is live or confirmed available through platform status.";
  if (release.status === "changes_requested") return "HYMN found issues that need correction before distribution can continue.";
  if (release.status === "rejected") return "This release was rejected. Check the reason and correction notes.";
  return null;
}
// vercel trigger 9
