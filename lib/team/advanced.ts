import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { portfolioDaws } from "@/lib/engineer-daws";
import { can, demand, TeamError, statuses, permissions, assertTaskTransition, type Actor, type Permission } from "./policy";
import { taskScope, projectScope, prospectScope, channelScope, taskAccess, eligible, audit, notify, validateLink } from "./service";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { prospectSchema } from "./validation";
import { parseTeamCsv } from "./csv";
import { teamRevenue } from "./revenue";

type Tx = Prisma.TransactionClient;
const id = z.string().min(1).max(80);
const text = z.string().trim().min(1).max(10000);
const date = z.string().datetime({ offset: true }).nullable();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const events = ["BEAT_REVIEW", "ENGINEER_PROFILE", "RELEASE_REVIEW", "STUDIO_COORDINATION"] as const;
const eventPermissions: Record<string, Permission> = { BEAT_REVIEW: "operations.beats.manage", ENGINEER_PROFILE: "operations.engineers.manage", RELEASE_REVIEW: "operations.distribution.review", STUDIO_COORDINATION: "operations.studio.review" };
export const approvalTypes = ["DISTRIBUTION_READINESS", "BEAT_PUBLICATION", "RIGHTS_EXCEPTION", "PRICING_EXCEPTION", "REFUND_REQUEST", "OWNERSHIP_CHANGE", "OPERATIONAL_EXCEPTION", "PROJECT_SIGNOFF"] as const;
const sensitive = new Set<string>(["RIGHTS_EXCEPTION", "PRICING_EXCEPTION", "REFUND_REQUEST", "OWNERSHIP_CHANGE"]);
export async function scopedAttachment(a: Actor, input: { taskId?: string | null; projectId?: string | null }, tx: Tx = prisma) {
  if (!!input.taskId === !!input.projectId) throw new TeamError("Choose exactly one task or project.");
  if (input.taskId) await taskAccess(tx, a, input.taskId);
  if (input.projectId && !await tx.teamProject.findFirst({ where: { ...projectScope(a), id: input.projectId } })) throw new TeamError("Project unavailable.", 404);
}
export async function advancedMutation(tx: Tx, a: Actor, resource: string, input: unknown) {
  if (resource === "expenses") {
    if (!a.role.owner) throw new TeamError("Only the owner can record acquisition expenses.", 403);
    const data = z.object({ category: text.max(100), description: text.max(1000), amount: z.number().positive().max(10000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001), incurredAt: z.string().datetime({ offset: true }) }).parse(input);
    const row = await tx.teamExpense.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, category: data.category, description: data.description, amountCents: Math.round(data.amount * 100), incurredAt: new Date(data.incurredAt) } }); await audit(tx, a, "expense.recorded", row.id, { amountCents: row.amountCents, currency: row.currency }); return row;
  }
  if (resource === "role-update") {
    if (!a.role.owner) throw new TeamError("Only the owner can change roles.", 403);
    const data = z.object({ id, name: text.max(80), permissions: z.array(z.enum(permissions)).max(permissions.length) }).parse(input);
    const role = await tx.teamRole.findFirst({ where: { id: data.id, workspaceId: a.workspaceId, owner: false } }); if (!role) throw new TeamError("Owner role cannot be changed here.", 403);
    const row = await tx.teamRole.update({ where: { id: role.id }, data: { name: data.name, permissions: data.permissions } }); await audit(tx, a, "role.changed", row.id, { before: role.permissions, after: row.permissions }); return row;
  }
  if (resource === "member-profile") {
    if (!a.role.owner) throw new TeamError("Owner action required.", 403);
    const data = z.object({ id, department: text.max(100), jobTitle: text.max(150), responsibilities: z.string().max(10000), managerId: id.nullable() }).parse(input);
    if (!await tx.teamMember.findFirst({ where: { id: data.id, workspaceId: a.workspaceId } })) throw new TeamError("Member unavailable.", 404);
    if (data.managerId) { await eligible(tx, a, [data.managerId]); let manager: string | null = data.managerId; const seen = new Set([data.id]); while (manager) { if (seen.has(manager)) throw new TeamError("Circular reporting lines are not allowed."); seen.add(manager); manager = (await tx.teamMember.findUniqueOrThrow({ where: { id: manager } })).managerId; } }
    const row = await tx.teamMember.update({ where: { id: data.id }, data }); await audit(tx, a, "member.profile_updated", row.id); return row;
  }
  if (resource === "invite-revoke") {
    if (!a.role.owner) throw new TeamError("Owner action required.", 403); const data = z.object({ id }).parse(input);
    await tx.teamInvitation.updateMany({ where: { id: data.id, workspaceId: a.workspaceId, acceptedAt: null }, data: { revokedAt: new Date() } }); await audit(tx, a, "invitation.revoked", data.id); return { revoked: true };
  }
  if (resource === "task-bulk") {
    demand(a, "tasks.update"); const data = z.object({ ids: z.array(id).min(1).max(50), status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED"]), blocker: z.string().max(2000).default("") }).parse(input);
    const tasks = await tx.teamTask.findMany({ where: { ...taskScope(a), id: { in: data.ids } } });
    if (tasks.length !== new Set(data.ids).size) throw new TeamError("Every selected task must be accessible.", 403);
    for (const task of tasks) {
      if (task.ownerId !== a.id || ["COMPLETED", "CANCELLED"].includes(task.status)) demand(a, "tasks.assign");
      assertTaskTransition({ previous: task.status, next: data.status, review: task.approvalRequired, evidence: task.evidence, blocker: data.blocker, dependenciesComplete: false, checklistComplete: false, reviewer: false, authorIsOwner: task.ownerId === a.id });
      if (task.projectId) { const project = await tx.teamProject.findUnique({ where: { id: task.projectId } }); if (!project?.workflow.includes(data.status)) throw new TeamError("A selected project disallows this status."); }
    }
    await tx.teamTask.updateMany({ where: { id: { in: data.ids }, workspaceId: a.workspaceId }, data: { status: data.status, blocker: data.blocker, completedAt: null, version: { increment: 1 } } }); await audit(tx, a, "tasks.bulk_updated", a.workspaceId, { ids: data.ids, status: data.status }); return { updated: tasks.length };
  }
  if (resource === "prospect-import") {
    demand(a, "crm.prospects.create"); const data = z.object({ csv: z.string().max(200000), commit: z.boolean().default(false) }).parse(input); const rows = parseTeamCsv(data.csv); const results: { row: number; status: string; name: string; error?: string }[] = [];
    for (let index = 0; index < rows.length; index++) {
      const raw = rows[index]; const parsed = prospectSchema.safeParse({ name: raw.name, email: raw.email || null, contactUrl: raw.contactUrl || null, sourceUrl: raw.sourceUrl, evidence: raw.evidence, ownerId: a.id, categories: (raw.categories || "Distribution").split("|").map(s => s.trim()), buyingSignal: raw.buyingSignal || "", verified: raw.verified?.toLowerCase() === "true", notes: raw.notes || "", score: { intent: Number(raw.intent || 0), relevance: Number(raw.relevance || 0), recency: Number(raw.recency || 0), contactability: Number(raw.contactability || 0), fit: Number(raw.fit || 0) } });
      if (!parsed.success) { results.push({ row: index + 2, status: "INVALID", name: raw.name, error: parsed.error.issues.map(i => i.message).join("; ") }); continue; }
      const candidate = parsed.data; const identityKey = hash(candidate.email?.toLowerCase() || candidate.contactUrl!);
      if (await tx.teamProspect.findFirst({ where: { workspaceId: a.workspaceId, identityKey } }) || candidate.email && await tx.growthLead.findFirst({ where: { email: { equals: candidate.email, mode: "insensitive" } } })) { results.push({ row: index + 2, status: "DUPLICATE", name: candidate.name }); continue; }
      if (data.commit) {
        const lead = await tx.growthLead.create({ data: { kind: "acquisition", name: candidate.name, email: candidate.email || "", message: candidate.evidence, interest: candidate.categories.join(", "), notes: candidate.notes } });
        await tx.teamProspect.create({ data: { ...candidate, workspaceId: a.workspaceId, leadId: lead.id, identityKey } });
      }
      results.push({ row: index + 2, status: data.commit ? "IMPORTED" : "READY", name: candidate.name });
    }
    if (data.commit) await audit(tx, a, "prospects.imported", a.workspaceId, { imported: results.filter(r => r.status === "IMPORTED").length });
    return { items: results, committed: data.commit };
  }
  if (resource === "project-update") {
    demand(a, "projects.manage");
    const data = z.object({ id, version: z.number().int(), title: text.max(200), description: z.string().max(10000), status: z.enum(["ACTIVE", "BLOCKED", "COMPLETED", "ARCHIVED"]), memberIds: z.array(id).min(1).max(100), dueAt: date, milestones: z.array(z.object({ title: text.max(200), dueAt: date, done: z.boolean() })).max(50), workflow: z.array(z.enum(statuses)).min(2).max(7) }).parse(input);
    const old = await tx.teamProject.findFirst({ where: { ...projectScope(a), id: data.id } }); if (!old) throw new TeamError("Project unavailable.", 404);
    if (old.version !== data.version) throw new TeamError("Project changed. Refresh first.", 409);
    await eligible(tx, a, data.memberIds);
    if (!data.workflow.includes("TODO") || !data.workflow.includes("COMPLETED") || !data.workflow.includes("IN_REVIEW")) throw new TeamError("Workflows must retain To Do, In Review and Completed.");
    const linked = await tx.teamTask.findMany({ where: { projectId: old.id, archivedAt: null }, select: { ownerId: true, status: true } });
    if (linked.some(t => !data.memberIds.includes(t.ownerId) || !data.workflow.includes(t.status as typeof statuses[number]))) throw new TeamError("Keep assignees and statuses currently used by this project's tasks.");
    if (data.status === "COMPLETED" && (linked.some(t => !["COMPLETED", "CANCELLED"].includes(t.status)) || data.milestones.some(m => !m.done))) throw new TeamError("Finish tasks and milestones before completing this project.");
    const row = await tx.teamProject.update({ where: { id: data.id }, data: { ...data, dueAt: data.dueAt ? new Date(data.dueAt) : null, version: { increment: 1 } } }); await audit(tx, a, "project.updated", row.id, { status: row.status }); return row;
  }
  if (resource === "task-controls") {
    const data = z.object({ id, version: z.number().int(), action: z.enum(["archive", "duplicate", "configure"]), parentId: id.nullable().optional(), collaboratorIds: z.array(id).max(30).optional(), recurrenceDays: z.number().int().min(1).max(365).nullable().optional() }).parse(input);
    const task = await taskAccess(tx, a, data.id); if (task.version !== data.version) throw new TeamError("Task changed. Refresh first.", 409);
    if (data.action === "archive") { demand(a, "tasks.delete"); if (await tx.teamTask.count({ where: { workspaceId: a.workspaceId, dependencyIds: { has: task.id }, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } } })) throw new TeamError("Remove active dependencies before archiving this task."); const row = await tx.teamTask.update({ where: { id: task.id }, data: { archivedAt: new Date(), version: { increment: 1 } } }); await audit(tx, a, "task.archived", task.id); return row; }
    demand(a, "tasks.assign");
    if (data.action === "duplicate") { demand(a, "tasks.create"); const row = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, ownerId: task.ownerId, creatorId: a.id, projectId: task.projectId, title: `${task.title} (copy)`.slice(0, 200), description: task.description, approvalRequired: task.approvalRequired, priority: task.priority, recordType: task.recordType, recordId: task.recordId, checklist: (task.checklist as { text: string; done: boolean }[]).map(c => ({ ...c, done: false })) } }); await audit(tx, a, "task.duplicated", row.id, { sourceId: task.id }); await notify(tx, row.ownerId, `Assigned: ${row.title}`); return row; }
    if (data.collaboratorIds) await eligible(tx, a, data.collaboratorIds);
    if (data.parentId) { let parent: string | null = data.parentId; const seen = new Set([task.id]); while (parent) { if (seen.has(parent)) throw new TeamError("Circular subtasks are not allowed."); seen.add(parent); parent = (await taskAccess(tx, a, parent)).parentId; } }
    const row = await tx.teamTask.update({ where: { id: task.id }, data: { parentId: data.parentId, collaboratorIds: data.collaboratorIds, recurrenceDays: data.recurrenceDays, version: { increment: 1 } } }); await audit(tx, a, "task.controls_updated", task.id); return row;
  }
  if (resource === "message-action") {
    demand(a, "chat.use");
    const data = z.object({ id, action: z.enum(["edit", "delete", "pin", "reaction", "read"]), body: text.max(4000).optional(), emoji: z.enum(["👍", "❤️", "🎵", "✅", "👀"]).optional() }).parse(input);
    const message = await tx.teamMessage.findFirst({ where: { id: data.id, channel: channelScope(a) } }); if (!message) throw new TeamError("Message unavailable.", 404);
    if (["edit", "delete"].includes(data.action) && message.authorId !== a.id) throw new TeamError("Only the author can edit or remove this message.", 403);
    if (data.action === "pin") demand(a, "chat.channel.manage");
    if (message.deletedAt && data.action !== "read") throw new TeamError("Message has been removed.");
    const reactions = message.reactions as Record<string, string>;
    if (data.action === "reaction") { if (!data.emoji) throw new TeamError("Choose a reaction."); if (reactions[a.id] === data.emoji) delete reactions[a.id]; else reactions[a.id] = data.emoji; }
    const row = await tx.teamMessage.update({ where: { id: message.id }, data: data.action === "edit" ? { body: data.body || message.body, editedAt: new Date() } : data.action === "delete" ? { body: "Message removed", deletedAt: new Date() } : data.action === "pin" ? { pinned: !message.pinned } : data.action === "reaction" ? { reactions } : { readMemberIds: [...new Set([...message.readMemberIds, a.id])] } });
    if (data.action !== "read" && data.action !== "reaction") await audit(tx, a, `message.${data.action}`, row.id); return row;
  }
  if (resource === "approval-create") {
    const data = z.object({ approverId: id, type: z.enum(approvalTypes), recordType: z.enum(["beat", "release", "engineer", "studio"]), recordId: z.number().int().positive(), reason: text, evidence: text }).parse(input);
    await validateLink(tx, a, data.recordType, data.recordId); await eligible(tx, a, [data.approverId]);
    const approver = await tx.teamMember.findUniqueOrThrow({ where: { id: data.approverId }, include: { role: true } });
    if (approver.id === a.id || !can(approver, "tasks.approve") || sensitive.has(data.type) && !approver.role.owner) throw new TeamError("Choose an independent authorised approver; sensitive exceptions require the owner.");
    const row = await tx.teamApproval.create({ data: { ...data, workspaceId: a.workspaceId, requesterId: a.id } }); await audit(tx, a, "approval.requested", row.id, { type: row.type }); await notify(tx, row.approverId, `Approval requested: ${row.type}`, "/team?module=decisions"); return row;
  }
  if (resource === "approval-decide") {
    demand(a, "tasks.approve"); const data = z.object({ id, status: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), decision: text }).parse(input);
    const old = await tx.teamApproval.findFirst({ where: { workspaceId: a.workspaceId, id: data.id, approverId: a.id } });
    if (!old || old.requesterId === a.id) throw new TeamError("Approval unavailable.", 403);
    if (sensitive.has(old.type) && !a.role.owner) throw new TeamError("Owner decision required.", 403);
    if (old.status !== "PENDING") throw new TeamError("This decision has already been recorded.", 409);
    const row = await tx.teamApproval.update({ where: { id: old.id }, data: { status: data.status, decision: data.decision, decidedAt: new Date() } }); await audit(tx, a, "approval.decided", row.id, { status: row.status, decision: data.decision }); await notify(tx, row.requesterId, `${row.type}: ${row.status}`, "/team?module=decisions"); return row;
  }
  if (resource === "documents") {
    demand(a, "tasks.create"); const data = z.object({ id: id.optional(), version: z.number().int().optional(), title: text.max(200), body: text, type: z.enum(["SOP", "RESPONSE", "HANDOVER"]), approved: z.boolean().default(false) }).parse(input);
    if (data.approved && !a.role.owner) throw new TeamError("Only the owner can approve shared instructions.", 403);
    if (data.id) {
      const old = await tx.teamDocument.findFirst({ where: { workspaceId: a.workspaceId, id: data.id } }); if (!old || !a.role.owner && old.authorId !== a.id || old.approved && !a.role.owner) throw new TeamError("Document unavailable for editing.", 403);
      if (old.version !== data.version) throw new TeamError("Document changed. Refresh first.", 409);
      const row = await tx.teamDocument.update({ where: { id: old.id }, data: { title: data.title, body: data.body, type: data.type, approved: data.approved, version: { increment: 1 } } }); await audit(tx, a, "document.updated", row.id); return row;
    }
    const row = await tx.teamDocument.create({ data: { workspaceId: a.workspaceId, authorId: a.id, title: data.title, body: data.body, type: data.type, approved: data.approved } }); await audit(tx, a, "document.created", row.id); return row;
  }
  if (resource === "preferences") {
    const data = z.object({ availability: z.enum(["AVAILABLE", "BUSY", "AWAY"]), notifications: z.boolean(), digest: z.enum(["NONE", "DAILY", "WEEKLY"]), fridayReminder: z.boolean() }).parse(input);
    const previous = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id }, select: { preferences: true } });
    const retained = previous.preferences && typeof previous.preferences === "object" && !Array.isArray(previous.preferences) ? previous.preferences : {};
    return tx.teamMember.update({ where: { id: a.id }, data: { availability: data.availability, preferences: { ...retained, ...data } } });
  }
  if (resource === "saved-views") {
    const data = z.object({ name: text.max(100), filters: z.object({ status: z.enum(statuses).optional(), query: z.string().max(200).optional(), mine: z.boolean().optional() }) }).parse(input);
    return tx.teamSavedView.create({ data: { ...data, workspaceId: a.workspaceId, memberId: a.id } });
  }
  if (resource === "workflow-rules") {
    if (!a.role.owner) throw new TeamError("Only the owner can configure automations.", 403);
    const data = z.object({ name: text.max(150), eventType: z.enum(events), ownerId: id, enabled: z.boolean() }).parse(input); await eligible(tx, a, [data.ownerId]);
    const member = await tx.teamMember.findUniqueOrThrow({ where: { id: data.ownerId }, include: { role: true } }); demand(member, eventPermissions[data.eventType]);
    const row = await tx.teamWorkflowRule.upsert({ where: { workspaceId_eventType: { workspaceId: a.workspaceId, eventType: data.eventType } }, create: { ...data, workspaceId: a.workspaceId }, update: data }); await audit(tx, a, "workflow.configured", row.id); return row;
  }
  if (resource === "workflow-sync") {
    if (!a.role.owner) throw new TeamError("Owner action required.", 403);
    let created = 0;
    const rules = await tx.teamWorkflowRule.findMany({ where: { workspaceId: a.workspaceId, enabled: true } });
    for (const rule of rules) {
      const handled = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: `${a.workspaceId}:${rule.eventType}:` } }, select: { recordId: true } });
      const excludedIds = handled.flatMap(t => t.recordId ? [t.recordId] : []);
      const assignee = await tx.teamMember.findFirst({ where: { workspaceId: a.workspaceId, id: rule.ownerId, status: "ACTIVE", user: { status: "ACTIVE" } }, include: { role: true } }); if (!assignee || !can(assignee, eventPermissions[rule.eventType])) continue;
      const records = rule.eventType === "BEAT_REVIEW" ? (await tx.beat.findMany({ where: { id: { notIn: excludedIds }, status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED"] } }, take: 5 })).map(r => ({ id: r.id, title: r.title, type: "beat" })) : rule.eventType === "ENGINEER_PROFILE" ? (await tx.engineerProfile.findMany({ where: { id: { notIn: excludedIds }, OR: [{ bio: "" }, { verificationState: "UNVERIFIED" }] }, take: 5 })).map(r => ({ id: r.id, title: r.professionalName, type: "engineer" })) : rule.eventType === "RELEASE_REVIEW" ? (await tx.release.findMany({ where: { id: { notIn: excludedIds }, status: { in: ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] } }, take: 5 })).map(r => ({ id: r.id, title: r.title, type: "release" })) : (await tx.studioServiceOrder.findMany({ where: { id: { notIn: excludedIds }, paymentStatus: "PAID", status: { notIn: ["COMPLETED", "CANCELLED", "REFUNDED"] } }, take: 5 })).map(r => ({ id: r.id, title: r.projectTitle, type: "studio" }));
      for (const record of records) {
        const key = `${a.workspaceId}:${rule.eventType}:${record.id}`;
        if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: key } })) continue;
        const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: assignee.id, title: `Review: ${record.title}`.slice(0, 200), description: `Created by ${rule.name}. Review actual ${record.type} #${record.id}; this task never executes the business operation.`, approvalRequired: true, recordType: record.type, recordId: record.id, eventKey: key } });
        await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey: key, taskId: task.id } }); await notify(tx, assignee.id, task.title); created++;
      }
    }
    // Deadline notifications are deduplicated by task/day and also respect scopes.
    const due = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, archivedAt: null, dueAt: { lte: new Date(Date.now() + 86400000) }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, take: 100 });
    for (const task of due) { const key = `${task.id}:due:${new Date().toISOString().slice(0, 10)}`; if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: key } })) continue; await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey: key, taskId: task.id } }); await notify(tx, task.ownerId, `Deadline attention: ${task.title}`); }
    await audit(tx, a, "workflow.synced", a.workspaceId, { created }); return { created };
  }
  if (resource === "inbound-link") {
    demand(a, "crm.prospects.assign"); const data = z.object({ leadId: z.number().int().positive(), ownerId: id, sourceUrl: z.string().url().refine(v => /^https?:\/\//.test(v)), evidence: text.min(10) }).parse(input); await eligible(tx, a, [data.ownerId]);
    const lead = await tx.growthLead.findUnique({ where: { id: data.leadId } }); if (!lead || !a.role.owner && lead.assignedTo !== a.userId) throw new TeamError("Enquiry unavailable.", 404);
    if (await tx.teamProspect.findUnique({ where: { leadId: lead.id } })) throw new TeamError("This enquiry is already linked.", 409);
    const duplicate = await tx.teamProspect.findFirst({ where: { workspaceId: a.workspaceId, email: { equals: lead.email, mode: "insensitive" } } }); if (duplicate) throw new TeamError("A matching prospect exists; use its record instead of creating a duplicate.", 409);
    const row = await tx.teamProspect.create({ data: { workspaceId: a.workspaceId, ownerId: data.ownerId, leadId: lead.id, name: lead.name, email: lead.email || null, sourceUrl: data.sourceUrl, evidence: data.evidence, buyingSignal: lead.interest, notes: lead.notes, stage: lead.status.toUpperCase() === "CLOSED" ? "LOST" : lead.status.toUpperCase(), categories: [], score: { intent: 0, relevance: 0, recency: 0, contactability: 0, fit: 0 }, identityKey: hash(lead.email.toLowerCase() || `lead:${lead.id}`) } });
    await audit(tx, a, "enquiry.linked", row.id, { leadId: lead.id }); await notify(tx, row.ownerId, `Enquiry assigned: ${lead.name}`, "/team?module=crm"); return row;
  }
  throw new TeamError("Unknown team action.", 404);
}

export async function advancedRead(a: Actor, resource: string, params: URLSearchParams) {
  const skip = Math.max(0, Math.min(100000, parseInt(params.get("offset") || "0") || 0)); const page = { take: 50, skip };
  if (resource === "attachments") {
    const target = { taskId: params.get("task") || undefined, projectId: params.get("project") || undefined }; await scopedAttachment(a, target);
    return { items: await prisma.teamAttachment.findMany({ where: { workspaceId: a.workspaceId, ...target, ...(!a.role.owner ? { sensitive: false } : {}) }, ...page, orderBy: { createdAt: "desc" } }) };
  }
  if (resource === "decisions") return { items: await prisma.teamApproval.findMany({ where: { workspaceId: a.workspaceId, ...(a.role.owner ? {} : { OR: [{ requesterId: a.id }, { approverId: a.id }] }) }, ...page, orderBy: { createdAt: "desc" } }) };
  if (resource === "documents") return { items: await prisma.teamDocument.findMany({ where: { workspaceId: a.workspaceId, ...(a.role.owner ? {} : { OR: [{ approved: true }, { authorId: a.id }] }) }, ...page, orderBy: { updatedAt: "desc" } }) };
  if (resource === "preferences") return prisma.teamMember.findUnique({ where: { id: a.id }, select: { preferences: true, availability: true } });
  if (resource === "expenses") { if (!a.role.owner) throw new TeamError("Owner access required.", 403); return { items: await prisma.teamExpense.findMany({ where: { workspaceId: a.workspaceId }, ...page, orderBy: { incurredAt: "desc" } }) }; }
  if (resource === "workspaces") return { items: (await prisma.teamMember.findMany({ where: { userId: a.userId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { workspaceId: true, workspace: { select: { name: true } } } })).map(m => ({ id: m.workspaceId, name: m.workspace.name })) };
  if (resource === "discover") {
    demand(a, "crm.prospects.create"); const query = (params.get("q") || "").trim().slice(0, 150); const market = (params.get("market") || "India").slice(0, 80);
    if (query.length < 2) throw new TeamError("Enter a research query with at least two characters.");
    const research = `${query} independent music artist ${market}`;
    const links = [{ name: "Public web research", sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(research)}` }, { name: "YouTube artist research", sourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(research)}` }, { name: "Public professional contact research", sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(research + " official contact booking")}` }];
    if (process.env.TEAM_MUSICBRAINZ_COMMERCIAL_APPROVED !== "true") return { items: links.map((l, i) => ({ id: String(i), ...l, needsResearch: true })), provider: "Manual public-source research", notice: "These are research links, not verified leads or contact details. Review evidence before adding a prospect. MusicBrainz integration requires explicit commercial-use approval." };
    if (!(await consumeRateLimit({ scope: "team-musicbrainz", identity: "shared-provider", limit: 1, windowSeconds: 1 })).allowed) throw new TeamError("Discovery provider rate limit reached. Retry shortly.", 429);
    const url = new URL("https://musicbrainz.org/ws/2/artist/"); url.searchParams.set("query", `artist:"${query.replace(/["\\]/g, " ")}"`); url.searchParams.set("fmt", "json"); url.searchParams.set("limit", "20");
    const response = await fetch(url, { headers: { "User-Agent": `HYMN-Team-OS/1.0 (${getPublicAppUrl()})`, Accept: "application/json" }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) throw new TeamError("Discovery provider is unavailable. Use manual source research.", 502);
    const result = z.object({ artists: z.array(z.object({ id: z.string().uuid(), name: z.string(), country: z.string().optional() })).max(20) }).parse(await response.json());
    return { items: result.artists.map(artist => ({ ...artist, sourceUrl: `https://musicbrainz.org/artist/${artist.id}`, needsResearch: true })), provider: "MusicBrainz", notice: "Public metadata only. No email/contact is invented. Market and service fit require human verification." };
  }
  if (resource === "invitations") { if (!a.role.owner) throw new TeamError("Owner access required.", 403); return { items: await prisma.teamInvitation.findMany({ where: { workspaceId: a.workspaceId }, select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true, role: { select: { name: true } } }, ...page, orderBy: { createdAt: "desc" } }) }; }
  if (resource === "saved-views") return { items: await prisma.teamSavedView.findMany({ where: { workspaceId: a.workspaceId, memberId: a.id }, ...page }) };
  if (resource === "workflow-rules") { if (!a.role.owner) throw new TeamError("Owner access required.", 403); return { items: await prisma.teamWorkflowRule.findMany({ where: { workspaceId: a.workspaceId }, ...page }) }; }
  if (resource === "inbound") { demand(a, "crm.prospects.assign"); return { items: await prisma.growthLead.findMany({ where: { teamProspect: null, ...(!a.role.owner ? { assignedTo: a.userId } : {}) }, select: { id: true, name: true, interest: true, status: true, createdAt: true }, ...page, orderBy: { createdAt: "desc" } }) }; }
  if (resource === "search") {
    const query = (params.get("q") || "").trim().slice(0, 200); if (query.length < 2) return { items: [] };
    const contains = { contains: query, mode: "insensitive" as const };
    const tasks = await prisma.teamTask.findMany({ where: { ...taskScope(a), OR: [{ title: contains }, { description: contains }], AND: [taskScope(a)] }, take: 15, select: { id: true, title: true } });
    const projects = await prisma.teamProject.findMany({ where: { ...projectScope(a), title: contains }, take: 10, select: { id: true, title: true } });
    const prospects = can(a, "crm.prospects.view") ? await prisma.teamProspect.findMany({ where: { ...prospectScope(a), name: contains }, take: 10, select: { id: true, name: true } }) : [];
    const messages = can(a, "chat.use") ? await prisma.teamMessage.findMany({ where: { channel: channelScope(a), deletedAt: null, body: contains }, take: 10, select: { id: true, body: true, channelId: true } }) : [];
    return { items: [...tasks.map(t => ({ id: t.id, title: t.title, type: "Task", href: `/team?module=tasks&task=${t.id}` })), ...projects.map(p => ({ id: p.id, title: p.title, type: "Project", href: "/team?module=projects" })), ...prospects.map(p => ({ id: p.id, title: p.name, type: "Prospect", href: "/team?module=crm" })), ...messages.map(m => ({ id: m.id, title: m.body.slice(0, 100), type: "Message", href: `/team?module=chat&channel=${m.channelId}` }))] };
  }
  if (resource === "engineer-audit") {
    demand(a, "operations.engineers.manage");
    const profiles = await prisma.engineerProfile.findMany({ ...page, include: { listings: { select: { active: true, turnaroundDays: true, serviceType: true } } } });
    return { items: profiles.map(p => ({ id: p.id, name: p.professionalName, daws: portfolioDaws(p.portfolio), genres: p.genres, availability: p.availability, services: p.listings, missing: [...(!p.bio ? ["Bio"] : []), ...(!p.genres.length ? ["Genres"] : []), ...(!portfolioDaws(p.portfolio).length ? ["DAWs"] : []), ...(!p.listings.length ? ["Services"] : [])] })) };
  }
  if (resource === "analytics") {
    demand(a, "reports.team.view"); const start = params.get("start"); const end = params.get("end"); const from = start ? new Date(start) : new Date(Date.now() - 30 * 86400000); const until = end ? new Date(end) : new Date();
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) until.setTime(new Date(`${end}T23:59:59.999+05:30`).getTime());
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) from.setTime(new Date(`${start}T00:00:00+05:30`).getTime());
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || from > until) throw new TeamError("Choose a valid date range.");
    const where = can(a, "reports.all.view") ? { workspaceId: a.workspaceId } : { workspaceId: a.workspaceId, ownerId: a.id };
    const prospects = can(a, "crm.prospects.view") ? await prisma.teamProspect.findMany({ where: { ...where, createdAt: { gte: from, lte: until } }, select: { id: true, stage: true, verified: true } }) : [];
    const contacts = can(a, "crm.prospects.view") ? await prisma.teamOutreach.findMany({ where: { prospect: { ...where }, kind: "CONTACT", occurredAt: { gte: from, lte: until } }, select: { prospectId: true }, distinct: ["prospectId"] }) : [];
    const replies = can(a, "crm.prospects.view") ? await prisma.teamOutreach.findMany({ where: { prospect: { ...where }, kind: "REPLY", occurredAt: { gte: from, lte: until } }, select: { prospectId: true }, distinct: ["prospectId"] }) : [];
    const completed = await prisma.teamTask.findMany({ where: { ...taskScope(a), status: "COMPLETED", completedAt: { gte: from, lte: until } }, select: { createdAt: true, completedAt: true } });
    return { ...(await teamRevenue(a, from, until)), from, until, prospects: prospects.length, verified: prospects.filter(p => p.verified).length, contacted: contacts.length, replied: replies.length, convertedAccounts: prospects.filter(p => p.stage === "CONVERTED").length, replyRate: contacts.length ? replies.length / contacts.length : null, completed: completed.length, averageCycleHours: completed.length ? completed.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()) / 3600000, 0) / completed.length : null, definitions: "Contacted/replied are distinct prospects with actual recorded events in the date range. Converted accounts are not automatically paid conversions. Cycle time is creation to completion. Paid conversions and owner-only revenue use actual paid orders." };
  }
  throw new TeamError("Unknown team resource.", 404);
}
