import { NextResponse } from "next/server";
import { createSupportTicket, listAllSupportTickets, listSupportTicketsByUser, updateSupportTicketStatus } from "@/lib/db";
import { requireUser } from "@/lib/access";
import type { SupportTicketStatus } from "@/lib/types";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

function parseStatus(value: unknown): SupportTicketStatus | null {
  if (value === "open" || value === "in_progress" || value === "resolved" || value === "closed") return value;
  return null;
}

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const tickets = result.user.role === "admin" ? await listAllSupportTickets() : await listSupportTicketsByUser(result.user.id);
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "create");

  if (action === "update-status") {
    if (result.user.role !== "admin") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    const ticketId = Number(body.ticketId);
    const status = parseStatus(body.status);
    if (!Number.isInteger(ticketId) || ticketId <= 0 || !status) {
      return NextResponse.json({ error: "Valid ticketId and status are required." }, { status: 400 });
    }
    const ticket = await updateSupportTicketStatus(ticketId, status);
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    if (status === "resolved" || status === "closed") await resolveAdminTask(`support:${ticketId}:open`, `Support ticket ${status}.`);
    await logAuditEvent({ actorType: "admin", actorId: result.user.id, entityType: "support_ticket", entityId: ticketId, action: `support.${status}` });
    return NextResponse.json({ ticket });
  }

  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (subject.length < 3 || message.length < 10) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const parseId = (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const ticket = await createSupportTicket({
    userId: result.user.id,
    subject,
    message,
    category: typeof body.category === "string" ? body.category.slice(0, 80) : "general",
    priority: body.priority === "high" ? "high" : "normal",
    relatedReleaseId: parseId(body.relatedReleaseId),
    relatedPurchaseId: parseId(body.relatedPurchaseId),
    relatedPayoutId: parseId(body.relatedPayoutId)
  });
  await Promise.all([
    createAdminTaskOnce({ eventKey: `support:${ticket.id}:open`, type: "Support Ticket Open", priority: ticket.priority === "high" ? "high" : "normal", title: ticket.subject, body: ticket.message, href: `/admin?tab=support&ticketId=${ticket.id}`, entityType: "support_ticket", entityId: ticket.id }),
    logAuditEvent({ actorType: "user", actorId: result.user.id, entityType: "support_ticket", entityId: ticket.id, action: "support.created", newValue: { category: ticket.category, priority: ticket.priority, relatedReleaseId: ticket.relatedReleaseId, relatedPurchaseId: ticket.relatedPurchaseId, relatedPayoutId: ticket.relatedPayoutId } })
  ]);
  return NextResponse.json({ ticket }, { status: 201 });
}

// vercel trigger
