import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { teamMutation, teamRead, teamWrite } from '../lib/team/service';
import { mergeContacts } from '../lib/team/contact-merge';
import { matchingContacts, contactPhoneKey } from '../lib/team/contact-directory';
import { importCallContact } from '../lib/team/call-list-import';
import { readCallFollowups, recordCallbackOutcome } from '../lib/team/customer-followups';
async function main(){
  assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const workspace=await prisma.teamWorkspace.create({data:{name:'Contact merge fixture',clientCardsImportedAt:new Date()}});
  async function member(name:string,owner=false){const user=await prisma.user.create({data:{name,email:`${name}@contact.fixture.invalid`,googleId:name}});const role=await prisma.teamRole.upsert({where:{workspaceId_name:{workspaceId:workspace.id,name:owner?'Owner':'Call Representative'}},update:{},create:{workspaceId:workspace.id,name:owner?'Owner':'Call Representative',owner,permissions:owner?[]:['crm.outreach.manage','tasks.update','calendar.manage','tasks.complete']}});return prisma.teamMember.create({data:{workspaceId:workspace.id,userId:user.id,roleId:role.id},include:{role:true}});}
  const owner=await member('owner',true),kira=await member('kira'),other=await member('other');
  assert.equal(contactPhoneKey('98765 43210'),contactPhoneKey('+91 98765-43210'));
  assert.equal(contactPhoneKey('+880 1973464785'),'8801973464785');
  const target=await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:other.id,name:'Existing artist',email:'artist@fixture.invalid',phone:'9876543210',notes:'Other member private note'}});
  const source=await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:kira.id,name:'Artist alias',email:'alternate@fixture.invalid',phone:'+919999999999',notes:'Kira private note'}});
  const task=await prisma.teamTask.create({data:{workspaceId:workspace.id,creatorId:owner.id,ownerId:kira.id,clientId:source.id,title:'Existing call',description:'Call history'}});
  const event=await prisma.teamCalendarEvent.create({data:{workspaceId:workspace.id,creatorId:owner.id,assigneeId:kira.id,clientId:source.id,title:'Existing appointment',kind:'FOLLOW_UP',startsAt:new Date('2027-01-05T05:30:00Z')}});
  assert.equal((await matchingContacts(prisma,workspace.id,{phone:'+91 (98765) 43210'}))[0].id,target.id);
  await assert.rejects(teamMutation(kira,'clients-save',{ownerId:kira.id,name:'Duplicate',phone:'+919876543210'}),/matching contact/);
  const merge={sourceId:source.id,sourceVersion:source.version,targetId:target.id,targetVersion:target.version,confirmedSamePerson:true,reason:'Confirmed same artist by phone and email.',requestKey:randomUUID()};
  await assert.rejects(teamMutation(kira,'clients-merge',{...merge,confirmedSamePerson:false}));
  const result=await teamMutation(kira,'clients-merge',merge) as {id:string;notes:string;version:number};
  assert.equal(result.id,target.id);assert.equal(result.notes,'','Merging must not expose another member\'s private notes.');
  assert.equal((await prisma.teamTask.findUniqueOrThrow({where:{id:task.id}})).ownerId,kira.id);
  assert.equal((await prisma.teamTask.findUniqueOrThrow({where:{id:task.id}})).clientId,target.id);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({where:{id:event.id}})).clientId,target.id);
  assert.equal((await matchingContacts(prisma,workspace.id,{phone:'9999999999'}))[0].id,target.id);
  assert.equal((await matchingContacts(prisma,workspace.id,{email:'alternate@fixture.invalid'}))[0].id,target.id);
  const history=await teamRead(kira,'client-merge-history',new URLSearchParams({clientId:target.id})) as {items:{notes:string}[]};assert.equal(history.items[0].notes,'Kira private note');
  const repeat=await teamMutation(kira,'clients-merge',merge) as {id:string};assert.equal(repeat.id,target.id);
  const draft={ownerId:kira.id,name:'Artist updated details',email:'third@fixture.invalid',phone:'+919876543210',notes:'New private research note',status:'ACTIVE'};
  const merged=await teamMutation(kira,'clients-merge',{targetId:target.id,targetVersion:result.version,draft,confirmedSamePerson:true,reason:'Confirmed new email for the same artist.',requestKey:randomUUID()}) as {id:string;version:number};
  assert.equal((await matchingContacts(prisma,workspace.id,{email:'third@fixture.invalid'}))[0].id,target.id);
  assert.equal(await prisma.teamClientWelcome.count(),0,'A merge does not send introductions.');
  const prospect=await prisma.teamProspect.create({data:{workspaceId:workspace.id,ownerId:other.id,clientId:target.id,name:'Existing artist',email:target.email,phone:target.phone,sourceUrl:'https://fixture.invalid/artist',evidence:'Existing pipeline history kept on its original owner.',score:{},identityKey:'merge-fixture-prospect'}});
  const blocked=await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:kira.id,name:'Opted out',phone:'+918888888888',status:'DO_NOT_CONTACT'}});
  await teamMutation(kira,'clients-merge',{sourceId:blocked.id,sourceVersion:1,targetId:target.id,targetVersion:merged.version,confirmedSamePerson:true,reason:'Confirmed duplicate with do-not-contact preference.',requestKey:randomUUID()});
  assert.equal((await prisma.teamClient.findUniqueOrThrow({where:{id:target.id}})).status,'DO_NOT_CONTACT');
  const protectedProspect=await prisma.teamProspect.findUniqueOrThrow({where:{id:prospect.id}});assert.equal(protectedProspect.suppressed,true);assert.equal(protectedProspect.ownerId,other.id);
  assert.equal((await prisma.teamTask.findUniqueOrThrow({where:{id:task.id}})).status,'CANCELLED');
  const user1=await prisma.user.create({data:{name:'Account one',email:'account1@fixture.invalid',googleId:'account1'}}),user2=await prisma.user.create({data:{name:'Account two',email:'account2@fixture.invalid',googleId:'account2'}});
  const card1=await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:kira.id,userId:user1.id,name:'User 1'}}),card2=await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:kira.id,userId:user2.id,name:'User 2'}});
  await assert.rejects(teamWrite(kira,(tx,a)=>mergeContacts(tx,a,{sourceId:card1.id,sourceVersion:1,targetId:card2.id,targetVersion:1,confirmedSamePerson:true,reason:'Two different accounts should not merge.',requestKey:randomUUID()})),/different HYMN login/);
  const parent=await prisma.teamTask.create({data:{workspaceId:workspace.id,creatorId:owner.id,ownerId:kira.id,title:'Friendly introductions'}});
  const now=new Date('2027-01-08T04:30:00Z'); // Friday 10 AM IST
  const options={batch:'fixture-contacts',assigneeId:kira.id,parentTaskId:parent.id,now};
  for(let i=0;i<12;i++){const row={name:`Intro ${i}`,phone:`+91700000${String(i).padStart(4,'0')}`,notes:i===0?'Mixing/mastering priority and distribution.':'Friendly introduction; distribution.'};const imported=await teamWrite(owner,(tx,a)=>importCallContact(tx,a,row,options));assert.equal(imported.status,'ASSIGNED');if(i===0)assert.equal((await teamWrite(owner,(tx,a)=>importCallContact(tx,a,row,options))).status,'ALREADY_ASSIGNED');}
  const calls=await readCallFollowups(kira,new URLSearchParams());assert.equal(calls.items.length,12);
  const intros=await prisma.teamTask.findMany({where:{parentId:parent.id},orderBy:{dueAt:'asc'}});assert.equal(intros.length,12);
  const dayCounts=new Map<string,number>();
  for(const call of intros){assert.equal(call.ownerId,kira.id);const local=new Date(call.dueAt!.getTime()+330*60000);assert.ok(![0,6].includes(local.getUTCDay()));const day=local.toISOString().slice(0,10);dayCounts.set(day,(dayCounts.get(day)||0)+1);}
  assert.ok([...dayCounts.values()].every(n=>n<=10));
  const slots=await prisma.teamCalendarEvent.findMany({where:{followUpTaskId:{in:intros.map(t=>t.id)}}});assert.equal(new Set(slots.map(s=>s.startsAt.toISOString())).size,12);
  await teamWrite(kira,(tx,a)=>recordCallbackOutcome(tx,a,{id:intros[0].id,version:intros[0].version,outcome:'RESOLVED',notes:'Introduced HYMN services and noted current needs.'},now));
  assert.equal(await prisma.acquisitionLead.count(),0,'Founder-provided calls must not fabricate acquisition credit.');
  assert.equal(await prisma.teamAppointmentMessage.count(),0,'Internal slots must not send customer appointment emails.');
  console.log('PASS contact merge and call import: normalization, conflicts, private-note isolation, history, aliases, retries, DNC, separate accounts, Kira assignment, weekday capacity, idempotent imports, actual outcomes and no invented acquisition credit.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
