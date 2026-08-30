import "server-only";
import { Resend } from "resend";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const emailConfigured = process.env.EMAIL_PROVIDER?.toLowerCase() === "resend"
  && process.env.EMAIL_ENABLED === "true"
  && Boolean(process.env.RESEND_API_KEY?.trim());

let client: Resend | null = null;

export function getEmailClient() {
  if (!emailConfigured) return null;
  client ??= new Resend(process.env.RESEND_API_KEY!.trim());
  return client;
}

export function getEmailConfig() {
  return {
    enabled: emailConfigured,
    provider: "resend",
    from: process.env.EMAIL_FROM?.trim() || "HYMN Music <updates@hymnmusic.in>",
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || "hello@hymnmusic.fun",
    appUrl: getPublicAppUrl()
  };
}
// vercel trigger 6
