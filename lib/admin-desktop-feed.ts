import type {Prisma} from '@prisma/client';
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
export function desktopTaskAlert(task:{id:number;entityType:string;updatedAt:Date;status:string;priority:string},permissions:readonly string[]){
  const group=desktopTaskGroups.find(g=>(g.entities as readonly string[]).includes(task.entityType));
  if(group&&!group.permissions.some(p=>permissions.includes(p)))return null;
  if(!group&&!permissions.includes('system.manage'))return null;
  return {key:`${task.id}:${task.updatedAt.toISOString()}:${task.status}`,category:group?.category??'system',title:group?.title??'HYMN operations need attention',body:`${task.priority==='critical'?'Urgent review requested.':'An admin task was created or updated.'} Open Admin OS for details.`,href:group?.href??'/admin?tab=notifications'};
}
