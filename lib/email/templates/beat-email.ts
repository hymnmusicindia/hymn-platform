import "server-only";
import { emailLayout, emailText } from "@/lib/email/email-templates";
export function beatEmail(input: { event: "beat_purchase_success" | "license_ready"; userName: string; beatTitle: string; url: string }) {
  const ready = input.event === "license_ready";
  const subject = ready ? "Your beat license is ready" : "Your beat purchase is confirmed";
  const body = ready ? `Your license for “${input.beatTitle}” is ready to download.` : `Your purchase of “${input.beatTitle}” has been confirmed. Your license will be available in your dashboard.`;
  const model = { title: subject, greeting: `Hi ${input.userName || "there"},`, body, ctaLabel: ready ? "Download license" : "View purchase", ctaUrl: input.url };
  return { subject, html: emailLayout(model), text: emailText(model) };
}
// vercel trigger 6
