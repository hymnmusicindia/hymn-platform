import type {Prisma} from '@prisma/client';
import {can,type Actor} from './policy';

/** Shared execution never grants access to private projects or restricted source tools. */
export function sharedWorkScope(a:Actor):Prisma.TeamTaskWhereInput {
 const records:Prisma.TeamTaskWhereInput[]=[{recordType:null}];
 if(can(a,'support.reply')||can(a,'crm.outreach.manage'))records.push({recordType:'support'});
 for(const [recordType,permission] of [['release','operations.distribution.review'],['beat','operations.beats.manage'],['engineer','operations.engineers.manage'],['studio','operations.studio.review']] as const)if(can(a,permission))records.push({recordType});
 const sources:Prisma.TeamTaskWhereInput[]=[];
 for(const [kind,permission] of [['lead','crm.prospects.create'],['producer','operations.producers.approve'],['engineer','operations.engineers.approve']] as const)if(!can(a,permission))sources.push({eventKey:{startsWith:`auto-source:${kind}:`}});
 if(!can(a,'crm.outreach.manage'))sources.push({eventKey:{startsWith:'support-call:'}},{eventKey:{endsWith:':call'}});
 return {workspaceId:a.workspaceId,archivedAt:null,...(can(a,'tasks.all')?{}:{AND:[{OR:[{projectId:null},{project:{memberIds:{has:a.id}}}]},{OR:records},...(sources.length?[{OR:[{eventKey:null},{NOT:{OR:sources}}]}]:[])]})};
}
export function mayHelp(a:Actor){return can(a,'tasks.update')&&can(a,'tasks.complete');}
