import { Prisma } from "@prisma/client";
import { roleTemplates, TeamError, type Actor } from "./policy";
import { syncDailyCrmWork } from "./daily-work";

// Called only by the explicit operator rollout. No account is granted membership
// or found by display name; the operator supplies verified existing member IDs.
export async function configureCrmProgramme(tx: Prisma.TransactionClient, actor: Actor, researcherIds: string[], callerId: string) {
  if (!actor.role.owner) throw new TeamError("Owner required.", 403);
  const ids = [...researcherIds, callerId];
  if (researcherIds.length !== 3 || new Set(ids).size !== 4) throw new TeamError("Specify three distinct researchers and one call representative.");
  const staff = await tx.teamMember.findMany({ where: { id: { in: ids }, workspaceId: actor.workspaceId, status: "ACTIVE", role: { owner: false }, user: { status: "ACTIVE" } }, include: { role: true } });
  if (staff.length !== 4) throw new TeamError("All four IDs must be active existing employees; owners cannot receive work.");
  const roles = new Map<string, string>();
  for (const name of ["Researcher", "Call Representative"]) {
    const existing = await tx.teamRole.findFirst({ where: { workspaceId: actor.workspaceId, name } });
    if (existing?.owner) throw new TeamError("The employee role name conflicts with an owner role.");
    const role = existing ? await tx.teamRole.update({ where: { id: existing.id }, data: { permissions: roleTemplates[name] } }) : await tx.teamRole.create({ data: { workspaceId: actor.workspaceId, name, permissions: roleTemplates[name] } });
    roles.set(name, role.id);
  }
  for (const member of staff) {
    const researcher = researcherIds.includes(member.id);
    const previous = member.preferences && typeof member.preferences === "object" && !Array.isArray(member.preferences) ? member.preferences : {};
    const crm = { workRole: researcher ? "researcher" : "caller", researchTarget: researcher ? 15 : 0, callTarget: researcher ? 0 : 45, caller: !researcher };
    await tx.teamMember.update({ where: { id: member.id }, data: { roleId: roles.get(researcher ? "Researcher" : "Call Representative")!, jobTitle: researcher ? "Lead Researcher" : "Call Representative", department: "Growth & Client Success", preferences: { ...previous, crm }, responsibilities: researcher ? "Add 15 unique, verified, contactable leads every India calendar day and hand them to the call representative through CRM." : "Work the combined research queue (up to 45 new leads daily), make calls or reviewed emails, record contact evidence and schedule follow-ups." } });
    await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: "crm.employee_programme_configured", entityId: member.id, detail: { previousRoleId: member.roleId, crm } } });
    const eventKey = `${member.id}:crm-workflow-onboarding`;
    await tx.teamTask.upsert({ where: { eventKey }, create: { workspaceId: actor.workspaceId, creatorId: actor.id, ownerId: member.id, eventKey, title: researcher ? "Learn the research and handoff workflow" : "Prepare the call and follow-up workflow", description: researcher ? "Open the Team Guide. Review what counts as a lead, collect real public contact sources, verify email/phone and outreach eligibility, add your first contact in Contacts & Calls, and confirm the caller assignment. Use the daily progress card to track 15 verified contactable leads." : "Open the Team Guide and Call queue. Check source evidence and opt-outs, prepare a brief service introduction, review the individual email template tools, learn call notes, WhatsApp and next-call scheduling, and work eligible leads as researchers submit them. No customer leads have been fabricated." }, update: {} });
    // Supersede the old role-specific onboarding; retain its full history.
    const previousOnboarding = await tx.teamTask.findUnique({ where: { eventKey: `${member.id}:onboarding` } });
    if (previousOnboarding && !["COMPLETED", "CANCELLED"].includes(previousOnboarding.status)) {
      await tx.teamTask.update({ where: { id: previousOnboarding.id }, data: { status: "CANCELLED", blocker: "Superseded by the owner-approved daily CRM programme.", recurrenceDays: null, version: { increment: 1 } } });
      await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: "crm.onboarding_superseded", entityId: previousOnboarding.id, detail: { replacement: eventKey } } });
    }
  }
  const owners = await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId, role: { owner: true } } });
  const ownerIds = owners.map(member => member.id);
  for (const owner of owners) {
    const previous = owner.preferences && typeof owner.preferences === "object" && !Array.isArray(owner.preferences) ? owner.preferences : {};
    await tx.teamMember.update({ where: { id: owner.id }, data: { preferences: { ...previous, crm: { researchTarget: 0, callTarget: 0, caller: false } } } });
  }
  const ownerTasks = await tx.teamTask.findMany({ where: { workspaceId: actor.workspaceId, ownerId: { in: ownerIds }, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { createdAt: "asc" } });
  const seen = new Set<string>(); let reassigned = 0, duplicates = 0;
  for (const task of ownerTasks) {
    const key = task.recordType && task.recordId ? `${task.title}:${task.recordType}:${task.recordId}` : task.id;
    const duplicate = seen.has(key);
    if (duplicate) {
      await tx.teamTask.update({ where: { id: task.id }, data: { status: "CANCELLED", recurrenceDays: null, blocker: "Duplicate operational assignment consolidated during the owner-exempt CRM rollout.", version: { increment: 1 } } });
      duplicates++;
    } else {
      seen.add(key);
      await tx.teamTask.update({ where: { id: task.id }, data: { ownerId: researcherIds[reassigned % researcherIds.length], ...(task.recordType ? { title: `Research handoff: ${task.title}`.slice(0, 200), description: `${task.description}\n\nCollect and verify the requested information, attach source-backed evidence, and submit it for owner review. This research assignment does not grant profile-editing, publishing, payment or other final business permissions.` } : {}), recurrenceDays: null, version: { increment: 1 } } });
      reassigned++;
    }
    await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: duplicate ? "crm.owner_work_consolidated" : "crm.owner_work_reassigned", entityId: task.id, detail: { previousOwnerId: task.ownerId, reason: "Explicit owner instruction: owners supervise; employees perform operational work." } } });
  }
  await tx.teamWorkflowRule.updateMany({ where: { workspaceId: actor.workspaceId, ownerId: { in: ownerIds } }, data: { enabled: false } });
  return { researchers: researcherIds.length, callers: 1, reassigned, duplicates, ...await syncDailyCrmWork(tx, actor) };
}
