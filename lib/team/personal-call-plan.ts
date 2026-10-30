import 'server-only';
import type {Prisma} from '@prisma/client';
import {z} from 'zod';
import {type Actor,TeamError} from './policy';
import {personalCallPlan} from './personal-call-plan-policy';
import {employeeCallSlot} from './availability';
import {syncCallbackCalendar} from './callback-calendar';
import {indiaWorkday} from './daily-work';
import {internalIdentities,matchesInternalIdentity} from './internal-identity';
import {whatsappNumber} from './phone';
import {activityOpen} from './work-station-policy';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function savePersonalCallPlan(tx:Prisma.TransactionClient,a:Actor,input:unknown){
  if(!a.role.owner)throw new TeamError('Personal owner call plans require owner access.',403);
  const data=z.object({enabled:z.boolean(),dailyLimit:z.union([z.literal(3),z.literal(4)])}).parse(input);
  const member=await tx.teamMember.findUniqueOrThrow({where:{id:a.id}}),preferences=object(member.preferences);
  await tx.teamMember.update({where:{id:a.id},data:{preferences:json({...preferences,crm:{...object(preferences.crm),personalCallPlan:data}})}});
  await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'workstation.personal_plan_updated',entityId:a.id,detail:json({previous:personalCallPlan(member.preferences),next:data})}});
  return data;
}
/** An opted-in owner can take a small number of genuine, unstarted calls. Never invent contacts or change sales attribution. */
export async function syncPersonalCallPlans(tx:Prisma.TransactionClient,a:Actor,now=new Date()){
  const owners=await tx.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',availability:'AVAILABLE',role:{owner:true},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}});
  const roster=await internalIdentities(tx);let assigned=0;
  for(const member of owners){
    const plan=personalCallPlan(member.preferences);if(!plan.enabled)continue;
    const outstanding=await tx.teamTask.count({where:{workspaceId:a.workspaceId,ownerId:member.id,archivedAt:null,status:{notIn:['COMPLETED','CANCELLED']},followUpContext:{path:['personalCallPlan'],equals:true}}});
    if(outstanding>=plan.dailyLimit)continue;
    const today=indiaWorkday(now).day;
    if(await tx.teamTask.count({where:{workspaceId:a.workspaceId,ownerId:member.id,archivedAt:null,status:{not:'CANCELLED'},followUpContext:{path:['personalPlanDay'],equals:today}}})>=plan.dailyLimit)continue;
    const firstSlot=await employeeCallSlot(tx,a.workspaceId,member.id,now);if(!firstSlot)continue;
    const {day,start,end}=indiaWorkday(firstSlot);
    const already=await tx.teamTask.count({where:{workspaceId:a.workspaceId,ownerId:member.id,archivedAt:null,status:{not:'CANCELLED'},OR:[{dueAt:{gte:start,lt:end},followUpContext:{path:['personalCallPlan'],equals:true}},{followUpContext:{path:['personalPlanDay'],equals:day}}]}});
    const budget=Math.min(plan.dailyLimit-outstanding,plan.dailyLimit-already);if(budget<=0)continue;
    const candidates=await tx.teamTask.findMany({where:{workspaceId:a.workspaceId,ownerId:{not:member.id},archivedAt:null,status:'TODO',dueAt:{lte:end},eventKey:{startsWith:'support-call:'},client:{status:'ACTIVE',mergedIntoId:null}},include:{client:true},orderBy:[{dueAt:'asc'},{id:'asc'}],take:60});
    const candidateIds=candidates.map(task=>task.id),clientIds=[...new Set(candidates.flatMap(task=>task.clientId?[task.clientId]:[]))];
    const [otherCalls,calendarCalls,prospects,unsubscribed]=await Promise.all([
      tx.teamTask.findMany({where:{workspaceId:a.workspaceId,clientId:{in:clientIds},archivedAt:null,status:{notIn:['COMPLETED','CANCELLED']},OR:[{eventKey:{startsWith:'support-call:'}},{eventKey:{endsWith:':call'}},{followUpContext:{path:['kind'],equals:'CALL'}},{followUpContext:{path:['kind'],equals:'SUPPORT_CALLBACK'}},{followUpContext:{path:['workActivity','status'],equals:'RUNNING'}}]},select:{id:true,clientId:true}}),
      tx.teamCalendarEvent.findMany({where:{followUpTaskId:{in:candidateIds},kind:'CALL'},select:{followUpTaskId:true}}),
      tx.teamProspect.findMany({where:{clientId:{in:clientIds}},select:{clientId:true,suppressed:true,verified:true,contactEligibility:true}}),
      tx.newsletterSubscriber.findMany({where:{email:{in:[...new Set(candidates.flatMap(task=>task.client?.email?[task.client.email]:[]))],mode:'insensitive'},OR:[{unsubscribedAt:{not:null}},{status:{not:'subscribed'}}]},select:{email:true}})
    ]);
    const prospectByClient=new Map(prospects.map(row=>[row.clientId,row]));
    let taken=0;
    for(const task of candidates){
      if(taken>=budget)break;
      const c=object(task.followUpContext),client=task.client;
      if(!client||activityOpen(c)||matchesInternalIdentity(roster,client))continue;
      // Friendly introductions are already approved call work; other sources keep their own assignment.
      if(c.kind!=='FRIENDLY_INTRO')continue;
      const phone=String(c.callPhone||c.callbackPhone||client.phone);if(!whatsappNumber(phone))continue;
      const prospect=prospectByClient.get(client.id);
      if(prospect&&(prospect.suppressed||!prospect.verified||!['CONSENTED','LEGITIMATE_INTEREST'].includes(prospect.contactEligibility)))continue;
      if(client.email&&unsubscribed.some(row=>row.email.toLowerCase()===client.email!.toLowerCase()))continue;
      if(otherCalls.some(row=>row.clientId===client.id&&row.id!==task.id))continue;
      if(calendarCalls.some(row=>row.followUpTaskId===task.id))continue;
      const dueAt=await employeeCallSlot(tx,a.workspaceId,member.id,firstSlot,undefined,task.id);if(!dueAt||indiaWorkday(dueAt).day!==day)break;
      const updated=await tx.teamTask.update({where:{id:task.id},data:{ownerId:member.id,dueAt,followUpContext:json({...c,personalCallPlan:true,personalPlanDay:day,pinnedAssignee:true}),version:{increment:1}}});
      await syncCallbackCalendar(tx,a,updated);
      await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'workstation.personal_call_assigned',entityId:task.id,detail:{previousOwnerId:task.ownerId,ownerId:member.id,clientId:client.id,day,dueAt:dueAt.toISOString(),limit:plan.dailyLimit}}});
      await tx.teamNotification.create({data:{memberId:member.id,title:`Call assigned: ${task.title}`,href:`/team?workspace=${a.workspaceId}&module=work-station&task=${task.id}`}});
      taken++;assigned++;
    }
  }
  return{assigned};
}
