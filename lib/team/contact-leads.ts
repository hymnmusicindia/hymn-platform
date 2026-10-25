import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { contactPhoneKey } from './contact-directory';
import type { Actor } from './policy';

/** A saved contact is intake, never evidence of verification or consent. */
export async function ensureContactLead(tx: Prisma.TransactionClient, actor: Actor, clientId: string) {
  const card = await tx.teamClient.findFirst({ where: { id: clientId, workspaceId: actor.workspaceId }, include: { prospect: true } });
  if (!card || card.prospect || card.userId || card.mergedIntoId || card.status !== 'ACTIVE') return null;
  const emails = [card.email, card.secondaryEmail].filter(Boolean);
  if (emails.length && await tx.user.count({ where: { OR: emails.flatMap(email => [{ email: { equals: email, mode: 'insensitive' as const } }, { contactEmail: { equals: email, mode: 'insensitive' as const } }]) } })) return null;
  if (emails.length && await tx.growthLead.count({ where: { OR: emails.map(email => ({ email: { equals: email, mode: 'insensitive' as const } })) } })) return null;
  const phone = contactPhoneKey(card.phone);
  if (phone && (await tx.$queryRaw<{ id: number }[]>`SELECT id FROM users WHERE regexp_replace(regexp_replace(COALESCE(mobile,''), '[^0-9]', '', 'g'), '^00', '') IN (${phone}, ${phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone}) LIMIT 1`).length) return null;
  const duplicates = await tx.teamProspect.findMany({ where: { workspaceId: card.workspaceId }, select: { email: true, phone: true } });
  if (duplicates.some(p => p.email && emails.some(email => email.toLowerCase() === p.email!.toLowerCase()) || phone && contactPhoneKey(p.phone) === phone)) return null;
  const prospect = await tx.teamProspect.create({ data: {
    workspaceId: card.workspaceId, clientId: card.id, ownerId: card.ownerId, name: card.name,
    email: card.email || null, phone: card.phone, city: card.city, discoveredAt: card.createdAt,
    sourceUrl: `/team?module=contacts&client=${encodeURIComponent(card.id)}`,
    evidence: 'Contact saved by an operator. Source and contact details require verification.',
    score: { intent: 0, relevance: 0, recency: 0, contactability: 0, fit: 0 },
    identityKey: createHash('sha256').update(`contact:${card.id}`).digest('hex'),
    categories: [], stage: 'NEEDS_RESEARCH', verified: false, contactEligibility: 'UNVERIFIED',
  } });
  const lead = await tx.acquisitionLead.create({ data: { workspaceId: card.workspaceId, prospectId: prospect.id, researcherEmployeeId: actor.id, registeredAt: card.createdAt, attributionLockedAt: new Date(), ownershipHistory: { create: { actorEmployeeId: actor.id, newEmployeeId: actor.id, attributionRole: 'RESEARCHER', reason: 'Contact intake; verification pending.' } } } });
  await tx.teamAudit.create({ data: { workspaceId: card.workspaceId, actorId: actor.id, action: 'contact.lead_created', entityId: prospect.id, detail: { clientId: card.id, acquisitionLeadId: lead.id } } });
  return prospect;
}
