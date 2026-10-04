import crypto from "node:crypto";
import { getPublicAppUrl } from "@/lib/public-app-url";

export function normalizeNewsletterEmail(value: string) {
  return value.trim().toLowerCase();
}

export function newsletterToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export function newsletterEmail(input: { message: string; unsubscribeToken: string; imageUrl?: string | null; imageAlt?: string | null }) {
  const unsubscribeUrl = `${getPublicAppUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const logoUrl = `${getPublicAppUrl()}/assets/hymnlogowhite.png`;
  const body = escapeHtml(input.message).split(/\r?\n/).filter(Boolean).map(paragraph => `<p style="margin:0 0 16px">${paragraph}</p>`).join("");
  const campaignImage = input.imageUrl ? `<img src="${escapeHtml(input.imageUrl)}" alt="${escapeHtml(input.imageAlt || "HYMN Music newsletter feature")}" width="552" style="display:block;width:100%;max-width:552px;height:auto;margin:24px 0 0;border:0;border-radius:14px;object-fit:cover">` : "";
  return {
    html: `<main style="max-width:600px;margin:0 auto;padding:32px 24px;background:#101114;color:#f7f7f7;font-family:Arial,sans-serif;line-height:1.6"><img src="${logoUrl}" alt="HYMN Music" width="132" style="display:block;width:132px;height:auto;border:0">${campaignImage}<div style="margin-top:28px;font-size:16px">${body}</div><hr style="margin:32px 0;border:0;border-top:1px solid #303136"><p style="font-size:12px;color:#a8a8ad">You received this because you subscribed to HYMN Music updates. <a href="${unsubscribeUrl}" style="color:#f7f7f7">Unsubscribe</a> at any time.</p></main>`,
    text: `${input.message}\n\nYou received this because you subscribed to HYMN Music updates. Unsubscribe: ${unsubscribeUrl}`
  };
}
