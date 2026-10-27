import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";
import { purchaseAttachments } from "@/lib/email/purchase-attachments";

const recipientSchema = z.string().trim().email().max(320);
export type EmailDeliveryStatus = "sent" | "failed" | "skipped" | "duplicate_skipped";
export type TransactionalEmailInput = { to: string; subject: string; template: string; html: string; text: string; eventKey: string; userId?: number; entityType?: string; entityId?: string | number; forceRetry?: boolean; senderName?: string; timeoutMs?: number };

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<{ status: EmailDeliveryStatus; logId?: number; providerMessageId?: string; error?: string }> {
  const config = getEmailConfig();
  const eventKey = input.eventKey.trim();
  const email = recipientSchema.safeParse(input.to);
  const recipient = email.success ? email.data : null;
  const emailLog = (prisma as any).emailLog;
  try {
    const duplicate = await emailLog.findUnique({ where: { eventKey } });
    if (duplicate && !input.forceRetry) return { status: "duplicate_skipped", logId: duplicate.id };
    const status = !config.enabled || !email.success ? "skipped" : "queued";
    const log = await emailLog.create({ data: { userId: input.userId ?? null, toEmail: recipient ?? String(input.to || "invalid"), subject: input.subject, template: input.template, eventKey, entityType: input.entityType ?? null, entityId: input.entityId == null ? null : String(input.entityId), provider: config.provider, status, errorMessage: !recipient ? "Invalid recipient email." : !config.enabled ? "Transactional email is disabled or not configured." : null, payload: { html: input.html, text: input.text } } });
    if (status === "skipped") return { status: "skipped", logId: log.id };
    const client = getEmailClient({ timeoutMs: input.timeoutMs });
    if (!client || !recipient) return { status: "skipped", logId: log.id };
    try {
      const attachments = input.entityType === "beat_purchase" && input.userId && input.entityId
        ? await purchaseAttachments(Number(input.entityId), input.userId, recipient).catch(() => []) : [];
      const verifiedAddress = config.from.match(/<([^>]+)>/)?.[1] || config.from;
      const displayName = input.senderName?.replace(/[\r\n"<>]/g, "").trim().slice(0, 160);
      const from = displayName && recipientSchema.safeParse(verifiedAddress).success ? `"${displayName}" <${verifiedAddress}>` : config.from;
      const result = await client.emails.send({ from, to: recipient, subject: input.subject, html: input.html, text: input.text, attachments, ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
      if (result.error) throw new Error(result.error.message);
      await emailLog.update({ where: { id: log.id }, data: { status: "sent", providerMessageId: result.data?.id ?? null, sentAt: new Date() } });
      return { status: "sent", logId: log.id, providerMessageId: result.data?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email provider request failed.";
      await emailLog.update({ where: { id: log.id }, data: { status: "failed", errorMessage: message } }).catch(() => undefined);
      return { status: "failed", logId: log.id, error: message };
    }
  } catch (error) {
    // Logging or provider failures must never break the business event.
    return { status: "failed", error: error instanceof Error ? error.message : "Email logging failed." };
  }
}

export async function retryTransactionalEmail(logId: number) {
  const emailLog = (prisma as any).emailLog;
  const original = await emailLog.findUnique({ where: { id: logId } });
  if (!original) throw new Error("Email log not found.");
  if (original.status !== "failed") throw new Error("Only failed emails can be retried.");
  if (original.template === "team_performance_report") throw new Error("Performance reports are weekly only. Review delivery in the performance outbox; generic retries cannot resend daily reports or bypass membership checks.");
  if (original.template === "team_outreach") throw new Error("Review team outreach inside Team OS; generic retries cannot bypass recipient eligibility checks.");
  if (original.template === "team_call_briefing") throw new Error("Review team briefings in their outbox; generic retries cannot preserve the PDF and membership checks.");
  if (original.template === "support_reply") throw new Error("Review delivery and retry from the support ticket mailbox.");
  if (original.template === "team_appointment") {
    const { assertAppointmentRetryAllowed } = await import("@/lib/team/appointments");
    await assertAppointmentRetryAllowed(String(original.entityId), original.toEmail);
  }
  if (original.template === "team_client_welcome") {
    const { assertClientWelcomeRetryAllowed } = await import("@/lib/team/client-welcome");
    await assertClientWelcomeRetryAllowed(original.toEmail);
  }
  const payload = original.payload && typeof original.payload === "object" ? original.payload as { html?: string; text?: string } : {};
  if (!payload.html || !payload.text) throw new Error("This email attempt does not contain retryable content.");
  if (original.template === "team_appointment" && !(await prisma.teamAppointmentMessage.updateMany({ where: { id: String(original.entityId), status: "REVIEW" }, data: { status: "SENDING" } })).count) throw new Error("Appointment email is already being retried or was delivered.");
  const retryNumber = Number(original.retryCount || 0) + 1;
  await emailLog.update({ where: { id: original.id }, data: { retryCount: retryNumber } });
  const result = await sendTransactionalEmail({ to: original.toEmail, subject: original.subject, template: original.template, html: payload.html, text: payload.text, eventKey: `${original.eventKey}:retry:${retryNumber}`, userId: original.userId ?? undefined, entityType: original.entityType ?? undefined, entityId: original.entityId ?? undefined });
  if (original.template === "team_client_welcome") await prisma.teamClientWelcome.updateMany({ where: { email: original.toEmail.toLowerCase() }, data: { status: result.status === "sent" ? "SENT" : "REVIEW", error: result.error || null } });
  if (original.template === "team_appointment") await prisma.teamAppointmentMessage.updateMany({ where: { id: String(original.entityId) }, data: { status: result.status === "sent" ? "SENT" : "REVIEW", error: result.error || null } });
  return result;
}
// vercel trigger 6
