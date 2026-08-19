import "server-only";
import { emailLayout, emailText } from "@/lib/email/email-templates";
export function splitEmail(input: { event: "split_invite_received" | "split_accepted" | "split_declined"; userName: string; ownerName?: string; recipientName?: string; releaseTitle: string; role?: string; sharePercent?: number; url: string }) {
  const invite = input.event === "split_invite_received";
  const accepted = input.event === "split_accepted";
  const subject = invite ? "You received a HYMN split invite" : accepted ? "Split invite accepted" : "Split invite declined";
  const body = invite ? `${input.ownerName} added you to a split for “${input.releaseTitle}”. Your role is ${input.role} and your share is ${input.sharePercent}%.` : `${input.recipientName} ${accepted ? "accepted" : "declined"} the split invite for “${input.releaseTitle}”.`;
  const model = { title: subject, greeting: `Hi ${input.userName || "there"},`, body, ctaLabel: invite ? "Review split" : "View split", ctaUrl: input.url };
  return { subject, html: emailLayout(model), text: emailText(model) };
}
// vercel trigger 6
