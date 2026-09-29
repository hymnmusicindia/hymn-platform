import "server-only";
import { emailLayout, emailText } from "@/lib/email/email-templates";

export type ReleaseEmailData = { userName: string; releaseTitle: string; artistName?: string; releaseId: string | number; releaseStatus: string; releaseDate?: string; manageReleaseUrl: string; correctionUrl?: string; rejectionReason?: string };

const copy: Record<string, { subject: string; body: (data: ReleaseEmailData) => string; next: string; cta: string; step: number; notice?: (data: ReleaseEmailData) => string | undefined }> = {
  release_submitted: { subject: "Your release has been submitted", body: (d) => `We received “${d.releaseTitle}”. HYMN will review its audio, artwork, metadata and rights information before distribution.`, next: "No action is needed right now. We’ll email you when review is complete or if anything needs your attention.", cta: "Manage release", step: 0 },
  release_under_review: { subject: "Your release is under review", body: (d) => `Our release team is now checking “${d.releaseTitle}” for store readiness.`, next: "Keep an eye on your inbox. We’ll tell you as soon as it is approved or if corrections are required.", cta: "View release status", step: 1 },
  release_approved_by_hymn: { subject: "Your release has been approved", body: (d) => `Good news—“${d.releaseTitle}” has passed HYMN’s review and is being prepared for delivery.`, next: "We’ll deliver the release to our distribution partner and continue updating you as it moves toward stores.", cta: "View release status", step: 2 },
  release_changes_requested: { subject: "Your release needs changes", body: (d) => `We found information in “${d.releaseTitle}” that needs your attention before distribution can continue.`, next: "Open your release, read each review note, make the requested updates and resubmit it for review.", cta: "Review requested changes", step: 1 },
  release_rejected: { subject: "Your release was not approved", body: (d) => `We could not approve “${d.releaseTitle}” in its current form. Your release has not been sent to music stores.`, next: "Open the release to review the decision and any available notes. Reply to this email if you need help understanding the reason.", cta: "Review decision", step: 1, notice: (d) => d.rejectionReason ? `Review note: ${d.rejectionReason}` : undefined },
  release_sent_to_distributor: { subject: "Your release is with our distributor", body: (d) => `“${d.releaseTitle}” has completed HYMN review and has been sent for distribution processing.`, next: "Stores process deliveries on their own timelines. We’ll notify you when a schedule or live status is confirmed.", cta: "Track distribution", step: 3 },
  release_scheduled: { subject: "Your release is scheduled", body: (d) => `“${d.releaseTitle}” is scheduled for ${d.releaseDate || "your selected release date"}.`, next: "You can review the release details now. Store availability can appear at different times across platforms and regions.", cta: "View release", step: 4 },
  release_live: { subject: "Your release is live", body: (d) => `“${d.releaseTitle}” is now confirmed live through platform status.`, next: "Open the release in HYMN to check its current status and start sharing it with your audience.", cta: "View live release", step: 4, notice: () => "Availability can vary by music store, territory and processing time." },
  release_distribution_failed: { subject: "Your release needs attention", body: (d) => `Distribution processing for “${d.releaseTitle}” encountered an issue.`, next: "Open your release for the latest status. HYMN may retry delivery or ask you for a correction, depending on the issue.", cta: "Check release", step: 3 }
};

export function releaseStatusEmail(event: string, data: ReleaseEmailData) {
  const item = copy[event];
  if (!item) throw new Error(`Unsupported release email event: ${event}`);
  const ctaUrl = event === "release_changes_requested" ? data.correctionUrl || data.manageReleaseUrl : data.manageReleaseUrl;
  const model = { title: item.subject, greeting: `Hi ${data.userName || "there"},`, body: item.body(data), ctaLabel: item.cta, ctaUrl, notice: item.notice?.(data), timelineStep: item.step, sections: [
    { title: "What happens next?", body: item.next },
    { title: "Need help with your release?", body: "Reply to this email and the HYMN team will help you understand the status and next steps." }
  ] };
  return { subject: item.subject, html: emailLayout(model), text: emailText(model) };
}
// vercel trigger 6
