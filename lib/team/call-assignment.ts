import "server-only";
import type { Prisma } from "@prisma/client";
import { can } from "./policy";
import { acceptsAssignmentsNow } from "./availability-rules";
import { callSlotFromSnapshot } from "./call-capacity";
import { callTaskWhere } from "./daily-call-policy";
import { indiaWorkday } from "./daily-work";
import { callWorkload } from "./call-workload";
import { callLoadScore } from "./call-allocation";
import { expertiseScore } from "@/lib/consultation-domain";

export async function loadCallAllocation(tx: Prisma.TransactionClient, workspaceId: string, after: Date, eventId?: string, taskId?: string) {
  const until = new Date(after.getTime() + 14 * 86400000);
  const members = await tx.teamMember.findMany({ where: { workspaceId, status: "ACTIVE", availability: "AVAILABLE", user: { status: "ACTIVE" }, role: { owner: false } }, include: { role: true, user: { select: { name: true } } }, orderBy: { id: "asc" } });
  const ids = members.map(member => member.id);
  const [workload, events, tasks] = await Promise.all([
    callWorkload(tx, workspaceId, ids),
    tx.teamCalendarEvent.findMany({ where: { workspaceId, assigneeId: { in: ids }, status: { in: ["SCHEDULED", "COMPLETED"] }, ...(eventId ? { id: { not: eventId } } : {}), ...(taskId ? { OR: [{ followUpTaskId: null }, { followUpTaskId: { not: taskId } }] } : {}), startsAt: { gte: new Date(after.getTime() - 7 * 86400000), lt: until } }, select: { assigneeId: true, followUpTaskId: true, kind: true, startsAt: true, endsAt: true, status: true } }),
    tx.teamTask.findMany({ where: { workspaceId, ownerId: { in: ids }, archivedAt: null, status: { not: "CANCELLED" }, ...(taskId ? { id: { not: taskId } } : {}), dueAt: { gte: indiaWorkday(after).start, lt: until }, ...callTaskWhere }, select: { ownerId: true, dueAt: true } })
  ]);
  return { members, workload, events, tasks, until };
}
export async function allocateCustomerCall(tx: Prisma.TransactionClient, options: { snapshot?: Awaited<ReturnType<typeof loadCallAllocation>>; workspaceId: string; after: Date; exact?: boolean; preferredMemberId?: string; onlyMemberId?: string; exclude?: string[]; interests?: string[]; eventId?: string; taskId?: string; consultation?: boolean; callerRotation?: boolean; rotationAfterId?: string; now?: Date }) {
  const snapshot = options.snapshot || await loadCallAllocation(tx, options.workspaceId, options.after, options.eventId, options.taskId);
  const members = snapshot.members.filter(member => (!options.onlyMemberId || member.id === options.onlyMemberId) && !options.exclude?.includes(member.id));
  const eligible = members.filter(member => {
    const crm = (member.preferences as { crm?: { caller?: boolean; workRole?: string } } | null)?.crm;
    return can(member, "crm.outreach.manage") && can(member, "calendar.manage") && can(member, "tasks.update") && (!options.consultation || can(member, "crm.prospects.view")) && (!options.callerRotation || crm?.caller || crm?.workRole === "caller" || /call representative/i.test(member.role.name)) && acceptsAssignmentsNow(member.preferences, options.now);
  });
  const offset = (eligible.findIndex(member => member.id === options.rotationAfterId) + 1) % (eligible.length || 1);
  const rotated = [...eligible.slice(offset), ...eligible.slice(0, offset)];
  const order = new Map(rotated.map((member, index) => [member.id, index]));
  const workload = snapshot.workload;
  const expertise = (member: typeof eligible[number]) => expertiseScore({ ...member, name: member.user.name, load: 0, lastAssignedAt: 0 }, options.interests || []);
  eligible.sort((a, b) => Number(b.id === options.preferredMemberId) - Number(a.id === options.preferredMemberId) || expertise(b) - expertise(a) || callLoadScore(a.preferences, workload.get(a.id) || 0) - callLoadScore(b.preferences, workload.get(b.id) || 0) || (order.get(a.id) || 0) - (order.get(b.id) || 0));
  for (const member of eligible) {
    const reservations = snapshot.events.filter(event => event.assigneeId === member.id && event.status === "SCHEDULED");
    const dates = [...snapshot.tasks.filter(task => task.ownerId === member.id && task.dueAt).map(task => task.dueAt!), ...snapshot.events.filter(event => event.assigneeId === member.id && !event.followUpTaskId && ["CALL", "FOLLOW_UP"].includes(event.kind)).map(event => event.startsAt)];
    const slot = callSlotFromSnapshot(member.preferences, options.after, reservations, dates, snapshot.until);
    if (!slot || options.exact && slot.getTime() !== options.after.getTime()) continue;
    return { member, startsAt: slot, reason: `${member.id === options.preferredMemberId ? "Existing responsible teammate; " : ""}qualified, available, and within shared call capacity (${workload.get(member.id) || 0} open calls).` };
  }
  return null;
}
