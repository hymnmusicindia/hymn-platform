import "server-only";
import { EMAIL_GLOBAL_CSS } from "@/lib/email/email-global-css";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

export function emailLayout(input: { title: string; greeting?: string; body: string; ctaLabel: string; ctaUrl: string; notice?: string; timelineStep?: number }) {
  const timeline = input.timelineStep == null ? "" : `<div class="timeline" aria-label="Release progress">${[0,1,2,3,4].map((step) => `<span class="${step <= input.timelineStep! ? "active" : ""}"></span>`).join("")}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${EMAIL_GLOBAL_CSS}</style></head><body><div class="wrap"><div class="card"><div class="header">HYMN</div><main class="content"><h1>${escapeHtml(input.title)}</h1>${input.greeting ? `<p>${escapeHtml(input.greeting)}</p>` : ""}${timeline}<p>${escapeHtml(input.body)}</p>${input.notice ? `<div class="notice">${escapeHtml(input.notice)}</div>` : ""}<a class="button" href="${escapeHtml(input.ctaUrl)}">${escapeHtml(input.ctaLabel)}</a></main><footer class="footer">This is a transactional email related to your HYMN account or release.<br>Reply to this email if you need help.</footer></div></div></body></html>`;
}

export function emailText(input: { title: string; greeting?: string; body: string; ctaLabel: string; ctaUrl: string; notice?: string }) {
  return [input.title, input.greeting, input.body, input.notice, `${input.ctaLabel}: ${input.ctaUrl}`, "This is a transactional email related to your HYMN account or release."].filter(Boolean).join("\n\n");
}
// vercel trigger 6
