import 'server-only';
import {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {clientDetailsSchema,readClientDetails,type ClientDetails} from './client-details';
import {TeamError} from './team/policy';
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function customerDetailsSnapshot(preferences:unknown){const p=obj(preferences);return {details:readClientDetails(p.clientDetails),revision:Number.isSafeInteger(p.clientDetailsRevision)&&Number(p.clientDetailsRevision)>=0?Number(p.clientDetailsRevision):0};}
export async function saveCustomerDetails(userId:number,details:ClientDetails,revision:number,db=prisma){
 const parsed=clientDetailsSchema.parse(details);
 return db.$transaction(async tx=>{
  const card=await tx.teamClient.findUnique({where:{userId},select:{id:true,workspaceId:true}});
  if(card)await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${card.workspaceId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
  const user=await tx.user.findUniqueOrThrow({where:{id:userId},select:{status:true,onboardingPreferences:true}});
  if(user.status!=='ACTIVE')throw new TeamError('Your account is not active.',403);
  const current=customerDetailsSnapshot(user.onboardingPreferences);if(current.revision!==revision)throw new TeamError('These details changed in another session. Reload the saved details before saving again.',409);
  const next={...obj(user.onboardingPreferences),clientDetails:parsed,clientDetailsRevision:revision+1};
  await tx.user.update({where:{id:userId},data:{onboardingPreferences:next as Prisma.InputJsonValue}});
  if(card)await tx.teamClient.updateMany({where:{id:card.id,userId,mergedIntoId:null},data:{clientDetails:{...parsed,source:'CUSTOMER',updatedAt:new Date().toISOString()},city:parsed.city,state:parsed.state,version:{increment:1}}});
  return {details:parsed,revision:revision+1};
 },{maxWait:10000,timeout:20000});
}
