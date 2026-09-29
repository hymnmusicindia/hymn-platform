import "server-only";
import { getPublicAppUrl } from "@/lib/public-app-url";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

export type EmailSection = { title: string; body: string; linkLabel?: string; linkUrl?: string };
export type EmailLayoutInput = { title: string; greeting?: string; body: string; ctaLabel: string; ctaUrl: string; notice?: string; timelineStep?: number; sections?: EmailSection[] };

export function emailLayout(input: EmailLayoutInput) {
  const timeline = input.timelineStep == null ? "" : `<table role="presentation" width="100%" cellspacing="4" style="margin:20px 0"><tr>${[0,1,2,3,4].map((step) => `<td height="4" style="background:${step <= input.timelineStep! ? "#202020" : "#e9e6e1"};border-radius:3px"></td>`).join("")}</tr></table>`;
  const url = escapeHtml(input.ctaUrl);
  const logoUrl = escapeHtml(`${getPublicAppUrl()}/assets/hymnlogowhite.png`);
  const sections = (input.sections || []).map((section) => `<tr><td style="padding:0 30px 24px"><h2 style="font-size:16px;line-height:1.35;margin:0 0 6px;color:#202020">${escapeHtml(section.title)}</h2><p style="font-size:13px;line-height:1.65;color:#66615b;margin:0">${escapeHtml(section.body)}${section.linkLabel && section.linkUrl ? `<br><a href="${escapeHtml(section.linkUrl)}" style="display:inline-block;margin-top:5px;color:#16766f;font-weight:bold;text-decoration:none">${escapeHtml(section.linkLabel)} &rsaquo;</a>` : ""}</p></td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#f5f4f1;color:#202020;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(input.body)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e4df;overflow:hidden">
<tr><td align="center" style="background:#151515;padding:24px 30px"><img src="${logoUrl}" width="112" alt="HYMN Music" style="display:block;width:112px;max-width:100%;height:auto;border:0"><div style="margin-top:8px;font-size:8px;letter-spacing:2.8px;color:#bdbdbd">YOUR MUSIC. MOVING FORWARD.</div></td></tr>
<tr><td style="padding:34px 30px 18px"><h1 style="font-size:25px;line-height:1.25;letter-spacing:-.5px;margin:0 0 22px">${escapeHtml(input.title)}</h1>${input.greeting ? `<p style="font-size:14px;line-height:1.7;margin:0 0 16px">${escapeHtml(input.greeting)}</p>` : ""}${timeline}<p style="font-size:14px;line-height:1.7;color:#5e5a55;margin:0;white-space:pre-line">${escapeHtml(input.body)}</p>${input.notice ? `<table role="presentation" width="100%" cellspacing="0" style="margin-top:18px"><tr><td style="padding:14px;background:#f7f5f2;border-left:2px solid #202020;font-size:12px;line-height:1.6;white-space:pre-line">${escapeHtml(input.notice)}</td></tr></table>` : ""}<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:22px"><tr><td bgcolor="#202020"><a href="${url}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:12px;font-weight:bold">${escapeHtml(input.ctaLabel)} &rarr;</a></td></tr></table></td></tr>
${sections}
<tr><td style="border-top:1px solid #ece9e4;padding:20px 30px;text-align:center;font-size:10px;line-height:1.7;color:#88837d">This transactional message relates to your HYMN account, purchase or release.<br>Need help? Reply to this email.<br><a href="${url}" style="color:#777;word-break:break-all">Open in HYMN</a></td></tr></table></td></tr></table></body></html>`;
}

export function emailText(input: EmailLayoutInput) {
  return [input.title, input.greeting, input.body, input.notice, ...(input.sections || []).map((section) => `${section.title}\n${section.body}${section.linkLabel && section.linkUrl ? `\n${section.linkLabel}: ${section.linkUrl}` : ""}`), `${input.ctaLabel}: ${input.ctaUrl}`, "This transactional message relates to your HYMN account, purchase or release. Reply if you need help."].filter(Boolean).join("\n\n");
}
// vercel trigger 6
