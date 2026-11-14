import "server-only";
import type { PartnershipInvitation } from "@prisma/client";
import { prisma } from "./prisma";
import { getEmailClient, getEmailConfig } from "./email/email-client";
import { emailLayout, emailText, type EmailLayoutInput } from "./email/email-templates";
import { buildPartnershipPdf } from "./partnership-pdf";
import { getPublicAppUrl } from "./public-app-url";
import { agreementDigest } from "./partnership-agreement";

export function partnershipEmailHtml(input:EmailLayoutInput){
  const html=emailLayout(input).replace("</head>",`<style>@font-face{font-family:'HYMN Manrope';src:url('${getPublicAppUrl()}/fonts/manrope-variable.ttf') format('truetype');font-weight:200 800;font-style:normal}body,table,td,p,a,h1,h2{font-family:'HYMN Manrope',Arial,Helvetica,sans-serif}</style></head>`).replace("font-family:Arial,Helvetica,sans-serif","font-family:'HYMN Manrope',Arial,Helvetica,sans-serif");
  return html.replace(/#[0-9a-f]{6}/gi,color=>{const rgb=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));const grey=Math.round(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722).toString(16).padStart(2,"0");return `#${grey}${grey}${grey}`;});
}

export function partnershipInvitationEmail(token:string):EmailLayoutInput {
  const url=`${getPublicAppUrl()}/partnerships/activate/${token}`;
  return {title:"Sound Sync, welcome to HYMN.",greeting:"Dear Vanshika,",body:"We are pleased to invite Sound Sync to a strategic partnership with HYMN Music, built around shared growth, meaningful community benefits and transparent referral earnings. Your formal agreement is attached as a PDF and is also available on your activation page.",ctaLabel:"Review agreement & activate",ctaUrl:url,notice:"Electronic acceptance: after signing in with vanshikavohra14@gmail.com, click ‘Accept agreement & activate Yearly+’ to confirm that you have read and agree to comply with every clause, personally and on behalf of Sound Sync. No handwritten signature is required. Viewing this email or opening the link alone does not accept the agreement.",sections:[
    {title:"Your complimentary Yearly+ membership",body:"Activate your individual 12-month Yearly+ term without a subscription payment or automatic renewal. This individual term remains protected if the Sound Sync business partnership is later discontinued. Sound Sync's separate company account can be nominated with HYMN."},
    {title:"One shared objective: 105 clients",body:"We will review progress every four months against a shared objective of 105 unique qualifying paying clients, alongside promotion, referral quality and overall contribution. There is no separate monthly minimum and renewal remains subject to HYMN's review."},
    {title:"Your community. A continuing opportunity.",body:"Once activated, you will receive a second email containing your unique referral code and referral link. Eligible purchases by customers who approve your referral connection can earn a share under HYMN's existing referral terms. Your partnership has no minimum withdrawal amount; verification and the standard 14-day hold apply."},
    {title:"A simple next step",body:"Use the button to read the agreement, sign up or sign in with this email address, and accept to activate. Your invitation is valid for 30 days. If you already have an automatically billed plan, HYMN will help arrange the complimentary term without duplicate billing. Reply to this email for any assistance."}
  ]};
}
export function partnershipActivatedEmail(invitation:PartnershipInvitation,code:string):EmailLayoutInput {
  const link=`${getPublicAppUrl()}/join?ref=${encodeURIComponent(code)}`;
  const expires=invitation.subscriptionExpiresAt!.toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"});
  return {title:"Your Yearly+ partnership is active.",greeting:"Dear Vanshika,",body:`Welcome to HYMN Music. Your agreement has been accepted and your complimentary individual Yearly+ membership is now active through ${expires}. No subscription payment or automatic renewal has been set up. We look forward to growing with Sound Sync.`,ctaLabel:"Open your referral dashboard",ctaUrl:`${getPublicAppUrl()}/dashboard?tab=referral`,notice:`YOUR REFERRAL CODE\n${code}\n\nYOUR COMMUNITY INVITATION LINK\n${link}`,sections:[
    {title:"Share your link with your community",body:"Share the code or link across your channels. Customers sign in and approve the referral connection before eligible purchases can contribute to your earnings. Eligible repeat purchases and renewals can also qualify while the referral connection and partnership remain eligible.",linkLabel:"Your shareable referral link",linkUrl:link},
    {title:"Commission and withdrawals",body:"HYMN's existing rates apply, with the standard current direct rate of 2% of verified eligible HYMN net revenue, subject to purchase-specific configured rates and reconciliation. Your dashboard records the actual rate, basis and earnings. You have no minimum withdrawal amount and no additional partnership payout cap. Request any positive cleared balance after the 14-day hold with verified payout details. Refund, risk and payment checks apply; payouts are reviewed bank transfers rather than instant withdrawals."},
    {title:"Your agreement, kept on record",body:`Agreement version: ${invitation.agreementVersion}. Your acceptance and original individual subscription term are recorded. Your accepted agreement is attached for your records. The shared objective remains 105 qualifying paying clients per four-month review period. Reply here to nominate Sound Sync's separate company account or discuss campaigns.`},
  ]};
}

class PartnershipMailFailure extends Error { constructor(readonly retryable:boolean){super(retryable?"SMTP did not send the message; a retry is safe.":"Delivery outcome requires review.");} }
async function sendPartnershipMessage(invitation:PartnershipInvitation,input:EmailLayoutInput,kind:"invitation"|"activated"){
  if(invitation.agreementHash!==agreementDigest())throw Error("The original agreement version requires review before delivery.");
  const config=getEmailConfig(),client=getEmailClient({timeoutMs:10000});
  if(!config.enabled||!client)throw Error("Partnership email is not configured.");
  const eventKey=`partnership:${invitation.id}:${kind}${kind==="activated"?`:attempt:${invitation.mailAttempts}`:""}`;
  const pdf=await buildPartnershipPdf();
  // A unique pre-send log is a send-once reservation. Uncertain SMTP outcomes
  // require review; neither a double click nor a worker retry may blindly resend.
  const log=await prisma.emailLog.create({data:{userId:invitation.userId,toEmail:invitation.email,subject:kind==="invitation"?"Your Sound Sync partnership invitation & Yearly+ activation | HYMN Music":"Your Yearly+ is active — your Sound Sync referral code & link | HYMN Music",template:`partnership_${kind}`,eventKey,entityType:"partnership",entityId:invitation.id,provider:"smtp",status:"queued",payload:{html:partnershipEmailHtml(input),text:emailText(input),agreementVersion:invitation.agreementVersion}}});
  let accepted=false;
  try{
    const result=await client.emails.send({from:config.from,to:invitation.email,subject:log.subject,html:partnershipEmailHtml(input),text:emailText(input),replyTo:config.replyTo,attachments:[{filename:"HYMN-Music-Sound-Sync-Partnership-Agreement.pdf",content:pdf,contentType:"application/pdf"}]});
    if(result.error)throw Error(result.error.message);
    accepted=true;
    await prisma.emailLog.update({where:{id:log.id},data:{status:"sent",sentAt:new Date(),providerMessageId:result.data?.id}});
    return result.data?.id;
  }catch(error){
    const command=error&&typeof error==="object"&&"command" in error?String(error.command):"";
    const retryable=!accepted&&["CONN","EHLO","HELO","STARTTLS","AUTH","MAIL FROM","RCPT TO"].includes(command);
    const failure=new PartnershipMailFailure(retryable);
    await prisma.emailLog.update({where:{id:log.id},data:{status:"failed",errorMessage:failure.message}}).catch(()=>undefined);throw failure;
  }
}
export async function sendPartnershipInvitation(invitation:PartnershipInvitation,token:string){return sendPartnershipMessage(invitation,partnershipInvitationEmail(token),"invitation");}

export async function deliverPartnershipMail(deadline=Date.now()+12000){
  await prisma.partnershipInvitation.updateMany({where:{mailStatus:"SENDING",mailLockedAt:{lt:new Date(Date.now()-300000)}},data:{mailStatus:"REVIEW",mailError:"Interrupted delivery. Inspect SMTP acceptance before retrying."}});
  const config=getEmailConfig();if(!config.enabled)return {sent:0,deferred:true};
  let sent=0;
  while(Date.now()<deadline){
    const next=await prisma.partnershipInvitation.findFirst({where:{mailStatus:"PENDING",acceptedAt:{not:null},mailAvailableAt:{lte:new Date()}},orderBy:{createdAt:"asc"}});
    if(!next)break;
    if(!(await prisma.partnershipInvitation.updateMany({where:{id:next.id,mailStatus:"PENDING"},data:{mailStatus:"SENDING",mailLockedAt:new Date(),mailAttempts:{increment:1}}})).count)continue;
    try{
      const user=await prisma.user.findUnique({where:{id:next.userId!},select:{email:true,status:true,referralCode:true}});
      if(!user||user.status!=="ACTIVE"||user.email.toLowerCase()!==next.email.toLowerCase()||!user.referralCode)throw Error("Recipient account changed; review required.");
      await sendPartnershipMessage({...next,mailAttempts:next.mailAttempts+1},partnershipActivatedEmail(next,user.referralCode),"activated");
      await prisma.partnershipInvitation.update({where:{id:next.id},data:{mailStatus:"SENT",mailSentAt:new Date(),mailLockedAt:null,mailError:null}});sent++;
    }catch(error){
      const retryable=error instanceof PartnershipMailFailure&&error.retryable&&next.mailAttempts<4;
      await prisma.partnershipInvitation.update({where:{id:next.id},data:{mailStatus:retryable?"PENDING":"REVIEW",mailLockedAt:null,mailAvailableAt:new Date(Date.now()+60000*2**next.mailAttempts),mailError:retryable?"SMTP did not send the message. Automatic retry scheduled.":"Delivery requires review. Do not resend without checking SMTP and email logs."}});
    }
  }
  return {sent,deferred:false};
}
