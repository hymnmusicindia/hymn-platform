import "server-only";
import type { Prisma } from "@prisma/client";
import { queueAppointment } from "./appointments";
import { allocateCustomerCall } from "./call-assignment";
import type { Actor } from "./policy";

const terminal = ["CONVERTED", "NOT_INTERESTED", "LOST", "CONSULTATION_COMPLETED"];
export async function syncConsultationTask(tx: Prisma.TransactionClient, requestId: string, creatorId: string) {
  const request = await tx.consultationRequest.findUniqueOrThrow({ where: { id: requestId }, include: { calendarEvent: true } });
  if (!request.assignedMemberId) {
    if (request.taskId) await tx.teamTask.updateMany({ where: { id: request.taskId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { status: "BLOCKED", blocker: "Consultation is awaiting allocation.", version: { increment: 1 } } });
    return null;
  }
  const previousTaskId = request.taskId || request.calendarEvent?.followUpTaskId;
  const old = previousTaskId ? await tx.teamTask.findFirst({ where: { id: previousTaskId, workspaceId: request.workspaceId, clientId: request.clientId } }) : null;
  const context = old?.followUpContext && typeof old.followUpContext === "object" ? old.followUpContext as Record<string, Prisma.InputJsonValue> : {};
  const closed = terminal.includes(request.status);
  const dueAt = request.calendarEvent?.status === "SCHEDULED" ? request.calendarEvent.startsAt : null;
  const data = { clientId: request.clientId, ownerId: request.assignedMemberId, title: `Consultation: ${request.fullName}`, description: `${request.interests.join(", ")}\n${request.otherRequirement}`, dueAt, status: closed ? ["NOT_INTERESTED", "LOST"].includes(request.status) ? "CANCELLED" : "COMPLETED" : old && old.ownerId === request.assignedMemberId ? old.status : "TODO", blocker: old?.blocker || "", callPhase: "CONSULTATION", followUpContext: { ...context, kind: "CALL", callPhase: "CONSULTATION", consultationId: request.id, source: "CONSULTATION", routingReason: "Consultation assigned through shared call capacity." } as Prisma.InputJsonValue };
  const task = old ? await tx.teamTask.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } }) : await tx.teamTask.create({ data: { ...data, workspaceId: request.workspaceId, creatorId, eventKey: `consultation:${request.id}:call`, priority: "HIGH" } });
  if (!request.taskId) await tx.consultationRequest.update({ where: { id: request.id }, data: { taskId: task.id } });
  if (request.calendarEvent && request.calendarEvent.followUpTaskId !== task.id) await tx.teamCalendarEvent.update({ where: { id: request.calendarEvent.id }, data: { followUpTaskId: task.id } });
  return task;
}

export async function syncConsultationCalendar(tx: Prisma.TransactionClient, actor: Actor, task: { id: string; ownerId: string; dueAt: Date | null; status: string; title: string; clientId: string | null }) {
  const request = await tx.consultationRequest.findUnique({ where: { taskId: task.id }, include: { calendarEvent: true } });
  if (!request) return false;
  const fullTask = await tx.teamTask.findUniqueOrThrow({ where: { id: task.id } });
  const context = fullTask.followUpContext as Record<string, unknown> | null;
  const old = request.calendarEvent;
  const outcome = typeof context?.lastOutcomeAt === "string" && (!old || new Date(context.lastOutcomeAt) >= old.updatedAt);
  const closed = ["COMPLETED", "CANCELLED", "BLOCKED", "IN_REVIEW"].includes(task.status);
  let eventId = old?.id || null;
  if (old && (closed || outcome)) {
    const event = await tx.teamCalendarEvent.update({ where: { id: old.id }, data: { status: task.status === "CANCELLED" ? "CANCELLED" : "COMPLETED", ...(outcome && !closed ? { followUpTaskId: null } : {}), version: { increment: 1 }, scheduleRevision: { increment: 1 } } });
    await queueAppointment(tx, event);
    if (outcome && !closed) eventId = null;
  }
  if (!closed && task.dueAt) {
    if (eventId) {
      if (old!.startsAt.getTime() !== task.dueAt.getTime() || old!.assigneeId !== task.ownerId || old!.status !== "SCHEDULED") {
        const event = await tx.teamCalendarEvent.update({ where: { id: eventId }, data: { assigneeId: task.ownerId, startsAt: task.dueAt, endsAt: new Date(task.dueAt.getTime() + 1800000), status: "SCHEDULED", scheduleRevision: { increment: 1 }, version: { increment: 1 } } });
        await queueAppointment(tx, event);
      }
    } else {
      const event = await tx.teamCalendarEvent.create({ data: { workspaceId: request.workspaceId, creatorId: actor.id, assigneeId: task.ownerId, clientId: task.clientId, followUpTaskId: task.id, kind: "FOLLOW_UP", title: task.title, startsAt: task.dueAt, endsAt: new Date(task.dueAt.getTime() + 1800000), notes: "Internal follow-up plan; customer confirmation is required." } });
      eventId = event.id; await queueAppointment(tx, event);
    }
  }
  await tx.consultationRequest.update({ where: { id: request.id }, data: { assignedMemberId: task.ownerId, calendarEventId: eventId, preferredCallback: closed ? null : task.dueAt, status: task.status === "COMPLETED" ? "CONSULTATION_COMPLETED" : task.status === "CANCELLED" ? "NOT_INTERESTED" : outcome || task.status === "BLOCKED" ? "FOLLOW_UP_REQUIRED" : request.status, version: { increment: 1 } } });
  return true;
}

export async function routeWaitingConsultations(tx: Prisma.TransactionClient, actor: Actor, now = new Date()) {
  const waiting = await tx.consultationRequest.findMany({ where: { workspaceId: actor.workspaceId, OR: [{ status: "UNASSIGNED" }, { taskId: null, status: { in: ["ASSIGNED", "CALLBACK_SCHEDULED", "CONTACTED", "FOLLOW_UP_REQUIRED"] } }] }, orderBy: { updatedAt: "asc" }, take: 12 });
  let assigned = 0;
  for (const request of waiting) {
    const client = await tx.teamClient.findUnique({ where: { id: request.clientId }, select: { status: true } });
    if (client?.status !== "ACTIVE") continue;
    if (!request.assignedMemberId) {
      if (request.preferredCallback && request.preferredCallback <= now) {
        await tx.consultationRequest.update({ where: { id: request.id }, data: { updatedAt: now } });
        continue;
      }
      const selection = await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, after: request.preferredCallback || new Date(now.getTime() + 1800000), exact: !!request.preferredCallback, interests: request.interests, consultation: true });
      if (!selection) { await tx.consultationRequest.update({ where: { id: request.id }, data: { updatedAt: now } }); continue; }
      let calendarEventId = request.calendarEventId;
      if (request.preferredCallback) {
        const event = await tx.teamCalendarEvent.create({ data: { workspaceId: actor.workspaceId, creatorId: actor.id, clientId: request.clientId, assigneeId: selection.member.id, kind: "CALL", title: `${request.fullName} — ${request.interests.join(", ")}`, startsAt: selection.startsAt, endsAt: new Date(selection.startsAt.getTime() + 1800000), notes: "Customer-requested consultation." } });
        calendarEventId = event.id; await queueAppointment(tx, event, now);
      }
      await tx.consultationRequest.update({ where: { id: request.id }, data: { assignedMemberId: selection.member.id, calendarEventId, status: request.preferredCallback ? "CALLBACK_SCHEDULED" : "ASSIGNED", version: { increment: 1 } } });
      await tx.consultationActivity.create({ data: { consultationId: request.id, kind: "ASSIGNED", message: selection.reason, metadata: { memberId: selection.member.id } } });
      await tx.teamNotification.create({ data: { memberId: selection.member.id, title: `Consultation allocated: ${request.fullName}`, href: `/team?workspace=${actor.workspaceId}&module=contacts&client=${request.clientId}` } });
      assigned++;
    }
    await syncConsultationTask(tx, request.id, actor.id);
  }
  return { assigned };
}
