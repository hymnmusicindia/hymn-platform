import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isSameAppOrigin } from "@/lib/request-origin";
import { createSoundSyncInvitation, partnershipTokenHash } from "@/lib/partnerships";
import { sendPartnershipInvitation } from "@/lib/partnership-mail";
import { getEmailConfig } from "@/lib/email/email-client";
import { agreementDigest } from "@/lib/partnership-agreement";
import { referralJson } from "@/lib/referral-request";

export const maxDuration=60;
export async function GET(){
  const admin=await requireAdminPermission("system.manage");if("error" in admin)return admin.error;
  const invitations=await prisma.partnershipInvitation.findMany({where:{email:"vanshikavohra14@gmail.com"},orderBy:{createdAt:"desc"},select:{id:true,email:true,status:true,expiresAt:true,acceptedAt:true,subscriptionExpiresAt:true,mailStatus:true,mailSentAt:true,mailError:true}});
  return Response.json({invitations,senderReady:getEmailConfig().enabled},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
  const admin=await requireRecentAdminPermission("system.manage");if("error" in admin)return admin.error;
  if(!isSameAppOrigin(request))return Response.json({error:"Same-origin request required."},{status:403});
  const payload=await referralJson(request,1000);
  if(!payload||typeof payload!=="object"||!("action" in payload)||!("recipient" in payload)||payload.action!=="send_invitation"||payload.recipient!=="vanshikavohra14@gmail.com"||Object.keys(payload).length!==2)return Response.json({error:"Confirm the Sound Sync invitation recipient."},{status:400});
  if(!getEmailConfig().enabled)return Response.json({error:"The HYMN SMTP sender is not configured."},{status:503});
  const {invitation,token}=await createSoundSyncInvitation();
  if(invitation.acceptedAt||invitation.status!=="INVITED"||invitation.expiresAt<=new Date()||invitation.agreementHash!==agreementDigest()||partnershipTokenHash(token)!==invitation.tokenHash)return Response.json({error:"Review this invitation's current state before sending."},{status:409});
  const prior=await prisma.emailLog.findUnique({where:{eventKey:`partnership:${invitation.id}:invitation`}});
  if(prior)return Response.json({status:prior.status,logId:prior.id,duplicatePrevented:true},{status:prior.status==="sent"?200:409});
  try{
    const providerMessageId=await sendPartnershipInvitation(invitation,token);
    await prisma.auditLog.create({data:{actorType:"admin",actorId:"sub" in admin?Number(admin.sub):null,action:"partnership.invitation_sent",entity:"partnership_invitation",entityId:invitation.id,metadata:{recipient:invitation.email,agreementHash:invitation.agreementHash}}});
    return Response.json({status:"sent",recipient:invitation.email,invitationId:invitation.id,providerMessageId});
  }catch{return Response.json({error:"Delivery requires review. Check HYMN email logs before retrying."},{status:502});}
}
