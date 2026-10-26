import 'server-only';
import type {Prisma} from '@prisma/client';
/** Ledger calculations use the employee who was connected when the purchase was created. */
export async function employeeAttributionAt(tx:Prisma.TransactionClient,customerId:number,at:Date,workspaceId?:string){
  const leads=await tx.acquisitionLead.findMany({where:{customerId,...(workspaceId?{workspaceId}:{})},take:101});
  if(leads.length>100)throw Error('Employee attribution requires review.');
  const matches:typeof leads=[];
  for(const lead of leads){
    const history=Array.isArray(lead.referralHistory)?lead.referralHistory:[];
    let historical=false;
    for(const raw of history){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
      const period=raw as Record<string,unknown>;
      if(typeof period.startsAt!=='string'||typeof period.endsAt!=='string'||typeof period.employeeId!=='string'||typeof period.researcherId!=='string')throw Error('Referral history requires review.');
      const start=new Date(period.startsAt),end=new Date(period.endsAt);
      if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)throw Error('Referral history requires review.');
      if(at<start||at>=end)continue;
      matches.push({...lead,acquisitionEmployeeId:period.employeeId,researcherEmployeeId:period.researcherId,attributionLockedAt:start,referralEndedAt:end,referralOnly:period.referralOnly===true,referralAcceptedAt:typeof period.acceptedAt==='string'?new Date(period.acceptedAt):null,requiresReferralConsent:false});historical=true;
    }
    if(!historical&&lead.acquisitionEmployeeId&&lead.attributionLockedAt&&lead.attributionLockedAt<=at&&(!lead.referralEndedAt||lead.referralEndedAt>at)&&(!lead.requiresReferralConsent||lead.referralAcceptedAt&&lead.referralAcceptedAt<=at))matches.push(lead);
  }
  if(matches.length>1)throw Error('Conflicting employee attribution requires review.');
  return matches[0]||null;
}
