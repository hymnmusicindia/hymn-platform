export type ReleaseStatusTone = "neutral" | "progress" | "success" | "warning" | "danger";
const map: Record<string, { label: string; description: string; tone: ReleaseStatusTone; step: number; nextAction: string }> = {
  draft: { label: "Draft", description: "Finish the release details when you are ready.", tone: "neutral", step: 0, nextAction: "Continue release" },
  submitted: { label: "Submitted", description: "HYMN has received your release.", tone: "progress", step: 1, nextAction: "Track review" },
  in_queue: { label: "Under Review", description: "Your release is waiting for HYMN review.", tone: "progress", step: 1, nextAction: "Track review" },
  under_review: { label: "Under Review", description: "HYMN is checking your music and metadata.", tone: "progress", step: 1, nextAction: "Track review" },
  changes_requested: { label: "Changes Required", description: "Update the requested details before distribution.", tone: "warning", step: 1, nextAction: "Fix release" },
  rejected: { label: "Action Required", description: "Review the decision and available corrections.", tone: "danger", step: 1, nextAction: "Review release" },
  approved: { label: "Approved by HYMN", description: "HYMN review is complete. Partner delivery has not yet been confirmed.", tone: "progress", step: 2, nextAction: "Track delivery" },
  queued_for_distribution: { label: "Queued for Distribution", description: "Your release is waiting to be sent to the distribution partner.", tone: "progress", step: 2, nextAction: "Track delivery" },
  submitting_to_distributor: { label: "Sending to Partner", description: "HYMN is awaiting the partner acknowledgement.", tone: "progress", step: 2, nextAction: "Track delivery" },
  sent: { label: "Received by Partner", description: "The distribution partner has acknowledged your release.", tone: "progress", step: 2, nextAction: "Track delivery" },
  sent_to_distributor: { label: "Received by Partner", description: "DireNote acknowledged your release. Store availability is not yet confirmed.", tone: "progress", step: 2, nextAction: "Track delivery" },
  distributor_processing: { label: "Partner Processing", description: "DireNote is processing your release.", tone: "progress", step: 2, nextAction: "Track delivery" },
  processing: { label: "Partner Processing", description: "DireNote is processing your release.", tone: "progress", step: 2, nextAction: "Track delivery" },
  delivery_failed: { label: "Delivery Needs Attention", description: "HYMN is checking a delivery issue. Do not create or pay for another release.", tone: "danger", step: 2, nextAction: "View delivery details" },
  takedown_requested: { label: "Takedown Requested", description: "HYMN has received the takedown request.", tone: "warning", step: 4, nextAction: "Track takedown" },
  takedown_processing: { label: "Takedown Processing", description: "Removal is awaiting partner confirmation.", tone: "warning", step: 4, nextAction: "Track takedown" },
  taken_down: { label: "Taken Down", description: "Removal has been confirmed.", tone: "neutral", step: 4, nextAction: "View details" },
  distributor_changes_required: { label: "Fix Required", description: "DireNote requires corrections before distribution can continue.", tone: "danger", step: 1, nextAction: "Fix release" },
  delivered: { label: "Delivered", description: "Delivery is complete and store availability is being tracked.", tone: "success", step: 3, nextAction: "View stores" },
  scheduled: { label: "Scheduled", description: "Your release is ready for its release date.", tone: "success", step: 3, nextAction: "View schedule" },
  awaiting_live_confirmation: { label: "Awaiting Live Confirmation", description: "The release date has arrived and platform availability is being verified.", tone: "progress", step: 3, nextAction: "View stores" },
  partially_live: { label: "Partially Live", description: "The release is live on at least one platform while remaining stores process it.", tone: "success", step: 3, nextAction: "View stores" },
  live: { label: "Live", description: "Your release is available and reporting will follow.", tone: "success", step: 4, nextAction: "View performance" },
  failed: { label: "Delivery Issue", description: "HYMN needs your attention to continue delivery.", tone: "danger", step: 2, nextAction: "Resolve issue" }
};
export function getReleaseStatusPresentation(status?: string | null) { return map[String(status || "draft").toLowerCase()] || { label: String(status || "Status pending").replaceAll("_", " "), description: "Open the release for the latest details.", tone: "neutral" as const, step: 0, nextAction: "Manage release" }; }

/** Human labels for operational release states. Kept client-safe so admin and
 * customer surfaces cannot drift by each maintaining their own formatter. */
export function adminReleaseStatusLabel(status: string, providerStatus?: string | null) {
  const labels: Record<string, string> = {
    submitting_to_distributor: "Sending to DireNote",
    sent_to_distributor: "Sent to DireNote",
    distributor_processing: "DireNote Review",
    changes_requested: "Changes Required",
    rejected: providerStatus === "rejected" ? "Rejected by DireNote" : "Rejected"
  };
  return labels[status.toLowerCase()] ?? status.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
