import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createUniqueReferralCode } from "@/lib/referrals";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";
import { SOUND_SYNC_AGREEMENT_VERSION, agreementDigest, PARTNERSHIP_ACCEPTANCE } from "./partnership-agreement";
import { REFERRAL_MINIMUM_PAYOUT_MINOR } from "./referral-commission-policy";
import { getUserSessionSecret } from "./env";

export function partnershipTokenHash(token:string){return createHash("sha256").update(token).digest("hex");}
export function validPartnershipToken(token:string){return /^[a-f0-9]{64}$/.test(token);}
export async function findPartnership(token:string){
  if(!validPartnershipToken(token))return null;
  return prisma.partnershipInvitation.findUnique({where:{tokenHash:partnershipTokenHash(token)}});
}
export async function createSoundSyncInvitation(){
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19462028)`;
    const existing=await tx.partnershipInvitation.findFirst({where:{email:"vanshikavohra14@gmail.com",agreementVersion:SOUND_SYNC_AGREEMENT_VERSION},orderBy:{createdAt:"desc"}});
    if(existing)return {invitation:existing,token:partnershipInvitationToken(existing.id)};
    const id=randomUUID(),token=partnershipInvitationToken(id);
    const invitation=await tx.partnershipInvitation.create({data:{id,email:"vanshikavohra14@gmail.com",name:"Vanshika Vora",company:"Sound Sync",tokenHash:partnershipTokenHash(token),agreementVersion:SOUND_SYNC_AGREEMENT_VERSION,agreementHash:agreementDigest(),expiresAt:new Date(Date.now()+30*86400000)}});
    return {invitation,token};
  });
}
export function partnershipInvitationToken(id:string){return createHmac("sha256",getUserSessionSecret()).update(`hymn:partnership-invitation:v1:${id}`).digest("hex");}
export async function partnershipMinimumPayout(tx: Pick<Prisma.TransactionClient,"partnershipInvitation">,userId:number){
  const partner=await tx.partnershipInvitation.findUnique({where:{userId},select:{acceptedAt:true,minimumPayoutMinor:true}});
  return partner?.acceptedAt ? partner.minimumPayoutMinor : REFERRAL_MINIMUM_PAYOUT_MINOR;
}
export async function acceptPartnership(token:string,userId:number,context:{ipAddress?:string;userAgent?:string}={}){
  if(!validPartnershipToken(token))throw Error("This invitation link is invalid. Please contact HYMN for a new invitation.");
  for(let attempt=0;attempt<3;attempt++)try{
    return await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19462027, ${userId}::int)`;
      const invitation=await tx.partnershipInvitation.findUnique({where:{tokenHash:partnershipTokenHash(token)}});
      if(!invitation)throw Error("This invitation link is invalid. Please contact HYMN.");
      const user=await tx.user.findUniqueOrThrow({where:{id:userId}});
      if(user.status!=="ACTIVE"||user.email.toLowerCase()!==invitation.email.toLowerCase())throw Error("Please sign in with the email address that received this invitation.");
      if(invitation.acceptedAt){if(invitation.userId!==userId)throw Error("This invitation has already been used.");return invitation;}
      if(invitation.status!=="INVITED"||invitation.expiresAt<=new Date())throw Error("This invitation has expired or is no longer available. Reply to HYMN for a new link.");
      if(invitation.agreementVersion!==SOUND_SYNC_AGREEMENT_VERSION||invitation.agreementHash!==agreementDigest())throw Error("The agreement has changed. Please request an updated invitation before accepting.");
      if(await tx.partnershipInvitation.findUnique({where:{userId}}))throw Error("This account already has a partnership. Please contact HYMN.");
      const previous=await tx.subscription.findUnique({where:{userId}});
      if(previous?.razorpaySubscriptionId&&!["cancelled","completed","expired"].includes(previous.status.toLowerCase()))throw Error("Your existing subscription has automatic billing attached. Reply to HYMN so we can arrange complimentary access without duplicate billing. Your invitation remains available.");
      const now=new Date(),expiryDate=new Date(now);expiryDate.setUTCFullYear(expiryDate.getUTCFullYear()+1);
      if(expiryDate.getUTCMonth()!==now.getUTCMonth())expiryDate.setUTCDate(0);
      if(previous?.status==="active"&&previous.expiryDate>expiryDate)expiryDate.setTime(previous.expiryDate.getTime());
      const fields={plan:"yearly_plus",planName:"Yearly+",expiryDate,status:"active",artistLimit:artistProfileLimitForPlan("yearly_plus"),releaseLimit:null,availableFeatures:JSON.stringify(["distribution","quality_check","priority_support","custom_label","15_artist_profiles","manual_unlimited_releases"]),daysRemaining:Math.ceil((expiryDate.getTime()-now.getTime())/86400000),autoRenewal:false,currentPeriodStart:null,currentPeriodEnd:null,nextRenewalDate:null,cancelledAt:null,cancelAtPeriodEnd:false,razorpaySubscriptionId:null,razorpayPlanId:null,planVersionId:null,providerSyncedAt:null};
      await tx.subscription.upsert({where:{userId},create:{userId,...fields,purchasedAt:now},update:fields});
      if(!user.referralCode)await tx.user.update({where:{id:userId},data:{referralCode:await createUniqueReferralCode(tx,"Sound Sync")}});
      await tx.distributionOrder.updateMany({where:{userId,paymentStatus:{in:["created","authorized"]},fulfilledAt:null,razorpayPaymentId:null,plan:"yearly_plus"},data:{paymentStatus:"cancelled"}});
      const accepted=await tx.partnershipInvitation.update({where:{id:invitation.id},data:{userId,acceptedAt:now,subscriptionExpiresAt:expiryDate,status:"ACTIVE",mailStatus:"PENDING",mailAvailableAt:now}});
      await tx.auditLog.create({data:{actorType:"user",actorId:userId,actorRole:user.role,action:"partnership.accepted",entity:"partnership_invitation",entityId:invitation.id,ipAddress:context.ipAddress?.slice(0,100),userAgent:context.userAgent?.slice(0,500),metadata:{agreementVersion:invitation.agreementVersion,agreementHash:invitation.agreementHash,acceptance:PARTNERSHIP_ACCEPTANCE,acceptedAt:now.toISOString(),subscriptionExpiresAt:expiryDate.toISOString(),minimumPayoutMinor:invitation.minimumPayoutMinor,previousPlan:previous?.plan??null}}});
      return accepted;
    },{isolationLevel:"Serializable",timeout:20000});
  }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034"&&attempt<2)continue;throw error;}
  throw Error("Activation is busy. Please try again.");
}
