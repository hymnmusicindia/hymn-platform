import { config } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
config({path:'.env.hostinger',quiet:true});
import { prisma } from '../lib/prisma';
import { assertProductionDatabaseReady } from '../lib/production-database-safety';
import { callListRow, importCallContact, INTRODUCTION_BRIEF } from '../lib/team/call-list-import';
import { teamWrite } from '../lib/team/service';
import { contactPhoneKey, matchingContacts } from '../lib/team/contact-directory';
async function main(){
  const path=process.argv[2],batch=process.argv[3];
  if(!path||!batch||!/^[a-z0-9-]{3,80}$/.test(batch))throw new Error('Usage: import-team-call-list.ts <private JSON file> <batch-key> [--apply]');
  await assertProductionDatabaseReady(prisma);
  const rows=JSON.parse(readFileSync(path,'utf8')).map((r:unknown)=>callListRow.parse(r)) as ReturnType<typeof callListRow.parse>[];
  if(!rows.length||rows.length>200||new Set(rows.map(r=>contactPhoneKey(r.phone))).size!==rows.length)throw new Error('Use up to 200 contacts with unique normalized numbers.');
  const workspace=await prisma.teamWorkspace.findFirstOrThrow({orderBy:{createdAt:'asc'}});
  const owner=await prisma.teamMember.findFirstOrThrow({where:{workspaceId:workspace.id,status:'ACTIVE',role:{owner:true},user:{name:{equals:'Aditya Ujjain',mode:'insensitive'},status:'ACTIVE'}},include:{role:true}});
  const callers=await prisma.teamMember.findMany({where:{workspaceId:workspace.id,status:'ACTIVE',role:{owner:false},user:{name:{equals:'Kira',mode:'insensitive'},status:'ACTIVE'}},include:{role:true}});
  if(callers.length!==1||!callers[0].role.permissions.includes('crm.outreach.manage'))throw new Error('A unique active Kira call representative is required.');
  const kira=callers[0];
  const plan=[];
  for(const row of rows){const matches=await matchingContacts(prisma,workspace.id,row);const linked=row.existingUserId?await prisma.teamClient.findUnique({where:{userId:row.existingUserId}}):null;const ids=new Set([...matches.map(m=>m.id),...(linked?[linked.id]:[])]);if(ids.size>1)throw new Error(`Conflicting identities for ${row.name}. Resolve before applying.`);plan.push({name:row.name,matched:ids.size>0,linkedUserId:row.existingUserId||null});}
  console.log(JSON.stringify({contacts:rows.length,matched:plan.filter(p=>p.matched).length,create:plan.filter(p=>!p.matched).length,assignee:'Kira',batch,apply:process.argv.includes('--apply')}));
  if(!process.argv.includes('--apply'))return;
  mkdirSync('.cache',{recursive:true});
  const parent=await teamWrite(owner,async(tx,a)=>tx.teamTask.upsert({where:{eventKey:`contact-call-batch:${workspace.id}:${batch}`},update:{},create:{workspaceId:workspace.id,creatorId:a.id,ownerId:kira.id,eventKey:`contact-call-batch:${workspace.id}:${batch}`,title:`Friendly HYMN introductions - ${rows.length} contacts`,description:`${INTRODUCTION_BRIEF}\n\nReview each assigned contact's specific notes. Takumi's mixing/mastering enquiry is prioritised. Confirm missing names and email addresses; ask Miginda for a referral update and Rishant for engineer-workflow feedback. Individual calls reserve weekday slots with at most ten introductions per day. Completion means actual call outcomes recorded, not merely opening WhatsApp.`,priority:'HIGH'}}));
  const results=[];
  for(const row of [...rows].sort((a,b)=>Number(/priority/i.test(b.notes))-Number(/priority/i.test(a.notes)))){
    results.push(await teamWrite(owner,(tx,a)=>importCallContact(tx,a,row,{batch,assigneeId:kira.id,parentTaskId:parent.id})));
    writeFileSync('.cache/team-call-import-result.json',JSON.stringify({batch,parentTaskId:parent.id,assigneeId:kira.id,results},null,2));
  }
  const tasks=await prisma.teamTask.findMany({where:{parentId:parent.id},select:{id:true,dueAt:true,ownerId:true,clientId:true}});
  if(tasks.some(t=>t.ownerId!==kira.id))throw new Error('Assignment verification failed.');
  const dates=tasks.map(t=>t.dueAt?.getTime()||0).filter(Boolean).sort((a,b)=>a-b);
  await teamWrite(owner,async tx=>{await tx.teamTask.update({where:{id:parent.id},data:{dueAt:dates.length?new Date(dates.at(-1)!):null}});if(!await tx.teamAudit.findFirst({where:{workspaceId:workspace.id,action:'contact.batch_assigned',entityId:parent.id}})){await tx.teamNotification.create({data:{memberId:kira.id,title:`Assigned: friendly HYMN introductions to ${tasks.length} contacts`,href:`/team?workspace=${workspace.id}&module=work&task=${parent.id}`}});await tx.teamAudit.create({data:{workspaceId:workspace.id,actorId:owner.id,action:'contact.batch_assigned',entityId:parent.id,detail:{batch,contacts:tasks.length,assigneeId:kira.id}}});}});
  console.log(JSON.stringify({verifiedTasks:tasks.length,calendarSlots:await prisma.teamCalendarEvent.count({where:{followUpTaskId:{in:tasks.map(t=>t.id)},assigneeId:kira.id,status:'SCHEDULED'}}),created:await prisma.teamAudit.count({where:{workspaceId:workspace.id,action:'contact.introduction_assigned',AND:[{detail:{path:['batch'],equals:batch}},{detail:{path:['created'],equals:true}}]}}),reused:await prisma.teamAudit.count({where:{workspaceId:workspace.id,action:'contact.introduction_assigned',AND:[{detail:{path:['batch'],equals:batch}},{detail:{path:['created'],equals:false}}]}}),skipped:results.filter(r=>r.status==='SKIPPED_SUPPRESSED').length,first:dates.length?new Date(dates[0]).toISOString():null,last:dates.length?new Date(dates.at(-1)!).toISOString():null}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Import failed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
