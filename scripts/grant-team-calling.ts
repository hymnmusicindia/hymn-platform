import { PrismaClient, Prisma } from '@prisma/client';
import { assertProductionDatabaseReady } from '../lib/production-database-safety';

// Explicit operator grant; preserve each person's existing duties and privileges.
async function main() {
  await assertProductionDatabaseReady(undefined, { enforceRestrictedRole: false });
  const db = new PrismaClient();
  try {
    const userIds = process.argv.find(arg => arg.startsWith('--users='))?.slice(8).split(',').map(Number) || [];
    if (!userIds.length || userIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw Error('Supply verified existing user IDs.');
    const members = await db.teamMember.findMany({ where: { userId: { in: userIds }, status: 'ACTIVE', user: { status: 'ACTIVE' } }, include: { role: true, user: { select: { name: true } } } });
    if (members.length !== userIds.length || new Set(members.map(m => m.workspaceId)).size !== 1 || members.some(m => m.role.owner)) throw Error('Expected distinct active employees in one workspace.');
    console.log(JSON.stringify(members.map(m => ({ userId: m.userId, name: m.user.name, role: m.role.name, action: 'Add calling permissions and enable caller rotation; retain existing duties.' }))));
    if (!process.argv.includes('--apply')) return;
    await db.$transaction(async tx => {
      const workspaceId = members[0].workspaceId;
      await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${workspaceId} FOR UPDATE`;
      const operator = await tx.teamMember.findFirstOrThrow({ where: { workspaceId, status: 'ACTIVE', role: { owner: true } }, orderBy: { id: 'asc' } });
      for (const preview of members) {
        const member = await tx.teamMember.findUniqueOrThrow({ where: { id: preview.id }, include: { role: true, user: { select: { status: true } } } });
        if (member.status !== 'ACTIVE' || member.user.status !== 'ACTIVE' || member.role.owner) throw Error('Employee access changed; rerun verification.');
        const permissions = [...new Set([...member.role.permissions, 'crm.prospects.view', 'crm.outreach.manage', 'calendar.view', 'calendar.manage'])];
        const name = member.role.name.endsWith(' & Calling') ? member.role.name : `${member.role.name} & Calling`;
        const existing = await tx.teamRole.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
        if (existing && (existing.owner || JSON.stringify([...existing.permissions].sort()) !== JSON.stringify([...permissions].sort()))) throw Error('Role name already has different permissions.');
        const role = existing || await tx.teamRole.create({ data: { workspaceId, name, permissions, owner: false } });
        const prefs = member.preferences && typeof member.preferences === 'object' && !Array.isArray(member.preferences) ? member.preferences : {};
        const crm = prefs.crm && typeof prefs.crm === 'object' && !Array.isArray(prefs.crm) ? prefs.crm : {};
        if (member.roleId === role.id && crm.caller === true) continue;
        await tx.teamMember.update({ where: { id: member.id }, data: { roleId: role.id, preferences: { ...prefs, crm: { ...crm, caller: true } } as Prisma.InputJsonValue } });
        await tx.teamAudit.create({ data: { workspaceId, actorId: operator.id, action: 'member.calling_access_granted', entityId: member.id, detail: { authority: 'Explicit account-owner request', previousRoleId: member.roleId, roleId: role.id, caller: true } } });
      }
    }, { timeout: 30000, maxWait: 10000 });
    console.log('Calling access granted. Schedules and existing research targets remain in place; no calls or messages were triggered.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Calling grant failed.'); process.exitCode = 1; });
