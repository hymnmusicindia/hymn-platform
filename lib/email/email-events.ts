import "server-only";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import type { ReleaseEmailData } from "@/lib/email/templates/release-status-email";
import { splitEmail } from "@/lib/email/templates/split-email";
import { payoutEmail } from "@/lib/email/templates/payout-email";
import { beatEmail } from "@/lib/email/templates/beat-email";
import { prisma } from "@/lib/prisma";
import { enqueueReleaseEmail } from "./release-outbox";

export const EMAIL_EVENTS = ["release_submitted","release_under_review","release_approved_by_hymn","release_changes_requested","release_rejected","release_sent_to_distributor","release_scheduled","release_live","release_distribution_failed","split_invite_received","split_accepted","split_declined","payout_earnings_updated","payout_request_submitted","payout_completed","payout_rejected","beat_purchase_success","license_ready"] as const;
export type EmailEvent = typeof EMAIL_EVENTS[number];

export async function sendReleaseEmail(event: EmailEvent, input: { to: string; userId: number; correctionEventKey?: string } & ReleaseEmailData) {
  const current = await prisma.release.findUnique({ where: { id: Number(input.releaseId) }, select: { version: true } });
  const logId = await enqueueReleaseEmail(prisma, event, { ...input, statusEventKey: current ? `v${current.version}` : undefined });
  return { status: "queued" as const, logId };
}

export async function sendSplitEmailEvent(input: Parameters<typeof splitEmail>[0] & { to: string; userId?: number; splitId: number; inviteId?: number; recipientEmail?: string }) {
  const template = splitEmail(input);
  return sendTransactionalEmail({ ...template, to: input.to, template: input.event, eventKey: `split:${input.splitId}:${input.inviteId ?? "legacy"}:${input.event}:${input.recipientEmail || input.to}:email`, userId: input.userId, entityType: "split", entityId: input.splitId });
}

export async function sendPayoutEmailEvent(input: Parameters<typeof payoutEmail>[0] & { to: string; userId: number; payoutId: string | number }) {
  const template = payoutEmail(input);
  return sendTransactionalEmail({ ...template, to: input.to, template: input.event, eventKey: `payout:${input.payoutId}:${input.event}:email`, userId: input.userId, entityType: "payout", entityId: input.payoutId });
}

export async function sendBeatEmailEvent(input: Parameters<typeof beatEmail>[0] & { to: string; userId: number; purchaseId: number }) {
  const { studioBeatSections } = await import("@/lib/studio-beat-followups");
  const sections = input.event === "beat_purchase_success" ? await studioBeatSections(input.purchaseId, input.userId).catch(() => []) : [];
  const template = beatEmail({ ...input, studioSections: sections });
  return sendTransactionalEmail({ ...template, to: input.to, template: input.event, eventKey: `beat:${input.purchaseId}:${input.event}:email`, userId: input.userId, entityType: "beat_purchase", entityId: input.purchaseId });
}

export function emailAppUrl(path: string) { return `${getEmailConfig().appUrl}${path.startsWith("/") ? path : `/${path}`}`; }
// vercel trigger 6
