import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { listStudioEngineers } from "@/lib/studio-services";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { emailLayout, emailText, type EmailSection } from "@/lib/email/email-templates";
import { sendTransactionalEmail, retryTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getEmailConfig } from "@/lib/email/email-client";
export function studioPreferenceToken(userId:number) {const secret=process.env.JWT_SECRET;if(!secret)throw new Error("Email preference signing is unavailable.");const payload=`${userId}.${Math.floor(Date.now()/1000)+365*86400}`;return `${payload}.${createHmac("sha256",secret).update(`studio-tips:${payload}`).digest("hex")}`;}
export function studioPreferenceUser(token:string) {const parts=token.split(".");if(parts.length!==3||!process.env.JWT_SECRET)return null;const [id,exp,signature]=parts;if(!/^\d+$/.test(id)||Number(exp)<Date.now()/1000)return null;const expected=createHmac("sha256",process.env.JWT_SECRET).update(`studio-tips:${id}.${exp}`).digest("hex"),a=Buffer.from(expected),b=Buffer.from(signature);return a.length===b.length&&timingSafeEqual(a,b)?Number(id):null;}
export async function studioBeatSections(purchaseId:number,userId:number):Promise<EmailSection[]> {
 const purchase=await prisma.beatPurchase.findFirst({where:{id:purchaseId,userId,hasAccess:true},include:{beat:{select:{genre:true}},user:{select:{studioTipsEnabled:true}}}});if(!purchase||!purchase.user.studioTipsEnabled)return [];
 const exact=await listStudioEngineers({genre:purchase.beat.genre});const engineers=exact.length?exact:await listStudioEngineers();const root=getPublicAppUrl();
 return [
  {title:"Your beat. Your recording. Your release.",body:"Need help finishing the sound? Mixing and mastering is optional. If your master is ready, go straight to distribution from Purchases.",linkLabel:"Free mix-readiness check",linkUrl:`${root}/studio/readiness?beatPurchaseId=${purchaseId}`},
  ...engineers.slice(0,3).map(e=>({title:e.professionalName,body:`${e.specialties.join(" / ")} · Hear work, read client vouches, and check available listening calls.`,linkLabel:"Meet your sound partner",linkUrl:`${root}/studio/engineers/${e.slug}?beatPurchaseId=${purchaseId}`})),
  {title:"Studio email preferences",body:"You can stop optional Studio recommendations at any time.",linkLabel:"Manage Studio emails",linkUrl:`${root}/studio/email-preferences?token=${studioPreferenceToken(userId)}`},
 ];
}
export async function sendStudioBeatFollowups(now=new Date(),deadline=Date.now()+40000) {
 if(!getEmailConfig().enabled)return {sent:0,scanned:0,enabled:false};
 const purchases=await prisma.beatPurchase.findMany({where:{hasAccess:true,paymentId:{not:null},studioNudgeSentAt:null,purchasedAt:{gte:new Date("2026-10-13T00:00:00Z"),lte:new Date(now.getTime()-7*86400000)},releaseId:null,user:{studioTipsEnabled:true,status:"ACTIVE"},studioOrders:{none:{status:{notIn:["CANCELLED","REFUNDED","EXPIRED"]}}}},include:{user:{select:{id:true,name:true,email:true}},beat:{select:{title:true}}},orderBy:{purchasedAt:"asc"},take:30});
 let sent=0;
 for(const p of purchases){if(Date.now()>deadline)break;const eventKey=`studio:beat:${p.id}:day7`,prior=await prisma.emailLog.findUnique({where:{eventKey}});let result;
  if(prior?.status==="failed"){if((prior.retryCount||0)>=3){await prisma.beatPurchase.update({where:{id:p.id},data:{studioNudgeSentAt:now}});continue;}result=await retryTransactionalEmail(prior.id);}else{const sections=await studioBeatSections(p.id,p.userId);if(!sections.length)continue;const model={title:"How is your record coming along?",greeting:`Hi ${p.user.name},`,body:`It’s been a week since you picked up ${p.beat.title}. If your recording needs a final polish, meet an engineer. If it’s ready, skip mixing and start your release.`,ctaLabel:"Check your mix readiness",ctaUrl:`${getPublicAppUrl()}/studio/readiness?beatPurchaseId=${p.id}`,sections};result=await sendTransactionalEmail({to:p.user.email,userId:p.userId,eventKey,template:"studio_beat_day7",entityType:"studio_beat_followup",entityId:p.id,subject:model.title,html:emailLayout(model),text:emailText(model)});}
  if(result.status==="sent"||result.status==="duplicate_skipped"){await prisma.beatPurchase.update({where:{id:p.id},data:{studioNudgeSentAt:now}});sent++;}
 }
 return {sent,scanned:purchases.length};
}
