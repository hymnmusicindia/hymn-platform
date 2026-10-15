import { prisma } from "../lib/prisma";
import { roleTemplates } from "../lib/team/policy";

// Explicit, audited operator action. This grants Team OS access only, never
// application-wide ADMIN rights. Every account must already exist and be active.
async function main() {
  const at = process.argv.indexOf("--emails");
  const emails = (at >= 0 ? process.argv[at + 1] || "" : "").split(",").map(s => s.trim().toLowerCase());
  if (!emails.length || emails.some(s => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) || new Set(emails).size !== emails.length) throw new Error("Supply --emails with distinct, explicitly authorised account emails.");
  const users = await prisma.user.findMany({ where: { email: { in: emails, mode: "insensitive" }, status: "ACTIVE" }, select: { id: true, email: true } });
  if (users.length !== emails.length || emails.some(email => users.filter(u => u.email.toLowerCase() === email).length !== 1)) throw new Error("Each email must match exactly one existing active account. No accounts were changed.");
  if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ accounts: users, action: "Grant Team OS Owner; preview only" })); return; }
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(187462901)`;
    const workspaces = await tx.teamWorkspace.findMany({ take: 2 });
    if (workspaces.length > 1) throw new Error("Ambiguous workspace; choose a workspace explicitly before granting access.");
    const workspaceId = workspaces[0]?.id ?? (await tx.teamWorkspace.create({ data: { name: "HYMN Team OS" } })).id;
    if (!workspaces.length) {
      for (const [name, permissions] of Object.entries(roleTemplates)) await tx.teamRole.create({ data: { workspaceId, name, permissions, owner: name === "Owner" } });
      for (const name of ["General", "Growth", "Marketplace", "Operations", "Announcements"]) await tx.teamChannel.create({ data: { workspaceId, name, private: false, memberIds: [] } });
    }
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${workspaceId} FOR UPDATE`;
    const role = await tx.teamRole.findFirstOrThrow({ where: { workspaceId, owner: true } });
    for (const user of users) {
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.status !== "ACTIVE" || current.email.toLowerCase() !== user.email.toLowerCase()) throw new Error("Account changed; rerun verification.");
      const previous = await tx.teamMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } });
      if (previous?.status === "ACTIVE" && previous.roleId === role.id) continue;
      const member = await tx.teamMember.upsert({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, create: { workspaceId, userId: user.id, roleId: role.id, jobTitle: "Team Owner", department: "Leadership" }, update: { roleId: role.id, status: "ACTIVE", jobTitle: "Team Owner" } });
      await tx.teamAudit.create({ data: { workspaceId, actorId: member.id, action: "owner.explicit_operator_grant", entityId: member.id, detail: { userId: user.id, previousRoleId: previous?.roleId ?? null, authority: "Explicit account-owner request" } } });
    }
  }, { timeout: 30000, maxWait: 10000 });
  console.log("Verified accounts now have Team OS Owner access. Application account roles were not changed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Owner grant failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
