import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can, demand, TeamError, type Actor, type Permission } from './policy';
import { audit, notify } from './service';
import { personalCallPlan } from './personal-call-plan-policy';
import { indiaWorkday } from './daily-work';
import { reservationEnd, reservationsOverlap } from './calendar-reservations';
import { activeWindows, effectiveSlots, moveWorkWeek, planMeetsTarget, planMinutes, record, requiredMinutes, validWorkWeek, withinWorkHours, workAvailability, workWeek } from './availability-rules';
const weekSchema = z.string().refine(validWorkWeek, 'Choose a Monday-based week.');
const slotsSchema = z.array(z.object({ day:z.number().int().min(0).max(6), start:z.number().int().min(0).max(1425).multipleOf(15), end:z.number().int().min(15).max(1440).multipleOf(15) })).max(42);
export async function availabilityMutation(tx: Prisma.TransactionClient, a: Actor, resource: string, input: unknown) {
  if(resource === 'availability-policy') {
    demand(a,'team.members.manage');
    const data=z.object({memberId:z.string(),weeklyHours:z.number().min(0).max(84).multipleOf(0.25),week:weekSchema,leaveHours:z.number().min(0).max(84).multipleOf(0.25),recurring:z.object({enabled:z.boolean(),slots:slotsSchema,assignOnlyWhileActive:z.boolean(),restrictOverrides:z.boolean()}).optional()}).parse(input);
    if(data.leaveHours>data.weeklyHours)throw new TeamError('Approved leave cannot exceed weekly working hours.');
    const member=await tx.teamMember.findFirst({where:{id:data.memberId,workspaceId:a.workspaceId,status:'ACTIVE',role:{owner:false}}});
    if(!member)throw new TeamError('Employee unavailable.',404);
    const preferences=record(member.preferences), config=workAvailability(preferences);
    if(data.recurring){
      const slots=[...data.recurring.slots].sort((a,b)=>a.day-b.day||a.start-b.start);
      for(let i=0;i<slots.length;i++)if(slots[i].end<=slots[i].start||i>0&&slots[i-1].day===slots[i].day&&slots[i-1].end>slots[i].start)throw new TeamError('Recurring hours must not overlap.');
      if(data.recurring.enabled&&planMinutes(slots)<data.weeklyHours*60*0.7)throw new TeamError('Recurring hours must cover at least 70% of weekly working hours.');
    }
    const updated={...config,weeklyMinutes:data.weeklyHours*60,...(data.recurring?{recurring:data.recurring}:{}),leave:{...config.leave,[data.week]:data.leaveHours*60}};
    await tx.teamMember.update({where:{id:member.id},data:{preferences:{...preferences,workAvailability:updated} as Prisma.InputJsonValue}});
    await audit(tx,a,'availability.policy_updated',member.id,{week:data.week,weeklyHours:data.weeklyHours,leaveHours:data.leaveHours,recurring:updated.recurring});
    await notify(tx,member.id,'Your working-hours requirement changed. Review your weekly availability.','/team?module=availability');
    return {saved:true};
  }
  const data=z.object({week:weekSchema,revision:z.number().int().min(0),slots:slotsSchema}).parse(input);
  if(a.role.owner)throw new TeamError('Owners supervise work; employee availability is not required.');
  if(data.week<workWeek() || data.week>moveWorkWeek(workWeek(),4))throw new TeamError('Submit this week or one of the next four weeks.');
  const member=await tx.teamMember.findUniqueOrThrow({where:{id:a.id}}), preferences=record(member.preferences), config=workAvailability(preferences);
  if((config.plans[data.week]?.revision || 0)!==data.revision)throw new TeamError('Availability changed. Refresh before saving.',409);
  const slots=[...data.slots].sort((x,y)=>x.day-y.day || x.start-y.start);
  for(let index=0;index<slots.length;index++) {
    const slot=slots[index], previous=slots[index-1];
    if(slot.end<=slot.start || previous?.day===slot.day && previous.end>slot.start)throw new TeamError('Use non-overlapping time ranges with an end after the start.');
    if(planMinutes(slots.filter(s=>s.day===slot.day))>720)throw new TeamError('Declare no more than 12 available hours per day.');
  }
  if(planMinutes(slots)<Math.ceil(requiredMinutes(preferences,data.week)*0.7))throw new TeamError('Declare at least 70% of your working hours after approved leave.');
  const plans=Object.fromEntries(Object.entries(config.plans).filter(([week])=>week>=moveWorkWeek(workWeek(),-8)));
  const next={...preferences,workAvailability:{...config,plans:{...plans,[data.week]:{revision:data.revision+1,submittedAt:new Date().toISOString(),slots}}}};
  if(planMinutes(effectiveSlots(next,data.week))!==planMinutes(slots))throw new TeamError('These hours fall outside your recurring shift. Ask a manager to change the shift.');
  const start=new Date(`${data.week}T00:00:00+05:30`), end=new Date(start.getTime()+7*86400000);
  const booked=await tx.teamCalendarEvent.findMany({where:{workspaceId:a.workspaceId,assigneeId:a.id,status:'SCHEDULED',OR:[{kind:{in:['CALL','FOLLOW_UP']}},{followUpTaskId:{not:null}}],startsAt:{gte:new Date(Math.max(start.getTime(),Date.now())),lt:end}}});
  if(booked.some(event=>!withinWorkHours(next,event.startsAt,reservationEnd(event))))throw new TeamError('An upcoming call falls outside these hours. Pass or reschedule it before changing your availability.',409);
  await tx.teamMember.update({where:{id:a.id},data:{preferences:next as Prisma.InputJsonValue}});
  await audit(tx,a,'availability.submitted',a.id,{week:data.week,minutes:planMinutes(slots),revision:data.revision+1});
  return {saved:true,revision:data.revision+1};
}
export async function availabilityRead(a:Actor,params:URLSearchParams) {
  const week=weekSchema.parse(params.get('week')||workWeek());
  const members=await prisma.teamMember.findMany({where:{workspaceId:a.workspaceId,status:'ACTIVE',role:{owner:false},...(can(a,'tasks.assign')?{}:{id:a.id})},include:{user:{select:{name:true}},role:true},orderBy:{id:'asc'}});
  return {week,minimumPercent:70,items:members.map(m=>({id:m.id,name:m.user.name,weeklyHours:workAvailability(m.preferences).weeklyMinutes/60,leaveHours:Number(workAvailability(m.preferences).leave[week]||0)/60,requiredHours:requiredMinutes(m.preferences,week)/60,plan:workAvailability(m.preferences).plans[week]||null,previousPlan:workAvailability(m.preferences).plans[moveWorkWeek(week,-1)]||null,effectiveSlots:effectiveSlots(m.preferences,week),planSource:workAvailability(m.preferences).plans[week]?'weekly':workAvailability(m.preferences).recurring.enabled?'recurring':'none',recurring:workAvailability(m.preferences).recurring,compliant:planMeetsTarget(m.preferences,week)}))};
}
export async function employeeCallSlot(tx:Prisma.TransactionClient,workspaceId:string,memberId:string,after:Date,eventId?:string,taskId?:string,permission:Permission='crm.outreach.manage') {
  const member=await tx.teamMember.findFirst({where:{id:memberId,workspaceId,status:'ACTIVE',availability:'AVAILABLE',user:{status:'ACTIVE'}},include:{role:true}});
  const personal=member?.role.owner?personalCallPlan(member.preferences):null;
  if(member?.role.owner&&(!personal?.enabled||permission!=='crm.outreach.manage'))return null;
  if(!member || !can(member,permission) || permission==='crm.outreach.manage' && !can(member,'calendar.manage'))return null;
  const until=new Date(after.getTime()+14*86400000);
  const reservations=await tx.teamCalendarEvent.findMany({where:{workspaceId,assigneeId:memberId,status:'SCHEDULED',...(eventId?{id:{not:eventId}}:{}),...(taskId?{OR:[{followUpTaskId:null},{followUpTaskId:{not:taskId}}]}:{}),startsAt:{gte:new Date(after.getTime()-7*86400000),lt:until}}});
  for(const window of activeWindows(member.preferences,after,until)) {
    let candidate=new Date(Math.ceil(Math.max(after.getTime(),window.startsAt.getTime())/900000)*900000);
    while(candidate.getTime()+30*60000<=Math.min(window.endsAt.getTime(),until.getTime())) {
      if(personal){const {start,end}=indiaWorkday(candidate);const used=await tx.teamTask.count({where:{workspaceId,ownerId:memberId,archivedAt:null,status:{not:'CANCELLED'},...(taskId?{id:{not:taskId}}:{}),dueAt:{gte:start,lt:end},followUpContext:{path:['personalCallPlan'],equals:true}}});if(used>=personal.dailyLimit)break;}
      const conflicts=reservations.filter(event=>reservationsOverlap({kind:'CALL',startsAt:candidate,endsAt:null},event));
      if(!conflicts.length)return candidate;
      candidate=new Date(Math.ceil(Math.max(...conflicts.map(event=>reservationEnd(event).getTime()))/900000)*900000);
    }
  }
  return null;
}
export async function requireActiveCallHours(tx:Prisma.TransactionClient,workspaceId:string,memberId:string,startsAt:Date,endsAt:Date) {
  const member=await tx.teamMember.findFirst({where:{id:memberId,workspaceId,status:'ACTIVE',availability:'AVAILABLE',role:{owner:false},user:{status:'ACTIVE'}},include:{role:true}});
  if(!member || !can(member,'calendar.manage') || !can(member,'crm.outreach.manage') || !withinWorkHours(member.preferences,startsAt,endsAt))throw new TeamError('Choose a call representative with active working hours covering this entire call.',409);
}
