import 'server-only';
import { Prisma } from '@prisma/client';
import { whatsappNumber } from './phone';
import { contactPhoneKey } from './contact-directory';

// Login account type is independent of employment. Team members can still be
// artists/producers; their own browsing must not create customer sales work.
export const internalUserWhere: Prisma.UserWhereInput = {
  OR: [{ role: 'ADMIN' }, { teamMemberships: { some: { status: { in: ['ACTIVE', 'SUSPENDED'] } } } }, { adminMembership: { is: { active: true, revokedAt: null } } }]
};
export type InternalIdentities = { users: Set<number>; emails: Set<string>; phones: Set<string> };
type Identity = { id?: number | string; userId?: number | null; customerUserId?: number | null; email?: string | null; secondaryEmail?: string | null; additionalEmails?: string[]; phone?: string | null; mobile?: string | null; alternatePhones?: string[] };
export function matchesInternalIdentity(roster: InternalIdentities, person: Identity) {
  const id = person.userId ?? person.customerUserId ?? person.id;
  if (typeof id === 'number' && roster.users.has(id)) return true;
  if ([person.email, person.secondaryEmail, ...(person.additionalEmails || [])].some(v => v && roster.emails.has(v.trim().toLowerCase()))) return true;
  return [person.phone, person.mobile, ...(person.alternatePhones || [])].some(v => { const phone = whatsappNumber(v || ''); return phone && roster.phones.has(contactPhoneKey(phone)); });
}
export async function internalIdentities(tx: Prisma.TransactionClient): Promise<InternalIdentities> {
  const staff = await tx.user.findMany({ where: internalUserWhere, select: { id: true, email: true, mobile: true } });
  const linked = await tx.teamClient.findMany({ where: { userId: { in: staff.map(u => u.id) } }, select: { email: true, secondaryEmail: true, additionalEmails: true, phone: true, alternatePhones: true } });
  const roster: InternalIdentities = { users: new Set(staff.map(u => u.id)), emails: new Set(), phones: new Set() };
  for (const p of [...staff, ...linked]) {
    const person = p as Identity;
    for (const email of [person.email, person.secondaryEmail, ...(person.additionalEmails || [])]) if (email?.trim()) roster.emails.add(email.trim().toLowerCase());
    for (const value of [person.mobile, person.phone, ...(person.alternatePhones || [])]) { const phone = whatsappNumber(value || ''); if (phone) roster.phones.add(contactPhoneKey(phone)); }
  }
  return roster;
}
