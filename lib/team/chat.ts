import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { demand, TeamError, type Actor } from './policy';
import { channelScope } from './chat-policy';
import { messageSchema } from './validation';

const person = { id: true, user: { select: { name: true, avatar: true } } } as const;
const active = (workspaceId: string): Prisma.TeamMemberWhereInput => ({ workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' }, role: { OR: [{ owner: true }, { permissions: { has: 'chat.use' } }] } });
export async function chatRead(a: Actor, resource: string, params: URLSearchParams) {
  demand(a, 'chat.use');
  if (resource !== 'chat-conversations') throw new TeamError('Chat unavailable.', 404);
  const [items, members] = await Promise.all([
    prisma.teamChannel.findMany({ where: channelScope(a), take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { messages: { where: { deletedAt: null }, take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, body: true, createdAt: true, authorId: true } },
        _count: { select: { messages: { where: { deletedAt: null, authorId: { not: a.id }, NOT: { readMemberIds: { has: a.id } } } } } } } }),
    prisma.teamMember.findMany({ where: active(a.workspaceId), select: person, take: 500, orderBy: { id: 'asc' } })
  ]);
  return { members, items: items.map(c => {
    const direct = c.id.startsWith('dm-');
    const peer = direct ? members.find(m => c.memberIds.includes(m.id) && m.id !== a.id) : null;
    return { id: c.id, name: peer?.user.name || c.name, avatar: peer?.user.avatar || null, direct,
      memberIds: c.memberIds, unread: c._count.messages, lastMessage: c.messages[0] || null, createdAt: c.createdAt };
  }).sort((a, b) => new Date(b.lastMessage?.createdAt || b.createdAt).getTime() - new Date(a.lastMessage?.createdAt || a.createdAt).getTime()) };
}

// Chat has its own short transaction. It must not queue behind workstation's
// workspace-wide coordinator lock. Revalidate membership on every write.
export async function chatMutation(identity: Actor, resource: string, input: unknown) {
  return prisma.$transaction(async tx => {
    const a = await tx.teamMember.findUnique({ where: { id: identity.id }, include: { role: true, user: { select: { name: true, status: true } } } });
    if (!a || a.workspaceId !== identity.workspaceId || a.status !== 'ACTIVE' || a.user.status !== 'ACTIVE') throw new TeamError('Team access has been revoked.', 403);
    demand(a, 'chat.use');
    if (resource === 'chat-direct' || resource === 'chat-group') {
      const d = resource === 'chat-direct' ? z.object({ memberId: z.string().min(1).max(80) }).parse(input) : z.object({ name: z.string().trim().min(2).max(100), memberIds: z.array(z.string().min(1).max(80)).min(1).max(99) }).parse(input);
      const ids = [...new Set([a.id, ...('memberId' in d ? [d.memberId] : d.memberIds)])].sort();
      if (ids.length < 2) throw new TeamError('Choose another teammate.');
      const members = await tx.teamMember.findMany({ where: { ...active(a.workspaceId), id: { in: ids } }, select: person });
      if (members.length !== ids.length) throw new TeamError('Choose active members of this workspace.', 403);
      if ('memberId' in d) {
        const id = 'dm-' + createHash('sha256').update(JSON.stringify([a.workspaceId, ids])).digest('hex');
        return tx.teamChannel.upsert({ where: { id }, update: {}, create: { id, workspaceId: a.workspaceId, name: members.map(m => m.user.name || 'Teammate').join(' & ').slice(0, 100), private: true, memberIds: ids } });
      }
      return tx.teamChannel.create({ data: { workspaceId: a.workspaceId, name: d.name, private: true, memberIds: ids } });
    }
    if (resource === 'chat-read') {
      const d = z.object({ channelId: z.string().min(1).max(80), ids: z.array(z.string().min(1).max(80)).max(50) }).parse(input);
      if (!await tx.teamChannel.findFirst({ where: { ...channelScope(a), id: d.channelId } })) throw new TeamError('Conversation unavailable.', 404);
      await tx.teamMessage.updateMany({ where: { channelId: d.channelId, id: { in: d.ids }, deletedAt: null, NOT: { readMemberIds: { has: a.id } } }, data: { readMemberIds: { push: a.id } } });
      return { ok: true };
    }
    if (resource !== 'chat-send') throw new TeamError('Chat action unavailable.', 404);
    const d = messageSchema.parse(input);
    const channel = await tx.teamChannel.findFirst({ where: { ...channelScope(a), id: d.channelId } });
    if (!channel) throw new TeamError('Conversation unavailable.', 404);
    const clientKey = `${a.id}:${d.clientKey}`;
    if (d.parentId && !await tx.teamMessage.findFirst({ where: { id: d.parentId, channelId: channel.id, deletedAt: null } })) throw new TeamError('Reply unavailable.');
    const created = await tx.teamMessage.createMany({ data: [{ channelId: channel.id, authorId: a.id, body: d.body, clientKey, parentId: d.parentId, readMemberIds: [a.id] }], skipDuplicates: true });
    const message = await tx.teamMessage.findUniqueOrThrow({ where: { clientKey } });
    if (message.channelId !== channel.id || message.body !== d.body) throw new TeamError('Message retry content differs.', 409);
    if (created.count) {
      const recipients = await tx.teamMember.findMany({ where: { ...active(a.workspaceId), id: { not: a.id, ...(channel.private ? { in: channel.memberIds } : {}) } }, select: { id: true, preferences: true }, take: 500 });
      const data = recipients.filter(m => (m.preferences as { notifications?: boolean } | null)?.notifications !== false).map(m => ({ memberId: m.id, title: `${a.user.name || 'Teammate'}: new message${channel.id.startsWith('dm-') ? '' : ' in ' + channel.name}`, href: `/team?module=chat&channel=${channel.id}` }));
      if (data.length) await tx.teamNotification.createMany({ data });
    }
    return message;
  }, { maxWait: 5000, timeout: 10000 });
}
