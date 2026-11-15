import "server-only";
import { prisma } from "./prisma";
import { approvalEstimateText, PARTNER_APPROVAL_FORWARD_STATES } from "./partner-release-approval";
import { releaseStatusEmail } from "./email/templates/release-status-email";
import { getPublicAppUrl } from "./public-app-url";

/** One owner notification and durable email per verified current submission. */
export async function queuePartnerReleaseApproval(releaseId: number, attemptId: number, upc: string, estimatedDate: string | null) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`partner-approval:${releaseId}`}, 7213))`;
    const [release, attempt] = await Promise.all([
      tx.release.findUnique({ where: { id: releaseId }, include: { user: true } }),
      tx.distributionSubmissionAttempt.findFirst({ where: { id: attemptId, releaseId, provider: "direnote", isCurrent: true, upc } }),
    ]);
    if (!release || !attempt || release.archivedAt || release.user.status !== "ACTIVE" || !PARTNER_APPROVAL_FORWARD_STATES.includes(release.status)
      || /rejected|changes|required|failed/.test(String(release.direNoteStatus).toLowerCase())) return;
    const eventKey = `release:${releaseId}:partner-approved:attempt:${attemptId}`;
    const href = `/dashboard/releases/${releaseId}`;
    const estimate = approvalEstimateText(estimatedDate);
    const title = `Approved for distribution: ${release.title}`;
    const body = `Good news! HYMN has received distribution approval for “${release.title}”. ${estimate}`;
    const metadata = { releaseId, attemptId, estimatedDate, estimateOnly: true, source: "direnote" };
    await tx.notification.upsert({ where: { eventKey }, create: { eventKey, userId: release.userId, title, body, type: "release", priority: "normal", href, actionLabel: "View release", metadata }, update: { title, body, metadata } });
    const email = releaseStatusEmail("release_partner_approved", { userName: release.user.name, releaseTitle: release.title, artistName: release.artistName, releaseId, releaseStatus: release.status, manageReleaseUrl: `${getPublicAppUrl()}${href}`, approvalEstimate: estimate });
    const data = { userId: release.userId, toEmail: release.user.email, subject: email.subject, template: "release_partner_approved", entityType: "release", entityId: String(releaseId), provider: "smtp", payload: { channel: "release_outbox", html: email.html, text: email.text, expectedStatus: release.status, approvalAttemptId: attemptId, approvalUpc: upc, preserveNames: [release.title, release.artistName] } };
    await tx.emailLog.upsert({ where: { eventKey: `${eventKey}:email` }, create: { ...data, eventKey: `${eventKey}:email`, status: "pending" }, update: {} });
    // Refresh estimates only before SMTP is attempted; never reset sent or uncertain deliveries.
    await tx.emailLog.updateMany({ where: { eventKey: `${eventKey}:email`, status: { in: ["pending", "skipped"] } }, data: { ...data, status: "pending", errorMessage: null } });
  }, { timeout: 30_000, maxWait: 10_000 });
}
