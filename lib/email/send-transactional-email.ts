import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";

const recipientSchema = z.string().trim().email().max(320);
export type EmailDeliveryStatus = "sent" | "failed" | "skipped" | "duplicate_skipped";
export type TransactionalEmailInput = { to: string; subject: string; template: string; html: string; text: string; eventKey: string; userId?: number; entityType?: string; entityId?: string | number; forceRetry?: boolean };

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
    const client = getEmailClient();
    if (!client || !recipient) return { status: "skipped", logId: log.id };
    try {
      const result = await client.emails.send({ from: config.from, to: recipient, subject: input.subject, html: input.html, text: input.text, ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
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
  const payload = original.payload && typeof original.payload === "object" ? original.payload as { html?: string; text?: string } : {};
  if (!payload.html || !payload.text) throw new Error("This email attempt does not contain retryable content.");
  const retryNumber = Number(original.retryCount || 0) + 1;
  await emailLog.update({ where: { id: original.id }, data: { retryCount: retryNumber } });
  return sendTransactionalEmail({ to: original.toEmail, subject: original.subject, template: original.template, html: payload.html, text: payload.text, eventKey: `${original.eventKey}:retry:${retryNumber}`, userId: original.userId ?? undefined, entityType: original.entityType ?? undefined, entityId: original.entityId ?? undefined });
}
// vercel trigger 6
