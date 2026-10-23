import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { reviewCreatorApplication } from '@/lib/creator-application-review';
import { can, demand, TeamError, type Actor } from './policy';
import { teamWrite } from './service';

const capability = { producer: 'operations.producers.approve', engineer: 'operations.engineers.approve' } as const;
export const creatorReviewSchema = z.object({ kind: z.enum(['producer', 'engineer']), id: z.number().int().positive(), updatedAt: z.string().datetime(), decision: z.enum(['APPROVE', 'REJECT']), note: z.string().trim().min(5).max(2000), checksConfirmed: z.boolean() }).superRefine((v, c) => { if (v.decision === 'APPROVE' && !v.checksConfirmed) c.addIssue({ code: 'custom', message: 'Confirm the application and work samples have been checked.' }); });
async function primary(tx: Prisma.TransactionClient, a: Actor) {
  const workspace = await tx.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (workspace?.id !== a.workspaceId) throw new TeamError('Creator reviews belong to the primary HYMN workspace.', 403);
}
export async function readCreatorApplications(identity: Actor) {
  return teamWrite(identity, async (tx, a) => {
    await primary(tx, a);
    if (!can(a, capability.producer) && !can(a, capability.engineer)) throw new TeamError('Creator application review permission is required.', 403);
    const user = { select: { name: true } } as const;
    const producers = can(a, capability.producer) ? await tx.producerApplication.findMany({ where: { status: 'PENDING', userId: { not: a.userId } }, include: { user }, orderBy: { createdAt: 'asc' }, take: 100 }) : [];
    const engineers = can(a, capability.engineer) ? await tx.engineerApplication.findMany({ where: { status: 'PENDING', userId: { not: a.userId } }, include: { user }, orderBy: { createdAt: 'asc' }, take: 100 }) : [];
    return { producers, engineers };
  });
}
export async function decideCreatorApplication(identity: Actor, value: unknown, requestId: string) {
  const input = creatorReviewSchema.parse(value);
  return teamWrite(identity, async (tx, a) => {
    await primary(tx, a); demand(a, capability[input.kind]);
    const result = await reviewCreatorApplication(tx, { ...input, expectedUpdatedAt: new Date(input.updatedAt), actorId: a.userId, requestId });
    await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: `creator.${input.kind}.${result.status.toLowerCase()}`, entityId: String(input.id), detail: { note: input.note, checksConfirmed: input.checksConfirmed, profileId: result.profileId } } });
    return result;
  });
}
