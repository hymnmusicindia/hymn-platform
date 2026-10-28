import "server-only";
import { customerBrandText } from "@/lib/customer-message";
import { getPublicAppUrl } from "@/lib/public-app-url";
import type { ManualEmailBlock } from "@/lib/manual-email";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

export type EmailSection = { title: string; body: string; linkLabel?: string; linkUrl?: string };
export type EmailLayoutInput = { title: string; greeting?: string; body: string; ctaLabel: string; ctaUrl: string; notice?: string; timelineStep?: number; sections?: EmailSection[]; blocks?: ManualEmailBlock[]; preserveNames?: string[]; audience?: 'team' | 'customer' };

function emailButton(label: string, url: string) {
  if (!label || !/^https?:\/\//i.test(url)) return "";
  const whatsapp = url.startsWith("https://wa.me/");
  const color = whatsapp ? "#147d46" : "#202020";
  const icon = whatsapp ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-label="WhatsApp" style="vertical-align:middle;margin-right:6px"><path fill="none" stroke="#fff" stroke-width="1.7" d="M20.5 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.2-4.6A8.5 8.5 0 1 1 20.5 11.5Z"/><path fill="#fff" d="M8.3 6.8c-.5 0-1.3.8-1.3 1.8 0 2.8 3.6 6.4 6.4 6.4 1 0 1.8-.8 1.8-1.3l-2-1.2-.9.9c-1.1-.4-2.5-1.8-2.9-2.9l.9-.9-1.2-2Z"/></svg>' : "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 0"><tr><td bgcolor="${color}" style="border-radius:12px"><a href="${escapeHtml(url)}" style="display:inline-block;border:14px solid ${color};border-radius:12px;padding:0 9px;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:bold;mso-padding-alt:0">${icon}${escapeHtml(label)} &rarr;</a></td></tr></table>`;
}

function emailBlocks(blocks: ManualEmailBlock[]) {
  return blocks.map(block => block.type === "button" ? emailButton(block.label, block.url)
    : block.type === "notice" ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px"><tr><td style="padding:14px;background:#f7f5f2;border-left:2px solid #202020;font-size:12px;line-height:1.6">${escapeHtml(block.text).replace(/\r?\n/g, "<br>")}</td></tr></table>`
    : `<p style="font-size:14px;line-height:1.7;color:#5e5a55;margin:16px 0 0">${escapeHtml(block.text).replace(/\r?\n/g, "<br>")}</p>`).join("");
}

export function emailLayout(input: EmailLayoutInput) {
  const timeline = input.timelineStep == null ? "" : `<table role="presentation" width="100%" cellspacing="4" style="margin:20px 0"><tr>${[0,1,2,3,4].map((step) => `<td height="4" style="background:${step <= input.timelineStep! ? "#202020" : "#e9e6e1"};border-radius:3px"></td>`).join("")}</tr></table>`;
  const url = escapeHtml(input.ctaUrl);
  const logoUrl = escapeHtml(`${getPublicAppUrl()}/assets/hymnlogowhite.png`);
  const blocks = emailBlocks(input.blocks ?? []);
  const firstParagraph = input.blocks?.find(block => block.type === "paragraph");
  const preheader = input.body || (firstParagraph?.type === "paragraph" ? firstParagraph.text : input.title);
  const body = input.body ? `<p style="font-size:14px;line-height:1.7;color:#5e5a55;margin:0">${escapeHtml(input.body).replace(/\r?\n/g, "<br>")}</p>` : "";
  const notice = input.notice ? emailBlocks([{ type: "notice", text: input.notice }]) : "";
  const sections = (input.sections || []).map((section) => `<tr><td style="padding:0 30px 24px"><h2 style="font-size:16px;line-height:1.35;margin:0 0 6px;color:#202020">${escapeHtml(section.title)}</h2><p style="font-size:13px;line-height:1.65;color:#66615b;margin:0">${input.audience === 'team' ? escapeHtml(section.body).replace(/\r?\n/g, '<br>') : escapeHtml(section.body)}${section.linkLabel && section.linkUrl ? `<br><a href="${escapeHtml(section.linkUrl)}" style="display:inline-block;margin-top:5px;color:#16766f;font-weight:bold;text-decoration:none">${escapeHtml(section.linkLabel)} &rsaquo;</a>` : ""}</p></td></tr>`).join("");
  return customerBrandText(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#f5f4f1;color:#202020;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e4df;border-radius:20px;overflow:hidden;box-shadow:0 16px 48px rgba(20,20,20,.08)">
<tr><td align="center" style="background:#151515;padding:24px 30px"><img src="${logoUrl}" width="112" alt="HYMN Music" style="display:block;width:112px;max-width:100%;height:auto;border:0"><div style="margin-top:8px;font-size:8px;letter-spacing:2.8px;color:#bdbdbd">${input.audience === 'team' ? 'HYMN TEAM WORKSPACE' : 'YOUR MUSIC. MOVING FORWARD.'}</div></td></tr>
<tr><td style="padding:34px 30px 24px"><h1 style="font-size:25px;line-height:1.25;letter-spacing:-.5px;margin:0 0 22px">${escapeHtml(input.title)}</h1>${input.greeting ? `<p style="font-size:14px;line-height:1.7;margin:0 0 16px">${escapeHtml(input.greeting)}</p>` : ""}${timeline}${body}${notice}${emailButton(input.ctaLabel, input.ctaUrl)}${blocks}</td></tr>
${sections}
${input.audience === 'team' ? '' : `<tr><td style="padding:24px 30px;background:#f3f7f4;border-top:1px solid #e1e9e3"><p style="margin:0;color:#202020;font-size:17px;font-weight:bold">Let's move your music forward.</p><p style="margin:8px 0 0;color:#545e57;font-size:13px;line-height:21px">Talk to the HYMN team about your next step.</p>${emailButton("Chat with HYMN on WhatsApp", "https://wa.me/918793643228")}<p style="margin:12px 0 0;color:#545e57;font-size:12px">WhatsApp &middot; +91 8793643228</p></td></tr>`}
<tr><td style="border-top:1px solid #ece9e4;padding:20px 30px;text-align:center;font-size:10px;line-height:1.7;color:#88837d">${input.audience === 'team' ? 'Your HYMN team work plan. Review the workspace for live changes.' : 'This transactional message relates to your HYMN account, purchase or release.'}<br>Need help? Reply to this email.<br><a href="${url}" style="color:#777;word-break:break-all">Open in HYMN</a></td></tr></table></td></tr></table></body></html>`, input.preserveNames);
}

export function emailText(input: EmailLayoutInput) {
  if (input.audience !== 'team') input = { ...input, sections: [...(input.sections ?? []), { title: "Contact HYMN on WhatsApp", body: "+91 8793643228", linkLabel: "Chat with us", linkUrl: "https://wa.me/918793643228" }] };
  return customerBrandText([input.title, input.greeting, input.body, input.notice, ...(input.blocks ?? []).map(block => block.type === "button" ? `${block.label}: ${block.url}` : block.text), ...(input.sections || []).map((section) => `${section.title}\n${section.body}${section.linkLabel && section.linkUrl ? `\n${section.linkLabel}: ${section.linkUrl}` : ""}`), input.ctaLabel && input.ctaUrl ? `${input.ctaLabel}: ${input.ctaUrl}` : "", input.audience === 'team' ? 'Your HYMN team work plan. Reply if you need help.' : "This transactional message relates to your HYMN account, purchase or release. Reply if you need help."].filter(Boolean).join("\n\n"), input.preserveNames);
}
// vercel trigger 6
