import type {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {desktopBrief} from './desktop-alert-text';
export const desktopTaskGroups=[
  {category:'distribution',entities:['release','release_change_request','managed_service_request'],permissions:['releases.read','releases.review','distribution.retry'],title:'Distribution needs attention',href:'/admin?tab=releases'},
  {category:'support',entities:['support_ticket'],permissions:['services.manage'],title:'New support activity',href:'/admin?tab=support'},
  {category:'store',entities:['beat','beat_purchase','studio_order'],permissions:['services.manage'],title:'Store or Studio activity',href:'/admin?tab=operations'},
  {category:'users',entities:['user','artist_hub_case'],permissions:['users.read'],title:'Account review required',href:'/admin?tab=users'},
  {category:'finance',entities:['payout','payout_request','partner_payout'],permissions:['payouts.review'],title:'Finance review required',href:'/admin?tab=revenue'},
] as const;
export function desktopTaskScope(permissions:readonly string[]):Prisma.AdminTaskWhereInput{
  const entities=desktopTaskGroups.filter(group=>group.permissions.some(p=>permissions.includes(p))).flatMap(group=>[...group.entities]);
  // Unknown operational tasks are reserved for system administrators.
  return permissions.includes('system.manage')?{}:{entityType:{in:entities}};
}
type Task={id:number;entityType:string;entityId?:string;updatedAt:Date;status:string;priority:string;type?:string;title?:string;body?:string;href?:string};
type Context={name:string;detail?:string;imageUrl?:string;href?:string};
export async function desktopTaskContexts(tasks:Task[]){
  const ids=(type:string)=>tasks.filter(t=>t.entityType===type).map(t=>Number(t.entityId)).filter(id=>Number.isSafeInteger(id)&&id>0);
  const [releases,tickets,beats,orders]=await Promise.all([
    prisma.release.findMany({where:{id:{in:ids('release')},archivedAt:null},select:{id:true,title:true,artistName:true,artworkUrl:true}}),
    prisma.supportTicket.findMany({where:{id:{in:ids('support_ticket')}},select:{id:true,subject:true,status:true,category:true}}),
    prisma.beat.findMany({where:{id:{in:ids('beat')}},select:{id:true,title:true,status:true}}),
    prisma.studioServiceOrder.findMany({where:{id:{in:ids('studio_order')}},select:{id:true,projectTitle:true,status:true,publicId:true}})
  ]);
  const result=new Map<string,Context>();
  for(const r of releases)result.set(`release:${r.id}`,{name:r.title,detail:r.artistName,imageUrl:r.artworkUrl?`/api/desktop/artwork?releaseId=${r.id}`:undefined,href:`/admin?tab=releases&releaseId=${r.id}`});
  for(const t of tickets)result.set(`support_ticket:${t.id}`,{name:t.subject,detail:`${t.category} · ${t.status.replaceAll('_',' ').toLowerCase()}`,href:`/admin?tab=support&ticketId=${t.id}`});
  for(const b of beats)result.set(`beat:${b.id}`,{name:b.title,detail:b.status.replaceAll('_',' ').toLowerCase(),href:`/admin?tab=operations&beatId=${b.id}`});
  for(const o of orders)result.set(`studio_order:${o.id}`,{name:o.projectTitle,detail:o.status.replaceAll('_',' ').toLowerCase(),href:`/admin/studio/orders/${o.publicId}`});
  return result;
}
export function desktopTaskAlert(task:Task,permissions:readonly string[],context?:Context){
  const group=desktopTaskGroups.find(g=>(g.entities as readonly string[]).includes(task.entityType));
  if(group&&!group.permissions.some(p=>permissions.includes(p)))return null;
  if(!group&&!permissions.includes('system.manage'))return null;
  const label=task.type?.replace(/Distribution QC review|Needs Review/gi,'QC required').replace(/Correction review/gi,'Corrections ready for QC').replace(/DireNote Failed/gi,'Delivery failed')||group?.title||'Operations update';
  const names=context&&['release','beat'].includes(task.entityType)?[context.name,context.detail||'']:[];
  return {key:`${task.id}:${task.updatedAt.toISOString()}:${task.status}`,category:group?.category??'system',title:desktopBrief(context?`${context.name} · ${label}`:task.title||label,150,names),body:desktopBrief([task.priority==='critical'?'Urgent':null,context?.detail,task.entityType==='support_ticket'?'Open the ticket to review the issue and reply.':task.body||'Open the workspace for details.'].filter(Boolean).join(' · '),260,names),href:context?.href??group?.href??'/admin?tab=notifications',imageUrl:context?.imageUrl??null,at:task.updatedAt.toISOString()};
}
