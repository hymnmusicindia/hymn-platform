export const permissions = ["calendar.view", "calendar.manage", "clients.view", "clients.manage", "team.members.view", "team.members.invite", "team.members.manage", "tasks.create", "tasks.assign", "tasks.update", "tasks.complete", "tasks.approve", "tasks.delete", "tasks.all", "projects.create", "projects.manage", "chat.use", "chat.channel.manage", "crm.prospects.view", "crm.prospects.create", "crm.prospects.assign", "crm.outreach.manage", "crm.all", "acquisition.admin", "operations.distribution.review", "operations.distribution.qc", "operations.beats.manage", "operations.engineers.manage", "operations.studio.review", "reports.team.view", "reports.all.view", "audit.view", "settings.manage"] as const;
export type Permission = typeof permissions[number];
export const statuses = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export const pipeline = ["NEW", "NEEDS_RESEARCH", "UNQUALIFIED", "DUPLICATE", "NOT_INTERESTED", "ASSIGNED", "QUALIFIED", "READY_TO_CONTACT", "CONTACTED", "REPLIED", "INTERESTED", "OFFER_SHARED", "CONVERTED", "LOST", "DO_NOT_CONTACT"] as const;
export const categories = ["Distribution", "Playlist curation", "Beat licensing", "Mixing & mastering", "Studios & producers"] as const;
const member: Permission[] = ["calendar.view", "calendar.manage", "clients.view", "clients.manage", "team.members.view", "tasks.create", "tasks.update", "tasks.complete", "projects.create", "chat.use", "reports.team.view"];
export const roleTemplates: Record<string, Permission[]> = {
  Owner: [...permissions],
  Admin: permissions.filter(p => p !== "settings.manage" && p !== "team.members.manage"),
  "Team Manager": [...member, "tasks.assign", "tasks.approve", "projects.manage", "chat.channel.manage"],
  Researcher: [...member, "crm.prospects.view", "crm.prospects.create"],
  "Call Representative": [...member, "crm.prospects.view", "crm.outreach.manage"],
  "Growth Executive": [...member, "crm.prospects.view", "crm.prospects.create", "crm.outreach.manage", "operations.distribution.review", "operations.studio.review"],
  "Marketplace Executive": [...member, "operations.beats.manage", "operations.engineers.manage"],
  "Release QC Reviewer": [...member, "operations.distribution.review", "operations.distribution.qc"],
  "Operations Executive": [...member, "operations.distribution.review", "operations.studio.review"],
  "Team Member": member,
  Viewer: ["calendar.view", "clients.view", "team.members.view", "reports.team.view"],
};
export const onboardingTemplates = [
  { name: "Tavish Relhan", role: "Growth Executive", department: "Growth & Client Success", jobTitle: "Artist Growth & Client Operations", target: "Contact 20 researched artist prospects. Count actual contact events, not drafts." },
  { name: "Manha Dakora", role: "Marketplace Executive", department: "Marketplace & Creator Success", jobTitle: "Beat Marketplace & Creator Operations", target: "Audit existing beat listings and engineer profiles; deliver a prioritised missing-information report." },
];
export class TeamError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type Actor = { id: string; workspaceId: string; userId: number; department: string; role: { owner: boolean; permissions: string[] } };
export function can(actor: Actor, permission: Permission) { return permission === "clients.view" || permission === "clients.manage" || actor.role.owner || actor.role.permissions.includes(permission); }
export function demand(actor: Actor, permission: Permission) { if (!can(actor, permission)) throw new TeamError("You do not have permission for this action.", 403); }
export function assertTaskTransition(input: { previous: string; next: string; review: boolean; evidence: string; blocker: string; dependenciesComplete: boolean; checklistComplete: boolean; reviewer: boolean; authorIsOwner: boolean }) {
  if (!(statuses as readonly string[]).includes(input.next)) throw new TeamError("Unknown task status.");
  if (input.next === "BLOCKED" && !input.blocker.trim()) throw new TeamError("Explain the blocker before blocking work.");
  if (input.next === "COMPLETED" || input.next === "IN_REVIEW") {
    if (!input.dependenciesComplete) throw new TeamError("Complete the dependencies first.");
    if (!input.checklistComplete) throw new TeamError("Complete the checklist first.");
    if (input.review && !input.evidence.trim()) throw new TeamError("Completion evidence is required.");
  }
  if (input.review && input.next === "COMPLETED" && (input.previous !== "IN_REVIEW" || !input.reviewer || input.authorIsOwner)) throw new TeamError("An independent authorised reviewer must approve this task from In Review.", 403);
  if (["COMPLETED", "CANCELLED"].includes(input.previous) && !["TODO", input.previous].includes(input.next)) throw new TeamError("Reopen the task to To Do first.");
}
export function assertAcyclic(taskId: string, dependencies: string[], graph: Map<string, string[]>) {
  const active = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new TeamError("Circular task dependencies are not allowed.");
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of id === taskId ? dependencies : graph.get(id) ?? []) visit(dependency);
    active.delete(id); visited.add(id);
  };
  visit(taskId);
}
export function weekStartIndia(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60_000);
  const day = local.getUTCDay();
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (day + 6) % 7));
}
export function scoreTotal(score: Record<string, number>) { return Object.values(score).reduce((sum, value) => sum + value, 0); }
