import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prisma} from '../lib/prisma';
import {teamWrite} from '../lib/team/service';
import {syncDailyCallSchedule} from '../lib/team/daily-call-scheduler';
import {callDayLimit,callPriority,isCallWork} from '../lib/team/daily-call-policy';
import type {Actor} from '../lib/team/policy';

async function main(){
 assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
 // db push omits SQL-only constraints: exercise the production support-link migration too.
 await prisma.$executeRawUnsafe(`ALTER TABLE "team_tasks" DROP CONSTRAINT IF EXISTS "team_task_record_pair_check"`);
 await prisma.$executeRawUnsafe(`ALTER TABLE "team_tasks" ADD CONSTRAINT "team_task_record_pair_check" CHECK (("recordType" IS NULL AND "recordId" IS NULL) OR ("recordType" IN ('beat','release','engineer','studio') AND "recordId" > 0))`);
 for(const statement of readFileSync('prisma/migrations/20261101100000_team_support_record_links/migration.sql','utf8').split(';').map(s=>s.trim()).filter(Boolean))await prisma.$executeRawUnsafe(statement);
 assert.equal(callDayLimit({crm:{workRole:'caller',callTarget:45}},240),8);
 assert.equal(callDayLimit({crm:{workRole:'researcher',callTarget:0}},480),4);
 assert.equal(callDayLimit({},0),0);
 const now=new Date('2026-11-03T05:00:00Z');
 assert(callPriority({priority:'NORMAL',dueAt:now,followUpContext:{kind:'SUPPORT_CALLBACK'}},now)>callPriority({priority:'HIGH',dueAt:now,followUpContext:{kind:'CALL'}},now));
 assert(isCallWork({eventKey:'artist-help:fixture',followUpContext:{artistJourney:true,kind:'CALL'}}));
 const workspace=await prisma.teamWorkspace.create({data:{name:'Daily call scheduler fixture'}});
 const ownerRole=await prisma.teamRole.create({data:{workspaceId:workspace.id,name:'Owner',owner:true,permissions:[]}});
 const role=await prisma.teamRole.create({data:{workspaceId:workspace.id,name:'Call Representative',permissions:['tasks.assign','tasks.update','tasks.complete','clients.view','calendar.manage','crm.outreach.manage']}});
 async function member(name:string,owner=false){const user=await prisma.user.create({data:{name,email:`${randomUUID()}@daily-calls.fixture.invalid`,googleId:randomUUID()}});return prisma.teamMember.create({data:{workspaceId:workspace.id,userId:user.id,roleId:owner?ownerRole.id:role.id,preferences:{crm:{caller:!owner,workRole:'caller',callTarget:2}}},include:{role:true,user:{select:{status:true}}}});}
 const owner=await member('Supervisor',true),a=await member('Rep A'),b=await member('Rep B'),off=await member('Unavailable rep');await prisma.teamMember.update({where:{id:off.id},data:{availability:'UNAVAILABLE'}});
 const actor=owner as Actor;
 async function call(index:number,extra:Record<string,unknown>={}){const client=await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:a.id,name:`Customer ${index}`,phone:`+91987654${String(index).padStart(4,'0')}`}});return prisma.teamTask.create({data:{workspaceId:workspace.id,creatorId:owner.id,ownerId:a.id,clientId:client.id,title:`Call ${index}`,eventKey:`support-call:${workspace.id}:${index}`,dueAt:new Date(now.getTime()-86400000),followUpContext:{kind:'CALL',service:index%2?'BEAT_PURCHASE':'DISTRIBUTION',...extra}}});}
 const calls=await Promise.all([call(1),call(2),call(3,{artistJourney:true,sourceRecord:{urgent:true}}),call(4),call(5)]);
 await prisma.teamTask.update({where:{id:calls[0].id},data:{recordType:'support',recordId:1}});
 const paused=await call(6,{workActivity:{id:randomUUID(),startedAt:now.toISOString(),status:'PAUSED'}}),pinned=await call(7,{pinnedAssignee:true});
 const wrongPhone=await call(8);await prisma.teamClient.update({where:{id:wrongPhone.clientId!},data:{phone:''}});
 const future=await call(10,{requestedAt:new Date(now.getTime()+86400000).toISOString()});
 await prisma.teamTask.update({where:{id:future.id},data:{priority:'URGENT'}});
 const explicit=await call(9);const confirmed=await prisma.teamCalendarEvent.create({data:{workspaceId:workspace.id,creatorId:owner.id,assigneeId:a.id,clientId:explicit.clientId,followUpTaskId:explicit.id,kind:'CALL',title:'Confirmed appointment',startsAt:new Date(now.getTime()-60000),endsAt:new Date(now.getTime()+29*60000)}});
 // This appointment counts against today's quota and must never be moved.
 await prisma.teamTask.update({where:{id:explicit.id},data:{dueAt:confirmed.startsAt}});
 const samePhone=await call(11);const confirmedClient=await prisma.teamClient.findUniqueOrThrow({where:{id:explicit.clientId!}});
 await prisma.teamClient.update({where:{id:samePhone.clientId!},data:{phone:confirmedClient.phone}});await prisma.teamTask.update({where:{id:samePhone.id},data:{priority:'URGENT'}});
 const first=await teamWrite(actor,(tx,current)=>syncDailyCallSchedule(tx,current,now));
 assert.equal(first.reps,3);assert.equal(first.duties,3);assert.equal(first.plans,2);assert.equal(first.capacity,4);assert.equal(first.scheduled,3,'Existing customer appointment uses one of four total call slots');
 const scheduled=await prisma.teamTask.findMany({where:{workspaceId:workspace.id,id:{in:calls.map(t=>t.id)},dueAt:{gte:now}},orderBy:{dueAt:'asc'}});
 assert.equal(scheduled.length,3);assert(scheduled.every(t=>t.ownerId===a.id||t.ownerId===b.id));
 const counts=new Map<string,number>();for(const t of scheduled)counts.set(t.ownerId,(counts.get(t.ownerId)||0)+1);assert((counts.get(a.id)||0)<=1);assert((counts.get(b.id)||0)<=2);
 for(const id of [paused.id,pinned.id,wrongPhone.id,future.id,samePhone.id])assert.equal((await prisma.teamTask.findUniqueOrThrow({where:{id}})).dueAt!.getTime(),now.getTime()-86400000);
 assert.deepEqual(await prisma.teamCalendarEvent.findUniqueOrThrow({where:{id:confirmed.id}}),confirmed,'Confirmed appointments remain byte-for-byte unchanged');
 const second=await teamWrite(actor,(tx,current)=>syncDailyCallSchedule(tx,current,now));assert.equal(second.duties,0);assert.equal(second.plans,0);assert.equal(second.scheduled,0);
 const events=await prisma.teamCalendarEvent.findMany({where:{workspaceId:workspace.id,status:'SCHEDULED'},orderBy:{startsAt:'asc'}});
 for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++)if(events[i].assigneeId===events[j].assigneeId)assert(events[i].endsAt!.getTime()<=events[j].startsAt.getTime(),'Rep call reservations never overlap');
 assert.equal(await prisma.teamAppointmentMessage.count({where:{eventId:{in:events.filter(e=>e.kind==='FOLLOW_UP').map(e=>e.id)},kind:{in:['CLIENT_CONFIRM','CLIENT_REMINDER']}}}),0,'Internal daily plans must not send customer appointment mail');
 assert.equal(await prisma.teamTask.count({where:{workspaceId:workspace.id,ownerId:owner.id}}),0,'Owners supervise rather than receive employee call duties');
 await assert.rejects(teamWrite({...a,role:{...a.role,permissions:[]}} as Actor,(tx,current)=>{current.role={...current.role,permissions:[]};return syncDailyCallSchedule(tx,current,now);}),/permission/i);
 console.log('PASS daily call scheduler: capacity, updated-module priority, balanced assignment, live activity and pinned protection, confirmed appointments, invalid phones, unavailable reps, idempotent daily plans/duties, authorization, no overlapping slots or customer mail.');
}
main().finally(()=>prisma.$disconnect());
