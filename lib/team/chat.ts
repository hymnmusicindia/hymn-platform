import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { demand, TeamError, type Actor } from './policy';
import { channelScope, directChatId } from './chat-policy';
import { messageSchema } from './validation';
import { publishChatChange } from './chat-events';

const person = { id: true, jobTitle: true, user: { select: { name: true, avatar: true } } } as const;
const active = (workspaceId: string): Prisma.TeamMemberWhereInput => ({ workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' }, role: { OR: [{ owner: true }, { permissions: { has: 'chat.use' } }] } });
export async function chatRead(a: Actor, resource: string, params: URLSearchParams) {
  demand(a, 'chat.use');
  if (resource === 'chat-messages') {
    const channelId = z.string().min(1).max(100).parse(params.get('channel'));
    const channel = await prisma.teamChannel.findFirst({ where: { ...channelScope(a), id: channelId }, select: { id: true, private: true, memberIds: true } });
    if (!channel) {
      const peer = params.get('peer');
      if (!peer || peer === a.id || channelId !== directChatId(a.workspaceId, a.id, peer) || !await prisma.teamMember.findFirst({ where: { ...active(a.workspaceId), id: peer }, select: { id: true } })) throw new TeamError('Conversation unavailable.', 404);
      return { items: [], readers: [] };
    }
    const offset = z.coerce.number().int().min(0).max(100000).catch(0).parse(params.get('offset') || 0);
    const items = await prisma.teamMessage.findMany({ where: { channelId, deletedAt: null }, take: 50, skip: offset, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { author: { select: person } } });
    const ids = [...new Set(items.flatMap(m => m.readMemberIds))].filter(id => !channel.private || channel.memberIds.includes(id));
    const readers = ids.length ? await prisma.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' }, id: { in: ids } }, select: person, orderBy: { id: 'asc' } }) : [];
    return { items: items.reverse(), readers };
  }
  if (resource !== 'chat-conversations') throw new TeamError('Chat unavailable.', 404);
  const [items, members] = await Promise.all([
    prisma.teamChannel.findMany({ where: channelScope(a), take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { messages: { where: { deletedAt: null }, take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, body: true, createdAt: true, authorId: true } },
        _count: { select: { messages: { where: { deletedAt: null, authorId: { not: a.id }, NOT: { readMemberIds: { has: a.id } } } } } } } }),
    prisma.teamMember.findMany({ where: active(a.workspaceId), select: person, take: 500, orderBy: { id: 'asc' } })
  ]);
  return { members: members.map(m => ({ ...m, directChannelId: directChatId(a.workspaceId, a.id, m.id) })), items: items.map(c => {
    const direct = c.id.startsWith('dm-');
    const peer = direct ? members.find(m => c.memberIds.includes(m.id) && m.id !== a.id) : null;
    return { id: c.id, name: peer?.user.name || c.name, avatar: peer?.user.avatar || null, direct,
      peerId: direct ? c.memberIds.find(id => id !== a.id) : undefined, memberIds: c.memberIds, unread: c._count.messages, lastMessage: c.messages[0] || null, createdAt: c.createdAt };
  }).sort((a, b) => new Date(b.lastMessage?.createdAt || b.createdAt).getTime() - new Date(a.lastMessage?.createdAt || a.createdAt).getTime()) };
}

// Chat has its own short transaction. It must not queue behind workstation's
// workspace-wide coordinator lock. Revalidate membership on every write.
export async function chatMutation(identity: Actor, resource: string, input: unknown) {
  const result = await prisma.$transaction(async tx => {
    const a = await tx.teamMember.findUnique({ where: { id: identity.id }, include: { role: true, user: { select: { name: true, status: true } } } });
    if (!a || a.workspaceId !== identity.workspaceId || a.status !== 'ACTIVE' || a.user.status !== 'ACTIVE') throw new TeamError('Team access has been revoked.', 403);
    demand(a, 'chat.use');
    if (resource === 'chat-direct' || resource === 'chat-group') {
      const d = resource === 'chat-direct' ? z.object({ memberId: z.string().min(1).max(80) }).parse(input) : z.object({ name: z.string().trim().min(2).max(100), memberIds: z.array(z.string().min(1).max(80)).min(1).max(99), requestKey: z.string().uuid().optional() }).parse(input);
      const ids = [...new Set([a.id, ...('memberId' in d ? [d.memberId] : d.memberIds)])].sort();
      if (ids.length < 2) throw new TeamError('Choose another teammate.');
      const members = await tx.teamMember.findMany({ where: { ...active(a.workspaceId), id: { in: ids } }, select: person });
      if (members.length !== ids.length) throw new TeamError('Choose active members of this workspace.', 403);
      if ('memberId' in d) {
        const id = directChatId(a.workspaceId, ids[0], ids[1]);
        await tx.teamChannel.createMany({ data: [{ id, workspaceId: a.workspaceId, name: members.map(m => m.user.name || 'Teammate').join(' & ').slice(0, 100), private: true, memberIds: ids }], skipDuplicates: true });
        return tx.teamChannel.findUniqueOrThrow({ where: { id } });
      }
      if (d.requestKey) {
        const id = 'group-' + createHash('sha256').update(JSON.stringify([a.workspaceId, a.id, d.requestKey])).digest('hex');
        await tx.teamChannel.createMany({ data: [{ id, workspaceId: a.workspaceId, name: d.name, private: true, memberIds: ids }], skipDuplicates: true });
        const group = await tx.teamChannel.findUniqueOrThrow({ where: { id } });
        if (group.name !== d.name || JSON.stringify([...group.memberIds].sort()) !== JSON.stringify(ids)) throw new TeamError('Group retry content differs.', 409);
        return group;
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
    let channel = await tx.teamChannel.findFirst({ where: { ...channelScope(a), id: d.channelId } });
    if (!channel) {
      const parsedPeer = z.object({ peerId: z.string().min(1).max(80) }).safeParse(input);
      if (!parsedPeer.success) throw new TeamError('Conversation unavailable.', 404);
      const peer = parsedPeer.data.peerId;
      if (peer === a.id || d.channelId !== directChatId(a.workspaceId, a.id, peer)) throw new TeamError('Conversation unavailable.', 404);
      const target = await tx.teamMember.findFirst({ where: { ...active(a.workspaceId), id: peer }, select: person });
      if (!target) throw new TeamError('This teammate is no longer available.', 403);
      await tx.teamChannel.createMany({ data: [{ id: d.channelId, workspaceId: a.workspaceId, private: true, memberIds: [a.id, peer].sort(), name: [a.user.name || 'Teammate', target.user.name || 'Teammate'].join(' & ').slice(0, 100) }], skipDuplicates: true });
      channel = await tx.teamChannel.findUniqueOrThrow({ where: { id: d.channelId } });
    }
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
  const channelId = result && typeof result === 'object' && 'channelId' in result ? String(result.channelId) : input && typeof input === 'object' && 'channelId' in input ? String(input.channelId) : result && typeof result === 'object' && 'id' in result ? String(result.id) : '';
  if (channelId) publishChatChange(identity.workspaceId, channelId);
  return result;
}
