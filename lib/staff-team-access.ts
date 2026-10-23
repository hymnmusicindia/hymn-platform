import 'server-only';
import { prisma } from './prisma';
import { isConfiguredAdminEmail } from './auth-role';
import { isAdminAuthority } from './admin-role-policy';
export async function changeStaffTeamAccess(actorId: number, input: { memberId: string; roleId: string; status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'; expectedRoleId: string; expectedStatus: string; reason: string }) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(187462902)`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, include: { adminMembership: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    const authority = actor?.adminMembership;
    if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'ADMIN') throw Error('Active founder or super-administrator authority is required.');
    const allowed = authority ? authority.active && !authority.revokedAt && isAdminAuthority(authority.role.key) && authority.role.permissions.some(p => p.permission.key === 'system.manage') : isConfiguredAdminEmail(actor.email);
    if (!allowed) throw Error('Active founder or super-administrator authority is required.');
    const identity = await tx.teamMember.findUniqueOrThrow({ where: { id: input.memberId }, select: { workspaceId: true } });
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${identity.workspaceId} FOR UPDATE`;
    const member = await tx.teamMember.findUniqueOrThrow({ where: { id: input.memberId }, include: { role: true, user: { select: { status: true } } } });
    if (member.userId === actorId || member.role.owner) throw Error('Protected owner or self access cannot be edited here.');
    if (member.roleId !== input.expectedRoleId || member.status !== input.expectedStatus) throw Error('Team access changed. Refresh before saving.');
    if (input.status === 'ACTIVE' && member.user.status !== 'ACTIVE') throw Error('An active account is required.');
    const role = await tx.teamRole.findFirst({ where: { id: input.roleId, workspaceId: member.workspaceId, owner: false } });
    if (!role) throw Error('Choose a configured non-owner role in this workspace.');
    const row = await tx.teamMember.update({ where: { id: member.id }, data: { roleId: role.id, status: input.status } });
    const detail = { oldRoleId: member.roleId, roleId: role.id, oldStatus: member.status, status: row.status, reason: input.reason };
    await tx.auditLog.create({ data: { actorType: 'admin', actorId, actorRole: authority?.role.key || 'owner', action: 'staff.team_access_changed', entity: 'team_member', entityId: member.id, reason: input.reason, riskLevel: 'high', previousValue: { roleId: member.roleId, status: member.status }, newValue: { roleId: role.id, status: row.status } } });
    await tx.teamAudit.create({ data: { workspaceId: member.workspaceId, actorId: String(actorId), action: 'member.access_changed', entityId: member.id, detail } });
    return { id: row.id, roleId: role.id, status: row.status };
  }, { maxWait: 10000, timeout: 30000 });
}
