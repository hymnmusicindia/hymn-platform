import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAdminTaskHistory, updateAdminTask } from "@/lib/task-queue";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  return NextResponse.json({ history: await listAdminTaskHistory(Number((await params).id)) });
}
import { logAuditEvent } from "@/lib/audit-log";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const id = Number((await params).id);
  const body = await request.json().catch(() => ({}));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  const allowed = ["open", "assigned", "snoozed", "resolved"];
  if (body.status && !allowed.includes(body.status)) return NextResponse.json({ error: "Invalid task status." }, { status: 400 });
  try {
    const actorId = "sub" in admin ? admin.sub : null;
    const task = await updateAdminTask(id, { status: body.status, assignedTo: body.assignToMe ? actorId : Number.isInteger(body.assignedTo) ? body.assignedTo : undefined, note: typeof body.note === "string" ? body.note : undefined, snoozedUntil: body.snoozedUntil ? new Date(body.snoozedUntil) : undefined, actorId });
    await logAuditEvent({ actorType: "admin", actorId: "sub" in admin ? admin.sub : null, entityType: "admin_task", entityId: id, action: "admin_task.updated", newValue: { status: body.status, assignedTo: body.assignedTo } });
    return NextResponse.json({ task });
  } catch { return NextResponse.json({ error: "Task not found." }, { status: 404 }); }
}
// vercel trigger 9
