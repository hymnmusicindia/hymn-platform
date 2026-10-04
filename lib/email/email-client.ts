import "server-only";
import nodemailer from "nodemailer";
import { getPublicAppUrl } from "@/lib/public-app-url";

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };
type EmailSendInput = { from: string; to: string; subject: string; html: string; text: string; replyTo?: string; attachments?: EmailAttachment[] };
type EmailSendResult = { data: { id?: string } | null; error: { message: string } | null };

function mailbox(value?: string) {
  return (value?.match(/<([^>]+)>/)?.[1] || value || "").trim().toLowerCase();
}

export function getEmailClient(): { emails: { send(input: EmailSendInput): Promise<EmailSendResult> } } | null {
  const config = getEmailConfig();
  if (!config.enabled) return null;
  return { emails: { send: async (input: EmailSendInput): Promise<EmailSendResult> => {
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com", port, secure: port === 465, requireTLS: true, auth: { user: process.env.SMTP_USER?.trim(), pass: process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "") }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true });
    const result = await transport.sendMail(input);
    if (!result.accepted.length) throw new Error("SMTP did not accept the recipient.");
    return { data: { id: result.messageId }, error: null };
  } } };
}

export function getEmailConfig() {
  const smtpUser = process.env.SMTP_USER?.trim();
  const requestedFrom = process.env.EMAIL_FROM?.trim();
  const smtpFrom = requestedFrom && (mailbox(requestedFrom) === mailbox(smtpUser) || process.env.SMTP_ALLOW_FROM_ALIAS === "true")
    ? requestedFrom
    : smtpUser ? `HYMN Music <${smtpUser}>` : undefined;
  return {
    enabled: process.env.EMAIL_ENABLED === "true" && Boolean(smtpUser && process.env.SMTP_APP_PASSWORD?.trim()),
    provider: "smtp",
    from: smtpFrom || "HYMN Music",
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || smtpUser,
    appUrl: getPublicAppUrl()
  };
}
// vercel trigger 6
