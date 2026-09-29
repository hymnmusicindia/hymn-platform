import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { getPublicAppUrl } from "@/lib/public-app-url";

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };

function mailbox(value?: string) {
  return (value?.match(/<([^>]+)>/)?.[1] || value || "").trim().toLowerCase();
}

export function getEmailClient() {
  const config = getEmailConfig();
  if (!config.enabled) return null;
  return { emails: { send: async (input: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string; attachments?: EmailAttachment[] }) => {
    if (config.provider === "smtp") {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        requireTLS: true,
        auth: { user: process.env.SMTP_USER?.trim(), pass: process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "") },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
        disableFileAccess: true, disableUrlAccess: true
      });
      const result = await transport.sendMail(input);
      if (!result.accepted.length) throw new Error("SMTP did not accept the recipient.");
      return { data: { id: result.messageId }, error: null };
    }
    return new Resend(process.env.RESEND_API_KEY!.trim()).emails.send({ ...input, attachments: input.attachments?.map(a => ({ filename: a.filename, content: a.content })) });
  } } };
}

export function getEmailConfig() {
  const provider = process.env.EMAIL_PROVIDER?.toLowerCase() || "resend";
  const smtpUser = process.env.SMTP_USER?.trim();
  const requestedFrom = process.env.EMAIL_FROM?.trim();
  const smtpFrom = requestedFrom && (mailbox(requestedFrom) === mailbox(smtpUser) || process.env.SMTP_ALLOW_FROM_ALIAS === "true")
    ? requestedFrom
    : smtpUser ? `HYMN Music <${smtpUser}>` : undefined;
  return {
    enabled: process.env.EMAIL_ENABLED === "true" && (provider === "smtp" ? Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_APP_PASSWORD?.trim()) : provider === "resend" && Boolean(process.env.RESEND_API_KEY?.trim())),
    provider,
    from: provider === "smtp" ? smtpFrom || "HYMN Music" : requestedFrom || "HYMN Music <updates@hymnmusic.in>",
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || (provider === "smtp" ? process.env.SMTP_USER?.trim() : "hello@hymnmusic.fun"),
    appUrl: getPublicAppUrl()
  };
}
// vercel trigger 6
