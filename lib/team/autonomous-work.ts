import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can, type Actor, type Permission } from './policy';
import { employeeCallSlot } from './availability';
import { record, withinWorkHours } from './availability-rules';
import { reservationEnd } from './calendar-reservations';
import { notifyTeamBatch } from './notification-batch';
import { teamWrite } from './service';
import { queueAppointment } from './appointments';

const prefix='auto-source:';
const closed=['LOST','NOT_INTERESTED','UNQUALIFIED','DUPLICATE','DO_NOT_CONTACT','CONVERTED'];
/** One source per locked transaction: bounded work, durable deduplication and no fabricated outcomes. */
export async function syncSourceWork(tx:Prisma.TransactionClient,a:Actor,now=new Date()) {
  const existing=await tx.teamTask.findMany({where:{workspaceId:a.workspaceId,eventKey:{startsWith:prefix}},select:{id:true,eventKey:true,status:true,ownerId:true,title:true,owner:{include:{role:true,user:{select:{status:true}}}}}});
  const keys=new Set(existing.filter(t=>t.status!=='COMPLETED').map(t=>t.eventKey));
  const open=existing.filter(t=>!['COMPLETED','CANCELLED'].includes(t.status));
  const ids=(kind:string)=>open.filter(t=>t.eventKey!.startsWith(`${prefix}${kind}:`)).map(t=>t.eventKey!.split(':')[2]);
  const prospects=await tx.teamProspect.findMany({where:{workspaceId:a.workspaceId,id:{in:ids('lead')}},select:{id:true,verified:true,suppressed:true,stage:true,contactEligibility:true,email:true,phone:true,client:{select:{status:true,mergedIntoId:true}}}});
  const producers=await tx.producerApplication.findMany({where:{id:{in:ids('producer').map(Number)}},select:{id:true,status:true,userId:true}});
  const engineers=await tx.engineerApplication.findMany({where:{id:{in:ids('engineer').map(Number)}},select:{id:true,status:true,userId:true}});
  // Actual source decisions close the assignment, rather than a task checkbox.
  for(const task of open) {
    const [,kind,id]=task.eventKey!.split(':');
    let status:string|undefined;
    if(kind==='lead') {
      const p=prospects.find(p=>p.id===id);
      if(!p||p.suppressed||closed.includes(p.stage)||p.client&&(p.client.status!=='ACTIVE'||p.client.mergedIntoId))status='CANCELLED';
      else if(p.verified&&['CONSENTED','LEGITIMATE_INTEREST'].includes(p.contactEligibility)&&Boolean(p.email||/^\+?[1-9]\d{7,14}$/.test(p.phone.replace(/[\s().-]/g,''))))status='COMPLETED';
    } else {
      const application=(kind==='producer'?producers:engineers).find(p=>p.id===Number(id));
      if(!application)status='CANCELLED';else if(application.status!=='PENDING')status='COMPLETED';
    }
    if(status){
      await tx.teamTask.update({where:{id:task.id},data:{status,completedAt:status==='COMPLETED'?now:null,evidence:'Automatically reconciled with the saved source decision.',version:{increment:1}}});
      await tx.teamCalendarEvent.updateMany({where:{workspaceId:a.workspaceId,followUpTaskId:task.id,status:'SCHEDULED'},data:{status,version:{increment:1}}});
      return {reconciled:1,created:0};
    }
  }
  const members=await tx.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',availability:'AVAILABLE',role:{owner:false},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}});
  const load=await tx.teamTask.groupBy({by:['ownerId'],where:{workspaceId:a.workspaceId,archivedAt:null,status:{notIn:['COMPLETED','CANCELLED']}},_count:true});
  for(const task of open) {
    const [,kind,id]=task.eventKey!.split(':');
    const permission:Permission=kind==='lead'?'crm.prospects.create':kind==='producer'?'operations.producers.approve':'operations.engineers.approve';
    const applicant=kind==='lead'?undefined:(kind==='producer'?producers:engineers).find(p=>p.id===Number(id))?.userId;
    if(task.owner.status==='ACTIVE'&&task.owner.availability==='AVAILABLE'&&task.owner.user.status==='ACTIVE'&&!task.owner.role.owner&&can(task.owner,permission)&&can(task.owner,'tasks.update')&&task.owner.userId!==applicant)continue;
    for(const member of members.filter(m=>m.id!==task.ownerId&&m.userId!==applicant&&can(m,permission)&&can(m,'tasks.update')).sort((x,y)=>(load.find(l=>l.ownerId===x.id)?._count||0)-(load.find(l=>l.ownerId===y.id)?._count||0))) {
      const event=await tx.teamCalendarEvent.findUnique({where:{followUpTaskId:task.id}});
      const dueAt=await employeeCallSlot(tx,a.workspaceId,member.id,now,event?.id,task.id,permission);
      if(!dueAt)continue;
      await tx.teamTask.update({where:{id:task.id},data:{ownerId:member.id,status:'TODO',blocker:'',dueAt,version:{increment:1}}});
      if(kind==='lead')await tx.teamProspect.updateMany({where:{workspaceId:a.workspaceId,id},data:{ownerId:member.id,version:{increment:1}}});
      if(event)await tx.teamCalendarEvent.update({where:{id:event.id},data:{assigneeId:member.id,status:'SCHEDULED',startsAt:dueAt,endsAt:new Date(dueAt.getTime()+1800000),remindedAt:null,scheduleRevision:{increment:1},version:{increment:1}}});
      await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'automation.source_reassigned',entityId:task.id,detail:{previous:task.ownerId,ownerId:member.id}}});
      await notifyTeamBatch(tx,a,[{eventKey:`reassigned:${task.id}:${member.id}:${task.ownerId}`,memberId:member.id,title:task.title,taskId:task.id}]);
      return {created:0,reconciled:1};
    }
  }
  type Source={key:string;title:string;description:string;permission:Permission;preferred?:string|null;userId?:number;clientId?:string|null};
  const sources:Source[]=[];
  const leads=await tx.acquisitionLead.findMany({
    where:{
      workspaceId:a.workspaceId,referralOnly:false,
      prospectId:{notIn:existing.filter(t=>t.status!=='COMPLETED'&&t.eventKey?.startsWith(`${prefix}lead:`)).map(t=>t.eventKey!.slice(`${prefix}lead:`.length))},
      prospect:{verified:false,suppressed:false,stage:{notIn:closed},OR:[{clientId:null},{client:{status:'ACTIVE',mergedIntoId:null}}]},
    },
    include:{prospect:true},orderBy:{registeredAt:'asc'},take:10,
  });
  for(const lead of leads)sources.push({key:`${prefix}lead:${lead.prospectId}`,title:`Check saved contact: ${lead.prospect.name}`,description:`Open Contacts & Calls and check this saved contact's details, public source and eligibility. Record evidence and useful notes. Do not mark a conversation or consent that did not happen.\nContact reference: ${lead.prospectId}\n/team?module=crm`,permission:'crm.prospects.create',preferred:lead.researcherEmployeeId,clientId:lead.prospect.clientId});
  const primary=await tx.teamWorkspace.findFirst({orderBy:{createdAt:'asc'},select:{id:true}});
  if(primary?.id===a.workspaceId)for(const kind of ['producer','engineer'] as const) {
    const ids=existing.filter(t=>t.status!=='COMPLETED'&&t.eventKey?.startsWith(`${prefix}${kind}:`)).map(t=>Number(t.eventKey!.split(':')[2]));
    const where={status:'PENDING' as const,id:{notIn:ids}};
    const records=kind==='producer'?await tx.producerApplication.findMany({where,select:{id:true,userId:true},orderBy:{createdAt:'asc'},take:5}):await tx.engineerApplication.findMany({where,select:{id:true,userId:true},orderBy:{createdAt:'asc'},take:5});
    for(const record of records)sources.push({key:`${prefix}${kind}:${record.id}`,title:`Review ${kind} application #${record.id}`,description:'Check the application and work samples in Creator approvals, then record your decision there.\n/team?module=creator-applications',permission:kind==='producer'?'operations.producers.approve':'operations.engineers.approve',userId:record.userId});
  }
  // Alternate lanes by the last assignment, so a large research backlog cannot starve approvals.
  const last=await tx.teamTask.findFirst({where:{workspaceId:a.workspaceId,eventKey:{startsWith:prefix}},orderBy:{createdAt:'desc'},select:{eventKey:true}});
  if(last?.eventKey?.startsWith(`${prefix}lead:`))sources.sort((x,y)=>Number(x.key.includes(':lead:'))-Number(y.key.includes(':lead:')));
  for(const source of sources) {
    if(keys.has(source.key))continue;
    const candidates=members.filter(m=>can(m,source.permission)&&can(m,'tasks.update')&&m.userId!==source.userId).sort((x,y)=>Number(y.id===source.preferred)-Number(x.id===source.preferred)||(load.find(l=>l.ownerId===x.id)?._count||0)-(load.find(l=>l.ownerId===y.id)?._count||0));
    for(const member of candidates) {
      const dueAt=await employeeCallSlot(tx,a.workspaceId,member.id,now,undefined,undefined,source.permission);
      if(!dueAt)continue;
      const task=await tx.teamTask.upsert({where:{eventKey:source.key},create:{workspaceId:a.workspaceId,creatorId:a.id,ownerId:member.id,clientId:source.clientId,title:source.title,description:source.description,eventKey:source.key,dueAt},update:{ownerId:member.id,status:'TODO',completedAt:null,archivedAt:null,evidence:'',blocker:'',dueAt,version:{increment:1}}});
      if(source.key.startsWith(`${prefix}lead:`))await tx.teamProspect.updateMany({where:{workspaceId:a.workspaceId,id:source.key.slice(`${prefix}lead:`.length),ownerId:{not:member.id}},data:{ownerId:member.id,version:{increment:1}}});
      await tx.teamCalendarEvent.upsert({where:{followUpTaskId:task.id},create:{workspaceId:a.workspaceId,creatorId:a.id,assigneeId:member.id,clientId:source.clientId,followUpTaskId:task.id,kind:'EVENT',title:source.title,startsAt:dueAt,endsAt:new Date(dueAt.getTime()+1800000),notes:'Automatic work reservation; finish by recording the actual source decision.'},update:{assigneeId:member.id,status:'SCHEDULED',startsAt:dueAt,endsAt:new Date(dueAt.getTime()+1800000),remindedAt:null,scheduleRevision:{increment:1},version:{increment:1}}});
      await notifyTeamBatch(tx,a,[{eventKey:`assigned:${source.key}:${task.version}`,memberId:member.id,title:source.title,taskId:task.id}]);
      await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'automation.source_assigned',entityId:task.id,detail:{source:source.key,ownerId:member.id}}});
      return {created:1,reconciled:0};
    }
  }
  return {created:0,reconciled:0};
}

/** Reflow only internal suggestions. Confirmed CALL appointments remain explicit exceptions. */
export async function repairWorkSchedule(actor:Actor,now=new Date(),limit=10) {
  const workspace=await prisma.teamWorkspace.findUniqueOrThrow({where:{id:actor.workspaceId},select:{customerFollowupCursor:true}});
  const cursor=record(workspace.customerFollowupCursor).scheduleRepairAfter;
  const events=await prisma.teamCalendarEvent.findMany({where:{workspaceId:actor.workspaceId,...(typeof cursor==='string'?{id:{gt:cursor}}:{}),status:'SCHEDULED',startsAt:{gte:now},OR:[{kind:'CALL'},{kind:'FOLLOW_UP',followUpTaskId:{not:null}}]},include:{assignee:{select:{preferences:true}}},orderBy:{id:'asc'},take:500});
  let repaired=0,exceptions=0;
  for(const candidate of [...events.filter(e=>e.kind==='CALL'&&!withinWorkHours(e.assignee.preferences,e.startsAt,reservationEnd(e))).slice(0,2),...events.filter(e=>e.kind==='FOLLOW_UP'&&!withinWorkHours(e.assignee.preferences,e.startsAt,reservationEnd(e))).slice(0,limit)])await teamWrite(actor,async(tx,a)=>{
    const event=await tx.teamCalendarEvent.findFirst({where:{id:candidate.id,workspaceId:a.workspaceId,status:'SCHEDULED'},include:{assignee:{select:{preferences:true}}}});
    if(!event||withinWorkHours(event.assignee.preferences,event.startsAt,reservationEnd(event)))return;
    if(event.kind==='CALL'){
      const eventKey=`coverage-needed:${event.id}:${event.version}`;
      if(!await tx.teamWorkflowEvent.findUnique({where:{eventKey}})) {
        await tx.teamWorkflowEvent.create({data:{workspaceId:a.workspaceId,eventKey}});
        await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'calendar.coverage_needed',entityId:event.id,detail:{version:event.version,reason:'Confirmed appointment is outside the current work schedule.'}}});
        await notifyTeamBatch(tx,a,[{eventKey:`schedule-exception:${event.id}:${event.version}`,memberId:a.id,title:`Confirmed appointment needs coverage: ${event.title}`,href:'/team?module=calendar'}]);
      }
      exceptions++;return;
    }
    const task=event.followUpTaskId?await tx.teamTask.findFirst({where:{id:event.followUpTaskId,workspaceId:a.workspaceId,status:{notIn:['COMPLETED','CANCELLED']}}}):null;
    if(!task)return;
    const startsAt=await employeeCallSlot(tx,a.workspaceId,event.assigneeId,new Date(Math.max(now.getTime(),event.startsAt.getTime())),event.id,task.id);
    if(!startsAt)return;
    const updated=await tx.teamCalendarEvent.update({where:{id:event.id},data:{startsAt,endsAt:new Date(startsAt.getTime()+1800000),remindedAt:null,scheduleRevision:{increment:1},version:{increment:1}}});
    await tx.teamTask.update({where:{id:task.id},data:{dueAt:startsAt,version:{increment:1}}});
    if(task.clientId)await tx.teamProspect.updateMany({where:{workspaceId:a.workspaceId,clientId:task.clientId,followUpAt:event.startsAt},data:{followUpAt:startsAt,version:{increment:1}}});
    await queueAppointment(tx,updated,now);
    await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'automation.schedule_repaired',entityId:event.id,detail:{previous:event.startsAt.toISOString(),startsAt:startsAt.toISOString()}}});
    repaired++;
  });
  await teamWrite(actor,async(tx,a)=>{
    const workspace=await tx.teamWorkspace.findUniqueOrThrow({where:{id:a.workspaceId},select:{customerFollowupCursor:true}});
    const next=record(workspace.customerFollowupCursor);
    if(events.length)next.scheduleRepairAfter=events[events.length-1].id;else delete next.scheduleRepairAfter;
    await tx.teamWorkspace.update({where:{id:a.workspaceId},data:{customerFollowupCursor:next as Prisma.InputJsonValue}});
  });
  return {repaired,exceptions};
}
