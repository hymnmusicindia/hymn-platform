import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can, demand, TeamError, type Actor } from "./policy";
import { audit, notify, taskScope } from "./service";
import { sharedWorkScope } from "./shared-work";
import { activityOpen } from "./work-station-policy";
import { allocateCustomerCall, loadCallAllocation } from "./call-assignment";
import { queueAppointment } from "./appointments";
import { isCallWork } from "./daily-call-policy";
import { callJourney, CALL_PHASES } from "./call-journey";
import { internalIdentities, matchesInternalIdentity } from "./internal-identity";
import { whatsappNumber } from "./phone";

const obj = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.InputJsonValue> : {};
const open = { notIn: ["COMPLETED", "CANCELLED"] };
const appointmentSelect = { id: true, startsAt: true, kind: true, status: true, version: true, googleMeetUrl: true, googleCalendarUrl: true, googleSyncStatus: true, googleSyncError: true } satisfies Prisma.TeamCalendarEventSelect;

async function accessibleTask(tx: Prisma.TransactionClient | typeof prisma, actor: Actor, id: string) {
  const task = await tx.teamTask.findFirst({ where: { ...taskScope(actor), id }, include: { owner: { include: { role: true } } } });
  if (!task) throw new TeamError("Work is unavailable.", 404);
  return task;
}
async function callableContact(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const contact = await tx.teamClient.findFirst({ where: { id, workspaceId: actor.workspaceId, mergedIntoId: null }, include: { prospect: true } });
  if (!contact || contact.status !== "ACTIVE" || !whatsappNumber(contact.phone)) throw new TeamError("Choose an active customer with a valid phone number.");
  if (contact.prospect && (contact.prospect.suppressed || !contact.prospect.verified || !["CONSENTED", "LEGITIMATE_INTEREST"].includes(contact.prospect.contactEligibility))) throw new TeamError("Contact verification or preferences prevent outreach.", 409);
  if (matchesInternalIdentity(await internalIdentities(tx), contact)) throw new TeamError("Internal team contacts cannot enter customer call allocation.");
  return contact;
}

export async function customerWorkRead(actor: Actor, resource: string, params: URLSearchParams) {
  demand(actor, "clients.view");
  if (resource === "calendar-connection") {
    if (!actor.role.owner) return { owner: false, connected: false };
    const connection = await prisma.teamGoogleCalendar.findUnique({ where: { workspaceId: actor.workspaceId }, select: { accountEmail: true, connectedAt: true } });
    const failures = await prisma.teamCalendarEvent.findMany({ where: { workspaceId: actor.workspaceId, googleSyncStatus: { in: ["ERROR", "WAITING_CONNECTION", "RETRY"] } }, select: { id: true, title: true, googleSyncStatus: true, googleSyncError: true }, take: 20, orderBy: { updatedAt: "asc" } });
    return { owner: true, connected: !!connection, connection, failures };
  }
  if (resource === "call-slots") {
    demand(actor, "crm.outreach.manage");
    const task = params.get("taskId") ? await accessibleTask(prisma, actor, params.get("taskId")!) : null;
    const after = params.get("after") ? new Date(params.get("after")!) : new Date(Date.now() + 1800000);
    if (!Number.isFinite(after.getTime()) || after <= new Date() || after.getTime() > Date.now() + 14 * 86400000) throw new TeamError("Choose a future date within two weeks.");
    const event = task ? await prisma.teamCalendarEvent.findUnique({ where: { followUpTaskId: task.id } }) : null;
    const items: { startsAt: string; memberId: string; name: string; reason: string }[] = [];
    let cursor = after;
    // A short read transaction shares the same capacity selector as actual writes.
    await prisma.$transaction(async tx => {
      const snapshot = await loadCallAllocation(tx, actor.workspaceId, after, event?.id, task?.id);
      for (let i = 0; i < 6; i++) {
        const choice = await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, snapshot, after: cursor, taskId: task?.id, eventId: event?.id, preferredMemberId: task?.ownerId, ...(params.get("keep") === "1" ? { onlyMemberId: task?.ownerId || actor.id } : {}), consultation: !!obj(task?.followUpContext).consultationId });
        if (!choice || choice.startsAt.getTime() > Date.now() + 14 * 86400000) break;
        items.push({ startsAt: choice.startsAt.toISOString(), memberId: choice.member.id, name: choice.member.user.name, reason: choice.reason });
        cursor = new Date(choice.startsAt.getTime() + 1800000);
      }
    }, { timeout: 20000 });
    return { items, timezone: "Asia/Kolkata" };
  }
  if (resource === "handoff-members") {
    demand(actor, "tasks.update");
    return { items: await prisma.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", role: { owner: false }, user: { status: "ACTIVE" }, id: { not: actor.id } }, select: { id: true, department: true, jobTitle: true, user: { select: { name: true } } }, take: 250, orderBy: { id: "asc" } }) };
  }
  const manager = can(actor, "tasks.assign");
  const [handoffs, waiting, tasks, names] = await Promise.all([
    prisma.teamWorkHandoff.findMany({ where: { task: sharedWorkScope(actor), status: "PENDING", ...(!manager ? { OR: [{ fromId: actor.id }, { toId: actor.id }] } : {}) }, include: { task: { select: { id: true, title: true, clientId: true } } }, orderBy: { createdAt: "asc" }, take: 50 }),
    can(actor, "crm.prospects.assign") ? prisma.consultationRequest.findMany({ where: { workspaceId: actor.workspaceId, status: "UNASSIGNED" }, select: { id: true, fullName: true, clientId: true, preferredCallback: true }, orderBy: { createdAt: "asc" }, take: 50 }) : Promise.resolve([]),
    prisma.teamTask.findMany({ where: { ...taskScope(actor), ...(!manager ? { OR: [{ ownerId: actor.id }, { collaboratorIds: { has: actor.id } }] } : {}), status: open, ...(params.get("blocked") === "1" ? { status: "BLOCKED" } : {}) }, select: { id: true, title: true, version: true, ownerId: true, clientId: true, dueAt: true, blocker: true, status: true, followUpContext: true, eventKey: true, callPhase: true, callAttempts: true, conversationCount: true, owner: { select: { user: { select: { name: true } } } } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 50 }),
    prisma.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE" }, select: { id: true, user: { select: { name: true } } } })
  ]);
  const name = new Map(names.map(member => [member.id, member.user.name]));
  return { manager, handoffs: handoffs.map(row => ({ ...row, fromName: name.get(row.fromId) || "Team member", toName: name.get(row.toId) || "Team member" })), waiting: waiting.map(row => ({ ...row, reason: row.preferredCallback && row.preferredCallback <= new Date() ? "Requested time expired; arrange a new time." : "Waiting for qualified staff and shared call capacity." })), tasks: tasks.map(task => ({ ...task, isCall: isCallWork(task), journey: callJourney(task.followUpContext,task), followUpContext: undefined })) };
}

export async function customerWorkMutation(tx: Prisma.TransactionClient, actor: Actor, resource: string, input: unknown) {
  if (resource === "calendar-google-retry") {
    if (!actor.role.owner) throw new TeamError("Only the calendar owner can retry synchronization.", 403);
    const { id } = z.object({ id: z.string() }).parse(input);
    const event = await tx.teamCalendarEvent.findFirst({ where: { id, workspaceId: actor.workspaceId } });
    if (!event || event.kind !== "CALL" && !event.googleEventId) throw new TeamError("Call not found.", 404);
    await tx.teamCalendarEvent.update({ where: { id }, data: { googleSyncStatus: "PENDING", googleSyncAfter: null, googleSyncAttempts: 0, version: { increment: 1 } } });
    return { id, calendarEventId: id };
  }
  if (resource === "handoff-request") {
    demand(actor, "tasks.update");
    const data = z.object({ taskId: z.string(), version: z.number().int().positive(), toId: z.string(), team: z.string().trim().max(100).default(""), mode: z.enum(["TRANSFER", "HELP"]), summary: z.string().trim().min(15).max(2000), requestKey: z.string().uuid() }).parse(input);
    const task = await accessibleTask(tx, actor, data.taskId);
    if (task.ownerId !== actor.id && !can(actor, "tasks.assign")) throw new TeamError("Only the accountable teammate or a supervisor can hand off work.", 403);
    const prior = await tx.teamWorkHandoff.findUnique({ where: { requestKey: data.requestKey } });
    if (prior) { if (prior.taskId !== task.id || prior.fromId !== actor.id || prior.toId !== data.toId || prior.summary !== data.summary || prior.mode !== data.mode) throw new TeamError("This retry key belongs to another handoff.", 409); return prior; }
    if (task.version !== data.version || !["TODO", "BLOCKED", "BACKLOG"].includes(task.status) || activityOpen(task.followUpContext)) throw new TeamError("Work changed or is active. Refresh and pause or finish the activity first.", 409);
    const context = obj(task.followUpContext);
    if (task.owner.role.owner || context.pinnedAssignee || context.personalCallPlan || context.dutyVersion || context.dailyCallPlan) throw new TeamError("This reserved assignment cannot be transferred.", 409);
    const member = await tx.teamMember.findFirst({ where: { id: data.toId, workspaceId: actor.workspaceId, status: "ACTIVE", role: { owner: false }, user: { status: "ACTIVE" } }, include: { role: true } });
    if (!member || member.id === actor.id || !can(member, "tasks.update") || !await tx.teamTask.findFirst({ where: { ...sharedWorkScope(member), id: task.id } })) throw new TeamError("Choose a qualified teammate with access to this work.");
    if (obj(task.followUpContext).kind === "CALL" && !can(member, "crm.outreach.manage")) throw new TeamError("The receiving teammate needs call permissions.");
    if (await tx.teamWorkHandoff.findFirst({ where: { taskId: task.id, status: "PENDING" } })) throw new TeamError("A handoff is already awaiting acceptance.", 409);
    const row = await tx.teamWorkHandoff.create({ data: { ...data, version: 1, taskVersion: task.version, fromId: actor.id } });
    if (task.ownerId !== actor.id) await notify(tx, task.ownerId, `Handoff requested for your work: ${task.title}`, `/team?workspace=${actor.workspaceId}&module=team-queue`);
    await notify(tx, member.id, `${data.mode === "HELP" ? "Specialist help" : "Handoff"} requested: ${task.title}`, `/team?workspace=${actor.workspaceId}&module=team-queue`);
    await audit(tx, actor, "contact.handoff_requested", task.clientId || task.id, { taskId: task.id, handoffId: row.id, discussion: data.summary, nextAction: "Awaiting receiving teammate acceptance." });
    return row;
  }
  if (resource === "handoff-resolve") {
    const data = z.object({ id: z.string(), version: z.number().int().positive(), action: z.enum(["ACCEPT", "DECLINE", "CANCEL"]) }).parse(input);
    const handoff = await tx.teamWorkHandoff.findFirst({ where: { id: data.id, task: { workspaceId: actor.workspaceId } }, include: { task: { include: { owner: { include: { role: true } } } } } });
    if (!handoff || (data.action === "CANCEL" ? handoff.fromId !== actor.id && !can(actor, "tasks.assign") : handoff.toId !== actor.id)) throw new TeamError("Handoff unavailable.", 403);
    if (handoff.version !== data.version || handoff.status !== "PENDING") throw new TeamError("Handoff already changed.", 409);
    const task = handoff.task;
    if (data.action === "ACCEPT") {
      if (task.version !== handoff.taskVersion) throw new TeamError("Work changed after this handoff was requested. Ask for an updated handoff.", 409);
      demand(actor, "tasks.update"); demand(actor, "tasks.complete");
      if (!await tx.teamTask.findFirst({ where: { ...sharedWorkScope(actor), id: task.id } }) || activityOpen(task.followUpContext) || !["TODO", "BLOCKED", "BACKLOG"].includes(task.status)) throw new TeamError("This work is active, closed, or no longer accessible.", 409);
      const context = obj(task.followUpContext);
      if (task.owner.role.owner || context.pinnedAssignee || context.personalCallPlan || context.dailyCallPlan || context.dutyVersion) throw new TeamError("This assignment is reserved.", 409);
      if (handoff.mode === "HELP") {
        await tx.teamTask.update({ where: { id: task.id }, data: { collaboratorIds: [...new Set([...task.collaboratorIds, actor.id])], version: { increment: 1 } } });
      } else {
        const event = await tx.teamCalendarEvent.findUnique({ where: { followUpTaskId: task.id } });
        if (event?.status === "SCHEDULED") {
          const choice = await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, onlyMemberId: actor.id, after: event.startsAt, exact: true, eventId: event.id, taskId: task.id, consultation: !!context.consultationId });
          if (!choice) throw new TeamError("This booking does not fit your hours or capacity. Reschedule before accepting.", 409);
          const updated = await tx.teamCalendarEvent.update({ where: { id: event.id }, data: { assigneeId: actor.id, scheduleRevision: { increment: 1 }, version: { increment: 1 } } });
          await queueAppointment(tx, updated);
        } else if (context.kind === "CALL") demand(actor, "crm.outreach.manage");
        await tx.teamTask.update({ where: { id: task.id }, data: { ownerId: actor.id, collaboratorIds: [...new Set([...task.collaboratorIds, task.ownerId])], version: { increment: 1 } } });
        await tx.consultationRequest.updateMany({ where: { taskId: task.id }, data: { assignedMemberId: actor.id, version: { increment: 1 } } });
        await tx.teamProspect.updateMany({ where: { workspaceId: actor.workspaceId, clientId: task.clientId || "", ownerId: task.ownerId, id: task.eventKey?.endsWith(":call") ? task.eventKey.slice(0, -5) : "" }, data: { ownerId: actor.id, version: { increment: 1 } } });
      }
      await tx.teamComment.create({ data: { taskId: task.id, authorId: actor.id, body: `${handoff.mode === "HELP" ? "Specialist joined" : "Handoff accepted"}: ${handoff.summary}` } });
    }
    const status = data.action === "ACCEPT" ? "ACCEPTED" : data.action === "DECLINE" ? "DECLINED" : "CANCELLED";
    const result = await tx.teamWorkHandoff.update({ where: { id: handoff.id }, data: { status, resolvedAt: new Date(), version: { increment: 1 } } });
    if (task.ownerId !== handoff.fromId) await notify(tx, task.ownerId, `Handoff ${status.toLowerCase()}: ${task.title}`, `/team?workspace=${actor.workspaceId}&module=team-queue`);
    await notify(tx, handoff.fromId, `Handoff ${status.toLowerCase()}: ${task.title}`, `/team?workspace=${actor.workspaceId}&module=team-queue`);
    await audit(tx, actor, "contact.handoff_resolved", task.clientId || task.id, { taskId: task.id, outcome: status, discussion: handoff.summary });
    return result;
  }
  demand(actor, "crm.outreach.manage"); demand(actor, "tasks.update");
  const data = z.object({ id: z.string().optional(), version: z.number().int().positive().optional(), clientId: z.string().optional(), purpose: z.string().trim().min(3).max(180).optional(), phase: z.enum(Object.keys(CALL_PHASES) as [keyof typeof CALL_PHASES, ...Array<keyof typeof CALL_PHASES>]).default("FIRST_CONVERSATION"), startsAt: z.string().datetime({ offset: true }), keepAssignee: z.boolean().default(true), confirmed: z.boolean(), reason: z.string().trim().min(5).max(1000), requestKey: z.string().uuid().optional() }).parse(input);
  const startsAt = new Date(data.startsAt);
  if (startsAt <= new Date() || startsAt.getTime() > Date.now() + 14 * 86400000) throw new TeamError("Choose a future time within two weeks.");
  let task = data.id ? await accessibleTask(tx, actor, data.id) : null;
  if (!task && resource !== "customer-call-create") throw new TeamError("Call not found.", 404);
  if (task && (task.version !== data.version || task.ownerId !== actor.id && !can(actor, "tasks.assign") || !["TODO", "BLOCKED", "BACKLOG"].includes(task.status) || activityOpen(task.followUpContext))) throw new TeamError("Call changed, is active, or belongs to another teammate. Refresh before scheduling.", 409);
  if (task && !isCallWork(task)) throw new TeamError("Use the task planner for non-call work.");
  if (task && Number(obj(task.followUpContext).noAnswerAttempts || 0) >= 3 && !can(actor, "tasks.assign")) throw new TeamError("A supervisor must review the unanswered-attempt limit before another call.", 409);
  const client = await callableContact(tx, actor, task?.clientId || data.clientId || "");
  const event = task ? await tx.teamCalendarEvent.findUnique({ where: { followUpTaskId: task.id } }) : null;
  if (!task && (!data.purpose || !data.requestKey)) throw new TeamError("Provide the purpose and a new request key.");
  if (!task && data.requestKey) {
    const previous = await tx.teamTask.findUnique({ where: { eventKey: `customer-call:${actor.workspaceId}:${actor.id}:${data.requestKey}` } });
    if (previous) { if (previous.clientId !== client.id || previous.title !== data.purpose) throw new TeamError("This request key was used for a different call.", 409); return { id: previous.id, duplicate: true }; }
  }
  const selection = await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, after: startsAt, exact: true, taskId: task?.id, eventId: event?.id, preferredMemberId: task?.ownerId || (!actor.role.owner ? actor.id : undefined), ...(data.keepAssignee && task ? { onlyMemberId: task.ownerId } : {}), consultation: !!obj(task?.followUpContext).consultationId });
  if (!selection) throw new TeamError("No qualified teammate has capacity at this time. Choose an available slot or another teammate.", 409);
  const fields = { ownerId: selection.member.id, dueAt: startsAt, status: "TODO", blocker: "" };
  if (task) task = await tx.teamTask.update({ where: { id: task.id }, data: { ...fields, collaboratorIds: [...new Set([...task.collaboratorIds, task.ownerId])], version: { increment: 1 } }, include: { owner: { include: { role: true } } } });
  else task = await tx.teamTask.create({ data: { ...fields, workspaceId: actor.workspaceId, creatorId: actor.id, clientId: client.id, title: data.purpose!, callPhase: data.phase, eventKey: `customer-call:${actor.workspaceId}:${actor.id}:${data.requestKey || randomUUID()}`, followUpContext: { kind: "CALL", callPhase: data.phase, source: "MANUAL_REQUEST", routingReason: selection.reason } }, include: { owner: { include: { role: true } } } });
  const booking = { assigneeId: selection.member.id, clientId: client.id, title: `${client.name} — ${task.title}`, startsAt, endsAt: new Date(startsAt.getTime() + 1800000), kind: data.confirmed ? "CALL" : "FOLLOW_UP", status: "SCHEDULED", notes: data.confirmed ? "Customer-agreed appointment." : "Internal plan; customer has not confirmed this time." };
  const saved = event ? await tx.teamCalendarEvent.update({ where: { id: event.id }, data: { ...booking, scheduleRevision: { increment: 1 }, version: { increment: 1 } } }) : await tx.teamCalendarEvent.create({ data: { ...booking, workspaceId: actor.workspaceId, creatorId: actor.id, followUpTaskId: task.id } });
  await tx.consultationRequest.updateMany({ where: { taskId: task.id }, data: { assignedMemberId: selection.member.id, calendarEventId: saved.id, preferredCallback: startsAt, status: data.confirmed ? "CALLBACK_SCHEDULED" : "ASSIGNED", version: { increment: 1 } } });
  await queueAppointment(tx, saved);
  await tx.teamComment.create({ data: { taskId: task.id, authorId: actor.id, body: `Schedule changed: ${data.reason}. ${selection.reason}` } });
  await audit(tx, actor, "contact.schedule_changed", client.id, { taskId: task.id, outcome: data.confirmed ? "APPOINTMENT_CONFIRMED" : "INTERNAL_PLAN", discussion: data.reason, nextAt: startsAt.toISOString(), nextAction: selection.reason });
  await notify(tx, selection.member.id, `Call scheduled: ${client.name}`, `/team?workspace=${actor.workspaceId}&module=work-station&task=${task.id}`);
  return { id: task.id, version: task.version, calendarEventId: saved.id, reason: selection.reason };
}

export { appointmentSelect };
