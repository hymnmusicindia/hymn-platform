import "server-only";
import { emailLayout, emailText } from "@/lib/email/email-templates";
export function payoutEmail(input: { event: "payout_earnings_updated" | "payout_request_submitted" | "payout_completed" | "payout_rejected"; userName: string; month?: string; year?: number; requestedAmount?: number; serviceFee?: number; netAmount?: number; url: string }) {
  const copy = input.event === "payout_earnings_updated" ? ["Your HYMN earnings have been updated", `Your earnings for ${input.month || "the latest period"} ${input.year || ""} have been updated.`] : input.event === "payout_request_submitted" ? ["Your payout request was submitted", `Your payout request for ₹${input.requestedAmount || 0} has been submitted. HYMN payout service fee: ₹${input.serviceFee || 0}. Net payable: ₹${input.netAmount || 0}.`] : input.event === "payout_completed" ? ["Your payout has been completed", `Your payout of ₹${input.netAmount || 0} has been marked completed.`] : ["Your payout request was rejected", "Your payout request could not be completed. Open your payout dashboard for the review details."];
  const model = { title: copy[0], greeting: `Hi ${input.userName || "there"},`, body: copy[1], ctaLabel: "View payout status", ctaUrl: input.url };
  return { subject: copy[0], html: emailLayout(model), text: emailText(model) };
}
// vercel trigger 6
