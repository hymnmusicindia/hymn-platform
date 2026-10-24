import 'server-only';
import { z } from 'zod';
import { isConfiguredAdminEmail } from './auth-role';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { mapSupportTicket, createNotification } from './db';
import type { SupportDetails } from './types';
import { sendTransactionalEmail } from './email/send-transactional-email';
import { getEmailConfig } from './email/email-client';
import { emailLayout } from './email/email-templates';
import { getPublicAppUrl } from './public-app-url';

export class SupportError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const supportDetails = (value: unknown): SupportDetails => value && typeof value === 'object' && !Array.isArray(value) ? value as SupportDetails : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const email = z.string().trim().email().max(320);
export async function validateSupportDetails(body: Record<string, unknown>, user: {id:number; email:string}) {
  const parsed = email.safeParse(body.email === undefined ? user.email : body.email);
  if (!parsed.success) throw new SupportError('Enter a valid contact email address.');
  const upc = String(body.upc || '').trim();
  if (upc && !/^\d{12,14}$/.test(upc)) throw new SupportError('UPC must contain 12 to 14 digits, or leave it blank.');
  const ids = z.array(z.number().int().positive()).max(3).safeParse(body.screenshotIds || []);
  if (!ids.success || new Set(ids.data).size !== ids.data.length) throw new SupportError('Attach up to three screenshots.');
  if (ids.data.length && await prisma.storedAsset.count({ where: { id: { in: ids.data }, ownerUserId:user.id, assetType:'private_support_screenshot', deletedAt:null } }) !== ids.data.length) throw new SupportError('One of the screenshots is unavailable or does not belong to you.');
  const details: SupportDetails = { email:parsed.data.toLowerCase(), upc, screenshotIds:ids.data };
  if (body.callbackRequested === true) Object.assign(details, callbackDetails(body));
  return details;
}
export function callbackDetails(body: Record<string, unknown>): SupportDetails {
  const phone = String(body.callbackPhone || '').replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new SupportError('Enter a callback number with country code, for example +919876543210.');
  return { callbackPhone:phone, callbackRequestedAt:new Date().toISOString(), callbackStatus:'REQUESTED', callbackPreference:String(body.callbackPreference || '').trim().slice(0,300) };
}
export async function readSupportTicket(id:number) {
  const ticket = await prisma.supportTicket.findUnique({ where:{id}, include:{ replies:{orderBy:{createdAt:'asc'}} } });
  return ticket ? mapSupportTicket(ticket) : null;
}
export async function changeSupportCallback(id:number, userId:number | null, body:Record<string, unknown>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id} FOR UPDATE`;
    const ticket = await tx.supportTicket.findUnique({where:{id}});
    if (!ticket || (userId !== null && ticket.userId !== userId)) throw new SupportError('Ticket not found.',404);
    if (['CLOSED','RESOLVED'].includes(ticket.status)) throw new SupportError('Open a new request for further assistance.');
    const details = supportDetails(ticket.details);
    if (body.action === 'callback-no-answer' || body.action === 'callback-contacted') {
      if (!details.callbackRequestedAt || !['REQUESTED','ASSIGNED'].includes(details.callbackStatus || '')) throw new SupportError('There is no pending callback to record.',409);
      if (String(body.notes || '').trim().length < 3) throw new SupportError('Record a short note about the actual call attempt.');
      details.callbackStatus = body.action === 'callback-no-answer' ? 'NO_ANSWER' : 'CONTACTED'; details.callbackAttemptAt = new Date().toISOString();
    } else {
      if (['REQUESTED','ASSIGNED'].includes(details.callbackStatus || '')) throw new SupportError('Your callback is already requested. The team will follow up.',409);
      Object.assign(details, callbackDetails(body));
    }
    await tx.supportTicket.update({where:{id},data:{details:json(details)}});
    return readSupportTicketIn(tx,id);
  });
}
export async function retrySupportReply(ticketId:number, body:Record<string, unknown>, authorId:number) {
  if (body.confirmedNotSent !== true || String(body.reason || '').trim().length < 10) throw new SupportError('Check the email logs and record why delivery was not completed before retrying.');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${ticketId} FOR UPDATE`;
    const reply = await tx.supportReply.findFirst({where:{id:String(body.replyId),ticketId,status:'REVIEW'}});
    if (!reply) throw new SupportError('This message is not awaiting delivery review.',409);
    const log = await tx.emailLog.findUnique({where:{eventKey:`support-reply:${reply.id}:${reply.attempt}`}});
    if (log?.status === 'sent') throw new SupportError('The email provider already accepted this message. Do not resend.',409);
    await tx.auditLog.create({data:{actorType:'admin',actorId:authorId || null,actorRole:'support',action:'support.email_retry_reviewed',entity:'support_ticket',entityId:String(ticketId),reason:String(body.reason).slice(0,2000),newValue:{replyId:reply.id}}});
    return tx.supportReply.update({where:{id:reply.id},data:{status:'QUEUED',error:null,attempt:{increment:1}}});
  });
}
async function readSupportTicketIn(tx:Prisma.TransactionClient,id:number) {
  return mapSupportTicket(await tx.supportTicket.findUniqueOrThrow({where:{id},include:{replies:{orderBy:{createdAt:'asc'}}}}));
}
export async function queueSupportReply(ticketId:number, authorId:number, body:Record<string, unknown>) {
  const input = z.object({ requestKey:z.string().uuid(), kind:z.enum(['solution','missed-call']), subject:z.string().trim().min(3).max(200).refine(s=>!/[\r\n]/.test(s)), body:z.string().trim().min(10).max(10000), reviewed:z.literal(true) }).safeParse(body);
  if (!input.success) throw new SupportError('Review the recipient, subject and message before sending.');
  const data = input.data;
  if (/\[Add the solution/i.test(data.body)) throw new SupportError('Replace the template placeholder with the actual solution.');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${ticketId} FOR UPDATE`;
    const ticket = await tx.supportTicket.findUnique({where:{id:ticketId},include:{user:{select:{email:true}}}});
    if (!ticket) throw new SupportError('Ticket not found.',404);
    const details = supportDetails(ticket.details);
    const recipient = email.safeParse(details.email || ticket.user.email);
    if (!recipient.success) throw new SupportError('This ticket does not have a valid recipient.');
    if (data.kind === 'missed-call' && (details.callbackStatus !== 'NO_ANSWER' || !details.callbackAttemptAt)) throw new SupportError('Record an unanswered call before using this template.',409);
    const requestKey = data.kind === 'missed-call' ? `support:${ticketId}:missed:${details.callbackAttemptAt}` : `support:${ticketId}:${data.requestKey}`;
    const prior = await tx.supportReply.findUnique({where:{requestKey}});
    if (prior) {
      if (prior.subject !== data.subject || prior.body !== data.body) throw new SupportError('This message was already queued. Refresh to see its status.',409);
      return prior;
    }
    const reply = await tx.supportReply.create({data:{ticketId,authorId,requestKey,kind:data.kind,recipient:recipient.data,subject:data.subject,body:data.body}});
    await tx.auditLog.create({data:{actorType:'admin',actorId:authorId || null,actorRole:'support',action:'support.email_queued',entity:'support_ticket',entityId:String(ticketId),newValue:{replyId:reply.id,kind:data.kind}}});
    return reply;
  });
}
/** Durable outbox: atomic claims; ambiguous delivery is held for review, never resent automatically. */
export async function processSupportMail(id?:string, deliver = sendTransactionalEmail) {
  const deadline = Date.now() + 40000;
  await prisma.supportReply.updateMany({where:{status:'SENDING',updatedAt:{lt:new Date(Date.now()-300000)}},data:{status:'REVIEW',error:'Delivery interrupted; inspect email logs before resending.'}});
  const uncertain = await prisma.supportReply.findMany({where:{status:'REVIEW',...(id?{id}:{})},include:{ticket:true},orderBy:{updatedAt:'asc'},take:10});
  for (const reply of uncertain) {
    const log = await prisma.emailLog.findUnique({where:{eventKey:`support-reply:${reply.id}:${reply.attempt}`},select:{status:true}});
    if(log?.status === 'sent') await prisma.supportReply.updateMany({where:{id:reply.id,status:'REVIEW'},data:{status:'SENT',error:null}});
  }
  if (!getEmailConfig().enabled) return { queued:true, configured:false };
  const jobs = await prisma.supportReply.findMany({where:{status:'QUEUED',...(id?{id}:{})},include:{ticket:true},orderBy:{createdAt:'asc'},take:id?1:3});
  let processed = 0;
  for (const job of jobs) {
    if (deadline - Date.now() < 30000) break;
    if (!(await prisma.supportReply.updateMany({where:{id:job.id,status:'QUEUED'},data:{status:'SENDING'}})).count) continue;
    processed++;
    try {
      const url = `${getPublicAppUrl()}/dashboard?tab=support&ticketId=${job.ticketId}`;
      const author = job.authorId ? await prisma.user.findUnique({where:{id:job.authorId},select:{name:true,email:true}}) : null;
      const member = job.authorId ? await prisma.teamMember.findFirst({where:{userId:job.authorId,status:'ACTIVE'},select:{jobTitle:true},orderBy:{joinedAt:'asc'}}) : null;
      const name = author?.name?.trim() || 'HYMN Support';
      const title = author && isConfiguredAdminEmail(author.email) && name.toLowerCase() === 'aditya ujjain' ? 'Founder, HYMN Music' : `${member?.jobTitle || 'Customer Support'}, HYMN Music`;
      const signedBody = `${job.body}\n\nWriting to you: ${name}\n${title}\n\nIf you have any questions, kindly reply to this email.`;
      const originalQuery = `Your original request #${job.ticketId}: ${job.ticket.subject}\n\n${job.ticket.message}`;
      const quotedQuery = originalQuery.split(/\r?\n/).map(line => `> ${line}`).join('\n');
      const result = await deliver({to:job.recipient,subject:job.subject,template:'support_reply',eventKey:`support-reply:${job.id}:${job.attempt}`,userId:job.ticket.userId,entityType:'support_ticket',entityId:job.ticketId,senderName:`${name} | HYMN Support`,timeoutMs:10000,text:`${signedBody}\n\n${quotedQuery}\n\nView your ticket: ${url}`,html:emailLayout({title:job.kind==='missed-call'?'Let us arrange another call':'Your HYMN support update',body:signedBody,preserveNames:[name],ctaLabel:job.kind==='missed-call'?'Reschedule a callback':'View support ticket',ctaUrl:url,notice:originalQuery})});
      await prisma.supportReply.update({where:{id:job.id},data:{status:result.status==='sent'?'SENT':'REVIEW',error:result.status==='sent'?null:result.error || 'Inspect email logs before sending again.'}});
      if (result.status==='sent') await createNotification({userId:job.ticket.userId,title:'HYMN Support replied',body:`An update on "${job.ticket.subject}" is available in your support history and email.`,type:'system',href:url,actionLabel:'View ticket',eventKey:`support-reply:${job.id}`});
    } catch { await prisma.supportReply.updateMany({where:{id:job.id,status:'SENDING'},data:{status:'REVIEW',error:'Delivery could not be confirmed. Inspect email logs before resending.'}}); }
  }
  return {processed,configured:true};
}
