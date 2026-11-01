import type { Prisma } from '@prisma/client';
import type { Actor } from './policy';

export const channelScope = (a: Actor): Prisma.TeamChannelWhereInput => ({
  workspaceId: a.workspaceId,
  OR: [{ private: false }, { memberIds: { has: a.id } }]
});
