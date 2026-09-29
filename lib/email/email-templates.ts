import "server-only";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

export function emailLayout(input: { title: string; greeting?: string; body: string; ctaLabel: string; ctaUrl: string; notice?: string; timelineStep?: number }) {
  const timeline = input.timelineStep == null ? "" : `<table role="presentation" width="100%" cellspacing="4" style="margin:20px 0"><tr>${[0,1,2,3,4].map((step) => `<td height="4" style="background:${step <= input.timelineStep! ? "#202020" : "#e9e6e1"};border-radius:3px"></td>`).join("")}</tr></table>`;
  const url = escapeHtml(input.ctaUrl);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#f3f1ed;color:#202020;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(input.body)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdfa;border:1px solid #e3dfd8;border-radius:18px;overflow:hidden">
<tr><td style="background:#151515;color:#ffffff;padding:26px 30px;font-size:28px;font-weight:900;letter-spacing:2px">HYMN<span style="display:block;margin-top:8px;font-size:10px;font-weight:400;letter-spacing:3px;color:#bdbdbd">YOUR MUSIC. MOVING FORWARD.</span></td></tr>
<tr><td style="padding:32px 30px"><h1 style="font-size:28px;line-height:1.2;letter-spacing:-1px;margin:0 0 22px">${escapeHtml(input.title)}</h1>${input.greeting ? `<p style="font-size:15px;line-height:1.7">${escapeHtml(input.greeting)}</p>` : ""}${timeline}<p style="font-size:16px;line-height:1.7;color:#54514d;white-space:pre-line">${escapeHtml(input.body)}</p>${input.notice ? `<table role="presentation" width="100%"><tr><td style="padding:16px;background:#f3f1ed;border-left:3px solid #202020;font-size:13px;line-height:1.6;white-space:pre-line">${escapeHtml(input.notice)}</td></tr></table>` : ""}<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px"><tr><td bgcolor="#202020" style="border-radius:8px"><a href="${url}" style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">${escapeHtml(input.ctaLabel)} &rarr;</a></td></tr></table><p style="margin-top:24px;font-size:11px;line-height:1.6;color:#777">Button not opening? Copy this link:<br><a href="${url}" style="color:#555;word-break:break-all">${url}</a></p></td></tr>
<tr><td style="border-top:1px solid #e9e6e1;padding:22px 30px;font-size:12px;line-height:1.7;color:#777">Sent for your HYMN account, purchase or project.<br>Need a hand? Reply to this email.</td></tr></table></td></tr></table></body></html>`;
}

export function emailText(input: { title: string; greeting?: string; body: string; ctaLabel: string; ctaUrl: string; notice?: string }) {
  return [input.title, input.greeting, input.body, input.notice, `${input.ctaLabel}: ${input.ctaUrl}`, "Sent for your HYMN account, purchase or project. Reply if you need help."].filter(Boolean).join("\n\n");
}
// vercel trigger 6
