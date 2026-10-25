import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { contactPhone, contactPhoneKey, matchingContacts, publicContact } from './contact-directory';
import { demand, TeamError, type Actor } from './policy';

const identitySchema = z.object({ email: z.union([z.string().trim().email().max(320), z.literal('')]).default(''), phone: z.string().trim().max(40).default(''), excludeId: z.string().max(80).optional() });
/** Exact identity checks only. Inactive/blocked cards remain visible to avoid duplicates. */
export async function contactIdentityMatches(a: Actor, input: unknown, db: Prisma.TransactionClient = prisma) {
  demand(a, 'clients.view');
  const data = identitySchema.parse(input), email = data.email.toLowerCase(), phone = contactPhoneKey(data.phone);
  if (!email && (!phone || phone.length < 10)) return { items: [], accounts: [] };
  const phoneValue = Prisma.sql`CASE WHEN length(n)=10 THEN '91'||n ELSE n END`;
  const result = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT c.id FROM team_clients c LEFT JOIN users u ON u.id=c."userId"
    WHERE c."workspaceId"=${a.workspaceId} AND c.merged_into_id IS NULL
      AND (${data.excludeId || ''}='' OR c.id<>${data.excludeId || ''}) AND (
      (${email}<>'' AND EXISTS (SELECT 1 FROM unnest(array_cat(ARRAY[c.email,c."secondaryEmail",u.email,u.contact_email],c."additionalEmails")) e WHERE lower(coalesce(e,''))=${email}))
      OR (${phone}<>'' AND EXISTS (SELECT 1 FROM (SELECT regexp_replace(regexp_replace(coalesce(p,''),'[^0-9]','','g'),'^00','') n FROM unnest(array_append(array_prepend(c.phone,c."alternatePhones"),u.mobile)) p) normalized WHERE ${phoneValue}=${phone}))
    ) LIMIT 20`);
  const cards = result.length ? await db.teamClient.findMany({ where: { workspaceId: a.workspaceId, id: { in: result.map(row => row.id) } }, orderBy: { createdAt: 'asc' } }) : [];
  const users = await db.$queryRaw<{ id: number; name: string; email: string; phone: string }[]>(Prisma.sql`
    SELECT u.id,u.name,u.email,coalesce(u.mobile,'') AS phone FROM users u
    WHERE u.status='ACTIVE' AND u.role IN ('CUSTOMER','PRODUCER')
      AND NOT EXISTS (SELECT 1 FROM team_memberships m WHERE m."userId"=u.id AND m.status='ACTIVE')
      AND NOT EXISTS (SELECT 1 FROM team_clients c WHERE c."userId"=u.id)
      AND ((${email}<>'' AND (lower(u.email)=${email} OR lower(coalesce(u.contact_email,''))=${email}))
        OR (${phone}<>'' AND (SELECT ${phoneValue} FROM (SELECT regexp_replace(regexp_replace(coalesce(u.mobile,''),'[^0-9]','','g'),'^00','') n) normalized)=${phone}))
    LIMIT 5`);
  return { items: cards.map(card => publicContact(a, card)), accounts: users };
}

export async function useExistingAccount(tx: Prisma.TransactionClient, a: Actor, input: unknown) {
  demand(a, 'clients.manage');
  const data = z.object({ userId: z.number().int().positive(), email: z.union([z.string().trim().email(), z.literal('')]).default(''), phone: z.string().max(40).default('') }).parse(input);
  const existing = await tx.teamClient.findUnique({ where: { userId: data.userId } });
  if (existing) {
    if (existing.workspaceId !== a.workspaceId) throw new TeamError('This account already has a contact card in another workspace. Ask a manager to review it.', 409);
    return publicContact(a, existing);
  }
  const matches = await contactIdentityMatches(a, data, tx);
  const account = matches.accounts.find(account => account.id === data.userId);
  if (!account) throw new TeamError('The account no longer matches these details. Check again.', 409);
  const user = await tx.user.findUniqueOrThrow({ where: { id: account.id }, select: { contactEmail: true } });
  const cards = await matchingContacts(tx, a.workspaceId, { email: account.email, secondaryEmail: user.contactEmail || '', phone: account.phone });
  if (cards.length > 1 || cards.some(card => card.userId && card.userId !== account.id)) throw new TeamError('This account matches conflicting saved cards. Review and merge the correct cards first.', 409);
  const card = cards[0] ? await tx.teamClient.update({ where: { id: cards[0].id }, data: { userId: account.id, phone: cards[0].phone || contactPhone(account.phone), email: cards[0].email || account.email, version: { increment: 1 } } }) : await tx.teamClient.create({ data: { workspaceId: a.workspaceId, ownerId: a.id, userId: account.id, name: account.name, email: account.email, phone: contactPhone(account.phone) } });
  await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'client.account_linked', entityId: card.id, detail: { userId: account.id } } });
  return publicContact(a, card);
}
