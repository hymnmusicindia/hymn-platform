import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { demand, can, TeamError, type Actor } from "./policy";
import { audit, eligible, notify, taskScope } from "./service";
import { CLIENT_INTERESTS } from "./client-interests";
import { taskSchema } from "./validation";
import { queueAppointment } from "./appointments";
import { reservationEnd, reservationsOverlap } from "./calendar-reservations";
import { importWorkspaceClientAccounts } from "./client-cards";
const id = z.string().min(1).max(80);
const email = z.union([z.string().trim().email().max(320), z.literal("")]).transform(value => value.toLowerCase());
const clientSchema = z.object({ id: id.optional(), version: z.number().int().positive().optional(), name: z.string().trim().min(1).max(160), phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/).default(""), email: email.default(""), secondaryEmail: email.default(""), interests: z.array(z.enum(Object.keys(CLIENT_INTERESTS) as [keyof typeof CLIENT_INTERESTS, ...(keyof typeof CLIENT_INTERESTS)[]])).max(6).default([]), state: z.string().trim().max(100).default(""), city: z.string().trim().max(100).default(""), notes: z.string().trim().max(10000).default(""), ownerId: id, status: z.enum(["ACTIVE", "DO_NOT_CONTACT", "ARCHIVED"]).default("ACTIVE") });
const eventSchema = z.object({ id: id.optional(), version: z.number().int().positive().optional(), title: z.string().trim().min(1).max(200), kind: z.enum(["CALL", "EMAIL", "MEETING", "FOLLOW_UP", "EVENT"]), clientId: id.nullable(), assigneeId: id, startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }).nullish(), notes: z.string().trim().max(10000).default(""), outcome: z.string().trim().max(10000).default(""), status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).default("SCHEDULED"), reminderMinutes: z.number().int().min(0).max(10080).default(30) });
export async function calendarMutation(tx: Prisma.TransactionClient, a: Actor, resource: string, input: unknown) {
  if (resource === "calendar-delete") {
    demand(a, "calendar.manage");
    const data = z.object({ id, version: z.number().int().positive() }).parse(input);
    const event = await tx.teamCalendarEvent.findFirst({ where: { id: data.id, workspaceId: a.workspaceId, status: { not: "DELETED" } } });
    if (!event) throw new TeamError("Event unavailable.", 404);
    if (event.creatorId !== a.id && event.assigneeId !== a.id) demand(a, "tasks.assign");
    if (event.version !== data.version) throw new TeamError("Event changed. Refresh before deleting.", 409);
    // Retain history while removing the event from all calendar views. The
    // schedule revision and status also invalidate queued and claimed reminders.
    await tx.teamCalendarEvent.update({ where: { id: event.id }, data: { status: "DELETED", version: { increment: 1 }, scheduleRevision: { increment: 1 } } });
    await tx.teamAppointmentMessage.updateMany({ where: { eventId: event.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await audit(tx, a, "calendar.deleted", event.id, { title: event.title, assigneeId: event.assigneeId, startsAt: event.startsAt.toISOString() });
    await notify(tx, event.assigneeId, `Event deleted: ${event.title}`, `/team?workspace=${a.workspaceId}&module=calendar`);
    return { id: event.id, deleted: true };
  }
  if (resource === "calendar-handoff") {
    demand(a, "calendar.manage");
    const data = z.object({ id, version: z.number().int().positive(), assigneeId: id, reason: z.string().trim().min(3).max(1000) }).parse(input);
    const event = await tx.teamCalendarEvent.findFirst({ where: { id: data.id, workspaceId: a.workspaceId } });
    if (!event) throw new TeamError("Event unavailable.", 404);
    if (event.assigneeId !== a.id) demand(a, "tasks.assign");
    if (event.version !== data.version) throw new TeamError("Event changed. Refresh first.", 409);
    if (event.kind !== "CALL" || event.status !== "SCHEDULED" || event.startsAt <= new Date()) throw new TeamError("Only upcoming scheduled calls can be passed to another representative.");
    if (event.assigneeId === data.assigneeId) throw new TeamError("Choose a different representative.");
    await eligible(tx, a, [data.assigneeId]);
    const member = await tx.teamMember.findUnique({ where: { id: data.assigneeId } });
    if (member?.availability !== "AVAILABLE") throw new TeamError("Choose an available representative.");
    // Reuse the same slot-conflict, client and schedule validation. Handoff is
    // narrow authority, not permission to assign arbitrary tasks or edit calls.
    const row = await saveEvent(tx, a, { ...event, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt?.toISOString() || null, assigneeId: data.assigneeId }, true);
    await audit(tx, a, "calendar.handoff", event.id, { from: event.assigneeId, to: data.assigneeId, reason: data.reason });
    await notify(tx, event.assigneeId, `Call reassigned: ${event.title}`, `/team?workspace=${a.workspaceId}&module=calendar`);
    return row;
  }
  if (resource === "calendar-task") {
    demand(a, "tasks.create");
    const data = taskSchema.pick({ title: true, description: true, ownerId: true, priority: true }).extend({ startsAt: z.string().datetime({ offset: true }), clientKey: z.string().uuid() }).parse(input);
    if (data.ownerId !== a.id) demand(a, "tasks.assign");
    await eligible(tx, a, [data.ownerId]);
    const eventKey = `calendar-task:${a.workspaceId}:${a.id}:${data.clientKey}`;
    const dueAt = new Date(data.startsAt);
    const prior = await tx.teamTask.findUnique({ where: { eventKey } });
    if (prior) {
      if (prior.title !== data.title || prior.ownerId !== data.ownerId || prior.description !== data.description || prior.priority !== data.priority || prior.dueAt?.getTime() !== dueAt.getTime()) throw new TeamError("This retry key belongs to a different scheduled task.", 409);
      return prior;
    }
    const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: data.ownerId, title: data.title, description: data.description, priority: data.priority, dueAt, eventKey } });
    await audit(tx, a, "calendar.task.created", task.id, { dueAt: dueAt.toISOString(), ownerId: task.ownerId });
    await notify(tx, task.ownerId, `Scheduled task: ${task.title}`, `/team?workspace=${a.workspaceId}&module=work&task=${task.id}`);
    return task;
  }
  if (resource === "clients-save") {
    demand(a, "clients.manage"); const data = clientSchema.parse(input); await eligible(tx, a, [data.ownerId]);
    const old = data.id ? await tx.teamClient.findFirst({ where: { id: data.id, workspaceId: a.workspaceId } }) : null;
    if (data.id && !old) throw new TeamError("Client unavailable.", 404);
    if (old && old.ownerId !== a.id && !can(a, "crm.all")) throw new TeamError("Client unavailable.", 404);
    if (old && old.version !== data.version) throw new TeamError("Client changed. Refresh first.", 409);
    if (data.ownerId !== a.id || old && old.ownerId !== a.id) demand(a, "tasks.assign");
    if (data.secondaryEmail && !data.email) throw new TeamError("Add a primary email before a secondary email.");
    if (data.secondaryEmail && data.secondaryEmail === data.email) throw new TeamError("Primary and secondary emails must be different.");
    const emails = [data.email, data.secondaryEmail].filter(Boolean);
    if (emails.length || data.phone) {
      const duplicate = await tx.teamClient.findFirst({ where: { workspaceId: a.workspaceId, id: { not: data.id }, OR: [...emails.flatMap(value => [{ email: { equals: value, mode: "insensitive" as const } }, { secondaryEmail: { equals: value, mode: "insensitive" as const } }]), ...(data.phone ? [{ phone: data.phone.replace(/[^+\d]/g, "") }] : [])] } });
      if (duplicate) throw new TeamError("A client with this email or phone already exists. Use the existing card.", 409);
    }
    const fields = { name: data.name, phone: data.phone.replace(/[^+\d]/g, ""), email: data.email, secondaryEmail: data.secondaryEmail, interests: [...new Set(data.interests)], state: data.state, city: data.city, notes: data.notes, ownerId: data.ownerId, status: data.status };
    const row = old ? await tx.teamClient.update({ where: { id: old.id }, data: { ...fields, version: { increment: 1 } } }) : await tx.teamClient.create({ data: { ...fields, workspaceId: a.workspaceId } });
    if (data.status !== "ACTIVE") await tx.teamCalendarEvent.updateMany({ where: { clientId: row.id, status: "SCHEDULED", startsAt: { gte: new Date() } }, data: { status: "CANCELLED", version: { increment: 1 } } });
    const registered = emails.length ? await tx.user.count({ where: { OR: emails.map(value => ({ email: { equals: value, mode: "insensitive" } })) } }) : 0;
    if (row.email && row.status === "ACTIVE" && !registered) await tx.teamClientWelcome.createMany({ data: [{ clientId: row.id, email: row.email }], skipDuplicates: true });
    await audit(tx, a, old ? "client.updated" : "client.created", row.id, { status: row.status }); return row;
  }
  return saveEvent(tx, a, input);
}
async function saveEvent(tx: Prisma.TransactionClient, a: Actor, input: unknown, handoff = false) {
  demand(a, "calendar.manage"); const data = eventSchema.parse(input);
  const old = data.id ? await tx.teamCalendarEvent.findFirst({ where: { id: data.id, workspaceId: a.workspaceId } }) : null;
  if (data.id && !old) throw new TeamError("Event unavailable.", 404);
  if (old?.status === "DELETED") throw new TeamError("This event was deleted.", 404);
  if (old && old.version !== data.version) throw new TeamError("Event changed. Refresh first.", 409);
  if (!handoff && (data.assigneeId !== a.id || old && old.assigneeId !== a.id && old.creatorId !== a.id)) demand(a, "tasks.assign");
  await eligible(tx, a, [data.assigneeId]);
  if (data.clientId) {
    demand(a, "clients.view"); const client = await tx.teamClient.findFirst({ where: { id: data.clientId, workspaceId: a.workspaceId } });
    if (!client || client.status !== "ACTIVE" || (!can(a, "crm.all") && client.ownerId !== a.id)) throw new TeamError("Choose an active client assigned to you; do-not-contact and archived clients cannot be scheduled.");
  }
  if (["CALL", "EMAIL", "FOLLOW_UP"].includes(data.kind) && !data.clientId) throw new TeamError("Link a client card for client outreach.");
  const startsAt = new Date(data.startsAt), endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (endsAt && (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 7 * 86400000)) throw new TeamError("Choose an end after the start, within seven days.");
  if (data.status === "COMPLETED" && !data.outcome.trim()) throw new TeamError("Record the outcome before completing the event.");
  if (data.status === "SCHEDULED") {
    const slot = { kind: data.kind, startsAt, endsAt };
    const nearby = await tx.teamCalendarEvent.findMany({ where: { workspaceId: a.workspaceId, assigneeId: data.assigneeId, id: { not: data.id }, status: "SCHEDULED", startsAt: { gte: new Date(startsAt.getTime() - 7 * 86400000), lt: reservationEnd(slot) } }, select: { kind: true, startsAt: true, endsAt: true } });
    if (nearby.some(event => reservationsOverlap(slot, event))) throw new TeamError("This teammate has an overlapping reservation. Calls reserve 30 minutes from their start; choose a free slot or another representative.", 409);
  }
  const fields = { title: data.title, kind: data.kind, clientId: data.clientId, assigneeId: data.assigneeId, startsAt, endsAt, notes: data.notes, outcome: data.outcome, status: data.status, reminderMinutes: data.reminderMinutes, ...(old && (old.startsAt.getTime() !== startsAt.getTime() || old.assigneeId !== data.assigneeId || old.reminderMinutes !== data.reminderMinutes) ? { remindedAt: null } : {}) };
  const scheduleChanged = !old || old.assigneeId !== data.assigneeId || old.clientId !== data.clientId || old.kind !== data.kind || old.status !== data.status || old.startsAt.getTime() !== startsAt.getTime();
  const row = old ? await tx.teamCalendarEvent.update({ where: { id: old.id }, data: { ...fields, version: { increment: 1 }, ...(scheduleChanged ? { scheduleRevision: { increment: 1 } } : {}) } }) : await tx.teamCalendarEvent.create({ data: { ...fields, workspaceId: a.workspaceId, creatorId: a.id } });
  if (scheduleChanged) await queueAppointment(tx, row);
  await audit(tx, a, old ? "calendar.updated" : "calendar.created", row.id, { status: row.status, kind: row.kind });
  if (!old || old.assigneeId !== row.assigneeId || old.startsAt.getTime() !== row.startsAt.getTime()) await notify(tx, row.assigneeId, `Scheduled: ${row.title} · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata", hour12: true }).format(row.startsAt)} IST`, `/team?workspace=${a.workspaceId}&module=calendar`);
  return row;
}
export async function remindCalendarTasks(tx: Prisma.TransactionClient, a: Actor, now: Date) {
  const tasks = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { gte: new Date(now.getTime() - 15 * 60000), lte: new Date(now.getTime() + 15 * 60000) }, owner: { status: "ACTIVE", user: { status: "ACTIVE" } } }, take: 1000 });
  for (const task of tasks) {
    const eventKey = `calendar-task-reminder:${task.id}:${task.dueAt!.toISOString()}`;
    if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey } })) continue;
    await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey } });
    await notify(tx, task.ownerId, `Task due soon: ${task.title}`, `/team?workspace=${a.workspaceId}&module=work&task=${task.id}`);
  }
}

export async function calendarRead(a: Actor, resource: string, params: URLSearchParams) {
  if (resource === "client-account-match") {
    demand(a, "clients.manage");
    const emails = z.array(z.string().trim().email().max(320)).max(2).parse(params.getAll("email"));
    return { accounts: await prisma.user.findMany({ where: { clientCards: { some: { workspaceId: a.workspaceId, ...(!can(a, "crm.all") ? { ownerId: a.id } : {}) } }, OR: emails.map(value => ({ email: { equals: value, mode: "insensitive" } })) }, select: { email: true, name: true, avatar: true } }) };
  }
  if (resource === "clients") {
    demand(a, "clients.view"); const q = (params.get("q") || "").trim().slice(0, 160); const offset = z.coerce.number().int().min(0).max(100000).parse(params.get("offset") || 0);
    if (can(a, "crm.all")) await importWorkspaceClientAccounts(a.workspaceId);
    const where = { workspaceId: a.workspaceId, ...(!can(a, "crm.all") ? { ownerId: a.id } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { secondaryEmail: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }, { state: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] } : {}) };
    const items = await prisma.teamClient.findMany({ where, take: 100, skip: offset, orderBy: { updatedAt: "desc" }, include: { welcomeJobs: { select: { email: true, status: true } }, user: { select: { id: true, name: true, email: true } } } });
    const emails = items.flatMap(c => [c.email, c.secondaryEmail]).filter(Boolean);
    const accounts = emails.length ? await prisma.user.findMany({ where: { OR: emails.map(value => ({ email: { equals: value, mode: "insensitive" as const } })) }, select: { email: true, name: true, avatar: true } }) : [];
    return { items: items.map(client => ({ ...client, accounts: accounts.filter(account => [client.email, client.secondaryEmail].includes(account.email.toLowerCase())) })), total: await prisma.teamClient.count({ where }) };
  }
  demand(a, "calendar.view");
  const start = z.string().datetime({ offset: true }).parse(params.get("start")), end = z.string().datetime({ offset: true }).parse(params.get("end"));
  if (new Date(end) <= new Date(start) || Date.parse(end) - Date.parse(start) > 93 * 86400000) throw new TeamError("Calendar range must be between one and 93 days.");
  const where = { workspaceId: a.workspaceId, status: { not: "DELETED" }, startsAt: { lt: new Date(end) }, OR: [{ endsAt: { gt: new Date(start) } }, { endsAt: null, startsAt: { gte: new Date(start) } }] };
  const [items, total, deadlines] = await Promise.all([
    prisma.teamCalendarEvent.findMany({ where, take: 1000, orderBy: { startsAt: "asc" }, include: { client: can(a, "clients.view") ? true : false, appointmentMessages: { where: { status: { not: "CANCELLED" } }, select: { kind: true, status: true, dueAt: true, error: true } } } }),
    prisma.teamCalendarEvent.count({ where }),
    prisma.teamTask.findMany({ where: { ...taskScope(a), dueAt: { gte: new Date(start), lt: new Date(end) }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, take: 1000, orderBy: { dueAt: "asc" }, select: { id: true, title: true, dueAt: true, ownerId: true, priority: true, status: true } })
  ]);
  return { items: items.map(item => ({ ...item, ...(item.client && !can(a, "crm.all") && item.client.ownerId !== a.id ? { client: null } : {}) })), total, deadlines };
}
