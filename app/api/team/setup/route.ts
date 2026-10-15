import { isSameAppOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { teamIdentity } from "@/lib/team/access";
import { configuredAdminEmails } from "@/lib/auth-role";
import { getAdminAccessForPage } from "@/lib/access";
import { roleTemplates, TeamError } from "@/lib/team/policy";
export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    const user = await teamIdentity(); const access = await getAdminAccessForPage(); const allowlist = configuredAdminEmails();
    const explicitlyConfigured = process.env.TEAM_OWNER_USER_ID ? Number(process.env.TEAM_OWNER_USER_ID) === user.id : allowlist.size === 1 && allowlist.has(user.email.toLowerCase());
    if (!explicitlyConfigured || !access || !["owner", "super_admin"].includes(access.role)) throw new TeamError("Owner setup requires the explicitly configured founder account. Set TEAM_OWNER_USER_ID when multiple administrators are configured.", 403);
    const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(187462901)`;
      if (await tx.teamWorkspace.count()) throw new TeamError("Team OS is already initialised. Ask its owner for an invitation.", 409);
      const workspace = await tx.teamWorkspace.create({ data: { name: "HYMN Team OS" } }); let ownerRoleId = "";
      for (const [name, permissions] of Object.entries(roleTemplates)) { const role = await tx.teamRole.create({ data: { workspaceId: workspace.id, name, owner: name === "Owner", permissions } }); if (role.owner) ownerRoleId = role.id; }
      const member = await tx.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: ownerRoleId, department: "Founder", jobTitle: "Founder & Owner" } });
      await tx.teamChannel.create({ data: { workspaceId: workspace.id, name: "General", private: false, memberIds: [member.id] } });
      await tx.teamAudit.create({ data: { workspaceId: workspace.id, actorId: member.id, action: "workspace.initialised", entityId: workspace.id, detail: { ownerUserId: user.id } } }); return { workspaceId: workspace.id };
    }, { timeout: 30000, maxWait: 10000 });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof TeamError ? error.message : "Owner setup unavailable. Check migration and founder configuration." }, { status: error instanceof TeamError ? error.status : 503 }); }
}
