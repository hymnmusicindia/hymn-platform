import 'server-only';
import { Prisma } from '@prisma/client';
import { whatsappNumber } from './phone';
import { employeeCallSlot } from './availability';
import { queueAppointment } from './appointments';
import { TeamError, type Actor } from './policy';
import { internalIdentities, matchesInternalIdentity, type InternalIdentities } from './internal-identity';
export async function callbackSlot(tx: Prisma.TransactionClient, workspaceId: string, memberId: string, after: Date, taskId?: string) {
  const slot = await employeeCallSlot(tx,workspaceId,memberId,after,undefined,taskId);
  if (!slot) throw new TeamError('No declared free callback slot within 14 days. Submit weekly availability or choose another representative.', 409);
  return slot;
}
export async function syncCallbackCalendar(tx: Prisma.TransactionClient, a: Actor, task: { id: string; title: string; ownerId: string; clientId: string | null; dueAt: Date | null; status: string; description: string }) {
  const status = ['COMPLETED', 'CANCELLED', 'BLOCKED'].includes(task.status) ? 'CANCELLED' : 'SCHEDULED';
  const old = await tx.teamCalendarEvent.findUnique({ where: { followUpTaskId: task.id } });
  if (!task.dueAt || !task.clientId) {
    if(old&&status==='CANCELLED'){const event=await tx.teamCalendarEvent.update({where:{id:old.id},data:{status:'CANCELLED',version:{increment:1},scheduleRevision:{increment:1}}});await queueAppointment(tx,event);}
    return;
  }
  const data = { title: task.title, assigneeId: task.ownerId, clientId: task.clientId, startsAt: task.dueAt, endsAt: new Date(task.dueAt.getTime() + 30 * 60000), status, kind: 'FOLLOW_UP', notes: `Internal suggested callback; no customer appointment is confirmed.\n${task.description}` };
  if (!old && status === 'SCHEDULED') {const event=await tx.teamCalendarEvent.create({ data: { ...data, workspaceId: a.workspaceId, creatorId: a.id, followUpTaskId: task.id } });await queueAppointment(tx,event);}
  else if (old) {
    const changed=old.assigneeId!==data.assigneeId||old.startsAt.getTime()!==data.startsAt.getTime()||old.status!==data.status;
    const event=await tx.teamCalendarEvent.update({ where: { id: old.id }, data: { ...data, remindedAt: null, version: { increment: 1 }, ...(changed?{scheduleRevision:{increment:1}}:{}) } });
    if(changed)await queueAppointment(tx,event);
  }
}
export async function syncProspectCallCalendar(tx: Prisma.TransactionClient, a: Actor, prospectId: string, now = new Date(), staff?: InternalIdentities) {
  const prospect = await tx.teamProspect.findFirst({ where: { id: prospectId, workspaceId: a.workspaceId }, include: { owner: { include: { role: true, user: { select: { status: true } } } } } });
  if (!prospect?.clientId) return;
  const task = await tx.teamTask.findUnique({ where: { eventKey: `${prospect.id}:call` } });
  if (!task) return;
  const internal = matchesInternalIdentity(staff ?? await internalIdentities(tx), prospect);
  if (internal) await tx.teamTask.updateMany({ where: { id: task.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, data: { status: 'CANCELLED', blocker: 'Internal team member: customer sales follow-up is not applicable.', version: { increment: 1 } } });
  const terminal = !whatsappNumber(prospect.phone) || prospect.suppressed || !prospect.verified || !['CONSENTED', 'LEGITIMATE_INTEREST'].includes(prospect.contactEligibility) || ['CONVERTED','LOST','NOT_INTERESTED','UNQUALIFIED','DUPLICATE','DO_NOT_CONTACT'].includes(prospect.stage);
  if (internal || terminal || task.archivedAt || ['COMPLETED','CANCELLED'].includes(task.status)) {
    await tx.teamCalendarEvent.updateMany({ where: { followUpTaskId: task.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', version: { increment: 1 } } }); return;
  }
  if (prospect.owner.status !== 'ACTIVE' || prospect.owner.user.status !== 'ACTIVE' || prospect.owner.availability !== 'AVAILABLE' || prospect.owner.role.owner || !prospect.owner.role.permissions.includes('crm.outreach.manage')) return;
  const desired = prospect.followUpAt && prospect.followUpAt > now ? prospect.followUpAt : new Date(now.getTime() + 3600000);
  const old = await tx.teamCalendarEvent.findUnique({ where: { followUpTaskId: task.id } });
  if (old?.status === 'SCHEDULED' && old.assigneeId === prospect.ownerId && (!prospect.followUpAt || old.startsAt.getTime() === prospect.followUpAt.getTime())) return;
  const dueAt = await callbackSlot(tx, a.workspaceId, prospect.ownerId, desired, task.id);
  const updated = await tx.teamTask.update({ where: { id: task.id }, data: { clientId: prospect.clientId, ownerId: prospect.ownerId, dueAt, description: `CRM follow-up for ${prospect.name}.\n${prospect.buyingSignal}\n${prospect.notes}`, version: { increment: 1 } } });
  await tx.teamProspect.update({ where: { id: prospect.id }, data: { followUpAt: dueAt, version: { increment: 1 } } });
  await syncCallbackCalendar(tx, a, updated);
}
