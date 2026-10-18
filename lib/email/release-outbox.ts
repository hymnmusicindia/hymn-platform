import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailClient, getEmailConfig } from "./email-client";
import { releaseStatusEmail, type ReleaseEmailData } from "./templates/release-status-email";
import { getPublicAppUrl } from "@/lib/public-app-url";
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

export async function enqueueRenderedEmail(db: any, input: { eventKey: string; template: string; to: string; userId: number; releaseId: number; subject: string; html: string; text: string; expectedStatus: string; draftEditedAt?: string }) {
  const data = { toEmail: input.to, userId: input.userId, template: input.template, entityType: "release", entityId: String(input.releaseId), subject: input.subject, provider: "smtp", payload: { channel: "release_outbox", html: input.html, text: input.text, expectedStatus: input.expectedStatus, draftEditedAt: input.draftEditedAt ?? null } };
  const log = await db.emailLog.upsert({ where: { eventKey: input.eventKey }, create: { ...data, eventKey: input.eventKey, status: "pending" }, update: {} });
  // Skipped means SMTP was never attempted. Sent/uncertain outcomes are never reset.
  if (log.status === "skipped") await db.emailLog.updateMany({ where: { id: log.id, status: "skipped" }, data: { ...data, status: "pending", errorMessage: null } });
  return log.id as number;
}

export async function enqueueReleaseEmail(db: any, event: string, input: { to: string; userId: number; correctionEventKey?: string; statusEventKey?: string } & ReleaseEmailData) {
  return enqueueRenderedEmail(db, { ...releaseStatusEmail(event, input), to: input.to, userId: input.userId, releaseId: Number(input.releaseId), template: event, expectedStatus: input.releaseStatus.toUpperCase(), eventKey: `release:${input.releaseId}:${event}${input.correctionEventKey ? `:${input.correctionEventKey}` : input.statusEventKey ? `:${input.statusEventKey}` : ""}:email` });
}

/** Called inside the status transaction: SMTP is never part of that transaction. */
export async function queueReleaseStatusUpdate(db: any, releaseId: number, status: string, requestedReminderKey?: string) {
  const event = ({ changes_requested: "release_changes_requested", rejected: "release_rejected", approved: "release_approved_by_hymn", scheduled: "release_scheduled", live: "release_live" } as Record<string, string>)[status.toLowerCase()];
  if (!event) return undefined;
  const release = await db.release.findUnique({ where: { id: releaseId }, include: { user: { select: { id: true, email: true, name: true, status: true } } } });
  if (!release || release.archivedAt || release.user.status !== "ACTIVE") return undefined;
  const meta = object(release.metadata), provider = object(meta.direNote);
  const releaseTiming = String(meta.releaseTiming ?? "quick_release");
  const providerScheduleApproved = ["scheduled", "ready for distribution", "approved for distribution", "release date approved"].includes(String(release.direNoteStatus ?? "").toLowerCase().replaceAll("_", " "));
  if (event === "release_scheduled" && (releaseTiming !== "schedule_release" || !providerScheduleApproved)) return undefined;
  const correctionKey = provider.correctionEventKey ?? release.reviewedAt?.toISOString() ?? "status";
  const providerMessages = Array.isArray(provider.correctionMessages) ? provider.correctionMessages.filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  return enqueueReleaseEmail(db, event, { to: release.user.email, userId: release.userId, userName: release.user.name, releaseId, releaseTitle: release.title, artistName: release.artistName, releaseStatus: status, statusEventKey: `v${release.version}`, releaseDate: releaseTiming === "schedule_release" ? release.releaseDate.toISOString().slice(0, 10) : undefined, manageReleaseUrl: `${getPublicAppUrl()}/dashboard/releases/${releaseId}`, correctionUrl: `${getPublicAppUrl()}/dashboard/releases/${releaseId}?tab=corrections`, rejectionReason: status === "changes_requested" ? (release.correctionReason ?? providerMessages.join("\n")) || undefined : release.rejectionReason ?? undefined, correctionEventKey: status === "changes_requested" ? correctionKey + (requestedReminderKey ? `:${requestedReminderKey}` : "") : undefined, providerApproved: providerScheduleApproved });
}

export async function deliverReleaseOutbox(releaseIds?: number[], limit = 5, deliver?: (input: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string }) => Promise<{ data: { id?: string } | null; error: { message: string } | null }>, emailLogIds?: number[]) {
  if (!getEmailConfig().enabled && !deliver) return { enabled: false, sent: 0, failed: 0 };
  const interrupted = await prisma.emailLog.findMany({ where: { status: "sending", payload: { path: ["channel"], equals: "release_outbox" } }, select: { id: true, payload: true }, take: 100 });
  const staleIds = interrupted.filter(row => {
    const claimedAt = Date.parse(object(row.payload).claimedAt ?? "");
    return !Number.isFinite(claimedAt) || claimedAt < Date.now() - 10 * 60000;
  }).map(row => row.id);
  if (staleIds.length) await prisma.emailLog.updateMany({ where: { id: { in: staleIds }, status: "sending" }, data: { status: "review", errorMessage: "Interrupted SMTP delivery: confirm provider outcome before retrying." } });
  const jobs = await prisma.emailLog.findMany({ where: { status: "pending", payload: { path: ["channel"], equals: "release_outbox" }, ...(releaseIds ? { entityId: { in: releaseIds.map(String) } } : {}), ...(emailLogIds ? { id: { in: emailLogIds } } : {}) }, orderBy: { createdAt: "asc" }, take: 50 });
  let sent = 0, failed = 0, cancelled = 0, processed = 0;
  const deadline = Date.now() + 40000;
  for (const job of jobs) {
    if (processed >= limit || Date.now() >= deadline) break;
    const payload = object(job.payload);
    if (payload.nextAttemptAt && Date.parse(payload.nextAttemptAt) > Date.now()) continue;
    if (!(await prisma.emailLog.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "sending", payload: { ...payload, claimedAt: new Date().toISOString() } } })).count) continue;
    processed++;
    const release = await prisma.release.findUnique({ where: { id: Number(job.entityId) }, include: { user: { select: { email: true, status: true } } } });
    const currentProviderStatus = String(release?.direNoteStatus ?? "").toLowerCase().replaceAll("_", " ");
    const providerScheduleApproved = ["scheduled", "ready for distribution", "approved for distribution", "release date approved"].includes(currentProviderStatus);
    if (job.template === "release_scheduled" && (String(object(release?.metadata).releaseTiming ?? "quick_release") !== "schedule_release" || !providerScheduleApproved || !payload.providerApproved)) {
      await prisma.emailLog.update({ where: { id: job.id }, data: { status: "cancelled", errorMessage: "Scheduled-release notices are only sent for schedule_release after provider approval." } });
      cancelled++;
      continue;
    }
    if (!release || release.archivedAt || release.status !== payload.expectedStatus || release.user.status !== "ACTIVE" || release.user.email.toLowerCase() !== job.toEmail.toLowerCase() || payload.draftEditedAt && (release.lastEditedAt ?? release.createdAt).toISOString() !== payload.draftEditedAt) {
      await prisma.emailLog.update({ where: { id: job.id }, data: { status: "cancelled", errorMessage: "Release, owner or draft changed before delivery." } }); cancelled++; continue;
    }
    try {
      const config = getEmailConfig();
      const result = await (deliver ?? getEmailClient({ timeoutMs: 8000 })!.emails.send)({ from: config.from, to: job.toEmail, subject: job.subject, html: payload.html, text: payload.text, replyTo: config.replyTo });
      if (result.error) throw new Error(result.error.message);
      await prisma.emailLog.update({ where: { id: job.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: result.data?.id ?? null, errorMessage: null } });
      sent++;
    } catch (error) {
      const failure = error as { code?: string; command?: string };
      const safeRetry = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(failure.code ?? "") || failure.code === "ETIMEDOUT" && failure.command === "CONN";
      const retry = job.retryCount + 1;
      await prisma.emailLog.update({ where: { id: job.id }, data: { status: safeRetry && retry <= 5 ? "pending" : "review", retryCount: retry, errorMessage: safeRetry ? "SMTP connection unavailable; bounded retry scheduled." : "SMTP outcome needs review; no automatic resend.", payload: { ...payload, nextAttemptAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** retry) * 1000).toISOString() } } });
      failed++;
    }
  }
  return { enabled: true, sent, failed, cancelled, processed };
}
