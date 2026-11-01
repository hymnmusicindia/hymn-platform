import type { Prisma } from '@prisma/client';
import type { Actor } from './policy';
import { createHash } from 'node:crypto';

export const directChatId = (workspace: string, first: string, second: string) =>
  'dm-' + createHash('sha256').update(JSON.stringify([workspace, [first, second].sort()])).digest('hex');

export const channelScope = (a: Actor): Prisma.TeamChannelWhereInput => ({
  workspaceId: a.workspaceId,
  OR: [{ private: false }, { memberIds: { has: a.id } }]
});
