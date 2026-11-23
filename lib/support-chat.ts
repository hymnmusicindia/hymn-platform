import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './prisma';
import { supportServices } from './support-chat-knowledge';
import { SupportError, callbackDetails } from './support';
import { ensureAccountClientCard } from './team/client-cards';
import { supportContactPhone } from './support-contact-phone';
import { normalizeDireNoteUpc } from './direnote-upc';
import { customerBrandText } from './customer-message';

const ticketSchema=z.object({requestKey:z.string().uuid(),service:z.enum(supportServices),message:z.string().trim().min(10).max(6000),releaseId:z.number().int().positive().nullable(),trackId:z.number().int().positive().nullable(),upc:z.string().trim().max(14).default(''),phone:z.string().trim().min(8).max(40),callbackRequested:z.boolean().default(false)});
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));

export async function supportChatContext(userId:number,search='',offset=0) {
  const user=await prisma.user.findUnique({where:{id:userId},select:{id:true,status:true,mobile:true}});
  if(!user||user.status!=='ACTIVE')throw new SupportError('Sign in with an active HYMN account.',403);
  const releases=await prisma.release.findMany({where:{userId,archivedAt:null,...(search?{OR:[{title:{contains:search,mode:'insensitive'}},{upc:{contains:search}}]}:{})},orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:offset,take:21,select:{id:true,title:true,upc:true,status:true,tracks:{orderBy:[{trackNumber:'asc'},{id:'asc'}],select:{id:true,title:true,trackNumber:true}}}});
  return {authenticated:true,phone:user.mobile??'',releases:releases.slice(0,20).map(release=>({...release,status:customerBrandText(release.status.toLowerCase().replaceAll('_',' ')),upc:normalizeDireNoteUpc(release.upc)??''})),hasMore:releases.length>20,nextOffset:offset+20};
}

/** The ticket, phone/contact update, customer notification and team task commit
 * together. A retry with the same request key returns the same ticket. */
export async function createChatSupportTicket(userId:number,raw:unknown) {
  const parsed=ticketSchema.safeParse(raw);
  if(!parsed.success)throw new SupportError('Check the issue description, selected release and contact number.');
  const input=parsed.data, phone=supportContactPhone(input.phone);
  if(!phone)throw new SupportError('Enter a valid contact number with country code.');
  if(input.upc&&!/^\d{12,14}$/.test(input.upc))throw new SupportError('Enter a 12–14 digit UPC, or leave it blank if it is not assigned.');
  if(input.trackId&&!input.releaseId)throw new SupportError('Choose a release before selecting its track.');
  if(input.service!=='distribution'&&(input.releaseId||input.trackId||input.upc))throw new SupportError('Release details belong to distribution support.');
  const fingerprint=createHash('sha256').update(JSON.stringify({...input,phone})).digest('hex');
  const workspace=await prisma.teamWorkspace.findFirst({orderBy:{createdAt:'asc'},select:{id:true}});
  if(!workspace)throw new SupportError('The support directory is temporarily unavailable. Your ticket has not been sent; please retry.',503);
  return prisma.$transaction(async tx=>{
    // Match the shared directory/consultation lock order.
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${workspace.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
    const account=await tx.user.findUnique({where:{id:userId},select:{id:true,status:true,role:true,email:true}});
    if(!account||account.status!=='ACTIVE')throw new SupportError('Your account is not active.',403);
    if(account.role==='ADMIN')throw new SupportError('Use the support workspace for staff requests.',403);
    const previous=await tx.supportTicket.findFirst({where:{userId,details:{path:['chatRequestKey'],equals:input.requestKey}},select:{id:true,subject:true,status:true,details:true}});
    if(previous){
      if((previous.details as Record<string,unknown>).chatFingerprint!==fingerprint)throw new SupportError('This request key already belongs to a different ticket. Start a new request.',409);
      return {id:previous.id,subject:previous.subject,status:previous.status.toLowerCase(),duplicate:true,contactSaved:true,href:`/dashboard?tab=support&ticketId=${previous.id}`};
    }
    const release=input.releaseId?await tx.release.findFirst({where:{id:input.releaseId,userId,archivedAt:null},include:{tracks:{orderBy:[{trackNumber:'asc'},{id:'asc'}],select:{id:true,title:true,trackNumber:true}}}}):null;
    if(input.releaseId&&!release)throw new SupportError('That release is no longer available in your account. Choose another release.',404);
    const track=input.trackId?release?.tracks.find(track=>track.id===input.trackId):null;
    if(input.trackId&&!track)throw new SupportError('That track does not belong to the selected release.',404);
    const savedUpc=normalizeDireNoteUpc(release?.upc);
    if(savedUpc&&input.upc&&savedUpc!==input.upc)throw new SupportError('The UPC does not match the selected release. Use its saved UPC.');
    const linked=await tx.teamClient.findUnique({where:{userId},select:{mergedIntoId:true}});
    if(linked?.mergedIntoId)throw new SupportError('Your contact profile needs a team review. Please contact HYMN from the Contact page.',409);
    const synced=await ensureAccountClientCard(userId,{mobile:phone,syncMobileToCard:true},tx);
    if(!synced?.contactCardSynced)throw new SupportError('Your contact card could not be saved. Nothing was submitted; please retry.',503);
    const details={email:account.email,upc:savedUpc||input.upc,source:'support_chat',chatRequestKey:input.requestKey,chatFingerprint:fingerprint,contactPhone:phone,contactSaved:true,trackId:track?.id??null,trackTitle:track?.title??null,trackNumber:track?.trackNumber??null,releaseTitle:release?.title??null,...(input.callbackRequested?callbackDetails({callbackPhone:phone}):{})};
    const subject=`${input.service==='distribution'?'Distribution':input.service[0].toUpperCase()+input.service.slice(1)}: ${release?.title??input.message.split('\n')[0]}`.slice(0,200);
    const ticket=await tx.supportTicket.create({data:{userId,subject,message:input.message,category:input.service,status:'OPEN',relatedReleaseId:release?.id??null,details:json(details)}});
    const task=await tx.adminTask.create({data:{eventKey:`support:${ticket.id}:open`,type:'Support Ticket Open',priority:input.callbackRequested?'high':'normal',title:subject,body:input.message,href:`/admin?tab=support&ticketId=${ticket.id}`,entityType:'support_ticket',entityId:String(ticket.id)}});
    await tx.adminTaskHistory.create({data:{taskId:task.id,action:'created',metadata:{source:'support_chat'}}});
    await tx.notification.create({data:{eventKey:`support-chat:${ticket.id}:created`,userId,title:'Support ticket created',body:`HYMN received your request: ${subject}`,type:'system',href:`/dashboard?tab=support&ticketId=${ticket.id}`,actionLabel:'View ticket',metadata:{ticketId:ticket.id}}});
    await tx.auditLog.create({data:{actorType:'user',actorId:userId,action:'support.chat_ticket_created',entity:'support_ticket',entityId:String(ticket.id),metadata:{releaseId:release?.id??null,trackId:track?.id??null,contactSaved:true,callbackRequested:input.callbackRequested}}});
    return {id:ticket.id,subject,status:'open',duplicate:false,contactSaved:true,href:`/dashboard?tab=support&ticketId=${ticket.id}`};
  },{timeout:30000,maxWait:10000});
}

/** Customer-only projection: never return internal diagnostics, recipients or unsent replies. */
export async function supportChatTickets(userId:number,offset=0){
  const account=await prisma.user.findUnique({where:{id:userId},select:{status:true}});
  if(account?.status!=='ACTIVE')throw new SupportError('Sign in with an active HYMN account.',403);
  const rows=await prisma.supportTicket.findMany({where:{userId},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:offset,take:21,select:{id:true,subject:true,message:true,status:true,createdAt:true,replies:{where:{status:'SENT'},orderBy:{createdAt:'asc'},select:{id:true,body:true,createdAt:true}}}});
  return {tickets:rows.slice(0,20).map(row=>({...row,subject:customerBrandText(row.subject),message:customerBrandText(row.message),status:row.status.toLowerCase().replaceAll('_',' '),replies:row.replies.map(reply=>({...reply,body:customerBrandText(reply.body)}))})),hasMore:rows.length>20,nextOffset:offset+20};
}
