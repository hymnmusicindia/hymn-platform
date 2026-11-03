import 'server-only';
import type {Prisma} from '@prisma/client';
import {can,demand,type Actor} from './policy';
import {crmPreferences} from './crm-workflow';
import {indiaWorkday} from './daily-work';
import {activeWindows,acceptsAssignmentsNow} from './availability-rules';
import {employeeCallSlot} from './availability';
import {syncCallbackCalendar} from './callback-calendar';
import {callWorkload} from './call-workload';
import {callLoadScore} from './call-allocation';
import {activityOpen} from './work-station-policy';
import {internalIdentities,matchesInternalIdentity} from './internal-identity';
import {whatsappNumber} from './phone';
import {readJourneyProfile} from '@/lib/artist-journey';
import {preferredSlot} from './artist-journey';
import {notifyTeamBatch,type TeamReminder} from './notification-batch';
import {CALL_DUTIES,CALL_DUTY_VERSION,callContext,callDayLimit,callPriority,callTaskWhere,isCallWork} from './daily-call-policy';
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Run under teamWrite's workspace lock. Existing source tasks remain the canonical calls. */
export async function syncDailyCallSchedule(tx:Prisma.TransactionClient,a:Actor,now=new Date()){
 demand(a,'tasks.assign');
 const {day,start,end}=indiaWorkday(now),deadline=Date.now()+12000;
 const workspace=await tx.teamWorkspace.findUniqueOrThrow({where:{id:a.workspaceId},select:{customerFollowupCursor:true}});
 const cursor=callContext(workspace.customerFollowupCursor),position=callContext(cursor.dailyCallScheduler);
 const members=(await tx.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',role:{owner:false},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}})).filter(m=>{
   const crm=crmPreferences(m.preferences);return (crm.caller||crm.workRole==='caller'||/call representative/i.test(m.role.name))&&can(m,'crm.outreach.manage')&&can(m,'tasks.update')&&can(m,'calendar.manage');
 });
 const result={day,reps:members.length,duties:0,plans:0,scheduled:0,held:0,capacity:0};if(!members.length)return result;
 const ids=members.map(m=>m.id),roster=await internalIdentities(tx);
 const [today,standalone,load]=await Promise.all([
   tx.teamTask.findMany({where:{workspaceId:a.workspaceId,archivedAt:null,status:{not:'CANCELLED'},dueAt:{gte:start,lt:end},...callTaskWhere},select:{id:true,ownerId:true,clientId:true,status:true,followUpContext:true,client:{select:{phone:true}}}}),
   tx.teamCalendarEvent.findMany({where:{workspaceId:a.workspaceId,followUpTaskId:null,kind:{in:['CALL','FOLLOW_UP']},status:{in:['SCHEDULED','COMPLETED']},startsAt:{gte:start,lt:end}},select:{assigneeId:true,clientId:true,client:{select:{phone:true}}}}),
   callWorkload(tx,a.workspaceId,ids)
 ]);
 const seen=new Map<string,Set<string>>();
 function remember(clientId:string|null,phone:string,id:string){for(const key of [clientId,whatsappNumber(phone)?`phone:${whatsappNumber(phone)}`:null])if(key){const calls=seen.get(key)||new Set<string>();calls.add(id);seen.set(key,calls);}}
 for(const task of today){const c=callContext(task.followUpContext);remember(task.clientId,String(c.callbackPhone||c.callPhone||task.client?.phone||''),task.id);}
 for(const event of standalone)remember(event.clientId,event.client?.phone||'','confirmed-appointment');
 const used=new Map(ids.map(id=>[id,today.filter(t=>t.ownerId===id).length+standalone.filter(e=>e.assigneeId===id).length]));
 const capacities=new Map(members.map(m=>[m.id,callDayLimit(m.preferences,activeWindows(m.preferences,start,end).reduce((n,w)=>n+(w.endsAt.getTime()-w.startsAt.getTime())/60000,0))]));
 const planningKeys=members.flatMap(m=>[`${a.workspaceId}:${CALL_DUTY_VERSION}:${m.id}`,`daily-call-plan:${a.workspaceId}:${day}:${m.id}`]);
 const reminders:TeamReminder[]=[];
 const priorPlans=new Map((await tx.teamTask.findMany({where:{workspaceId:a.workspaceId,eventKey:{in:planningKeys}},select:{id:true,eventKey:true,title:true}})).map(t=>[t.eventKey,t]));
 for(const member of members){
   if(Date.now()>deadline)break;
   const dutyKey=`${a.workspaceId}:${CALL_DUTY_VERSION}:${member.id}`;
   let duty=priorPlans.get(dutyKey);
   if(!duty){
     const responsibilities=member.responsibilities||'';
     const description=CALL_DUTIES.map((text,index)=>`${index+1}. ${text}`).join('\n\n');
     duty=await tx.teamTask.create({data:{workspaceId:a.workspaceId,creatorId:a.id,ownerId:member.id,eventKey:dutyKey,title:'Updated call-representative duties and tools',description,priority:'NORMAL',checklist:CALL_DUTIES.map(text=>({text,done:false})),followUpContext:{kind:'TASK',dutyVersion:CALL_DUTY_VERSION}}});
     await tx.teamMember.update({where:{id:member.id},data:{responsibilities:`${responsibilities}\n\n${CALL_DUTY_VERSION}\n${description}`.trim()}});
     await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'calls.duties_updated',entityId:member.id,detail:{version:CALL_DUTY_VERSION,taskId:duty.id,previousResponsibilities:responsibilities}}});
     reminders.push({eventKey:`duty-notice:${dutyKey}`,memberId:member.id,title:duty.title,taskId:duty.id,href:`/team?workspace=${a.workspaceId}&module=work-station&task=${duty.id}`});result.duties++;
   }
   const limit=capacities.get(member.id)||0;if(member.availability!=='AVAILABLE'||limit===0)continue;result.capacity+=limit;
   const eventKey=`daily-call-plan:${a.workspaceId}:${day}:${member.id}`;
   const existing=priorPlans.get(eventKey);
   if(!existing){const plan=await tx.teamTask.create({data:{workspaceId:a.workspaceId,creatorId:a.id,ownerId:member.id,eventKey,title:`Daily call plan · ${day}`,description:`Open Work-station and Schedule for the live queue. Today's capacity is at most ${limit} reserved 30-minute call slots, reduced by existing appointments and other work. Prioritize promised callbacks, support requests and corrections, then eligible onboarding and customer interest. Only actual source tasks are calls; this planning card does not record a completed call. Check the updated duties and keep needs, commitments and next actions current. Calls are added only when your assignment-hours policy permits and a free slot exists.`,dueAt:new Date(end.getTime()-1),followUpContext:{kind:'TASK',dailyCallPlan:true,day,capacity:limit,dutyVersion:CALL_DUTY_VERSION}}});reminders.push({eventKey:`plan-notice:${eventKey}`,memberId:member.id,title:plan.title,taskId:plan.id,href:`/team?workspace=${a.workspaceId}&module=work-station&task=${plan.id}`});result.plans++;}
 }
 await notifyTeamBatch(tx,a,reminders.splice(0));
 if(Date.now()>deadline)return result;
 const candidates=await tx.teamTask.findMany({where:{workspaceId:a.workspaceId,archivedAt:null,status:'TODO',...(position.day===day&&typeof position.after==='string'?{id:{gt:position.after}}:{}),client:{status:'ACTIVE',mergedIntoId:null},AND:[callTaskWhere,{OR:[{dueAt:null},{dueAt:{lt:now}}]}]},include:{client:{include:{prospect:true,user:{select:{status:true}}}},owner:{include:{role:true}}},orderBy:{id:'asc'},take:100});
 const lastCandidate=candidates.at(-1)?.id;
 const slots=new Map<string,Date|null>();
 for(const task of candidates.sort((l,r)=>callPriority(r,now)-callPriority(l,now)||(l.dueAt?.getTime()||0)-(r.dueAt?.getTime()||0)||l.id.localeCompare(r.id))){
   if(Date.now()>deadline||result.scheduled>=12)break;
   const c=callContext(task.followUpContext),client=task.client;
   if(!client||!isCallWork(task)||task.owner.role.owner||c.pinnedAssignee===true||activityOpen(c)||[...(seen.get(client.id)||[])].some(id=>id!==task.id)||matchesInternalIdentity(roster,client)||['NONE','MESSAGE','INSIGHTS_ONLY'].includes(c.contactMode)){result.held++;continue;}
   const phone=whatsappNumber(String(c.callbackPhone||c.callPhone||client.phone));
   if(!phone||[...(seen.get(`phone:${phone}`)||[])].some(id=>id!==task.id)||client.user&&client.user.status!=='ACTIVE'){result.held++;continue;}
   if(client.prospect&&(client.prospect.suppressed||!client.prospect.verified||!['CONSENTED','LEGITIMATE_INTEREST'].includes(client.prospect.contactEligibility)||['CONVERTED','LOST','NOT_INTERESTED','UNQUALIFIED','DUPLICATE','DO_NOT_CONTACT'].includes(client.prospect.stage))){result.held++;continue;}
   const profile=client.userId?await readJourneyProfile(client.userId,tx):null;
   if(profile&&(profile.contact!=='CALL'||profile.mode==='LATER'&&(!profile.after||new Date(profile.after)>now))){result.held++;continue;}
   const requested=typeof c.requestedAt==='string'?Date.parse(c.requestedAt):NaN;
   const after=new Date(Number.isFinite(requested)?Math.max(now.getTime(),requested):now.getTime());
   const old=await tx.teamCalendarEvent.findUnique({where:{followUpTaskId:task.id}});
   // Customer-confirmed appointments retain their assigned time and rep.
   if(old?.kind==='CALL'||old?.status==='SCHEDULED'&&old.startsAt>=now){result.held++;continue;}
   const priorToday=today.find(t=>t.id===task.id);
   const eligible=members.filter(m=>m.availability==='AVAILABLE'&&acceptsAssignmentsNow(m.preferences,now)&&(used.get(m.id)||0)-(priorToday?.ownerId===m.id?1:0)<(capacities.get(m.id)||0)&&(!Array.isArray(callContext(m.preferences).crm?.callServices)||!callContext(m.preferences).crm.callServices.length||callContext(m.preferences).crm.callServices.includes(c.service)));
   eligible.sort((l,r)=>callLoadScore(l.preferences,load.get(l.id)||0)-callLoadScore(r.preferences,load.get(r.id)||0)||l.id.localeCompare(r.id));
   let assigned=false;
   for(const member of eligible){
     if(Date.now()>deadline)break;
     if(!profile&&(!slots.has(member.id)||(slots.get(member.id)?.getTime()??Infinity)<after.getTime()))slots.set(member.id,await employeeCallSlot(tx,a.workspaceId,member.id,after,undefined,task.id));
     const dueAt=profile?await preferredSlot(tx,a.workspaceId,member.id,profile,after,task.id):slots.get(member.id);if(!dueAt||dueAt>=end)continue;
     const changed=await tx.teamTask.update({where:{id:task.id},data:{ownerId:member.id,dueAt,followUpContext:json({...c,dailyCallScheduled:{day,version:CALL_DUTY_VERSION,previousOwnerId:task.ownerId,reason:'Available capacity and priority; original source and attribution retained.'}}),version:{increment:1}}});
     await syncCallbackCalendar(tx,a,changed);
     await tx.teamAudit.create({data:{workspaceId:a.workspaceId,actorId:a.id,action:'calls.daily_scheduled',entityId:task.id,detail:{day,from:task.ownerId,to:member.id,dueAt:dueAt.toISOString()}}});
     reminders.push({eventKey:`daily-call-assigned:${day}:${task.id}:${member.id}`,memberId:member.id,title:`Call scheduled: ${task.title}`,taskId:task.id,href:`/team?workspace=${a.workspaceId}&module=work-station&task=${task.id}`});
     if(priorToday)used.set(priorToday.ownerId,Math.max(0,(used.get(priorToday.ownerId)||0)-1));
     used.set(member.id,(used.get(member.id)||0)+1);
     if(member.id!==task.ownerId){load.set(task.ownerId,Math.max(0,(load.get(task.ownerId)||0)-1));load.set(member.id,(load.get(member.id)||0)+1);}
     slots.delete(member.id);remember(client.id,phone,task.id);result.scheduled++;assigned=true;break;
   }
   if(!assigned){result.held++;slots.clear();}
 }
 await notifyTeamBatch(tx,a,reminders);
 if(Date.now()<=deadline&&result.scheduled<12)await tx.teamWorkspace.update({where:{id:a.workspaceId},data:{customerFollowupCursor:json({...cursor,dailyCallScheduler:{day,after:candidates.length===100?lastCandidate:null}})}});
 return result;
}
