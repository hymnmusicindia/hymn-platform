import { Prisma } from "@prisma/client";
import { type Actor } from "./policy";
import { allocateCustomerCall } from './call-assignment';

export type CrmPreferences = { researchTarget?: number; callTarget?: number; caller?: boolean; workRole?: "researcher" | "caller" };
export function crmPreferences(value: Prisma.JsonValue): CrmPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const crm = value.crm;
  return crm && typeof crm === "object" && !Array.isArray(crm) ? crm as CrmPreferences : {};
}

// Caller selection runs inside the existing workspace-locked write transaction.
export async function nextCaller(tx: Prisma.TransactionClient, actor: Actor, now=new Date()) {
  const previous = await tx.leadOwnershipEvent.findFirst({ where: { lead: { workspaceId: actor.workspaceId }, reason: "Automatic caller rotation." }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return (await allocateCustomerCall(tx, { workspaceId: actor.workspaceId, after: now, now, callerRotation: true, consultation: true, rotationAfterId: previous?.newEmployeeId || undefined }))?.member || null;
}
