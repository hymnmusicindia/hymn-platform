import type { Prisma } from '@prisma/client';
import { can, TeamError, type Actor } from './policy';

/** HYMN's local ten-digit numbers are Indian; explicit international prefixes are retained. */
export function contactPhoneKey(phone:string) {
  const digits=phone.replace(/\D/g,'').replace(/^00/,'');
  return digits.length===10 ? `91${digits}` : digits;
}
export function contactPhone(phone:string) { const key=contactPhoneKey(phone);return key?`+${key}`:''; }

export function contactNotesAllowed(a: Actor, card: { ownerId: string }) { return card.ownerId === a.id || can(a, 'crm.all'); }
export function publicContact<T extends { ownerId: string; notes: string; welcomeJobs?: unknown }>(a: Actor, card: T) {
  const notesVisible = contactNotesAllowed(a, card);
  return { ...card, notes: notesVisible ? card.notes : '', notesVisible, ...(!notesVisible && 'welcomeJobs' in card ? { welcomeJobs: [] } : {}) };
}
export async function contactPhoneMatches(tx: Prisma.TransactionClient, workspaceId: string, phone: string) {
  const digits = contactPhoneKey(phone);
  if (!digits) return [];
  return tx.$queryRaw<{ id: string }[]>`SELECT id FROM team_clients WHERE "workspaceId" = ${workspaceId} AND merged_into_id IS NULL AND EXISTS (SELECT 1 FROM unnest(array_prepend(phone,"alternatePhones")) p WHERE CASE WHEN length(regexp_replace(p,'[^0-9]','','g'))=10 THEN '91'||regexp_replace(p,'[^0-9]','','g') ELSE regexp_replace(regexp_replace(p,'[^0-9]','','g'),'^00','') END = ${digits}) LIMIT 20`;
}
export async function matchingContacts(tx:Prisma.TransactionClient,workspaceId:string,input:{phone?:string;email?:string;secondaryEmail?:string;excludeId?:string}) {
  const emails=[input.email,input.secondaryEmail].filter((e):e is string=>Boolean(e?.trim())).map(e=>e.trim().toLowerCase());
  const phones=input.phone?await contactPhoneMatches(tx,workspaceId,input.phone):[];
  if(!emails.length&&!phones.length)return [];
  return tx.teamClient.findMany({where:{workspaceId,mergedIntoId:null,...(input.excludeId?{id:{not:input.excludeId}}:{}),OR:[{id:{in:phones.map(p=>p.id)}},...emails.flatMap(email=>[{email:{equals:email,mode:'insensitive' as const}},{secondaryEmail:{equals:email,mode:'insensitive' as const}},{additionalEmails:{has:email}}])]},orderBy:{createdAt:'asc'},take:20});
}
export async function linkProspectContact(tx: Prisma.TransactionClient, prospectId: string, actor?: Actor, origin: 'TEAM' | 'AUTOMATION' = 'TEAM') {
  const p = await tx.teamProspect.findUniqueOrThrow({ where: { id: prospectId } });
  if (actor && actor.workspaceId !== p.workspaceId) throw new TeamError('Contact belongs to another workspace.', 403);
  if (p.clientId) return p.clientId;
  const phone = contactPhone(p.phone);
  const matches=await matchingContacts(tx,p.workspaceId,{phone,email:p.email||''});
  // Conflicting identities require a human merge; never join unrelated records.
  if (matches.length > 1) return null;
  const card = matches[0] ?? await tx.teamClient.create({ data: { workspaceId: p.workspaceId, ownerId: p.ownerId, name: p.name, phone, email: p.email || '', city: p.city, status: p.suppressed ? 'DO_NOT_CONTACT' : 'ACTIVE' } });
  if (!matches.length && actor) {
    await tx.teamAudit.create({ data: { workspaceId: p.workspaceId, actorId: actor.id, action: 'client.created', entityId: card.id, detail: { contactName: card.name, source: 'LEAD', prospectId: p.id, origin } } });
  }
  if (await tx.teamProspect.findFirst({ where: { clientId: card.id, id: { not: p.id } } })) return null;
  await tx.teamProspect.update({ where: { id: p.id }, data: { clientId: card.id } });
  if (p.suppressed && card.status !== 'DO_NOT_CONTACT') await tx.teamClient.update({ where: { id: card.id }, data: { status: 'DO_NOT_CONTACT', version: { increment: 1 } } });
  return card.id;
}

export async function syncProspectContact(tx: Prisma.TransactionClient, prospectId: string, actor?: Actor) {
  const clientId = await linkProspectContact(tx, prospectId, actor);
  if (!clientId) return;
  const p = await tx.teamProspect.findUniqueOrThrow({ where: { id: prospectId } });
  const card=await tx.teamClient.findUniqueOrThrow({where:{id:clientId}});
  if((await matchingContacts(tx,p.workspaceId,{phone:p.phone,email:p.email||'',excludeId:clientId})).length)throw new TeamError('These details match another contact. Review and merge the cards in Contact database before changing the pipeline identity.',409);
  const phone=contactPhone(p.phone),email=(p.email||'').toLowerCase();
  await tx.teamClient.update({where:{id:clientId},data:{name:p.name,email,phone,city:p.city,additionalEmails:[...new Set([card.email,...card.additionalEmails].filter(e=>e&&e.toLowerCase()!==email&&e.toLowerCase()!==card.secondaryEmail.toLowerCase()).map(e=>e.toLowerCase()))],alternatePhones:[...new Set([card.phone,...card.alternatePhones].filter(Boolean).map(contactPhone))].filter(v=>v!==phone),...(p.suppressed?{status:'DO_NOT_CONTACT'}:{}),version:{increment:1}}});
  if (p.suppressed) await tx.teamTask.updateMany({ where: { workspaceId: p.workspaceId, clientId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, data: { status: 'CANCELLED', version: { increment: 1 } } });
}
