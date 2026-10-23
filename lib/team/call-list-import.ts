import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { demand, TeamError, type Actor } from './policy';
import { matchingContacts, contactPhone, contactPhoneKey } from './contact-directory';
import { callbackSlot, syncCallbackCalendar } from './callback-calendar';
import { callWindowStart } from './call-rules';
import { assertEmployeeAssignee } from './daily-work';

export const callListRow=z.object({name:z.string().trim().min(1).max(160),phone:z.string().min(8).max(40),email:z.string().email().or(z.literal('')).default(''),notes:z.string().min(3).max(5000),existingUserId:z.number().int().positive().optional()});
export const INTRODUCTION_BRIEF='Introduce yourself as Kira from HYMN Music and ask if this is a convenient time. Be friendly and understand their work first. Explain HYMN music distribution, promotion and playlist pitching, beats, and mixing/mastering, starting with their stated interest. Let them know HYMN is available whenever they need help and invite them to reach out. Confirm their preferred name, missing email and current needs. Explain current published plans and prices accurately. Record the actual outcome, questions and any requested follow-up. Honour a request not to be contacted. These are founder-supplied contacts, not newly researched acquisition leads.';
function weekday(value:Date){let date=callWindowStart(value);while([0,6].includes(new Date(date.getTime()+330*60000).getUTCDay()))date=callWindowStart(new Date(date.getTime()+86400000));return date;}
const dayKey=(value:Date)=>new Date(value.getTime()+330*60000).toISOString().slice(0,10);
export async function importCallContact(tx:Prisma.TransactionClient,a:Actor,input:unknown,options:{batch:string;assigneeId:string;parentTaskId:string;now?:Date}) {
  demand(a,'tasks.assign');demand(a,'clients.manage');
  const row=callListRow.parse(input),phone=contactPhone(row.phone),now=options.now||new Date();
  if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new TeamError('Invalid international contact number.');
  const eventKey=`support-call:${a.workspaceId}:FRIENDLY_INTRO:${options.batch}:${contactPhoneKey(phone)}`;
  const prior=await tx.teamTask.findUnique({where:{eventKey}});
  if(prior){if(prior.ownerId!==options.assigneeId)throw new TeamError('An existing imported call has been reassigned; review it before resuming.');return {phone,status:'ALREADY_ASSIGNED',clientId:prior.clientId||undefined,taskId:prior.id,dueAt:prior.dueAt?.toISOString(),created:false};}
  await assertEmployeeAssignee(tx,a.workspaceId,options.assigneeId);
  const matches=await matchingContacts(tx,a.workspaceId,{phone,email:row.email});
  const account=row.existingUserId?await tx.user.findUnique({where:{id:row.existingUserId},select:{id:true,email:true,status:true}}):null;
  if(row.existingUserId&&!account)throw new TeamError('Verified existing account is unavailable.');
  const linked=account?await tx.teamClient.findUnique({where:{userId:account.id}}):null;
  if(linked&&linked.workspaceId!==a.workspaceId)throw new TeamError('The existing account belongs to another contact workspace.');
  const ids=new Set([...matches.map(c=>c.id),...(linked?[linked.id]:[])]);
  if(ids.size>1)throw new TeamError(`Conflicting records for ${row.name}; review their identity before merging.`,409);
  let client=linked||matches[0];const created=!client;
  if(client?.mergedIntoId)throw new TeamError('Resolve the merged contact before importing.');
  if(client&&account&&client.userId&&client.userId!==account.id)throw new TeamError('Conflicting linked login accounts.',409);
  if(account?.status!=='ACTIVE'&&account)throw new TeamError('The linked account is inactive.');
  if(client?.status==='DO_NOT_CONTACT'||client?.status==='ARCHIVED'||await tx.teamProspect.findFirst({where:{workspaceId:a.workspaceId,...(client?{clientId:client.id}:{phone}),suppressed:true}}))return {phone,status:'SKIPPED_SUPPRESSED',clientId:client?.id};
  const emails=[...new Set([client?.email,client?.secondaryEmail,...(client?.additionalEmails||[]),row.email,account?.email].filter((s):s is string=>Boolean(s)).map(s=>s.toLowerCase()))];
  const phones=[...new Set([phone,client?.phone,...(client?.alternatePhones||[])].filter((s):s is string=>Boolean(s)).map(contactPhone))];
  const interests=[...new Set([...(client?.interests||[]),...(/distribution|release/i.test(row.notes)?['DISTRIBUTION']:[]),...(/playlist/i.test(row.notes)?['PLAYLIST_CURATION']:[]),...(/promotion|marketing/i.test(row.notes)?['PROMOTION']:[]),...(/mix|master/i.test(row.notes)?['MIX_MASTER']:[]),...(/beat purchase/i.test(row.notes)?['BEAT_PURCHASE']:[]),...(/beat sales/i.test(row.notes)?['BEAT_SALES']:[])])];
  const fields={phone:phones[0],alternatePhones:phones.slice(1),email:emails[0]||'',secondaryEmail:emails[1]||'',additionalEmails:emails.slice(2),interests,...(account?{userId:account.id}:{})};
  client=client?await tx.teamClient.update({where:{id:client.id},data:{...fields,version:{increment:1}}}):await tx.teamClient.create({data:{...fields,workspaceId:a.workspaceId,ownerId:options.assigneeId,name:row.name,notes:row.notes}});
  const latest=await tx.teamTask.findFirst({where:{workspaceId:a.workspaceId,parentId:options.parentTaskId,ownerId:options.assigneeId,status:{not:'CANCELLED'},dueAt:{not:null}},orderBy:{dueAt:'desc'},select:{dueAt:true}});
  let dueAt=weekday(new Date(Math.max(now.getTime()+3600000,(latest?.dueAt?.getTime()||0)+30*60000)));
  // Reserve the existing 30-minute slots, with at most ten introductions per workday.
  for(let i=0;i<45;i++){
    const available=await callbackSlot(tx,a.workspaceId,options.assigneeId,dueAt);
    dueAt=weekday(available);
    if(dueAt.getTime()!==available.getTime())continue;
    const day=dayKey(dueAt),start=new Date(`${day}T00:00:00+05:30`),end=new Date(start.getTime()+86400000);
    const load=await tx.teamTask.count({where:{workspaceId:a.workspaceId,ownerId:options.assigneeId,eventKey:{contains:':FRIENDLY_INTRO:'},status:{notIn:['CANCELLED','COMPLETED']},dueAt:{gte:start,lt:end}}});
    if(load<10)break;
    dueAt=weekday(new Date(`${dayKey(new Date(start.getTime()+86400000))}T09:30:00+05:30`));
    if(i===44)throw new TeamError('No manageable introduction-call slot is available.');
  }
  const task=await tx.teamTask.create({data:{workspaceId:a.workspaceId,creatorId:a.id,ownerId:options.assigneeId,clientId:client.id,parentId:options.parentTaskId,eventKey,title:`Friendly HYMN introduction: ${row.name}`,description:`${INTRODUCTION_BRIEF}\n\nContact supplied as: ${row.name}\nCall number: ${phone}\nSpecific context: ${row.notes}\n${row.email?`Supplied email: ${row.email}`:'Ask for their preferred email; do not invent an address.'}`,priority:/priority/i.test(row.notes)?'HIGH':'NORMAL',dueAt,followUpContext:{version:1,kind:'FRIENDLY_INTRO',service:'HYMN services introduction',batch:options.batch,pinnedAssignee:true,suppliedName:row.name,callPhone:phone,tip:INTRODUCTION_BRIEF,footnotes:[row.notes,'Founder-supplied contact. Record a real call outcome; assignment is not a completed call or an acquisition credit.']}}});
  await syncCallbackCalendar(tx,a,task);
  await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'contact.introduction_assigned',entityId:client.id,detail:{batch:options.batch,taskId:task.id,assigneeId:options.assigneeId,created,verifiedAccountId:account?.id||null}}});
  return {phone,status:'ASSIGNED',clientId:client.id,taskId:task.id,dueAt:dueAt.toISOString(),created};
}
