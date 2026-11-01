import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { onboardingTemplates, TeamError } from './policy';

export async function acceptTeamInvitation(user: { id: number; email: string }, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new TeamError('Open the original invitation link and try again.');
  const invite = await prisma.teamInvitation.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') }, select: { id: true, workspaceId: true } });
  if (!invite) throw new TeamError('This invitation is unavailable. Ask the team owner for a new link.', 404);
  return prisma.$transaction(async tx => {
    // Keep the same lock as role/access changes, with the same time budget.
    // The default 5s budget can expire while waiting behind other work.
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${invite.workspaceId} FOR UPDATE`;
    const current = await tx.teamInvitation.findUnique({ where: { id: invite.id }, include: { role: true } });
    const account = await tx.user.findUnique({ where: { id: user.id }, select: { status: true, email: true } });
    if (!account || account.status !== 'ACTIVE') throw new TeamError('Sign in with an active HYMN account to join the team.', 403);
    if (!current || current.revokedAt || current.role.owner || current.role.workspaceId !== current.workspaceId) throw new TeamError('This invitation is no longer valid. Ask the team owner for a new link.', 403);
    if (current.email.trim().toLowerCase() !== account.email.trim().toLowerCase()) throw new TeamError('Sign in with the email address that received this invitation, then reopen the invitation link.', 403);
    const existing = await tx.teamMember.findUnique({ where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: user.id } } });
    if (current.acceptedAt) {
      // A lost response or repeated tap must not turn a successful join into
      // an error, nor restore access that an owner subsequently revoked.
      if (existing?.status === 'ACTIVE') return { workspaceId: existing.workspaceId, alreadyJoined: true };
      throw new TeamError('This invitation has been used. Ask the team owner to restore your team access.', 403);
    }
    if (current.expiresAt <= new Date()) throw new TeamError('This invitation has expired. Ask the team owner for a new link.', 410);
    if (existing) throw new TeamError(existing.status === 'ACTIVE' ? 'You already belong to this workspace. Open HYMN Team to continue.' : 'Team access already exists for this account. Ask the team owner to restore it.', 409);
    const member = await tx.teamMember.create({ data: { workspaceId: current.workspaceId, userId: user.id, roleId: current.roleId, department: current.department, jobTitle: current.jobTitle } });
    await tx.teamInvitation.update({ where: { id: current.id }, data: { acceptedAt: new Date() } });
    const template = onboardingTemplates.find(t => t.role === current.role.name && t.jobTitle === current.jobTitle);
    if (template) {
      await tx.teamMember.update({ where: { id: member.id }, data: { responsibilities: template.target } });
      const task = await tx.teamTask.create({ data: { workspaceId: member.workspaceId, creatorId: member.id, ownerId: member.id, title: 'Week one: your HYMN onboarding objective', description: template.target, dueAt: new Date(Date.now() + 7 * 86400000), approvalRequired: true, eventKey: `${member.id}:onboarding` } });
      await tx.teamNotification.create({ data: { memberId: member.id, title: 'Your week-one assignment is ready', href: `/team?module=work&task=${task.id}` } });
    }
    await tx.teamAudit.create({ data: { workspaceId: member.workspaceId, actorId: member.id, action: 'invitation.accepted', entityId: current.id, detail: {} } });
    return { workspaceId: member.workspaceId, alreadyJoined: false };
  }, { maxWait: 10000, timeout: 30000 });
}
