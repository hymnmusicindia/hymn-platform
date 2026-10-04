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

export function newsletterEmail(input: { subject?: string; message: string; unsubscribeToken: string; imageUrl?: string | null; imageAlt?: string | null; ctaLabel?: string | null; ctaUrl?: string | null }) {
  const unsubscribeUrl = `${getPublicAppUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const logoUrl = `${getPublicAppUrl()}/assets/hymnlogowhite.png`;
  const lines = input.message.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const body = lines.map(line => {
    const bullet = line.match(/^[•*-]\s*(.+)$/);
    if (bullet) return `<tr><td style="padding:0 0 10px"><table role="presentation" width="100%"><tr><td width="28" valign="top"><span style="display:inline-block;width:18px;height:18px;border-radius:99px;background:#7757ff;color:#fff;text-align:center;font:700 12px/18px Arial,sans-serif">✓</span></td><td style="color:#dedde4;font:15px/22px Arial,sans-serif">${escapeHtml(bullet[1])}</td></tr></table></td></tr>`;
    return `<tr><td style="padding:0 0 16px;color:#c9c8d0;font:15px/24px Arial,sans-serif">${escapeHtml(line)}</td></tr>`;
  }).join("");
  const campaignImage = input.imageUrl ? `<img src="${escapeHtml(input.imageUrl)}" alt="${escapeHtml(input.imageAlt || "HYMN Music newsletter feature")}" width="552" style="display:block;width:100%;max-width:552px;height:auto;margin:24px 0 0;border:0;border-radius:14px;object-fit:cover">` : "";
  const cta = input.ctaLabel && input.ctaUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:10px 0 4px"><tr><td bgcolor="#f4f1ff" style="border-radius:10px"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:15px 22px;color:#15131c;text-decoration:none;font:700 15px Arial,sans-serif">${escapeHtml(input.ctaLabel)} &nbsp;→</a></td></tr></table>` : "";
  const subject = escapeHtml(input.subject || "An update from HYMN Music");
  return {
    html: `<!doctype html><html><body style="margin:0;background:#0b0b0e"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0b0b0e"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #292832;border-radius:18px;overflow:hidden;background:#18181d"><tr><td style="padding:24px 28px;border-bottom:1px solid #2b2a34;background:linear-gradient(135deg,#211d32,#17171c)"><img src="${logoUrl}" alt="HYMN Music" width="132" style="display:block;width:132px;height:auto;border:0"><p style="margin:16px 0 0;color:#9e8cff;font:700 11px/16px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">HYMN launch offer</p></td></tr><tr><td style="padding:34px 28px 12px"><h1 style="margin:0;color:#f7f6fa;font:700 34px/40px Arial,sans-serif;letter-spacing:-1px">${subject}</h1>${campaignImage}</td></tr><tr><td style="padding:18px 28px 30px"><table role="presentation" width="100%">${body}</table>${cta}</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #2b2a34;color:#85838e;font:12px/19px Arial,sans-serif">You received this because you joined HYMN Music updates.<br><a href="${unsubscribeUrl}" style="color:#c8c3dd">Unsubscribe</a> at any time.</td></tr></table></td></tr></table></body></html>`,
    text: `${input.subject ? `${input.subject}\n\n` : ""}${input.message}${input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${input.ctaUrl}` : ""}\n\nYou received this because you joined HYMN Music updates. Unsubscribe: ${unsubscribeUrl}`
  };
}
