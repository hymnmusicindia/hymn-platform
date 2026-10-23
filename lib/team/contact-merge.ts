import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { demand, TeamError, type Actor } from './policy';
import { publicContact, contactPhone, matchingContacts } from './contact-directory';
type Tx=Prisma.TransactionClient;
type Draft={name:string;phone:string;email:string;secondaryEmail:string;interests:string[];state:string;city:string;notes:string;status:string};

/** Merge contact records only. Login accounts, lead attribution and task ownership never change. */
export async function mergeContacts(tx:Tx,a:Actor,input:unknown,draft?:Draft) {
  demand(a,'clients.manage');
  const data=z.object({targetId:z.string().min(1),targetVersion:z.number().int().positive(),sourceId:z.string().optional(),sourceVersion:z.number().int().positive().optional(),confirmedSamePerson:z.literal(true),reason:z.string().trim().min(5).max(1000),requestKey:z.string().uuid()}).parse(input);
  const requestKey=`${a.id}:${data.requestKey}`;
  const prior=await tx.teamAudit.findFirst({where:{workspaceId:a.workspaceId,actorId:a.id,action:'client.merged',detail:{path:['requestKey'],equals:requestKey}}});
  if(prior){if(prior.entityId!==data.targetId)throw new TeamError('This merge request was already used for another card.',409);return publicContact(a,await tx.teamClient.findUniqueOrThrow({where:{id:data.targetId}}));}
  const target=await tx.teamClient.findFirst({where:{id:data.targetId,workspaceId:a.workspaceId,mergedIntoId:null}});
  if(!target||target.version!==data.targetVersion)throw new TeamError('The retained contact changed. Refresh before merging.',409);
  const source=draft?await tx.teamClient.create({data:{...draft,phone:contactPhone(draft.phone),workspaceId:a.workspaceId,ownerId:a.id}}):await tx.teamClient.findFirst({where:{id:data.sourceId,workspaceId:a.workspaceId,mergedIntoId:null}});
  if(!source||source.id===target.id)throw new TeamError('Choose two different contacts in this workspace.');
  if(!draft&&source.version!==data.sourceVersion)throw new TeamError('The source contact changed. Refresh before merging.',409);
  if(source.userId&&target.userId&&source.userId!==target.userId)throw new TeamError('These cards belong to different HYMN login accounts. A contact merge cannot merge customer accounts.',409);
  const prospects=await tx.teamProspect.findMany({where:{clientId:{in:[source.id,target.id]}},select:{id:true,suppressed:true}});
  if(prospects.length>1)throw new TeamError('Both contacts have pipeline histories. Ask a CRM manager to resolve the duplicate leads before merging their cards.',409);
  const emails=[...new Set([target.email,target.secondaryEmail,...target.additionalEmails,source.email,source.secondaryEmail,...source.additionalEmails].filter(Boolean).map(v=>v.toLowerCase()))];
  const phones=[...new Set([target.phone,...target.alternatePhones,source.phone,...source.alternatePhones].filter(Boolean).map(contactPhone))];
  for(const value of [...emails,...phones]){
    const matches=await matchingContacts(tx,a.workspaceId,value.includes('@')?{email:value}:{phone:value});
    if(matches.some(c=>c.id!==source.id&&c.id!==target.id))throw new TeamError('Some details belong to another existing card. Merge those existing records first, then retry this entry.',409);
  }
  const blocked=[target.status,source.status].includes('DO_NOT_CONTACT')||prospects.some(p=>p.suppressed);
  // Remove the source's unique login link before moving that same link to the retained card.
  await tx.teamClient.update({where:{id:source.id},data:{mergedIntoId:target.id,status:blocked?'DO_NOT_CONTACT':'ARCHIVED',userId:null,version:{increment:1}}});
  const row=await tx.teamClient.update({where:{id:target.id},data:{email:emails[0]||'',secondaryEmail:emails[1]||'',additionalEmails:emails.slice(2),phone:phones[0]||'',alternatePhones:phones.slice(1),interests:[...new Set([...target.interests,...source.interests])],state:target.state||source.state,city:target.city||source.city,userId:target.userId||source.userId,status:blocked?'DO_NOT_CONTACT':target.status,version:{increment:1}}});
  await tx.teamClient.updateMany({where:{workspaceId:a.workspaceId,mergedIntoId:source.id},data:{mergedIntoId:target.id,version:{increment:1}}});
  await tx.teamTask.updateMany({where:{workspaceId:a.workspaceId,clientId:source.id},data:{clientId:target.id,version:{increment:1}}});
  const eventIds=(await tx.teamCalendarEvent.findMany({where:{workspaceId:a.workspaceId,clientId:source.id},select:{id:true}})).map(e=>e.id);
  await tx.teamCalendarEvent.updateMany({where:{id:{in:eventIds}},data:{clientId:target.id,version:{increment:1},scheduleRevision:{increment:1}}});
  await tx.teamAppointmentMessage.updateMany({where:{eventId:{in:eventIds},status:'PENDING'},data:{status:'CANCELLED',error:'Contact merged; review the retained contact before confirming a new schedule.'}});
  await tx.teamProspect.updateMany({where:{workspaceId:a.workspaceId,clientId:source.id},data:{clientId:target.id,version:{increment:1}}});
  // A merge is not a request to send mail. Preserve sent history and cancel pending introductions.
  await tx.teamClientWelcome.updateMany({where:{clientId:source.id,status:'PENDING'},data:{status:'CANCELLED',error:'Contact merged.'}});
  await tx.teamOutreachEmail.updateMany({where:{workspaceId:a.workspaceId,clientId:source.id,status:'QUEUED'},data:{status:'CANCELLED',error:'Contact merged; review the retained recipient.'}});
  if(blocked){await tx.teamProspect.updateMany({where:{workspaceId:a.workspaceId,clientId:target.id},data:{suppressed:true,stage:'DO_NOT_CONTACT',version:{increment:1}}});await tx.teamTask.updateMany({where:{workspaceId:a.workspaceId,clientId:target.id,status:{notIn:['COMPLETED','CANCELLED']}},data:{status:'CANCELLED',version:{increment:1}}});await tx.teamCalendarEvent.updateMany({where:{workspaceId:a.workspaceId,clientId:target.id,status:'SCHEDULED'},data:{status:'CANCELLED',version:{increment:1},scheduleRevision:{increment:1}}});await tx.teamOutreachEmail.updateMany({where:{workspaceId:a.workspaceId,clientId:target.id,status:'QUEUED'},data:{status:'CANCELLED',error:'Do-not-contact retained after merge.'}});await tx.teamClientWelcome.updateMany({where:{clientId:target.id,status:'PENDING'},data:{status:'CANCELLED',error:'Do-not-contact retained after merge.'}});}
  await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'client.merged',entityId:target.id,detail:{sourceId:source.id,targetId:target.id,requestKey,reason:data.reason,retainedOwnerId:target.ownerId,notesRetainedOnSource:true}}});
  return publicContact(a,row);
}
