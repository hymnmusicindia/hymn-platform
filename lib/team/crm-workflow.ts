import { Prisma } from "@prisma/client";
import { can, type Actor } from "./policy";
import { activeWindows, acceptsAssignmentsNow } from './availability-rules';

export type CrmPreferences = { researchTarget?: number; callTarget?: number; caller?: boolean; workRole?: "researcher" | "caller" };
export function crmPreferences(value: Prisma.JsonValue): CrmPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const crm = value.crm;
  return crm && typeof crm === "object" && !Array.isArray(crm) ? crm as CrmPreferences : {};
}

// Caller selection runs inside the existing workspace-locked write transaction.
export async function nextCaller(tx: Prisma.TransactionClient, actor: Actor, now=new Date()) {
  const members = await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", availability: "AVAILABLE", role: { owner: false }, user: { status: "ACTIVE" } }, include: { role: true }, orderBy: { id: "asc" } });
  const callers = members.filter(member => (crmPreferences(member.preferences).caller || crmPreferences(member.preferences).workRole === "caller" || /call representative/i.test(member.role.name)) && can(member, "crm.outreach.manage") && can(member, "crm.prospects.view") && acceptsAssignmentsNow(member.preferences,now) && activeWindows(member.preferences,now,new Date(now.getTime()+14*86400000)).length>0);
  if (!callers.length) return null;
  const previous = await tx.leadOwnershipEvent.findFirst({ where: { lead: { workspaceId: actor.workspaceId }, reason: "Automatic caller rotation." }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return callers[(callers.findIndex(member => member.id === previous?.newEmployeeId) + 1) % callers.length];
}
