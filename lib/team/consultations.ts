import "server-only";
import { ConsultationStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isConsultationSlotAvailable } from "@/lib/consultation-domain";
import { acceptsAssignmentsNow } from "./availability-rules";
import { TeamError, can, demand, type Actor } from "./policy";
import { audit, notify } from "./service";
import { queueAppointment } from "./appointments";
import { syncConsultationTask } from "./consultation-work";
import { allocateCustomerCall } from "./call-assignment";
import { activityOpen } from "./work-station-policy";

const statuses = Object.values(ConsultationStatus);
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: z.string().min(1), version: z.number().int().positive(), status: z.nativeEnum(ConsultationStatus) }).strict(),
  z.object({ action: z.literal("assign"), id: z.string().min(1), version: z.number().int().positive(), memberId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("note"), id: z.string().min(1), version: z.number().int().positive(), message: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("contact_attempt"), id: z.string().min(1), version: z.number().int().positive(), message: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("request_reassignment"), id: z.string().min(1), version: z.number().int().positive(), message: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ action: z.literal("callback"), id: z.string().min(1), version: z.number().int().positive(), callbackAt: z.string().datetime({ offset: true }).nullable() }).strict()
]);

const assignedScope = (actor: Actor) => can(actor, "crm.all") ? {} : { assignedMemberId: actor.id };

function requestScope(actor: Actor) {
  demand(actor, "crm.prospects.view");
  return { workspaceId: actor.workspaceId, ...assignedScope(actor) };
}

async function accessibleRequest(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const request = await tx.consultationRequest.findFirst({
    where: { id, ...requestScope(actor) },
    include: { calendarEvent: true }
  });
  if (!request) throw new TeamError("Consultation not found or not assigned to you.", 404);
  return request;
}

export async function consultationRead(actor: Actor, params: URLSearchParams) {
  const baseWhere = requestScope(actor);
  const query = (params.get("q") || "").trim().slice(0, 100);
  const status = params.get("status");
  const interest = params.get("interest");
  const assignedMemberId = params.get("member");
  const from = params.get("from");
  const to = params.get("to");
  const sort = params.get("sort") === "oldest" ? "asc" : "desc";
  const offset = Math.max(0, Math.min(100000, Number(params.get("offset")) || 0));
  for (const date of [from, to]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime()))) throw new TeamError("Choose valid consultation date filters.");
  }
  const where: Prisma.ConsultationRequestWhereInput = {
    ...baseWhere,
    ...(status && (statuses as string[]).includes(status) ? { status: status as ConsultationStatus } : {}),
    ...(interest ? { interests: { has: interest } } : {}),
    ...(can(actor, "crm.all") && assignedMemberId ? { assignedMemberId: assignedMemberId === "unassigned" ? null : assignedMemberId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) } : {}) } } : {}),
    ...(query ? { OR: [
      { fullName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phoneE164: { contains: query } }
    ] } : {})
  };
  const [items, total, statusCounts, eligibleMembers] = await Promise.all([
    prisma.consultationRequest.findMany({
      where,
      take: 100,
      skip: offset,
      orderBy: [{ createdAt: sort }, { id: sort }],
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedMember: { select: { id: true, user: { select: { name: true } } } },
        calendarEvent: { select: { id: true, startsAt: true, status: true, kind: true } },
        activities: { take: 20, orderBy: { createdAt: "desc" }, include: { actorMember: { select: { id: true, user: { select: { name: true } } } } } }
      }
    }),
    prisma.consultationRequest.count({ where }),
    Promise.all(statuses.map(async value => [value, await prisma.consultationRequest.count({ where: { ...baseWhere, status: value as ConsultationStatus } })] as const)),
    can(actor, "crm.prospects.assign")
      ? prisma.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", availability: "AVAILABLE", user: { status: "ACTIVE" }, role: { owner: false, permissions: { hasEvery: ["crm.prospects.view", "crm.outreach.manage", "calendar.manage"] } } }, select: { id: true, preferences: true, user: { select: { name: true } } }, orderBy: { joinedAt: "asc" } }).then(members => members.filter(member => acceptsAssignmentsNow(member.preferences)).map(({ id, user }) => ({ id, user })))
      : Promise.resolve([])
  ]);
  return { items, total, offset, statuses: Object.fromEntries(statusCounts), members: eligibleMembers };
}

async function consultationMutationInner(tx: Prisma.TransactionClient, actor: Actor, raw: unknown) {
  const data = mutationSchema.parse(raw);
  const request = await accessibleRequest(tx, actor, data.id);
  if (data.action === "assign") demand(actor, "crm.prospects.assign");
  else if (data.action !== "request_reassignment") demand(actor, "crm.outreach.manage");
  if (request.version !== data.version) throw new TeamError("Consultation changed. Refresh before saving.", 409);
  if (request.taskId && ["assign", "callback", "status"].includes(data.action)) {
    const task = await tx.teamTask.findUniqueOrThrow({ where: { id: request.taskId } });
    if (activityOpen(task.followUpContext)) throw new TeamError("Pause and finish the active call before changing its booking or assignment.", 409);
    if (data.action === "status" && ["CONTACTED", "CONSULTATION_COMPLETED"].includes(data.status) && task.conversationCount === 0) throw new TeamError("Record the real conversation in the shared call activity first.", 409);
  }
  if (data.action === "contact_attempt") throw new TeamError("Record the call outcome in the shared call activity so attempts and follow-ups stay consistent.", 409);

  if (data.action === "request_reassignment") {
    if (request.assignedMemberId !== actor.id) throw new TeamError("Only the assigned team member can request reassignment.", 403);
    const [latestRequest, latestAssignment] = await Promise.all([
      tx.consultationActivity.findFirst({ where: { consultationId: request.id, kind: "REASSIGNMENT_REQUESTED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      tx.consultationActivity.findFirst({ where: { consultationId: request.id, kind: { in: ["ASSIGNED", "REASSIGNED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    ]);
    if (latestRequest && (!latestAssignment || latestRequest.createdAt > latestAssignment.createdAt)) return { id: request.id, reassignmentRequested: true, duplicate: true };
    await tx.consultationActivity.create({ data: { consultationId: request.id, actorMemberId: actor.id, kind: "REASSIGNMENT_REQUESTED", message: data.message } });
    const managers = await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", OR: [{ role: { owner: true } }, { role: { permissions: { has: "crm.prospects.assign" } } }] }, select: { id: true } });
    const href = `/team?workspace=${encodeURIComponent(actor.workspaceId)}&module=consultations&consultation=${encodeURIComponent(request.id)}`;
    for (const manager of managers) await notify(tx, manager.id, `Reassignment requested: ${request.fullName}`, href);
    await audit(tx, actor, "CONSULTATION_REASSIGNMENT_REQUESTED", request.id, { message: data.message });
    return { id: request.id, reassignmentRequested: true, duplicate: false };
  }

  if (data.action !== "assign") demand(actor, "crm.outreach.manage");

  if (data.action === "status") {
    const status = data.status as ConsultationStatus;
    if (status === ConsultationStatus.CALLBACK_SCHEDULED && (!request.preferredCallback || request.calendarEvent?.status !== "SCHEDULED" || request.calendarEvent.kind !== "CALL")) {
      throw new TeamError("Schedule an available callback before setting this status.");
    }
    if (status === ConsultationStatus.UNASSIGNED && request.assignedMemberId) {
      demand(actor, "crm.prospects.assign");
      const eventToCancel = request.calendarEvent?.status === "SCHEDULED" ? request.calendarEvent : null;
      if (eventToCancel) {
        await tx.teamCalendarEvent.update({ where: { id: eventToCancel.id }, data: { status: "CANCELLED", scheduleRevision: { increment: 1 }, version: { increment: 1 } } });
        const event = await tx.teamCalendarEvent.findUniqueOrThrow({ where: { id: eventToCancel.id } });
        await queueAppointment(tx, event);
      }
      await tx.consultationRequest.update({ where: { id: request.id }, data: { status, assignedMemberId: null, preferredCallback: null } });
      await tx.consultationActivity.create({ data: { consultationId: request.id, actorMemberId: actor.id, kind: "UNASSIGNED", message: `Unassigned from ${request.assignedMemberId}`, metadata: { previousMemberId: request.assignedMemberId } } });
      await audit(tx, actor, "CONSULTATION_UNASSIGNED", request.id, { previousMemberId: request.assignedMemberId });
      return { id: request.id, status, calendarEventId: null, callbackCancelled: Boolean(eventToCancel) };
    }
    if (request.status !== status) {
      await tx.consultationRequest.update({ where: { id: request.id }, data: { status } });
      await tx.consultationActivity.create({ data: { consultationId: request.id, actorMemberId: actor.id, kind: "STATUS_CHANGED", message: `${request.status} → ${status}`, metadata: { from: request.status, to: status } } });
      await audit(tx, actor, "CONSULTATION_STATUS_CHANGED", request.id, { from: request.status, to: status });
    }
    return { id: request.id, status };
  }

  if (data.action === "note") {
    const kind = "INTERNAL_NOTE";
    await tx.consultationActivity.create({ data: { consultationId: request.id, actorMemberId: actor.id, kind, message: data.message } });
    await audit(tx, actor, kind, request.id);
    return { id: request.id, status: request.status };
  }

  if (data.action === "assign") {
    demand(actor, "crm.prospects.assign");
    const member = await tx.teamMember.findFirst({
      where: { id: data.memberId, workspaceId: actor.workspaceId, status: "ACTIVE", availability: "AVAILABLE", user: { status: "ACTIVE" }, role: { owner: false, permissions: { hasEvery: ["crm.prospects.view", "crm.outreach.manage", "calendar.manage"] } } },
      select: { id: true, preferences: true, user: { select: { name: true } } }
    });
    if (!member || !acceptsAssignmentsNow(member.preferences)) throw new TeamError("Choose an eligible, available HYMN team member.");
    const bookingAt = request.calendarEvent?.status === "SCHEDULED" ? request.calendarEvent.startsAt : new Date(Date.now() + 1800000);
    const capacity = await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, after: bookingAt, onlyMemberId: member.id, exact: request.calendarEvent?.status === "SCHEDULED", eventId: request.calendarEvent?.id, taskId: request.taskId || undefined, consultation: true });
    if (!capacity) throw new TeamError("That teammate has no shared call capacity at this time.", 409);
    if (request.calendarEvent?.status === "SCHEDULED" && request.preferredCallback) {
      const reservations = await tx.teamCalendarEvent.findMany({
        where: { workspaceId: actor.workspaceId, assigneeId: member.id, status: "SCHEDULED", id: { not: request.calendarEvent.id }, startsAt: { gte: new Date(request.calendarEvent.startsAt.getTime() - 7 * 86400000), lt: new Date(request.calendarEvent.startsAt.getTime() + 30 * 60000) } },
        select: { kind: true, startsAt: true, endsAt: true }
      });
      const candidate = await tx.teamMember.findUnique({ where: { id: member.id }, select: { preferences: true } });
      if (!candidate || !isConsultationSlotAvailable(candidate.preferences, request.calendarEvent.startsAt, reservations)) {
        throw new TeamError("That team member is not available at the selected callback time.", 409);
      }
      await tx.teamCalendarEvent.update({ where: { id: request.calendarEvent.id }, data: { assigneeId: member.id, scheduleRevision: { increment: 1 }, version: { increment: 1 } } });
      const updatedEvent = await tx.teamCalendarEvent.findUniqueOrThrow({ where: { id: request.calendarEvent.id } });
      await queueAppointment(tx, updatedEvent);
    }
    const nextStatus = request.calendarEvent?.status === "SCHEDULED" && request.calendarEvent.kind === "CALL" ? ConsultationStatus.CALLBACK_SCHEDULED : ConsultationStatus.ASSIGNED;
    await tx.consultationRequest.update({ where: { id: request.id }, data: { assignedMemberId: member.id, status: nextStatus } });
    await tx.consultationActivity.create({ data: { consultationId: request.id, actorMemberId: actor.id, kind: "ASSIGNED", message: `Assigned to ${member.user.name}`, metadata: { memberId: member.id } } });
    await tx.teamNotification.create({ data: { memberId: member.id, title: `New consultation lead: ${request.fullName}`, href: `/team?workspace=${encodeURIComponent(actor.workspaceId)}&module=consultations&consultation=${encodeURIComponent(request.id)}` } });
    await audit(tx, actor, "CONSULTATION_ASSIGNED", request.id, { memberId: member.id });
    return { id: request.id, assignedMemberId: member.id, status: nextStatus, calendarEventId: request.calendarEvent?.status === "SCHEDULED" ? request.calendarEvent.id : null };
  }

  const callbackAt = data.callbackAt ? new Date(data.callbackAt) : null;
  if (callbackAt && (callbackAt <= new Date() || callbackAt.getTime() > Date.now() + 14 * 86400000)) throw new TeamError("Choose a callback time within the next two weeks.");
  if (!request.assignedMemberId) throw new TeamError("Assign this consultation before scheduling a callback.");
  if (!callbackAt && (!request.preferredCallback || request.calendarEvent?.status !== "SCHEDULED")) {
    return { id: request.id, status: request.status, preferredCallback: null, calendarEventId: null, callbackCancelled: false };
  }
  const member = await tx.teamMember.findFirst({
    where: { id: request.assignedMemberId, workspaceId: actor.workspaceId, status: "ACTIVE", availability: "AVAILABLE", user: { status: "ACTIVE" } },
    select: { preferences: true }
  });
  if (!member) throw new TeamError("The assigned team member is no longer active.", 409);
  let eventId: string | null = request.calendarEvent?.id ?? null;
  if (callbackAt) {
    const reservations = await tx.teamCalendarEvent.findMany({
      where: { workspaceId: actor.workspaceId, assigneeId: request.assignedMemberId, status: "SCHEDULED", ...(eventId ? { id: { not: eventId } } : {}), startsAt: { gte: new Date(callbackAt.getTime() - 7 * 86400000), lt: new Date(callbackAt.getTime() + 30 * 60000) } },
      select: { kind: true, startsAt: true, endsAt: true }
    });
    const capacity = await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, onlyMemberId: request.assignedMemberId, after: callbackAt, exact: true, eventId: eventId || undefined, taskId: request.taskId || undefined, consultation: true });
    if (!capacity || !isConsultationSlotAvailable(member.preferences, callbackAt, reservations)) throw new TeamError("That callback slot is no longer available for the assigned team member.", 409);
    if (eventId) {
      await tx.teamCalendarEvent.update({ where: { id: eventId }, data: { startsAt: callbackAt, endsAt: new Date(callbackAt.getTime() + 30 * 60000), status: "SCHEDULED", scheduleRevision: { increment: 1 }, version: { increment: 1 } } });
    } else {
      const owner = await tx.teamMember.findFirst({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", role: { owner: true } }, orderBy: { joinedAt: "asc" }, select: { id: true } });
      if (!owner) throw new TeamError("No workspace owner is available to create the callback.");
      const event = await tx.teamCalendarEvent.create({ data: { workspaceId: actor.workspaceId, creatorId: owner.id, assigneeId: request.assignedMemberId, clientId: request.clientId, title: `HYMN consultation with ${request.fullName}`, kind: "CALL", startsAt: callbackAt, endsAt: new Date(callbackAt.getTime() + 30 * 60000), notes: "Consultation callback", status: "SCHEDULED" } });
      eventId = event.id;
    }
    const event = await tx.teamCalendarEvent.findUniqueOrThrow({ where: { id: eventId } });
    await queueAppointment(tx, event);
  } else if (request.calendarEvent) {
    await tx.teamCalendarEvent.update({ where: { id: request.calendarEvent.id }, data: { status: "CANCELLED", scheduleRevision: { increment: 1 }, version: { increment: 1 } } });
    const event = await tx.teamCalendarEvent.findUniqueOrThrow({ where: { id: request.calendarEvent.id } });
    await queueAppointment(tx, event);
  }
  const nextStatus = callbackAt ? ConsultationStatus.CALLBACK_SCHEDULED : request.status === ConsultationStatus.CALLBACK_SCHEDULED ? ConsultationStatus.ASSIGNED : request.status;
  await tx.consultationRequest.update({ where: { id: request.id }, data: { preferredCallback: callbackAt, calendarEventId: eventId, status: nextStatus } });
  await tx.consultationActivity.create({ data: { consultationId: request.id, actorMemberId: actor.id, kind: callbackAt ? "CALLBACK_RESCHEDULED" : "CALLBACK_CANCELLED", message: callbackAt ? `Callback scheduled for ${callbackAt.toISOString()}` : "Callback cancelled", metadata: { callbackAt: callbackAt?.toISOString() ?? null } } });
  await tx.teamNotification.create({ data: { memberId: request.assignedMemberId, title: callbackAt ? `Consultation callback rescheduled: ${request.fullName}` : `Consultation callback cancelled: ${request.fullName}`, href: `/team?workspace=${encodeURIComponent(actor.workspaceId)}&module=consultations&consultation=${encodeURIComponent(request.id)}` } });
  await audit(tx, actor, callbackAt ? "CONSULTATION_CALLBACK_RESCHEDULED" : "CONSULTATION_CALLBACK_CANCELLED", request.id, { callbackAt: callbackAt?.toISOString() ?? null });
  return { id: request.id, status: nextStatus, preferredCallback: callbackAt?.toISOString() ?? null, calendarEventId: eventId, callbackCancelled: !callbackAt };
}

export async function consultationMutation(tx: Prisma.TransactionClient, actor: Actor, raw: unknown) {
  const result = await consultationMutationInner(tx, actor, raw);
  const request = await tx.consultationRequest.update({ where: { id: result.id }, data: { version: { increment: 1 } }, include: { calendarEvent: true } });
  if (["CONVERTED", "NOT_INTERESTED", "LOST", "CONSULTATION_COMPLETED"].includes(request.status) && request.calendarEvent?.status === "SCHEDULED") {
    const event = await tx.teamCalendarEvent.update({ where: { id: request.calendarEvent.id }, data: { status: request.status === "CONSULTATION_COMPLETED" ? "COMPLETED" : "CANCELLED", version: { increment: 1 }, scheduleRevision: { increment: 1 } } });
    await queueAppointment(tx, event);
  }
  const action = mutationSchema.parse(raw).action;
  if (request.taskId && ["assign", "callback"].includes(action)) await tx.teamTask.updateMany({ where: { id: request.taskId, status: "BLOCKED", blocker: "Consultation is awaiting allocation." }, data: { status: "TODO", blocker: "", version: { increment: 1 } } });
  if (!request.taskId || ["assign", "callback", "status"].includes(action)) await syncConsultationTask(tx, request.id, actor.id);
  return { ...result, version: request.version, calendarEventId: request.calendarEventId };
}
