import "server-only";
import { emailLayout, emailText, type EmailSection } from "@/lib/email/email-templates";
export function beatEmail(input: { event: "beat_purchase_success" | "license_ready"; userName: string; beatTitle: string; url: string; studioSections?: EmailSection[]; purchaseId?:number }) {
  const ready = input.event === "license_ready";
  const subject = ready ? "Your beat license is ready" : "Your beat purchase is confirmed";
  const body = ready ? `Your license for “${input.beatTitle}” is ready to download.` : `Your purchase of “${input.beatTitle}” has been confirmed. Your license will be available in your dashboard.`;
  const model = { sections: [...(input.studioSections || []), ...(input.purchaseId ? [{title:"Beat files",body:`Download licensed files for purchase #${input.purchaseId}. Sign in with the email used for your purchase.`,linkLabel:"Download beat",linkUrl:new URL(`/api/beat-purchases/${input.purchaseId}/download`,input.url).toString()},{title:"Your licence",body:"View the agreement and download your PDF.",linkLabel:"Licence and PDF",linkUrl:new URL(`/licenses/${input.purchaseId}`,input.url).toString()}] : [])], title: subject, greeting: `Hi ${input.userName || "there"},`, body, notice: "Available licensed files are attached when they fit the email size limit. For larger files and all available downloads, sign in to your HYMN dashboard and open Purchases.", ctaLabel: "View purchase", ctaUrl: input.purchaseId ? new URL(`/dashboard/purchases/${input.purchaseId}`,input.url).toString() : input.url };
  return { subject, html: emailLayout(model), text: emailText(model) };
}
// vercel trigger 6
