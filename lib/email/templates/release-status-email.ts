import "server-only";
import { emailLayout, emailText } from "@/lib/email/email-templates";

export type ReleaseEmailData = { userName: string; releaseTitle: string; artistName?: string; releaseId: string | number; releaseStatus: string; releaseDate?: string; manageReleaseUrl: string; correctionUrl?: string; rejectionReason?: string };

const copy: Record<string, { subject: string; body: (data: ReleaseEmailData) => string; cta: string; step: number; notice?: (data: ReleaseEmailData) => string | undefined }> = {
  release_submitted: { subject: "Your release has been submitted", body: (d) => `Your release “${d.releaseTitle}” has been submitted to HYMN. Our team will now review your metadata, artwork, audio, and rights before moving it forward for distribution.`, cta: "Manage release", step: 0 },
  release_under_review: { subject: "Your release is under HYMN review", body: (d) => `Our team is reviewing “${d.releaseTitle}”. We will notify you when the review moves forward or if changes are required.`, cta: "View release status", step: 1 },
  release_approved_by_hymn: { subject: "Your release has been approved by HYMN", body: (d) => `Your release “${d.releaseTitle}” has cleared HYMN review. We are now preparing it for distribution.`, cta: "View release status", step: 2 },
  release_changes_requested: { subject: "Changes requested for your release", body: (d) => `HYMN has requested changes for “${d.releaseTitle}”. Please review the correction notes and update the required fields before resubmitting.`, cta: "Fix release", step: 1 },
  release_rejected: { subject: "Your release was rejected", body: (d) => `Your release “${d.releaseTitle}” was rejected after review. Please check the release manage page for details.`, cta: "View reason", step: 1, notice: (d) => d.rejectionReason ? `Reason: ${d.rejectionReason}` : undefined },
  release_sent_to_distributor: { subject: "Your release has been sent for distribution", body: (d) => `Your release “${d.releaseTitle}” has cleared HYMN review and has been sent forward for distribution processing.`, cta: "Track distribution", step: 3 },
  release_scheduled: { subject: "Your release is scheduled", body: (d) => `Your release “${d.releaseTitle}” is scheduled for ${d.releaseDate || "the selected release date"}. Platform availability may vary by DSP.`, cta: "View release", step: 4 },
  release_live: { subject: "Your release is live", body: (d) => `Your release “${d.releaseTitle}” is marked live or confirmed available through platform status.`, cta: "View release", step: 4, notice: () => "Availability is based on confirmed platform status and may vary by DSP." },
  release_distribution_failed: { subject: "Distribution issue with your release", body: (d) => `We encountered an issue while processing “${d.releaseTitle}” for distribution. Our team may need correction or retry details.`, cta: "View release", step: 3 }
};

export function releaseStatusEmail(event: string, data: ReleaseEmailData) {
  const item = copy[event];
  if (!item) throw new Error(`Unsupported release email event: ${event}`);
  const ctaUrl = event === "release_changes_requested" ? data.correctionUrl || data.manageReleaseUrl : data.manageReleaseUrl;
  const model = { title: item.subject, greeting: `Hi ${data.userName || "there"},`, body: item.body(data), ctaLabel: item.cta, ctaUrl, notice: item.notice?.(data), timelineStep: item.step };
  return { subject: item.subject, html: emailLayout(model), text: emailText(model) };
}
// vercel trigger 6
