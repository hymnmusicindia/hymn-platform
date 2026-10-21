import type { Prisma } from '@prisma/client';
import { can, type Actor } from './policy';

export function contactNotesAllowed(a: Actor, card: { ownerId: string }) { return card.ownerId === a.id || can(a, 'crm.all'); }
export function publicContact<T extends { ownerId: string; notes: string; welcomeJobs?: unknown }>(a: Actor, card: T) {
  const notesVisible = contactNotesAllowed(a, card);
  return { ...card, notes: notesVisible ? card.notes : '', notesVisible, ...(!notesVisible && 'welcomeJobs' in card ? { welcomeJobs: [] } : {}) };
}
export async function contactPhoneMatches(tx: Prisma.TransactionClient, workspaceId: string, phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return [];
  return tx.$queryRaw<{ id: string }[]>`SELECT id FROM team_clients WHERE "workspaceId" = ${workspaceId} AND regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^00', '') = ${digits} LIMIT 2`;
}
export async function linkProspectContact(tx: Prisma.TransactionClient, prospectId: string) {
  const p = await tx.teamProspect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.clientId) return p.clientId;
  const phone = p.phone.replace(/[^+\d]/g, '');
  const phoneMatches = await contactPhoneMatches(tx, p.workspaceId, phone);
  const matches = await tx.teamClient.findMany({ where: { workspaceId: p.workspaceId, OR: [...(p.email ? [{ email: { equals: p.email, mode: 'insensitive' as const } }, { secondaryEmail: { equals: p.email, mode: 'insensitive' as const } }] : []), { id: { in: phoneMatches.map(c => c.id) } }] }, orderBy: { createdAt: 'asc' }, take: 2 });
  // Conflicting identities require a human merge; never join unrelated records.
  if (matches.length > 1) return null;
  const card = matches[0] ?? await tx.teamClient.create({ data: { workspaceId: p.workspaceId, ownerId: p.ownerId, name: p.name, phone, email: p.email || '', city: p.city, status: p.suppressed ? 'DO_NOT_CONTACT' : 'ACTIVE' } });
  if (await tx.teamProspect.findFirst({ where: { clientId: card.id, id: { not: p.id } } })) return null;
  await tx.teamProspect.update({ where: { id: p.id }, data: { clientId: card.id } });
  if (p.suppressed && card.status !== 'DO_NOT_CONTACT') await tx.teamClient.update({ where: { id: card.id }, data: { status: 'DO_NOT_CONTACT', version: { increment: 1 } } });
  return card.id;
}

export async function syncProspectContact(tx: Prisma.TransactionClient, prospectId: string) {
  const clientId = await linkProspectContact(tx, prospectId);
  if (!clientId) return;
  const p = await tx.teamProspect.findUniqueOrThrow({ where: { id: prospectId } });
  await tx.teamClient.update({ where: { id: clientId }, data: { name: p.name, email: p.email || '', phone: p.phone, city: p.city, ...(p.suppressed ? { status: 'DO_NOT_CONTACT' } : {}), version: { increment: 1 } } });
  if (p.suppressed) await tx.teamTask.updateMany({ where: { workspaceId: p.workspaceId, clientId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, data: { status: 'CANCELLED', version: { increment: 1 } } });
}
