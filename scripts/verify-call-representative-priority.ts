import assert from 'node:assert/strict';
import { allocateCustomerCall } from '../lib/team/call-assignment';
import type { Prisma } from '@prisma/client';

async function main() {
 const after = new Date('2026-11-26T04:00:00Z');
 const permissions = ['crm.prospects.view', 'crm.outreach.manage', 'calendar.manage', 'tasks.update'];
 const member = (id:string, dedicated:boolean) => ({id,workspaceId:'fixture',jobTitle:dedicated?'Call representative':'Researcher',department:'Customer success',responsibilities:'Distribution and mixing',user:{name:id},role:{name:dedicated?'Call Representative':'Researcher & Calling',permissions,owner:false},preferences:{crm:{caller:true,...(dedicated?{workRole:'caller'}:{workRole:'researcher'})}}});
 const members=[member('Aaditya',true),member('Khushi',true),member('Backup',false)];
 const snapshot={members,workload:new Map([['Aaditya',33],['Khushi',34],['Backup',0]]),events:[],tasks:[],until:new Date(after.getTime()+3600000)} as unknown as NonNullable<Parameters<typeof allocateCustomerCall>[1]['snapshot']>;
 const tx={} as Prisma.TransactionClient;
 for(const consultation of [true,false]) {
  const pick=await allocateCustomerCall(tx,{workspaceId:'fixture',after,now:after,consultation,callerRotation:!consultation,snapshot});
  assert.equal(pick?.member.id,'Aaditya','Dedicated representatives take new calls before a lightly loaded researcher');
 }
 snapshot.workload.set('Aaditya',35);
 assert.equal((await allocateCustomerCall(tx,{workspaceId:'fixture',after,now:after,snapshot}))?.member.id,'Khushi','The lower-loaded dedicated representative is selected');
 assert.equal((await allocateCustomerCall(tx,{workspaceId:'fixture',after,now:after,snapshot,preferredMemberId:'Backup'}))?.member.id,'Backup','Existing explicit representative preference remains authoritative');
 snapshot.events=members.filter(m=>m.id!=='Backup').map(m=>({assigneeId:m.id,followUpTaskId:null,kind:'MEETING',status:'SCHEDULED',startsAt:after,endsAt:snapshot.until}));
 assert.equal((await allocateCustomerCall(tx,{workspaceId:'fixture',after,now:after,snapshot}))?.member.id,'Backup','Qualified backups remain available when dedicated representatives have no free slot');
 snapshot.events.push({assigneeId:'Backup',followUpTaskId:null,kind:'MEETING',status:'SCHEDULED',startsAt:after,endsAt:snapshot.until});
 assert.equal(await allocateCustomerCall(tx,{workspaceId:'fixture',after,now:after,snapshot}),null,'No representative is double-booked when all capacity is occupied');
 console.log('PASS dedicated call routing: consultations, general calls, balanced load, existing preference, qualified fallback and no double-booking.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
