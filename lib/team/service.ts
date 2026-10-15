import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, demand, TeamError, statuses, onboardingTemplates, assertAcyclic, assertTaskTransition, weekStartIndia, type Actor, type Permission } from "./policy";
import { taskSchema, taskUpdateSchema, projectSchema, inviteSchema, roleSchema, prospectSchema, prospectUpdateSchema, outreachSchema, messageSchema, channelSchema, reportSchema } from "./validation";

type Tx = Prisma.TransactionClient;
export const memberSelect = { id: true, department: true, jobTitle: true, responsibilities: true, managerId: true, lastActiveAt: true, availability: true, status: true, joinedAt: true, user: { select: { name: true, avatar: true, email: true } }, role: { select: { name: true } } } satisfies Prisma.TeamMemberSelect;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const taskScope = (a: Actor): Prisma.TeamTaskWhereInput => ({ workspaceId: a.workspaceId, archivedAt: null, ...(!can(a, "tasks.all") ? { OR: [{ ownerId: a.id }, { creatorId: a.id }, { collaboratorIds: { has: a.id } }, { project: { memberIds: { has: a.id } } }] } : {}) });
export const projectScope = (a: Actor): Prisma.TeamProjectWhereInput => ({ workspaceId: a.workspaceId, ...(!can(a, "tasks.all") ? { memberIds: { has: a.id } } : {}) });
export const prospectScope = (a: Actor): Prisma.TeamProspectWhereInput => ({ workspaceId: a.workspaceId, ...(!can(a, "crm.all") ? { ownerId: a.id } : {}) });
export const channelScope = (a: Actor): Prisma.TeamChannelWhereInput => ({ workspaceId: a.workspaceId, OR: [{ private: false }, { memberIds: { has: a.id } }] });
export async function audit(tx: Tx, a: Actor, action: string, entityId: string, detail: Prisma.InputJsonValue = {}) { await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action, entityId, detail } }); }
export async function notify(tx: Tx, memberId: string, title: string, href = "/team?module=work") { const member = await tx.teamMember.findUnique({ where: { id: memberId }, select: { preferences: true, status: true } }); if (member?.status !== "ACTIVE" || (member.preferences as { notifications?: boolean }).notifications === false) return; await tx.teamNotification.create({ data: { memberId, title, href } }); }
export async function eligible(tx: Tx, a: Actor, ids: string[]) {
  if (new Set(ids).size !== ids.length || await tx.teamMember.count({ where: { workspaceId: a.workspaceId, id: { in: ids }, status: "ACTIVE", user: { status: "ACTIVE" } } }) !== ids.length) throw new TeamError("Choose active members of this workspace.");
}
export async function teamWrite<T>(identity: Actor, execute: (tx: Tx, a: Actor) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    // One workspace lock serialises revocations, permissions, dependency changes
    // and message retries. No production business table is locked or mutated.
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${identity.workspaceId} FOR UPDATE`;
    const a = await tx.teamMember.findUnique({ where: { id: identity.id }, include: { role: true, user: { select: { status: true } } } });
    if (!a || a.workspaceId !== identity.workspaceId || a.status !== "ACTIVE" || a.user.status !== "ACTIVE") throw new TeamError("Team access has been revoked.", 403);
    await tx.teamMember.update({ where: { id: a.id }, data: { lastActiveAt: new Date() } });
    return execute(tx, a);
  }, { maxWait: 10000, timeout: 30000 });
}
export async function validateLink(tx: Tx, a: Actor, type?: string | null, id?: number | null) {
  if (!type && !id) return;
  if (!type || !id) throw new TeamError("Choose both a record type and ID.");
  const permission: Record<string, Permission> = { beat: "operations.beats.manage", release: "operations.distribution.review", engineer: "operations.engineers.manage", studio: "operations.studio.review" };
  demand(a, permission[type]);
  if (!a.role.owner && ["release", "studio"].includes(type) && !await tx.teamTask.findFirst({ where: { ...taskScope(a), recordType: type, recordId: id } })) throw new TeamError("This operational record must first be assigned by the owner.", 403);
  const record = type === "beat" ? await tx.beat.findUnique({ where: { id }, select: { id: true } }) : type === "release" ? await tx.release.findUnique({ where: { id }, select: { id: true } }) : type === "engineer" ? await tx.engineerProfile.findUnique({ where: { id }, select: { id: true } }) : await tx.studioServiceOrder.findUnique({ where: { id }, select: { id: true } });
  if (!record) throw new TeamError("The linked HYMN record does not exist.");
}
export async function taskAccess(tx: Tx, a: Actor, id: string) {
  const task = await tx.teamTask.findFirst({ where: { ...taskScope(a), id } });
  if (!task) throw new TeamError("Task not found or not accessible.", 404);
  return task;
}
async function dependencies(tx: Tx, a: Actor, id: string, ids: string[]) {
  if (ids.length && await tx.teamTask.count({ where: { ...taskScope(a), id: { in: ids } } }) !== new Set(ids).size) throw new TeamError("A dependency is unavailable.");
  const graph = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId }, select: { id: true, dependencyIds: true } });
  assertAcyclic(id, ids, new Map(graph.map(row => [row.id, row.dependencyIds])));
}

export async function teamMutation(identity: Actor, resource: string, input: unknown) {
  return teamWrite(identity, async (tx, a) => {
    const object = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const id = typeof object.id === "string" ? object.id : "";
    if (resource === "tasks") {
      demand(a, "tasks.create"); const data = taskSchema.parse(input);
      if (data.ownerId !== a.id) demand(a, "tasks.assign"); await eligible(tx, a, [data.ownerId]);
      if (data.projectId && !await tx.teamProject.findFirst({ where: { ...projectScope(a), id: data.projectId, memberIds: { has: data.ownerId } } })) throw new TeamError("Choose a project accessible to both you and the assignee.");
      await validateLink(tx, a, data.recordType, data.recordId); await dependencies(tx, a, "new", data.dependencyIds);
      const row = await tx.teamTask.create({ data: { ...data, dueAt: data.dueAt ? new Date(data.dueAt) : null, workspaceId: a.workspaceId, creatorId: a.id, approvalRequired: data.approvalRequired || !!data.recordType } });
      await audit(tx, a, "task.created", row.id, { ownerId: row.ownerId }); await notify(tx, row.ownerId, `Assigned: ${row.title}`, `/team?module=work&task=${row.id}`); return row;
    }
    if (resource === "task-update") {
      const data = taskUpdateSchema.parse(input); const old = await taskAccess(tx, a, id);
      demand(a, "tasks.update"); if (old.version !== data.version) throw new TeamError("This task changed. Refresh before saving.", 409);
      const owner = data.ownerId ?? old.ownerId;
      if (owner !== old.ownerId || (old.ownerId !== a.id && Object.keys(data).some(k => !["version", "status"].includes(k)))) demand(a, "tasks.assign");
      if (owner !== old.ownerId) await eligible(tx, a, [owner]);
      if (data.approvalRequired !== undefined && data.approvalRequired !== old.approvalRequired) demand(a, "tasks.approve");
      const projectId = data.projectId === undefined ? old.projectId : data.projectId;
      if (projectId && data.status) { const project = await tx.teamProject.findUnique({ where: { id: projectId } }); if (project && !project.workflow.includes(data.status)) throw new TeamError("This status is not enabled in the project's workflow."); }
      if (projectId && !await tx.teamProject.findFirst({ where: { ...projectScope(a), id: projectId, memberIds: { has: owner } } })) throw new TeamError("The assignee must belong to an accessible project.");
      if (data.recordType !== undefined || data.recordId !== undefined) await validateLink(tx, a, data.recordType ?? old.recordType, data.recordId ?? old.recordId);
      const deps = data.dependencyIds ?? old.dependencyIds; await dependencies(tx, a, old.id, deps);
      const next = data.status ?? old.status; const checklist = data.checklist ?? old.checklist as { text: string; done: boolean }[];
      const review = old.approvalRequired || data.approvalRequired || !!old.recordType || !!data.recordType;
      if (next !== old.status) {
        if (["COMPLETED", "IN_REVIEW"].includes(next)) demand(a, next === "COMPLETED" && review ? "tasks.approve" : "tasks.complete");
        if (["COMPLETED", "CANCELLED"].includes(old.status)) demand(a, "tasks.assign");
        if (old.ownerId !== a.id && !(next === "COMPLETED" && review)) demand(a, "tasks.assign");
        assertTaskTransition({ previous: old.status, next, review: !!review, evidence: data.evidence ?? old.evidence, blocker: data.blocker ?? old.blocker, dependenciesComplete: await tx.teamTask.count({ where: { workspaceId: a.workspaceId, id: { in: deps }, status: "COMPLETED" } }) === deps.length, checklistComplete: checklist.every(c => c.done), reviewer: can(a, "tasks.approve"), authorIsOwner: a.id === old.ownerId });
      }
      const row = await tx.teamTask.update({ where: { id }, data: { ...data, approvalRequired: !!review, dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null, completedAt: next === "COMPLETED" ? old.completedAt ?? new Date() : null, version: { increment: 1 } } });
      await audit(tx, a, "task.updated", id, { previousStatus: old.status, status: next, previousOwner: old.ownerId, ownerId: owner });
      if (owner !== old.ownerId) await notify(tx, owner, `Assigned: ${row.title}`, `/team?module=work&task=${id}`);
      if (a.id !== owner && old.status === "IN_REVIEW" && next !== old.status) await notify(tx, owner, `Review ${next === "COMPLETED" ? "approved" : "updated"}: ${row.title}`, `/team?module=work&task=${id}`);
      if (next === "COMPLETED" && old.status !== next && row.recurrenceDays) {
        const eventKey = `${row.id}:recurrence`;
        if (!await tx.teamTask.findUnique({ where: { eventKey } })) await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: row.ownerId, projectId: row.projectId, title: row.title, description: row.description, priority: row.priority, approvalRequired: row.approvalRequired, recordType: row.recordType, recordId: row.recordId, recurrenceDays: row.recurrenceDays, dueAt: new Date((row.dueAt?.getTime() || Date.now()) + row.recurrenceDays * 86400000), eventKey, checklist: (row.checklist as { text: string; done: boolean }[]).map(c => ({ ...c, done: false })) } });
      }
      if (next === "IN_REVIEW" && old.status !== next) {
        const reviewers = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: "ACTIVE", id: { not: owner }, OR: [{ role: { owner: true } }, { role: { permissions: { has: "tasks.approve" } } }] } });
        for (const reviewer of reviewers) await notify(tx, reviewer.id, `Review requested: ${row.title}`, `/team?module=approvals&task=${id}`);
      }
      return row;
    }
    if (resource === "comments") {
      demand(a, "tasks.update"); const task = await taskAccess(tx, a, id);
      const body = typeof object.body === "string" ? object.body.trim() : "";
      if (!body || body.length > 4000) throw new TeamError("Write a comment under 4,000 characters.");
      const row = await tx.teamComment.create({ data: { taskId: id, authorId: a.id, body } });
      if (task.ownerId !== a.id) await notify(tx, task.ownerId, `New comment: ${task.title}`, `/team?module=work&task=${id}`); return row;
    }
    if (resource === "projects") {
      demand(a, "projects.create"); const data = projectSchema.parse(input); if (data.memberIds.some(m => m !== a.id)) demand(a, "projects.manage");
      await eligible(tx, a, data.memberIds);
      const row = await tx.teamProject.create({ data: { ...data, workspaceId: a.workspaceId, dueAt: data.dueAt ? new Date(data.dueAt) : null } }); await audit(tx, a, "project.created", row.id); return row;
    }
    if (resource === "invites") {
      demand(a, "team.members.invite"); const data = inviteSchema.parse(input);
      const role = await tx.teamRole.findFirst({ where: { id: data.roleId, workspaceId: a.workspaceId, owner: false } });
      if (!role) throw new TeamError("Choose a non-owner role.");
      if (!a.role.owner && role.permissions.some(p => !a.role.permissions.includes(p) || ["team.members.manage", "team.members.invite", "settings.manage"].includes(p))) throw new TeamError("Only the owner can delegate this role.", 403);
      const token = randomBytes(32).toString("hex");
      await tx.teamInvitation.updateMany({ where: { workspaceId: a.workspaceId, email: data.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      const row = await tx.teamInvitation.create({ data: { ...data, workspaceId: a.workspaceId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 72 * 3600_000) } });
      await audit(tx, a, "member.invited", row.id, { roleId: role.id });
      return { id: row.id, token, expiresAt: row.expiresAt, delivery: "Share this single-use link securely. No email has been sent." };
    }
    if (resource === "members") {
      demand(a, "team.members.manage"); if (!a.role.owner) throw new TeamError("Only the owner can change team access.", 403);
      const member = await tx.teamMember.findFirst({ where: { id, workspaceId: a.workspaceId }, include: { role: true } });
      if (!member || member.role.owner) throw new TeamError("Owner access cannot be changed here.", 403);
      const roleId = typeof object.roleId === "string" ? object.roleId : member.roleId;
      const role = await tx.teamRole.findFirst({ where: { id: roleId, workspaceId: a.workspaceId, owner: false } });
      const status = object.status ?? member.status;
      if (!role || !["ACTIVE", "SUSPENDED", "REVOKED"].includes(String(status))) throw new TeamError("Invalid role or status.");
      const row = await tx.teamMember.update({ where: { id }, data: { status: String(status), roleId } }); await audit(tx, a, "member.access_changed", id, { oldStatus: member.status, status: row.status, oldRoleId: member.roleId, roleId }); return { id: row.id };
    }
    if (resource === "roles") {
      if (!a.role.owner) throw new TeamError("Only the owner can create roles.", 403);
      const data = roleSchema.parse(input); const row = await tx.teamRole.create({ data: { ...data, workspaceId: a.workspaceId } }); await audit(tx, a, "role.created", row.id, { permissions: data.permissions }); return row;
    }
    if (resource === "channels") {
      demand(a, "chat.channel.manage"); const data = channelSchema.parse(input); await eligible(tx, a, data.memberIds);
      if (!data.memberIds.includes(a.id)) data.memberIds.push(a.id);
      const row = await tx.teamChannel.create({ data: { ...data, workspaceId: a.workspaceId } }); await audit(tx, a, "channel.created", row.id); return row;
    }
    if (resource === "messages") {
      demand(a, "chat.use"); const data = messageSchema.parse(input);
      if (!await tx.teamChannel.findFirst({ where: { ...channelScope(a), id: data.channelId } })) throw new TeamError("Conversation unavailable.", 404);
      const key = `${a.id}:${data.clientKey}`;
      const previous = await tx.teamMessage.findUnique({ where: { clientKey: key } });
      if (previous) { if (previous.channelId !== data.channelId || previous.body !== data.body) throw new TeamError("Message retry content differs.", 409); return previous; }
      if (data.parentId && !await tx.teamMessage.findFirst({ where: { id: data.parentId, channelId: data.channelId, deletedAt: null } })) throw new TeamError("Reply target is unavailable.");
      for (const memberId of data.mentions) {
        await eligible(tx, a, [memberId]);
        const channel = await tx.teamChannel.findUniqueOrThrow({ where: { id: data.channelId } });
        if (channel.private && !channel.memberIds.includes(memberId)) throw new TeamError("Mention only participants in this private conversation.");
      }
      const row = await tx.teamMessage.create({ data: { channelId: data.channelId, body: data.body, parentId: data.parentId, clientKey: key, authorId: a.id, readMemberIds: [a.id] } });
      for (const memberId of data.mentions) await notify(tx, memberId, "You were mentioned in a team conversation", `/team?module=chat&channel=${data.channelId}`);
      return row;
    }
    if (resource === "notifications") { await tx.teamNotification.updateMany({ where: { memberId: a.id, ...(id ? { id } : {}), readAt: null }, data: { readAt: new Date() } }); return { ok: true }; }
    if (resource === "prospects") {
      demand(a, "crm.prospects.create"); const data = prospectSchema.parse(input);
      if (data.ownerId !== a.id) demand(a, "crm.prospects.assign"); await eligible(tx, a, [data.ownerId]);
      // Existing inbound enquiries remain authoritative. Never create a second
      // prospect/contact copy for a person already in that pipeline.
      if (data.email && await tx.growthLead.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } }, select: { id: true } })) throw new TeamError("This contact already exists in HYMN enquiries. Use its existing lead record; inbound-lead assignment integration is not yet enabled in Team OS.", 409);
      if (await tx.teamProspect.findUnique({ where: { workspaceId_identityKey: { workspaceId: a.workspaceId, identityKey: hash(data.email?.toLowerCase() || data.contactUrl!) } }, select: { id: true } })) throw new TeamError("This prospect already exists.", 409);
      const lead = await tx.growthLead.create({ data: { kind: "acquisition", name: data.name, email: data.email || "", interest: data.categories.join(", "), message: data.evidence, notes: data.notes } });
      const row = await tx.teamProspect.create({ data: { ...data, leadId: lead.id, workspaceId: a.workspaceId, identityKey: hash(data.email?.toLowerCase() || data.contactUrl!) } }); await audit(tx, a, "prospect.created", row.id, { leadId: lead.id }); return row;
    }
    if (resource === "prospect-update") {
      demand(a, "crm.prospects.view"); demand(a, "crm.outreach.manage"); const data = prospectUpdateSchema.parse(input);
      const old = await tx.teamProspect.findFirst({ where: { ...prospectScope(a), id } }); if (!old) throw new TeamError("Prospect unavailable.", 404);
      if (old.version !== data.version) throw new TeamError("Prospect changed. Refresh first.", 409);
      if (data.ownerId && data.ownerId !== old.ownerId) { demand(a, "crm.prospects.assign"); await eligible(tx, a, [data.ownerId]); }
      if (old.suppressed && (data.suppressed === false || (data.stage && data.stage !== "DO_NOT_CONTACT"))) throw new TeamError("Suppressed prospects cannot be reactivated here.", 403);
      if (data.stage === "CONTACTED" && !await tx.teamOutreach.count({ where: { prospectId: id, kind: "CONTACT" } })) throw new TeamError("Record an actual contact event, not a draft.");
      if (data.stage === "CONVERTED") {
        if (!data.customerUserId || !await tx.user.findUnique({ where: { id: data.customerUserId }, select: { id: true } })) throw new TeamError("Conversion must link an existing HYMN customer.");
      } else if (data.customerUserId) throw new TeamError("Link the customer when recording conversion.");
      const row = await tx.teamProspect.update({ where: { id }, data: { ...data, stage: data.suppressed || data.stage === "DO_NOT_CONTACT" ? "DO_NOT_CONTACT" : data.stage, suppressed: data.suppressed || data.stage === "DO_NOT_CONTACT" ? true : undefined, followUpAt: data.followUpAt === undefined ? undefined : data.followUpAt ? new Date(data.followUpAt) : null, version: { increment: 1 } } });
      if (row.leadId) await tx.growthLead.update({ where: { id: row.leadId }, data: { status: row.stage.toLowerCase(), notes: data.notes, userId: data.customerUserId } });
      if (row.ownerId !== old.ownerId) {
        await tx.teamTask.updateMany({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: `${id}:` }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { ownerId: row.ownerId, version: { increment: 1 } } });
        await notify(tx, row.ownerId, `Prospect assigned: ${row.name}`, "/team?module=crm");
      }
      await audit(tx, a, "prospect.updated", id, { previousStage: old.stage, stage: row.stage });
      if (row.suppressed || row.stage === "CONVERTED" || row.stage === "LOST") await tx.teamTask.updateMany({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: `${id}:` }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { status: "CANCELLED", version: { increment: 1 } } });
      if (row.stage === "CONVERTED" && old.stage !== row.stage) await notify(tx, row.ownerId, `Customer linked: ${row.name}. Paid status is verified separately.`, "/team?module=analytics");
      if (data.followUpAt !== undefined) await tx.teamTask.updateMany({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: `${id}:` }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { dueAt: row.followUpAt, version: { increment: 1 } } });
      if (["QUALIFIED", "REPLIED", "INTERESTED"].includes(row.stage)) {
        const eventKey = `${id}:${row.stage}`;
        if (!await tx.teamTask.findUnique({ where: { eventKey } })) {
          const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: row.ownerId, title: `Follow up: ${row.name}`, description: `CRM prospect ${id}. ${row.buyingSignal}`, eventKey, dueAt: row.followUpAt } });
          await notify(tx, row.ownerId, `Follow-up: ${row.name}`, `/team?module=work&task=${task.id}`);
        }
      }
      return row;
    }
    if (resource === "outreach") {
      demand(a, "crm.outreach.manage"); const data = outreachSchema.parse(input);
      const prospect = await tx.teamProspect.findFirst({ where: { ...prospectScope(a), id: data.prospectId } }); if (!prospect) throw new TeamError("Prospect unavailable.", 404);
      if (prospect.suppressed) throw new TeamError("This prospect is suppressed. No further outreach is allowed.", 403);
      const preference = prospect.email ? await tx.newsletterSubscriber.findFirst({ where: { email: { equals: prospect.email, mode: "insensitive" }, OR: [{ status: { not: "subscribed" } }, { unsubscribedAt: { not: null } }] } }) : null;
      if (preference) throw new TeamError("This contact has opted out. Further outreach is suppressed.", 403);
      if (data.kind === "CONTACT" && !prospect.verified) throw new TeamError("Verify the contact source before recording outreach.");
      if (new Date(data.occurredAt).getTime() > Date.now() + 60_000) throw new TeamError("An actual contact event cannot be in the future.");
      const row = await tx.teamOutreach.create({ data: { ...data, actorId: a.id, occurredAt: new Date(data.occurredAt) } }); await audit(tx, a, `outreach.${data.kind.toLowerCase()}`, row.id); return row;
    }
    if (resource === "reports") {
      demand(a, "reports.team.view"); const data = reportSchema.parse(input); const weekStart = weekStartIndia(); const since = new Date(weekStart.getTime() - 330 * 60_000);
      const [completed, contacted, replies, prospects] = await Promise.all([tx.teamTask.count({ where: { ownerId: a.id, status: "COMPLETED", completedAt: { gte: since } } }), tx.teamOutreach.findMany({ where: { actorId: a.id, kind: "CONTACT", occurredAt: { gte: since } }, select: { prospectId: true }, distinct: ["prospectId"] }), tx.teamOutreach.count({ where: { actorId: a.id, kind: "REPLY", occurredAt: { gte: since } } }), tx.teamProspect.count({ where: { ownerId: a.id, createdAt: { gte: since } } })]);
      const row = await tx.teamWeeklyReport.create({ data: { ...data, memberId: a.id, weekStart, metrics: { tasksCompleted: completed, artistsContacted: contacted.length, repliesRecorded: replies, prospectsAdded: prospects } } }); await audit(tx, a, "report.submitted", row.id); return row;
    }
    return (await import("./advanced")).advancedMutation(tx, a, resource, input);
  });
}

export async function acceptTeamInvitation(user: { id: number; email: string }, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new TeamError("Invalid invitation.");
  const invite = await prisma.teamInvitation.findUnique({ where: { tokenHash: hash(token) } });
  if (!invite) throw new TeamError("Invitation unavailable.", 404);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${invite.workspaceId} FOR UPDATE`;
    const current = await tx.teamInvitation.findUnique({ where: { id: invite.id }, include: { role: true } });
    const account = await tx.user.findUnique({ where: { id: user.id }, select: { status: true, email: true } });
    if (!current || current.acceptedAt || current.revokedAt || current.expiresAt <= new Date() || current.email !== account?.email.toLowerCase() || account.status !== "ACTIVE" || current.role.owner) throw new TeamError("Invitation expired, used, revoked, or belongs to a different account.", 403);
    if (await tx.teamMember.findUnique({ where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: user.id } } })) throw new TeamError("A membership already exists. Ask the owner to restore it if needed.", 409);
    const member = await tx.teamMember.create({ data: { workspaceId: current.workspaceId, userId: user.id, roleId: current.roleId, department: current.department, jobTitle: current.jobTitle } });
    await tx.teamInvitation.update({ where: { id: current.id }, data: { acceptedAt: new Date() } });
    const template = onboardingTemplates.find(t => t.role === current.role.name && t.jobTitle === current.jobTitle);
    if (template) {
      await tx.teamMember.update({ where: { id: member.id }, data: { responsibilities: template.target } });
      const task = await tx.teamTask.create({ data: { workspaceId: member.workspaceId, creatorId: member.id, ownerId: member.id, title: "Week one: your HYMN onboarding objective", description: template.target, dueAt: new Date(Date.now() + 7 * 86400000), approvalRequired: true, eventKey: `${member.id}:onboarding` } });
      await notify(tx, member.id, "Your week-one assignment is ready", `/team?module=work&task=${task.id}`);
    }
    await audit(tx, { ...member, role: current.role }, "invitation.accepted", current.id); return { workspaceId: member.workspaceId };
  });
}

export async function teamRead(a: Actor, resource: string, params: URLSearchParams) {
  const offset = Math.max(0, Math.min(100000, Number(params.get("offset")) || 0));
  const page = { take: 50, skip: offset };
  if (resource === "session") return { memberId: a.id, workspaceId: a.workspaceId, owner: a.role.owner, permissions: a.role.permissions };
  if (resource === "task") {
    const item = await prisma.teamTask.findFirst({ where: { ...taskScope(a), id: params.get("id") ?? "" }, include: { owner: { select: memberSelect }, project: { select: { title: true } } } });
    if (!item) throw new TeamError("Task unavailable.", 404);
    return item;
  }
  if (resource === "tasks") {
    const where = { ...taskScope(a), ...(params.get("status") && (statuses as readonly string[]).includes(params.get("status")!) ? { status: params.get("status")! } : {}), ...(params.get("mine") === "1" ? { ownerId: a.id } : {}), ...(params.get("q") ? { title: { contains: params.get("q")!.slice(0, 200), mode: "insensitive" as const } } : {}) };
    return { items: await prisma.teamTask.findMany({ where, ...page, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { owner: { select: memberSelect }, project: { select: { title: true } } } }), total: await prisma.teamTask.count({ where }) };
  }
  if (resource === "comments") {
    const task = await prisma.teamTask.findFirst({ where: { ...taskScope(a), id: params.get("id") ?? "" } }); if (!task) throw new TeamError("Task unavailable.", 404);
    return { items: await prisma.teamComment.findMany({ where: { taskId: task.id }, ...page, orderBy: { createdAt: "desc" }, include: { author: { select: memberSelect } } }) };
  }
  if (resource === "projects") return { items: await prisma.teamProject.findMany({ where: projectScope(a), ...page, orderBy: { createdAt: "desc" }, include: { _count: { select: { tasks: true } } } }) };
  if (resource === "members") { demand(a, "team.members.view"); return { items: await prisma.teamMember.findMany({ where: { workspaceId: a.workspaceId }, select: memberSelect, ...page, orderBy: { joinedAt: "asc" } }), roles: a.role.owner || can(a, "team.members.invite") ? await prisma.teamRole.findMany({ where: { workspaceId: a.workspaceId }, select: { id: true, name: true, permissions: true, owner: true } }) : [] }; }
  if (resource === "channels") { demand(a, "chat.use"); return { items: await prisma.teamChannel.findMany({ where: channelScope(a), ...page, orderBy: { createdAt: "asc" } }) }; }
  if (resource === "messages") {
    demand(a, "chat.use"); const channelId = params.get("channel") ?? "";
    if (!await prisma.teamChannel.findFirst({ where: { ...channelScope(a), id: channelId } })) throw new TeamError("Conversation unavailable.", 404);
    const items = await prisma.teamMessage.findMany({ where: { channelId }, ...page, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { author: { select: memberSelect } } }); return { items: items.reverse() };
  }
  if (resource === "notifications") return { items: await prisma.teamNotification.findMany({ where: { memberId: a.id }, ...page, orderBy: { createdAt: "desc" } }) };
  if (resource === "prospects") { demand(a, "crm.prospects.view"); const items = await prisma.teamProspect.findMany({ where: prospectScope(a), ...page, orderBy: { updatedAt: "desc" }, include: { lead: true, owner: { select: memberSelect } } }); return { items: items.map(({ lead, ...p }) => ({ ...p, name: lead?.name ?? p.name, email: lead?.email || p.email, notes: lead?.notes ?? p.notes, stage: lead ? lead.status === "closed" ? "LOST" : lead.status.toUpperCase() : p.stage, customerUserId: lead?.userId ?? p.customerUserId })) }; }
  if (resource === "outreach") { demand(a, "crm.prospects.view"); return { items: await prisma.teamOutreach.findMany({ where: { prospect: prospectScope(a), ...(params.get("id") ? { prospectId: params.get("id")! } : {}) }, ...page, orderBy: { occurredAt: "desc" } }) }; }
  if (resource === "reports") { demand(a, "reports.team.view"); return { items: await prisma.teamWeeklyReport.findMany({ where: can(a, "reports.all.view") ? { member: { workspaceId: a.workspaceId } } : { memberId: a.id }, ...page, orderBy: { weekStart: "desc" }, include: { member: { select: memberSelect } } }) }; }
  if (resource === "audit") { demand(a, "audit.view"); return { items: await prisma.teamAudit.findMany({ where: { workspaceId: a.workspaceId }, ...page, orderBy: { createdAt: "desc" } }) }; }
  if (resource === "overview") {
    const where = taskScope(a); const [active, overdue, blocked, reviews, completed, workload] = await Promise.all([prisma.teamTask.count({ where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED"] } } }), prisma.teamTask.count({ where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: new Date() } } }), prisma.teamTask.count({ where: { ...where, status: "BLOCKED" } }), prisma.teamTask.count({ where: { ...where, status: "IN_REVIEW" } }), prisma.teamTask.count({ where: { ...where, status: "COMPLETED" } }), prisma.teamTask.groupBy({ by: ["ownerId"], where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED"] } }, _count: true })]); return { active, overdue, blocked, reviews, completed, workload };
  }
  if (resource === "operations") {
    // Coordinators get operational metadata only: never payment amounts, private
    // media keys, credentials or unrestricted links into privileged admin APIs.
    return {
      beats: can(a, "operations.beats.manage") ? await prisma.beat.findMany({ take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, status: true, bpm: true, mood: true, keySignature: true, audioUploadId: true, previewUploadId: true, artworkUploadId: true, sampleDeclaredAt: true } }) : [],
      engineers: can(a, "operations.engineers.manage") ? await prisma.engineerProfile.findMany({ take: 50, select: { id: true, professionalName: true, bio: true, genres: true, verificationState: true } }) : [],
      releases: can(a, "operations.distribution.review") ? await prisma.release.findMany({ where: { id: { in: (await prisma.teamTask.findMany({ where: { ...taskScope(a), recordType: "release" }, select: { recordId: true } })).flatMap(t => t.recordId ? [t.recordId] : []) } }, take: 50, select: { id: true, title: true, status: true } }) : [],
      orders: can(a, "operations.studio.review") ? await prisma.studioServiceOrder.findMany({ where: { id: { in: (await prisma.teamTask.findMany({ where: { ...taskScope(a), recordType: "studio" }, select: { recordId: true } })).flatMap(t => t.recordId ? [t.recordId] : []) } }, take: 50, select: { id: true, projectTitle: true, status: true, deliveryDueAt: true } }) : [],
    };
  }
  return (await import("./advanced")).advancedRead(a, resource, params);
}
