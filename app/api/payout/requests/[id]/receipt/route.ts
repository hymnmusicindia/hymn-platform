import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!)); }

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const payout = await prisma.payoutRequest.findFirst({ where: { id: Number((await context.params).id), userId: user.user.id, status: "PAID" }, include: { events: { orderBy: { createdAt: "asc" } } } });
  if (!payout) return NextResponse.json({ error: "Paid payout receipt not found." }, { status: 404 });
  const timeline = payout.events.map(event => `<li>${escapeHtml(event.createdAt.toISOString())}: ${escapeHtml(event.previousStatus || "created")} &rarr; ${escapeHtml(event.newStatus)}${event.note ? ` — ${escapeHtml(event.note)}` : ""}</li>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>HYMN payout receipt ${payout.id}</title><style>body{font:14px system-ui;max-width:760px;margin:40px auto;padding:24px;color:#111}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:10px}h1{font-size:26px}small{color:#555}</style></head><body><h1>HYMN manual payout receipt</h1><p><small>This receipt records HYMN's manually confirmed payout. It is not a bank statement or tax certificate.</small></p><table><tr><td>Receipt</td><td>HYMN-PAYOUT-${payout.id}</td></tr><tr><td>Payment date</td><td>${escapeHtml(payout.paymentDate?.toISOString().slice(0, 10))}</td></tr><tr><td>Requested amount</td><td>${escapeHtml(payout.currency)} ${escapeHtml(payout.amount)}</td></tr><tr><td>Service fee</td><td>${escapeHtml(payout.currency)} ${escapeHtml(payout.serviceFee)}</td></tr><tr><td>Paid amount</td><td>${escapeHtml(payout.currency)} ${escapeHtml(payout.paidAmount)}</td></tr><tr><td>Method</td><td>${escapeHtml(payout.paymentMethod)}</td></tr><tr><td>UTR/reference</td><td>${escapeHtml(payout.paymentReference)}</td></tr></table><h2>Status timeline</h2><ol>${timeline}</ol></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="HYMN-payout-${payout.id}.html"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
}
// vercel trigger 9
