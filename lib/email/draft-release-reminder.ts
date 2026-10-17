import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/email/email-client";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { FIRST_RELEASE_PROMOTION_CODE, getFirstReleaseEligibility } from "@/lib/first-release-promotion";

export const DRAFT_REMINDER_TEMPLATE = "draft_release_four_days_v1";
export function draftReminderContent(name: string, title: string, url: string, free: boolean) {
  const model = {
    title: free ? "Your free release is waiting :)" : "Your music is ready for its next step",
    greeting: `Hi ${name || "artist"},`,
    body: `Your release “${title}” has been in draft for more than four days. Pick up where you left off, complete the remaining details and submit it for review.\n\n${free ? "Your first single’s base distribution is FREE with your HYMN first-release offer. Finish your draft and distribute :) Optional add-ons cost extra; check your final total before submitting." : "Your draft is saved. Open it to check the remaining details and current pricing before submitting."}\n\nNeed a hand? Reply to this email or chat with us on WhatsApp—we’ll help you take the next step.`,
    ctaLabel: free ? "Finish my free release" : "Continue my release", ctaUrl: url
  };
  return { subject: free ? `${title}: your free release is waiting :)` : `Finish your HYMN release: ${title}`, html: emailLayout(model), text: emailText(model) };
}

export async function sendDraftReleaseReminders() {
  // Do not consume deduplication keys while SMTP is disabled.
  if (!getEmailConfig().enabled || process.env.DRAFT_REMINDERS_ENABLED === "false") return { enabled: false, sent: 0 };
  const now = new Date();
  const cutoff = new Date(now.getTime() - 4 * 86400000);
  const logs = await prisma.emailLog.findMany({ where: { template: DRAFT_REMINDER_TEMPLATE }, select: { entityId: true, toEmail: true, createdAt: true } });
  const handledIds = logs.map(log => Number(log.entityId)).filter(Number.isSafeInteger);
  // At most one reminder per mailbox per rolling 24 hours; one automatic attempt per draft.
  const contacted = new Set(logs.filter(log => log.createdAt.getTime() > now.getTime() - 86400000).map(log => log.toEmail.toLowerCase()));
  const drafts = await prisma.release.findMany({
    where: { status: "DRAFT", createdAt: { lt: cutoff }, archivedAt: null, customerEditable: true, releaseSource: "CUSTOMER_SUBMISSION", id: { notIn: handledIds }, user: { status: "ACTIVE" }, statusTransitions: { none: { newStatus: "SUBMITTED" } } },
    include: { user: { select: { id: true, name: true, email: true, status: true } }, _count: { select: { tracks: true } } }, orderBy: { createdAt: "asc" }, take: 200
  });
  let sent = 0; let failed = 0;
  const deadline = Date.now() + 35000;
  for (const draft of drafts) {
    if (Date.now() >= deadline) break;
    if (contacted.has(draft.user.email.toLowerCase())) continue;
    await prisma.$transaction(async tx => {
    // Serialise all reminder jobs for this account, including overlapping cron requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19462026, ${draft.userId}::int)`;
    const recent = await tx.emailLog.findFirst({ where: { template: DRAFT_REMINDER_TEMPLATE, toEmail: { equals: draft.user.email, mode: "insensitive" }, createdAt: { gt: new Date(Date.now() - 86400000) } }, select: { id: true } });
    if (recent) return;
    const metadata = (draft.metadata ?? {}) as Record<string, unknown>;
    if (metadata.submittedAt || (draft.ownerUserId != null && draft.ownerUserId !== draft.userId)) return;
    const free = metadata.promotionCode === FIRST_RELEASE_PROMOTION_CODE && draft.releaseType === "single" && draft._count.tracks <= 1 && (await getFirstReleaseEligibility(draft.userId)).eligible;
    // Recheck immediately before sending: submitted/archived or disabled accounts must not be reminded.
    const current = await prisma.release.findFirst({ where: { id: draft.id, status: "DRAFT", archivedAt: null, user: { status: "ACTIVE" } }, select: { id: true } });
    if (!current) return;
    const url = `${getEmailConfig().appUrl}/distribution/start?edit=${draft.id}${free ? "&campaign=first-release" : ""}`;
    const content = draftReminderContent(draft.user.name, draft.title, url, free);
    const result = await sendTransactionalEmail({ ...content, timeoutMs: Math.max(1000, Math.min(8000, deadline - Date.now())), to: draft.user.email, userId: draft.userId, template: DRAFT_REMINDER_TEMPLATE, eventKey: `${DRAFT_REMINDER_TEMPLATE}:${draft.id}`, entityType: "release", entityId: draft.id });
    contacted.add(draft.user.email.toLowerCase());
    if (result.status === "sent") sent++;
    if (result.status === "failed") failed++;
    }, { timeout: 45000 });
    if (sent + failed >= 5) break;
  }
  return { enabled: true, sent, failed };
}
