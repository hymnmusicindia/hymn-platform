export type ReleaseStatusTone = "neutral" | "progress" | "success" | "warning" | "danger";
const map: Record<string, { label: string; description: string; tone: ReleaseStatusTone; step: number; nextAction: string }> = {
  draft: { label: "Draft", description: "Finish the release details when you are ready.", tone: "neutral", step: 0, nextAction: "Continue release" },
  submitted: { label: "Submitted", description: "HYMN has received your release.", tone: "progress", step: 1, nextAction: "Track review" },
  in_queue: { label: "Under Review", description: "Your release is waiting for HYMN review.", tone: "progress", step: 1, nextAction: "Track review" },
  under_review: { label: "Under Review", description: "HYMN is checking your music and metadata.", tone: "progress", step: 1, nextAction: "Track review" },
  changes_requested: { label: "Changes Required", description: "Update the requested details before distribution.", tone: "warning", step: 1, nextAction: "Fix release" },
  rejected: { label: "Action Required", description: "Review the decision and available corrections.", tone: "danger", step: 1, nextAction: "Review release" },
  approved: { label: "Under Review", description: "Your release is continuing through partner review.", tone: "progress", step: 1, nextAction: "Track review" },
  queued_for_distribution: { label: "Under Review", description: "Your release is continuing through partner review.", tone: "progress", step: 1, nextAction: "Track review" },
  submitting_to_distributor: { label: "Under Review", description: "Your release is continuing through partner review.", tone: "progress", step: 1, nextAction: "Track review" },
  sent: { label: "Under Review", description: "DireNote is reviewing your release.", tone: "progress", step: 1, nextAction: "Track review" },
  sent_to_distributor: { label: "Under Review", description: "DireNote is reviewing your release.", tone: "progress", step: 1, nextAction: "Track review" },
  distributor_processing: { label: "Under Review", description: "DireNote is reviewing your release.", tone: "progress", step: 1, nextAction: "Track review" },
  processing: { label: "Under Review", description: "DireNote is reviewing your release.", tone: "progress", step: 1, nextAction: "Track review" },
  distributor_changes_required: { label: "Fix Required", description: "DireNote requires corrections before distribution can continue.", tone: "danger", step: 1, nextAction: "Fix release" },
  delivered: { label: "Delivered", description: "Delivery is complete and store availability is being tracked.", tone: "success", step: 3, nextAction: "View stores" },
  scheduled: { label: "Scheduled", description: "Your release is ready for its release date.", tone: "success", step: 3, nextAction: "View schedule" },
  awaiting_live_confirmation: { label: "Awaiting Live Confirmation", description: "The release date has arrived and platform availability is being verified.", tone: "progress", step: 3, nextAction: "View stores" },
  partially_live: { label: "Partially Live", description: "The release is live on at least one platform while remaining stores process it.", tone: "success", step: 3, nextAction: "View stores" },
  live: { label: "Live", description: "Your release is available and reporting will follow.", tone: "success", step: 4, nextAction: "View performance" },
  failed: { label: "Delivery Issue", description: "HYMN needs your attention to continue delivery.", tone: "danger", step: 2, nextAction: "Resolve issue" }
};
export function getReleaseStatusPresentation(status?: string | null) { return map[String(status || "draft").toLowerCase()] || { label: String(status || "Status pending").replaceAll("_", " "), description: "Open the release for the latest details.", tone: "neutral" as const, step: 0, nextAction: "Manage release" }; }
