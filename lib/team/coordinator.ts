import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { can, demand, TeamError, type Actor, type Permission } from './policy';
import { audit, notify, taskScope } from './service';
import { contactPhone, matchingContacts } from './contact-directory';
import { employeeCallSlot } from './availability';
import { acceptsAssignmentsNow, activeWindows, moveWorkWeek, planMeetsTarget, record, workWeek } from './availability-rules';
import { internalIdentities, matchesInternalIdentity } from './internal-identity';
import { queueAppointment } from './appointments';
import { callLoadScore } from './call-allocation';
import { callWorkload } from './call-workload';
export const WORK_KINDS={CALL:'Customer callback',RELEASE_HELP:'Release assistance',BEAT_REVIEW:'Beat review',ENGINEER_PROFILE:'Engineer profile review',STUDIO_COORDINATION:'Studio coordination',GENERAL:'General operations'} as const;
const permissions:Record<keyof typeof WORK_KINDS,Permission>={CALL:'crm.outreach.manage',RELEASE_HELP:'operations.distribution.review',BEAT_REVIEW:'operations.beats.manage',ENGINEER_PROFILE:'operations.engineers.manage',STUDIO_COORDINATION:'operations.studio.review',GENERAL:'tasks.update'};
const intakeSchema=z.object({clientKey:z.string().uuid(),kind:z.enum(['CALL','RELEASE_HELP','BEAT_REVIEW','ENGINEER_PROFILE','STUDIO_COORDINATION','GENERAL']),summary:z.string().trim().min(3).max(180),details:z.string().trim().min(3).max(6000),source:z.string().trim().min(3).max(500),clientId:z.string().max(80).optional(),name:z.string().trim().max(160).default(''),email:z.union([z.string().trim().email().max(320),z.literal('')]).default(''),phone:z.string().trim().max(40).regex(/^[+\d\s().-]*$/).default(''),requestedAt:z.string().datetime({offset:true}).optional()});
export async function coordinatorIntake(tx:Prisma.TransactionClient,a:Actor,input:unknown) {
  demand(a,'tasks.create');
  const data=intakeSchema.parse(input);
  const payloadHash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const prior=await tx.teamWorkIntake.findUnique({where:{workspaceId_creatorId_clientKey:{workspaceId:a.workspaceId,creatorId:a.id,clientKey:data.clientKey}}});
  if(prior){if(prior.payloadHash!==payloadHash)throw new TeamError('This submission key belongs to different intake data. Start a new entry.',409);return {id:prior.id,status:prior.status,taskId:prior.taskId,reason:prior.reason,duplicate:true};}
  if(data.requestedAt && (new Date(data.requestedAt)<=new Date() || Date.parse(data.requestedAt)>Date.now()+28*86400000))throw new TeamError('Choose a requested time in the next four weeks.');
  let client=data.clientId?await tx.teamClient.findFirst({where:{id:data.clientId,workspaceId:a.workspaceId,mergedIntoId:null}}):null;
  if(data.clientId&&!client)throw new TeamError('Contact unavailable.',404);
  if(!client && (data.email||data.phone)) {
    const matches=await matchingContacts(tx,a.workspaceId,{email:data.email,phone:data.phone});
    if(matches.length>1)throw new TeamError('These details match multiple contacts. Merge or choose the correct contact in Contact database.',409);
    client=matches[0]||null;
    if(!client) {
      if(!data.name)throw new TeamError('Add a name for the new contact.');
      const user=data.email?await tx.user.findFirst({where:{email:{equals:data.email,mode:'insensitive'}},select:{id:true}}):null;
      client=await tx.teamClient.create({data:{workspaceId:a.workspaceId,ownerId:a.id,name:data.name,email:data.email.toLowerCase(),phone:contactPhone(data.phone),...(user&&!await tx.teamClient.findUnique({where:{userId:user.id},select:{id:true}})?{userId:user.id}:{})}});
      await audit(tx,a,'coordinator.contact_created',client.id);
    }
  }
  if(client && client.status!=='ACTIVE')throw new TeamError('This contact is archived or has declined further contact.');
  const prospect=client?await tx.teamProspect.findFirst({where:{clientId:client.id},select:{verified:true,contactEligibility:true,suppressed:true,stage:true}}):null;
  if(data.kind==='CALL'&&prospect&&(!prospect.verified||prospect.suppressed||!['CONSENTED','LEGITIMATE_INTEREST'].includes(prospect.contactEligibility)||['LOST','NOT_INTERESTED','UNQUALIFIED','DUPLICATE','DO_NOT_CONTACT'].includes(prospect.stage)))throw new TeamError('This research contact is not eligible for outreach. Verify and review it in Contacts & Calls first.');
  if(data.kind==='CALL' && (!client || !/^\+[1-9]\d{7,14}$/.test(contactPhone(client.phone))))throw new TeamError('Choose a contact with a valid phone number before requesting a callback.');
  if(data.kind==='CALL' && client && matchesInternalIdentity(await internalIdentities(tx),client))throw new TeamError('Internal staff should use team coordination, not the customer call queue.');
  const item=await tx.teamWorkIntake.create({data:{workspaceId:a.workspaceId,creatorId:a.id,clientKey:data.clientKey,payloadHash,kind:data.kind,summary:data.summary,details:data.details,source:data.source,clientId:client?.id,requestedAt:data.requestedAt?new Date(data.requestedAt):null,reason:'Saved; automatic routing is queued.'}});
  await audit(tx,a,'coordinator.received',item.id,{kind:data.kind,source:data.source});
  // Commit the source before routing. The API after-hook and scheduled worker
  // consume WAITING items, so a slow assignment never loses operator input.
  return tx.teamWorkIntake.findUniqueOrThrow({where:{id:item.id},select:{id:true,status:true,taskId:true,reason:true}});
}
export async function dispatchIntake(tx:Prisma.TransactionClient,a:Actor,id:string,now=new Date()) {
  const item=await tx.teamWorkIntake.findFirst({where:{id,workspaceId:a.workspaceId,status:'WAITING'}});
  if(!item)return;
  let client=item.clientId?await tx.teamClient.findFirst({where:{id:item.clientId,workspaceId:a.workspaceId},include:{prospect:{select:{suppressed:true}}}}):null;
  const seen=new Set<string>();
  while(client?.mergedIntoId && !seen.has(client.id) && seen.size<20) {
    seen.add(client.id);
    client=await tx.teamClient.findFirst({where:{id:client.mergedIntoId,workspaceId:a.workspaceId},include:{prospect:{select:{suppressed:true}}}});
  }
  if(client&&!client.mergedIntoId&&client.id!==item.clientId){item.clientId=client.id;await tx.teamWorkIntake.update({where:{id:item.id},data:{clientId:client.id}});}
  if(item.clientId && (!client || client.status!=='ACTIVE' || client.mergedIntoId || client.prospect?.suppressed)) {
    await tx.teamWorkIntake.update({where:{id},data:{status:'CANCELLED',reason:'Contact became unavailable or declined further contact.',version:{increment:1}}});return;
  }
  const existing=client?await tx.teamTask.findFirst({where:{workspaceId:a.workspaceId,clientId:client.id,status:{notIn:['COMPLETED','CANCELLED']},archivedAt:null,eventKey:{startsWith:'support-call:'},followUpContext:{path:['service'],equals:item.kind}}}):null;
  if(existing && item.kind==='CALL' && !item.requestedAt) {
    await tx.teamComment.create({data:{taskId:existing.id,authorId:a.id,body:`Additional context (${item.source}): ${item.details}`}});
    const context=record(existing.followUpContext);
    await tx.teamTask.update({where:{id:existing.id},data:{description:`${existing.description}\n${item.details}`.slice(-10000),followUpContext:{...context,footnotes:[...(Array.isArray(context.footnotes)?context.footnotes:[]),item.details].slice(-12)} as Prisma.InputJsonValue,version:{increment:1}}});
    await tx.teamWorkIntake.update({where:{id},data:{status:'ASSIGNED',taskId:existing.id,reason:`Context attached to existing callback ${existing.id}.`,version:{increment:1}}});
    await audit(tx,a,'coordinator.context_merged',id,{taskId:existing.id});return;
  }
  const permission=permissions[item.kind as keyof typeof WORK_KINDS];
  if(!permission)throw new TeamError('Unknown routing category.');
  const members=await tx.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',availability:'AVAILABLE',role:{owner:false},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}});
  const load=await tx.teamTask.groupBy({by:['ownerId'],where:{workspaceId:a.workspaceId,status:{notIn:['COMPLETED','CANCELLED']},archivedAt:null},_count:true});
  const calls = item.kind === 'CALL' ? await callWorkload(tx,a.workspaceId,members.map(m=>m.id)) : null;
  const score = (m: typeof members[number]) => calls ? callLoadScore(m.preferences,calls.get(m.id)||0) : load.find(l=>l.ownerId===m.id)?._count||0;
  const candidates=members.filter(m=>can(m,permission)&&can(m,'tasks.update')&&(item.kind!=='CALL'||acceptsAssignmentsNow(m.preferences,now))).sort((x,y)=>score(x)-score(y));
  let chosen:typeof members[number]|undefined, due:Date|null=null;
  let selectedLoad=Infinity;
  const desired=item.requestedAt&&item.requestedAt>now?item.requestedAt:new Date(now.getTime()+30*60000);
  if(item.requestedAt&&item.requestedAt<=now) {
    await tx.teamWorkIntake.update({where:{id},data:{reason:'Requested callback time has passed. Operator must arrange a new time.'}});return;
  }
  for(const member of candidates) {
    const workload=score(member);
    if(workload>selectedLoad)break;
    const slot=await employeeCallSlot(tx,a.workspaceId,member.id,desired,undefined,undefined,permission);
    if(slot && (!item.requestedAt || slot.getTime()===item.requestedAt.getTime()) && (!due||slot<due)){chosen=member;due=slot;selectedLoad=workload;}
  }
  if(!chosen||!due) {
    await tx.teamWorkIntake.update({where:{id},data:{reason:item.requestedAt?'No eligible employee is free at the requested time. Awaiting coverage.':'Waiting for an eligible employee in their active shift with a free slot.'}});return;
  }
  const call=item.kind==='CALL';
  const task=await tx.teamTask.create({data:{workspaceId:a.workspaceId,creatorId:item.creatorId,ownerId:chosen.id,clientId:item.clientId,title:item.summary,description:`${item.details}\n\nSource: ${item.source}\nRouting: ${WORK_KINDS[item.kind as keyof typeof WORK_KINDS]}; eligible employee with a free declared work slot.`,priority:item.requestedAt?'HIGH':call?'HIGH':'NORMAL',dueAt:due,eventKey:call?`support-call:${a.workspaceId}:INTAKE:${item.id}`:`coordinator:${item.id}`,approvalRequired:!call&&item.kind!=='GENERAL',followUpContext:{version:1,kind:call?'ENQUIRY':'COORDINATOR',service:item.kind,source:`intake:${item.id}`,referenceId:item.id,occurredAt:item.createdAt.toISOString(),footnotes:[item.details,`Source: ${item.source}`],routingReason:'Matched required permissions, declared weekly hours and current workload.'}}});
  const event=await tx.teamCalendarEvent.create({data:{workspaceId:a.workspaceId,creatorId:item.creatorId,assigneeId:chosen.id,clientId:item.clientId,followUpTaskId:task.id,title:item.summary,kind:call?'FOLLOW_UP':'EVENT',startsAt:due,endsAt:new Date(due.getTime()+30*60000),notes:call?'Internal suggested callback. Confirm the time with the customer before creating a customer appointment.':`Scheduled work: ${item.details}`}});
  if(call)await queueAppointment(tx,event);
  await tx.teamWorkIntake.update({where:{id},data:{status:'ASSIGNED',taskId:task.id,reason:'Assigned by required permission, declared availability and lowest open workload.',version:{increment:1}}});
  await notify(tx,chosen.id,`Assigned: ${task.title}`,`/team?workspace=${a.workspaceId}&module=${call?'customer-calls':'work'}&task=${task.id}`);
  await audit(tx,a,'coordinator.assigned',id,{taskId:task.id,assigneeId:chosen.id,dueAt:due.toISOString(),permission});
}
export async function syncCoordinator(tx:Prisma.TransactionClient,a:Actor,now=new Date()) {
  const deadline=Date.now()+10000;
  // Every failed assignment touches updatedAt, rotating unavailable work to the
  // back so a full batch of missing skills cannot starve other departments.
  const pending=await tx.teamWorkIntake.findMany({where:{workspaceId:a.workspaceId,status:'WAITING'},orderBy:[{updatedAt:'asc'},{createdAt:'asc'},{id:'asc'}],take:10});
  for(const item of pending){if(Date.now()>deadline)break;await dispatchIntake(tx,a,item.id,now);}
  await audit(tx,a,'coordinator.synced',a.workspaceId,{waitingScanned:pending.length});
}
export async function coordinatorUpdate(tx:Prisma.TransactionClient,a:Actor,input:unknown) {
  demand(a,'tasks.create');
  const data=z.object({id:z.string(),version:z.number().int().positive(),action:z.enum(['retry','cancel','reschedule']),requestedAt:z.string().datetime({offset:true}).optional()}).parse(input);
  const item=await tx.teamWorkIntake.findFirst({where:{id:data.id,workspaceId:a.workspaceId,...(!can(a,'tasks.assign')?{creatorId:a.id}:{})}});
  if(!item)throw new TeamError('Intake unavailable.',404);
  if(item.version!==data.version||item.status!=='WAITING')throw new TeamError('This intake changed or was already assigned. Refresh first.',409);
  if(data.action==='reschedule') {
    if(!data.requestedAt || new Date(data.requestedAt)<=new Date() || Date.parse(data.requestedAt)>Date.now()+28*86400000)throw new TeamError('Choose a future time within four weeks.');
    await tx.teamWorkIntake.update({where:{id:item.id},data:{requestedAt:new Date(data.requestedAt),version:{increment:1}}});
  }
  if(data.action==='cancel')await tx.teamWorkIntake.update({where:{id:item.id},data:{status:'CANCELLED',reason:'Cancelled by the responsible operator.',version:{increment:1}}});
  else await dispatchIntake(tx,a,item.id);
  await audit(tx,a,`coordinator.${data.action}`,item.id);
  return tx.teamWorkIntake.findUniqueOrThrow({where:{id:item.id},select:{id:true,status:true,taskId:true}});
}
export async function coordinatorRead(a:Actor) {
  demand(a,'tasks.create');
  const manager=can(a,'tasks.assign'), scope=manager?{}:{creatorId:a.id};
  const [items,tasks,members,waiting,heartbeat,emailReviews,coverageAudits]=await Promise.all([
    prisma.teamWorkIntake.findMany({where:{workspaceId:a.workspaceId,...scope},orderBy:{createdAt:'desc'},take:50,include:{task:{select:{id:true,status:true,dueAt:true,owner:{select:{user:{select:{name:true}}}}}}}}),
    prisma.teamTask.findMany({where:{...taskScope(a),status:{notIn:['COMPLETED','CANCELLED']}},orderBy:[{dueAt:{sort:'asc',nulls:'last'}},{createdAt:'asc'}],take:100,select:{id:true,title:true,status:true,priority:true,dueAt:true,ownerId:true,followUpContext:true,blocker:true,owner:{select:{user:{select:{name:true}}}}}}),
    prisma.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',role:{owner:false},...(!manager?{id:a.id}:{})},select:{id:true,preferences:true,user:{select:{name:true}}}}),
    prisma.teamWorkIntake.count({where:{workspaceId:a.workspaceId,status:'WAITING',...scope}}),
    prisma.teamAudit.findFirst({where:{workspaceId:a.workspaceId,action:'coordinator.synced'},orderBy:{createdAt:'desc'},select:{createdAt:true}}),
    prisma.teamAppointmentMessage.count({where:{status:'REVIEW',event:{workspaceId:a.workspaceId,...(!manager?{assigneeId:a.id}:{})}}}),
    prisma.teamAudit.findMany({where:{workspaceId:a.workspaceId,action:'calendar.coverage_needed'},orderBy:{createdAt:'desc'},take:100,select:{entityId:true,detail:true}})
  ]);
  const coverageEvents=await prisma.teamCalendarEvent.findMany({where:{workspaceId:a.workspaceId,id:{in:coverageAudits.map(log=>log.entityId)},status:'SCHEDULED',startsAt:{gt:new Date()},...(!manager?{assigneeId:a.id}:{})},select:{id:true,title:true,startsAt:true,version:true}});
  const coverage=coverageEvents.filter(event=>coverageAudits.some(log=>log.entityId===event.id&&record(log.detail).version===event.version));
  const week=workWeek();
  return {items,coverage,emailReviews,lastSyncAt:heartbeat?.createdAt||null,tasks:tasks.map(t=>({...t,reason:String(record(t.followUpContext).routingReason || record(t.followUpContext).tip || 'Assigned work with its saved source context.')})),waiting,week,availability:members.map(m=>({id:m.id,name:m.user.name,current:planMeetsTarget(m.preferences,week),next:planMeetsTarget(m.preferences,moveWorkWeek(week,1)),hasSlots:activeWindows(m.preferences,new Date(),new Date(Date.now()+7*86400000)).length>0})),kinds:WORK_KINDS,manager};
}
export async function remindAvailability(tx:Prisma.TransactionClient,a:Actor,now=new Date()) {
  const week=workWeek(now), localDay=new Date(now.getTime()+330*60000).getUTCDay();
  const target=localDay===0||localDay>=5?moveWorkWeek(week,1):week;
  const members=await tx.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',role:{owner:false},user:{status:'ACTIVE'}},select:{id:true,preferences:true}});
  for(const member of members) {
    if(planMeetsTarget(member.preferences,target))continue;
    const eventKey=`availability-reminder:${member.id}:${target}`;
    if(await tx.teamWorkflowEvent.findUnique({where:{eventKey}}))continue;
    await tx.teamWorkflowEvent.create({data:{workspaceId:a.workspaceId,eventKey}});
    await notify(tx,member.id,'Your schedule needs coverage. Review your recurring shift or this week’s override.','/team?module=availability');
  }
}
/** Start missing operational queues once qualified employees exist. Explicitly
 * disabled or customised existing rules are preserved. Only tasks are created. */
export async function ensureCoordinatorRules(tx:Prisma.TransactionClient,a:Actor) {
  if(!a.role.owner)return;
  const primary=await tx.teamWorkspace.findFirst({orderBy:{createdAt:'asc'},select:{id:true}});
  if(primary?.id!==a.workspaceId)return;
  const members=await tx.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',role:{owner:false},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}});
  const kinds:Record<string,Permission>={BEAT_REVIEW:'operations.beats.manage',ENGINEER_PROFILE:'operations.engineers.manage',RELEASE_REVIEW:'operations.distribution.review',STUDIO_COORDINATION:'operations.studio.review'};
  for(const [eventType,permission] of Object.entries(kinds)) {
    if(await tx.teamWorkflowRule.findUnique({where:{workspaceId_eventType:{workspaceId:a.workspaceId,eventType}}}))continue;
    const employee=members.find(member=>can(member,permission)&&can(member,'tasks.update'));
    if(!employee)continue;
    await tx.teamWorkflowRule.create({data:{workspaceId:a.workspaceId,eventType,ownerId:employee.id,name:`Automatic ${eventType.toLowerCase().replaceAll('_',' ')}`,enabled:true}});
    await audit(tx,a,'coordinator.rule_enabled',a.workspaceId,{eventType,preferredAssigneeId:employee.id});
  }
}
