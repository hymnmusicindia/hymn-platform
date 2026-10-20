import { Prisma } from "@prisma/client";
import { can, type Actor } from "./policy";

export type CrmPreferences = { researchTarget?: number; callTarget?: number; caller?: boolean; workRole?: "researcher" | "caller" };
export function crmPreferences(value: Prisma.JsonValue): CrmPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const crm = value.crm;
  return crm && typeof crm === "object" && !Array.isArray(crm) ? crm as CrmPreferences : {};
}

// Caller selection runs inside the existing workspace-locked write transaction.
export async function nextCaller(tx: Prisma.TransactionClient, actor: Actor) {
  const members = await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", availability: "AVAILABLE", role: { owner: false }, user: { status: "ACTIVE" } }, include: { role: true }, orderBy: { id: "asc" } });
  const callers = members.filter(member => crmPreferences(member.preferences).caller && can(member, "crm.outreach.manage") && can(member, "crm.prospects.view"));
  if (!callers.length) return null;
  const previous = await tx.leadOwnershipEvent.findFirst({ where: { lead: { workspaceId: actor.workspaceId }, reason: "Automatic caller rotation." }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return callers[(callers.findIndex(member => member.id === previous?.newEmployeeId) + 1) % callers.length];
}
