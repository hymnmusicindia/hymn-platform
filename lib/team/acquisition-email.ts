import "server-only";
import { teamSenderRole } from "./outreach-content";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";

export const acquisitionEmailStarters = [
  { slug: "music-distribution", name: "Music Distribution", category: "Distribution", subject: "Distribution support for {{artist_name}}", body: "Hi {{artist_name}},\n\nI came across your music and wanted to introduce HYMN Music, a platform helping independent artists with music distribution and artist services.\n\nIf you are planning a release, we would be happy to explain our distribution process, pricing, and first-release offer.\n\nYou can explore HYMN here:\n{{website_url}}\n\nIf this is relevant to your upcoming releases, feel free to reply and we can share the next steps.\n\nBest regards,\n{{sender_name}}\nHYMN Music" },
  { slug: "studio-partnership", name: "Studio Partnership", category: "Mixing & mastering", subject: "Potential partnership with {{company_name}}", body: "Hi {{artist_name}},\n\nI am reaching out from HYMN Music. We work with independent artists on music distribution and related services.\n\nWe are exploring partnerships with independent studios and producers to help artists access distribution and, where suitable, mixing and mastering services.\n\nWould you be open to discussing a possible collaboration?\n\nYou can find out more here:\n{{website_url}}\n\nBest regards,\n{{sender_name}}\nHYMN Music" },
  { slug: "follow-up", name: "Follow-up", category: "Other", subject: "Following up on HYMN Music", body: "Hi {{artist_name}},\n\nI wanted to follow up on my previous message about HYMN Music and our services for independent artists.\n\nIf you have an upcoming release or would like to understand our distribution options, I would be happy to share more information.\n\nYou can explore the platform here:\n{{website_url}}\n\nBest regards,\n{{sender_name}}\nHYMN Music" },
] as const;

export async function processAcquisitionEmailEvent(id: string) {
  const event = await prisma.acquisitionEmailEvent.findUnique({ where: { id } });
  if (!event || event.status !== "QUEUED") return;
  const sender = await prisma.teamMember.findFirst({ where: { id: event.createdByEmployeeId, workspaceId: event.workspaceId, status: "ACTIVE", user: { status: "ACTIVE" } }, include: { role: true, user: { select: { name: true } } } });
  const suppressed = await prisma.teamOutreachSuppression.findUnique({ where: { email: event.recipientEmail.toLowerCase() } });
  const [prospect, optedOut] = await Promise.all([
    prisma.teamProspect.findUnique({ where: { id: event.prospectId }, select: { suppressed: true, verified: true, contactEligibility: true, email: true } }),
    prisma.newsletterSubscriber.findFirst({ where: { email: { equals: event.recipientEmail, mode: "insensitive" }, OR: [{ status: { not: "subscribed" } }, { unsubscribedAt: { not: null } }] }, select: { id: true } }),
  ]);
  if (!sender || suppressed || !prospect || prospect.suppressed || !prospect.verified || !["CONSENTED", "LEGITIMATE_INTEREST"].includes(prospect.contactEligibility) || prospect.email?.toLowerCase() !== event.recipientEmail.toLowerCase() || optedOut) {
    const error = "Recipient is suppressed or no longer eligible for outreach; no email was sent.";
    await prisma.acquisitionEmailEvent.updateMany({ where: { id, status: "QUEUED" }, data: { status: "FAILED", providerError: error } });
    return { status: "skipped" as const, error };
  }
  const senderHeader = `${sender!.user.name} - ${teamSenderRole(sender!)} | HYMN Music`;
  const personalizedBody = `${senderHeader}\n\n${event.body}`;
  const html = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${personalizedBody.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!)}</div>`;
  const result = await sendTransactionalEmail({ to: event.recipientEmail, subject: event.subject, template: "acquisition_outreach", html, text: personalizedBody, senderName: `${sender!.user.name} | HYMN`, eventKey: event.eventKey, entityType: "acquisition_email", entityId: event.id });
  if (result.status === "sent") await prisma.acquisitionEmailEvent.updateMany({ where: { id, status: "QUEUED" }, data: { status: "SENT", providerMessageId: result.providerMessageId || null, sentAt: new Date() } });
  else await prisma.acquisitionEmailEvent.updateMany({ where: { id, status: "QUEUED" }, data: { status: "FAILED", providerError: result.error || (result.status === "skipped" ? "Email sending is disabled or not configured; no email was sent." : `Email sender status: ${result.status}`) } });
  await prisma.acquisitionProgramAudit.create({ data: { workspaceId: event.workspaceId, actorEmployeeId: event.createdByEmployeeId, action: result.status === "sent" ? "email.outreach_sent" : "email.outreach_failed", entityId: event.id, metadata: { recipient: event.recipientEmail, status: result.status, providerMessageId: result.providerMessageId || null, error: result.error || null } } });
  return result;
}
