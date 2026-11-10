import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TeamError, type Actor } from "./policy";
import { audit } from "./service";
import { meetingSchema } from "./meeting-policy";
import { reservationsOverlap } from "./calendar-reservations";

function owner(actor: Actor) {
  if (!actor.role.owner) throw new TeamError("Only a workspace owner can schedule Google meetings.", 403);
}
const select = { id: true, title: true, startsAt: true, endsAt: true, status: true, version: true, meetingAttendees: true, meetingDescription: true, googleSyncStatus: true, googleSyncError: true, googleMeetUrl: true, googleCalendarUrl: true } satisfies Prisma.TeamCalendarEventSelect;

export async function meetingRead(actor: Actor) {
  owner(actor);
  return { items: await prisma.teamCalendarEvent.findMany({ where: { workspaceId: actor.workspaceId, meetingRequestKey: { not: null }, status: { not: "DELETED" } }, select, orderBy: { startsAt: "desc" }, take: 50 }) };
}

export async function meetingMutation(tx: Prisma.TransactionClient, actor: Actor, resource: string, input: unknown) {
  owner(actor);
  if (resource === "meeting-cancel") {
    const data = z.object({ id: z.string().min(1).max(80), version: z.number().int().positive() }).parse(input);
    const event = await tx.teamCalendarEvent.findFirst({ where: { id: data.id, workspaceId: actor.workspaceId, meetingRequestKey: { not: null } } });
    if (!event) throw new TeamError("Meeting unavailable.", 404);
    if (event.status === "CANCELLED") return event;
    if (event.version !== data.version) throw new TeamError("Meeting changed. Refresh first.", 409);
    if (event.status !== "SCHEDULED") throw new TeamError("This meeting cannot be cancelled.", 409);
    const saved = await tx.teamCalendarEvent.update({ where: { id: event.id }, data: { status: "CANCELLED", version: { increment: 1 }, scheduleRevision: { increment: 1 }, googleSyncStatus: "PENDING", googleSyncAfter: null, googleSyncAttempts: 0 } });
    await audit(tx, actor, "meeting.cancelled", event.id);
    return saved;
  }
  const data = meetingSchema.parse(input);
  const meetingRequestKey = `${actor.workspaceId}:${actor.id}:${data.requestKey}`;
  const existing = await tx.teamCalendarEvent.findUnique({ where: { meetingRequestKey } });
  const startsAt = new Date(data.startsAt), endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60000);
  if (existing) {
    if (existing.title !== data.title || existing.startsAt.getTime() !== startsAt.getTime() || existing.endsAt?.getTime() !== endsAt.getTime() || existing.meetingDescription !== data.description || JSON.stringify(existing.meetingAttendees) !== JSON.stringify(data.attendees)) throw new TeamError("This request was already used for different meeting details. Refresh before creating another meeting.", 409);
    return existing;
  }
  if (startsAt <= new Date() || startsAt.getTime() > Date.now() + 366 * 86400000) throw new TeamError("Choose a future meeting within the next year.");
  const slot = { kind: "MEETING", startsAt, endsAt };
  const nearby = await tx.teamCalendarEvent.findMany({ where: { workspaceId: actor.workspaceId, assigneeId: actor.id, status: "SCHEDULED", startsAt: { gte: new Date(startsAt.getTime() - 7 * 86400000), lt: endsAt } }, select: { kind: true, startsAt: true, endsAt: true } });
  if (nearby.some(event => reservationsOverlap(slot, event))) throw new TeamError("You already have a meeting or call at this time. Choose a free time.", 409);
  const connected = await tx.teamGoogleCalendar.count({ where: { workspaceId: actor.workspaceId } });
  const event = await tx.teamCalendarEvent.create({ data: { workspaceId: actor.workspaceId, creatorId: actor.id, assigneeId: actor.id, title: data.title, kind: "MEETING", startsAt, endsAt, meetingAttendees: data.attendees, meetingDescription: data.description, meetingRequestKey, googleSyncStatus: connected ? "PENDING" : "WAITING_CONNECTION" } });
  await audit(tx, actor, "meeting.requested", event.id, { attendeeCount: data.attendees.length, startsAt: startsAt.toISOString() });
  return event;
}
