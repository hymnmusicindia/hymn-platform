import 'server-only';
import { Prisma } from '@prisma/client';
import { can } from './policy';
import { withinWorkHours } from './availability-rules';
import { reservationsOverlap } from './calendar-reservations';
/** Called only inside the workspace write lock. Passing never changes the client's time. */
export async function representativeForCall(tx:Prisma.TransactionClient,workspaceId:string,startsAt:Date,exclude:string[]=[],eventId?:string) {
  const members=await tx.teamMember.findMany({where:{workspaceId,status:'ACTIVE',availability:'AVAILABLE',id:{notIn:exclude},role:{owner:false},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}});
  const candidates=members.filter(m=>can(m,'crm.outreach.manage')&&can(m,'calendar.manage')&&withinWorkHours(m.preferences,startsAt,new Date(startsAt.getTime()+30*60000)));
  if(!candidates.length)return null;
  const events=await tx.teamCalendarEvent.findMany({where:{workspaceId,assigneeId:{in:candidates.map(m=>m.id)},status:'SCHEDULED',...(eventId?{id:{not:eventId}}:{}),startsAt:{gte:new Date(startsAt.getTime()-7*86400000)}}});
  const free=candidates.filter(m=>!events.some(e=>e.assigneeId===m.id&&reservationsOverlap({kind:'CALL',startsAt,endsAt:null},e)));
  const load=(memberId:string)=>events.filter(e=>e.assigneeId===memberId&&e.startsAt>=new Date()).length;
  return free.sort((a,b)=>load(a.id)-load(b.id)||a.id.localeCompare(b.id))[0]||null;
}
