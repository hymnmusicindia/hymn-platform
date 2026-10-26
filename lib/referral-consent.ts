import 'server-only';
import {createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
import type {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {getUserSessionSecret} from './env';
import {lockReferralGraph,normalizeReferralCode,registerReferralForNewUser} from './referrals';
import {referralMailbox,referralRemovalAt,REFERRAL_MINIMUM_CONNECTION_DAYS,type ReferralOffer,type ReferralConnection} from './referral-consent-policy';
type Tx=Prisma.TransactionClient;
export class ReferralConsentError extends Error {}
const publicIdentity={id:true,name:true,email:true,mobile:true,contactEmail:true,status:true,avatar:true} as const;
type Claims={purpose:'referral_consent';customerId:number;code:string;kind:'CUSTOMER'|'EMPLOYEE';ownerId:number;memberId?:string;currentId:string|null};

async function offerIdentity(tx:Tx,customerId:number,code:string){
  const customer=await tx.user.findUnique({where:{id:customerId},select:publicIdentity});
  const owner=await tx.user.findFirst({where:{referralCode:{equals:normalizeReferralCode(code),mode:'insensitive'},status:'ACTIVE'},select:publicIdentity});
  if(!customer||customer.status!=='ACTIVE'||!owner)throw new ReferralConsentError('This invitation is unavailable.');
  if(customer.id===owner.id||referralMailbox(customer.email)===referralMailbox(owner.email))throw new ReferralConsentError('You cannot refer your own account.');
  if(await tx.teamMember.count({where:{userId:customerId,status:'ACTIVE'}}))throw new ReferralConsentError('Staff accounts cannot be claimed as customer referrals.');
  const members=await tx.teamMember.findMany({where:{userId:owner.id,status:'ACTIVE'},include:{role:true},orderBy:{joinedAt:'asc'}});
  if(members.some(m=>m.role.owner))throw new ReferralConsentError('This account does not participate in the referral programme.');
  const member=members[0];
  const kind=member?'EMPLOYEE' as const:'CUSTOMER' as const;
  const current=kind==='CUSTOMER'?await tx.referral.findFirst({where:{referredUserId:customerId,endedAt:null}}):await tx.acquisitionLead.findFirst({where:{customerId,referralEndedAt:null,acquisitionEmployeeId:{not:null}}});
  const currentOwner=current?('userId' in current?current.userId:current.acquisitionEmployeeId):null;
  const needsApproval=Boolean(current&&'requiresReferralConsent' in current&&current.requiresReferralConsent&&!current.referralAcceptedAt&&currentOwner===member?.id);
  return {customer,owner,member,kind,needsApproval,currentId:current?String(current.id):null,alreadyConnected:kind==='CUSTOMER'?currentOwner===owner.id:currentOwner===member?.id&&!needsApproval};
}
export async function previewReferral(customerId:number,code:string):Promise<ReferralOffer>{
  return prisma.$transaction(async tx=>{
    const offer=await offerIdentity(tx,customerId,code);
    const claims:Claims={purpose:'referral_consent',customerId,code:normalizeReferralCode(code),kind:offer.kind,ownerId:offer.owner.id,memberId:offer.member?.id,currentId:offer.currentId};
    return {name:offer.owner.name,avatar:offer.owner.avatar,kind:offer.kind,proof:jwt.sign(claims,getUserSessionSecret(),{expiresIn:'15m',algorithm:'HS256'}),alreadyConnected:offer.alreadyConnected,conflict:Boolean(offer.currentId&&!offer.alreadyConnected&&!offer.needsApproval),minimumDays:REFERRAL_MINIMUM_CONNECTION_DAYS};
  },{timeout:15000});
}
async function receipts(tx:Tx,key:string,customerId:number,ownerId:number,body:string){
  await tx.referralMailJob.createMany({data:[customerId,ownerId].map(userId=>({eventKey:`referral-consent:${key}:${userId}`,userId,subject:'Your HYMN referral connection was updated',body})),skipDuplicates:true});
  await tx.notification.createMany({data:[customerId,ownerId].map(userId=>({userId,eventKey:`referral-consent:${key}:${userId}`,type:'account',title:'Referral connection updated',body,href:'/dashboard?tab=referral'})),skipDuplicates:true});
}
export async function approveReferral(tx:Tx,customerId:number,proof:string){
  let claims:Claims;
  try{claims=jwt.verify(proof,getUserSessionSecret(),{algorithms:['HS256']}) as Claims;}catch{throw new ReferralConsentError('This review expired. Refresh the invitation before approving.');}
  if(claims.purpose!=='referral_consent'||claims.customerId!==customerId)throw new ReferralConsentError('This invitation belongs to a different account.');
  await lockReferralGraph(tx);
  await tx.$queryRaw`SELECT id FROM users WHERE id=${customerId} FOR UPDATE`;
  const offer=await offerIdentity(tx,customerId,claims.code);
  if(offer.kind!==claims.kind||offer.owner.id!==claims.ownerId||offer.member?.id!==claims.memberId)throw new ReferralConsentError('The inviter changed. Review this invitation again.');
  if(offer.alreadyConnected)return {id:offer.currentId,kind:offer.kind,duplicate:true};
  if(offer.currentId!==claims.currentId||offer.currentId&&!offer.needsApproval)throw new ReferralConsentError('You already have a connection in this programme. Review it before choosing another inviter.');
  // Correlated identities require support review; shared IP alone is never proof of fraud.
  const phone=(s:string|null)=>s?.replace(/\D/g,'').replace(/^00/,'').replace(/^91(?=\d{10}$)/,'')||'';
  if(phone(offer.customer.mobile).length>=8&&phone(offer.customer.mobile)===phone(offer.owner.mobile))throw new ReferralConsentError('These accounts share contact details. Contact support to review eligibility.');
  const secondary=[offer.owner.email,offer.owner.contactEmail].filter((s):s is string=>Boolean(s)).map(referralMailbox);
  if([offer.customer.email,offer.customer.contactEmail].some(s=>s&&secondary.includes(referralMailbox(s))))throw new ReferralConsentError('These accounts share an email identity. Contact support to review eligibility.');
  if(await tx.referral.count({where:{OR:[{referredUserId:customerId},{userId:offer.owner.id}],riskStatus:{not:'clear'}}}))throw new ReferralConsentError('An earlier referral needs review. Contact support before creating another connection.');
  if(offer.kind==='CUSTOMER'){
    const row=await registerReferralForNewUser(tx,{referredUserId:customerId,referredEmail:offer.customer.email,referralCode:claims.code}).catch(error=>{if(error instanceof Error&&!error.name.startsWith('Prisma'))throw new ReferralConsentError(error.message);throw error;});
    if(!row)throw new ReferralConsentError('Invitation unavailable.');
    await tx.user.update({where:{id:customerId},data:{referralPromptCompletedAt:new Date()}});
    return {id:String(row.id),kind:offer.kind};
  }
  const member=offer.member!;
  const now=new Date();
  // Reuse the customer's contact and existing lead. A link is not a research or call verification.
  let client=await tx.teamClient.findUnique({where:{userId:customerId},include:{prospect:{include:{acquisitionLead:true}}}});
  if(client&&(client.workspaceId!==member.workspaceId||client.status!=='ACTIVE'||client.mergedIntoId))throw new ReferralConsentError('This contact needs a team review before it can be linked.');
  if(!client)client=await tx.teamClient.create({data:{workspaceId:member.workspaceId,ownerId:member.id,userId:customerId,name:offer.customer.name,email:offer.customer.email,phone:offer.customer.mobile||''},include:{prospect:{include:{acquisitionLead:true}}}});
  const prospect=client.prospect||await tx.teamProspect.create({data:{workspaceId:member.workspaceId,clientId:client.id,ownerId:member.id,name:offer.customer.name,email:offer.customer.email,phone:offer.customer.mobile||'',sourceUrl:'/dashboard?tab=referral',evidence:'Customer explicitly approved this team referral. No source check or call is implied.',identityKey:createHash('sha256').update(`approved-referral:${member.workspaceId}:${customerId}:${now.toISOString()}`).digest('hex'),score:{intent:0,relevance:0,recency:0,contactability:0,fit:0},categories:[],stage:'NEEDS_RESEARCH',verified:false,contactEligibility:'UNVERIFIED'}});
  let prior=await tx.acquisitionLead.findUnique({where:{prospectId:prospect.id}});
  if(prior){await tx.$queryRaw`SELECT id FROM acquisition_leads WHERE id=${prior.id} FOR UPDATE`;prior=await tx.acquisitionLead.findUnique({where:{id:prior.id}});}
  if(prior?.customerId&&prior.customerId!==customerId||!prior?.referralEndedAt&&prior?.attributionLockedAt&&prior.acquisitionEmployeeId&&prior.acquisitionEmployeeId!==member.id)throw new ReferralConsentError('This lead has protected attribution. Contact support to review the invitation.');
  const lead=prior?await tx.acquisitionLead.update({where:{id:prior.id},data:{customerId,acquisitionEmployeeId:member.id,convertedAt:prior.convertedAt||now,attributionLockedAt:now,referralAcceptedAt:now,referralEndedAt:null,requiresReferralConsent:true}}):await tx.acquisitionLead.create({data:{workspaceId:member.workspaceId,prospectId:prospect.id,researcherEmployeeId:member.id,acquisitionEmployeeId:member.id,customerId,convertedAt:now,attributionLockedAt:now,referralAcceptedAt:now,referralOnly:true}});
  await tx.acquisitionProgramAudit.create({data:{workspaceId:member.workspaceId,actorEmployeeId:member.id,action:'referral.customer_approved',entityId:lead.id,metadata:{customerId,approvedByCustomer:true,termsVersion:1}}});
  await tx.auditLog.create({data:{actorType:'user',actorId:customerId,action:'EMPLOYEE_REFERRAL_APPROVED',entity:'acquisition_lead',entityId:lead.id,metadata:{employeeId:member.id,termsVersion:1}}});
  await receipts(tx,`employee:${lead.id}:${now.getTime()}:approved`,customerId,member.userId,`The customer approved a HYMN team referral with ${offer.owner.name}. It applies to eligible future purchases only. The customer can remove this connection after 45 days. Employee commission requires verified revenue, programme eligibility and payment checks.`);
  if((member.preferences as {notifications?:boolean})?.notifications!==false)await tx.teamNotification.create({data:{memberId:member.id,title:`${offer.customer.name} approved your referral connection`,href:'/team?module=acquisition'}});
  return {id:lead.id,kind:offer.kind};
}
export async function referralConnections(userId:number,now=new Date()):Promise<ReferralConnection[]>{
  const [customer,employees]=await Promise.all([
    prisma.referral.findMany({where:{referredUserId:userId,endedAt:null},include:{owner:{select:{name:true}}}}),
    prisma.acquisitionLead.findMany({where:{customerId:userId,referralEndedAt:null,acquisitionEmployeeId:{not:null},OR:[{requiresReferralConsent:false},{referralAcceptedAt:{not:null}}]},include:{acquisitionEmployee:{include:{user:{select:{name:true}}}}}}),
  ]);
  return [...customer.map(row=>({id:String(row.id),kind:'CUSTOMER' as const,name:row.owner.name,connectedAt:row.acceptedAt||row.createdAt,legacy:!row.acceptedAt})),...employees.map(row=>({id:row.id,kind:'EMPLOYEE' as const,name:row.acquisitionEmployee!.user.name,connectedAt:row.referralAcceptedAt||row.convertedAt||row.attributionLockedAt||row.registeredAt,legacy:!row.referralAcceptedAt}))].map(row=>({...row,connectedAt:row.connectedAt.toISOString(),removableAt:referralRemovalAt(row.connectedAt).toISOString(),canRemove:now>=referralRemovalAt(row.connectedAt)}));
}
export async function removeReferral(tx:Tx,userId:number,kind:'CUSTOMER'|'EMPLOYEE',id:string,now=new Date()){
  await lockReferralGraph(tx);
  await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:userId},select:{status:true}});if(user?.status!=='ACTIVE')throw new ReferralConsentError('Account unavailable.');
  if(kind==='CUSTOMER'){
    const row=await tx.referral.findFirst({where:{id:Number(id),referredUserId:userId}});if(!row)throw new ReferralConsentError('Connection not found.');
    if(row.endedAt)return {removed:true};
    if(now<referralRemovalAt(row.acceptedAt||row.createdAt))throw new ReferralConsentError('This connection can be removed after 45 days.');
    await tx.referral.update({where:{id:row.id},data:{endedAt:now,activeRecipientId:null,ownerBlocked:true,followerBlocked:true}});
    await tx.user.update({where:{id:userId},data:{referredById:null,onboardingReferralCode:null}});
    await receipts(tx,`customer:${row.id}:removed`,userId,row.userId,'The customer removed this referral connection. Future purchases will no longer earn commission through it. Earlier eligible earnings remain subject to payment, fraud and refund checks.');
  }else{
    const row=await tx.acquisitionLead.findFirst({where:{id,customerId:userId},include:{acquisitionEmployee:true}});if(!row?.acquisitionEmployee)throw new ReferralConsentError('Connection not found.');
    if(row.referralEndedAt)return {removed:true};
    if(now<referralRemovalAt(row.referralAcceptedAt||row.convertedAt||row.attributionLockedAt||row.registeredAt))throw new ReferralConsentError('This connection can be removed after 45 days.');
    const startsAt=new Date(Math.max((row.attributionLockedAt||row.registeredAt).getTime(),row.referralAcceptedAt?.getTime()||0));
    const history=Array.isArray(row.referralHistory)?row.referralHistory:[];
    await tx.acquisitionLead.update({where:{id},data:{referralEndedAt:now,referralHistory:[...history,{employeeId:row.acquisitionEmployeeId,researcherId:row.researcherEmployeeId,referralOnly:row.referralOnly,acceptedAt:row.referralAcceptedAt?.toISOString()||null,startsAt:startsAt.toISOString(),endsAt:now.toISOString()}]}});
    await receipts(tx,`employee:${id}:${row.referralAcceptedAt?.getTime()||0}:removed`,userId,row.acquisitionEmployee.userId,'The customer removed this team referral connection. Future purchases stop contributing through it. Existing employee ledger entries and refund adjustments remain unchanged.');
    if(row.acquisitionEmployee.status==='ACTIVE'&&(row.acquisitionEmployee.preferences as {notifications?:boolean})?.notifications!==false)await tx.teamNotification.create({data:{memberId:row.acquisitionEmployee.id,title:'A client removed their referral connection; future purchases stop contributing.',href:'/team?module=acquisition'}});
  }
  await tx.auditLog.create({data:{actorType:'user',actorId:userId,action:'REFERRAL_CONSENT_REMOVED',entity:kind==='CUSTOMER'?'referral':'acquisition_lead',entityId:id,metadata:{effectiveAt:now.toISOString(),preserveEarnedLedger:true}}});
  return {removed:true};
}
