import "server-only";
import { customerBrandText } from "@/lib/customer-message";
import { emailLayout, emailText } from "@/lib/email/email-templates";

export type ReleaseEmailData = { userName: string; releaseTitle: string; artistName?: string; releaseId: string | number; releaseStatus: string; releaseDate?: string; manageReleaseUrl: string; correctionUrl?: string; rejectionReason?: string; providerApproved?: boolean; qcReportUrl?:string; qcSummary?:string; upc?: string; approvalEstimate?: string; correctionItems?: Array<{label:string;note?:string}>; correctionApology?: boolean };

const copy: Record<string, { subject: string; body: (data: ReleaseEmailData) => string; next: string; cta: string; step: number; notice?: (data: ReleaseEmailData) => string | undefined }> = {
  release_submitted: { subject: "Your release has been submitted", body: (d) => `We received “${d.releaseTitle}”. HYMN will review its audio, artwork, metadata and rights information before distribution.`, next: "No action is needed right now. We’ll email you when review is complete or if anything needs your attention.", cta: "Manage release", step: 0 },
  release_under_review: { subject: "Your release is under review", body: (d) => `Our release team is now checking “${d.releaseTitle}” for store readiness.`, next: "Keep an eye on your inbox. We’ll tell you as soon as it is approved or if corrections are required.", cta: "View release status", step: 1 },
  release_approved_by_hymn: { subject: "Your release has been approved", body: (d) => `Good news—“${d.releaseTitle}” has passed HYMN’s review. It has not yet been confirmed as received by our distribution partner.`, next: "HYMN is preparing the delivery. We’ll update you when the distribution partner acknowledges it, or if anything needs your attention.", cta: "View release status", step: 2 },
  release_partner_approved: { subject: "Your release is approved for distribution", body: (d) => `Good news! “${d.releaseTitle}” has received distribution approval through HYMN.`, next: "We’ll confirm when your release is live. Availability can vary by store and territory.", cta: "View release", step: 3, notice: (d) => d.approvalEstimate },
  release_changes_requested: { subject: "Your release needs changes", body: (d) => `We found information in “${d.releaseTitle}” that needs your attention before distribution can continue.`, next: "Open your release, read each review note, make the requested updates and resubmit it for review.", cta: "Review requested changes", step: 1 },
  release_rejected: { subject: "Your release was not approved", body: (d) => `We could not approve “${d.releaseTitle}” in its current form. Your release has not been sent to music stores.`, next: "Open the release to review the decision and any available notes. Reply to this email if you need help understanding the reason.", cta: "Review decision", step: 1, notice: (d) => d.rejectionReason ? `Review note: ${d.rejectionReason}` : undefined },
  release_sent_to_distributor: { subject: "Your release is with our distributor", body: (d) => `“${d.releaseTitle}” has completed HYMN review and has been sent for distribution processing.`, next: "We’ll update you as HYMN reviews your release. Quick releases usually reach stores within 2–7 days after partner approval. Store availability can vary.", cta: "Track distribution", step: 3 },
  release_scheduled: { subject: "Your release is scheduled", body: (d) => `“${d.releaseTitle}” is approved by HYMN and scheduled for ${d.releaseDate || "your selected release date"}.`, next: "HYMN has approved the schedule. Store availability can still vary by platform and region.", cta: "View release", step: 4 },
  release_live: { subject: "Your release is live", body: (d) => `“${d.releaseTitle}” is now confirmed live through platform status.`, next: "Open the release in HYMN to check its current status and start sharing it with your audience.", cta: "View live release", step: 4, notice: () => "Availability can vary by music store, territory and processing time." },
  release_distribution_failed: { subject: "Your release needs attention", body: (d) => `Distribution processing for “${d.releaseTitle}” encountered an issue.`, next: "Open your release for the latest status. HYMN may retry delivery or ask you for a correction, depending on the issue.", cta: "Check release", step: 3 }
};

export function releaseStatusEmail(event: string, data: ReleaseEmailData) {
  const item = copy[event];
  if (!item) throw new Error(`Unsupported release email event: ${event}`);
  const ctaUrl = event === "release_changes_requested" ? data.correctionUrl || data.manageReleaseUrl : data.manageReleaseUrl;
  const subject = data.correctionApology ? "Corrected QC report and our apology" : item.subject;
  const corrections = event === "release_changes_requested" ? correctionEmailSummary(data.correctionItems) : [];
  const preserveNames = [data.releaseTitle, data.artistName ?? ""].filter(Boolean);
  const model = { ctaAfterSections: event === "release_changes_requested", preserveNames, title: subject, greeting: `Hi ${data.userName || "there"},`, body: event === "release_scheduled" && data.providerApproved ? `Good news—“${data.releaseTitle}” has been approved by HYMN for your selected schedule on ${data.releaseDate || "the date shown in HYMN"}. This confirms the partner schedule, not that the release is already live.` : item.body(data), ctaLabel: event === "release_changes_requested" ? "View detailed QC review" : item.cta, ctaUrl: event === "release_changes_requested" ? data.qcReportUrl || ctaUrl : ctaUrl, notice: data.correctionApology ? "We are sorry. Our earlier message repeated the album-wide review against unrelated tracks and was difficult to read. Please use this corrected review in place of that message." : item.notice?.(data), timelineStep: item.step, sections: [
    ...corrections.map(item => ({title:item.label,body:item.note})),
    ...(event === 'release_changes_requested' ? [{title:'Release on hold',body:'Distribution can continue only after the requested changes have been reviewed. The items above summarize the current correction request; they do not mark other tracks as approved.'}] : []),
    ...(data.qcReportUrl && ['release_rejected','release_distribution_failed'].includes(event) ? [{title:'Detailed QC review',body:'Sign in to HYMN to read the current review and any verified supporting evidence.',linkLabel:'Open QC review',linkUrl:data.qcReportUrl}] : []),
    ...(event === "release_sent_to_distributor" && data.upc ? [{ title: "Release identifier", body: `UPC: ${data.upc}` }] : []),
    { title: "What happens next?", body: item.next },
    { title: "Need help with your release?", body: "Reply to this email and the HYMN team will help you understand the status and next steps." }
  ] };
  return { subject: customerBrandText(`${subject} · ${data.releaseTitle}`, preserveNames), html: emailLayout(model), text: emailText(model) };
}
/** Email is a bounded summary, never a concatenated provider report. */
export function correctionEmailSummary(items?:Array<{label:string;note?:string}>) {
  const clip=(text:string,max:number)=>text.length>max?text.slice(0,max-1).trimEnd()+'\u2026':text;
  const unique=[...new Map((items??[]).map(item=>[item.label.trim().toLowerCase()+"\n"+(item.note??""),item])).values()];
  if(!unique.length)return [{label:'Changes requested',note:'Open the detailed QC review for the affected tracks, reasons and required actions.'}];
  const grouped = new Map<string,{label:string;note?:string}>();
  for (const item of unique) {
    const action = item.note?.split(/Required action\s*\n/i)[1] || item.note || '';
    const key = action.replace(/\s+/g,' ').trim().toLowerCase();
    const existing = grouped.get(key);
    grouped.set(key, existing ? {...existing,label:existing.label+' / '+item.label} : item);
  }
  const summaries=[...grouped.values()];
  const result=summaries.slice(0,4).map(item=>({label:clip(item.label,110),note:clip((item.note?.split(/Required action\s*\n/i)[1] || item.note || 'Review the requested correction in HYMN.').replace(/\s+/g,' ').replace(/^HYMN review:\s*/i,''),240)}));
  if(summaries.length>4)result.push({label:'Additional corrections',note:`${summaries.length-4} additional item(s) are listed in your detailed QC review.`});
  return result;
}
