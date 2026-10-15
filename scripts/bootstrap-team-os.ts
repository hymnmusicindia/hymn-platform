import { prisma } from "../lib/prisma";
import { isConfiguredAdminEmail } from "../lib/auth-role";
import { roleTemplates } from "../lib/team/policy";

// Explicit operator action. Never infer the owner or employees from a name.
// Usage: node --import tsx scripts/bootstrap-team-os.ts --owner-user-id 123
async function main() {
  const index = process.argv.indexOf("--owner-user-id"); const userId = Number(process.argv[index + 1]);
  if (index < 0 || !Number.isSafeInteger(userId) || userId < 1) throw new Error("Supply --owner-user-id with the verified founder account ID.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true, status: true } });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE" || !isConfiguredAdminEmail(user.email)) throw new Error("Owner must be an active ADMIN explicitly listed in ADMIN_GOOGLE_EMAILS.");
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(187462901)`;
    if (await tx.teamWorkspace.count()) throw new Error("Team OS already exists. Bootstrap is intentionally non-destructive and cannot be rerun.");
    const workspace = await tx.teamWorkspace.create({ data: { name: "HYMN Team OS" } });
    let ownerRoleId = "";
    for (const [name, permissions] of Object.entries(roleTemplates)) {
      const role = await tx.teamRole.create({ data: { workspaceId: workspace.id, name, permissions, owner: name === "Owner" } });
      if (role.owner) ownerRoleId = role.id;
    }
    const owner = await tx.teamMember.create({ data: { workspaceId: workspace.id, userId, roleId: ownerRoleId, department: "Founder", jobTitle: "Founder & Owner" } });
    await tx.teamChannel.create({ data: { workspaceId: workspace.id, name: "General", private: false, memberIds: [owner.id] } });
    await tx.teamAudit.create({ data: { workspaceId: workspace.id, actorId: owner.id, action: "workspace.bootstrapped", entityId: workspace.id, detail: { ownerUserId: userId } } });
  }, { timeout: 30000, maxWait: 10000 });
  console.log("Team OS created. No employees were granted access. Invite verified accounts from Team Directory.");
}
main().catch(() => { console.error("Bootstrap failed. Check the verified founder ID, configured admin allowlist and migration status. No credentials are printed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
