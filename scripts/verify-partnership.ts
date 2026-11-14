import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { chromium, expect as browserExpect } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { acceptPartnership, createSoundSyncInvitation, partnershipMinimumPayout, partnershipTokenHash } from "../lib/partnerships";
import { deliverPartnershipMail, sendPartnershipInvitation } from "../lib/partnership-mail";
import { buildPartnershipPdf } from "../lib/partnership-pdf";
import { agreementDigest, SOUND_SYNC_AGREEMENT_VERSION } from "../lib/partnership-agreement";
import { requestReferralPayout } from "../lib/referral-commissions";
import { REFERRAL_MINIMUM_PAYOUT_MINOR } from "../lib/referral-commission-policy";
import { reportReturnPath } from "../lib/routes";
import { requestEmailCode } from "../lib/email-sign-in";
import { getIncomeSummary } from "../lib/income-summary";
import { incomeWithdrawalBlock } from "../lib/income-explorer";
const expect=browserExpect.configure({timeout:90000});
const makeUser=(email:string)=>prisma.user.create({data:{email,name:"Fixture Partner",googleId:randomUUID(),role:"CUSTOMER",onboardingDone:true}});
async function invitation(email:string){const token=randomBytes(32).toString("hex");const row=await prisma.partnershipInvitation.create({data:{email,name:"Fixture Partner",company:"Sound Sync",tokenHash:partnershipTokenHash(token),agreementVersion:SOUND_SYNC_AGREEMENT_VERSION,agreementHash:agreementDigest(),expiresAt:new Date(Date.now()+86400000)}});return {row,token};}
async function main(){
 assert.equal(process.env.DATABASE_URL,"postgresql://fixture:fixture@127.0.0.1:55479/partnership");
 // Validate the real additive migration against the fixture's existing schema.
 await prisma.$executeRawUnsafe('DROP TABLE "partnership_invitations"');
 for(const sql of readFileSync("prisma/migrations/20261114120000_partnership_activation/migration.sql","utf8").split(";").filter(s=>s.trim()))await prisma.$executeRawUnsafe(sql);
 const {invitation:row,token}=await createSoundSyncInvitation();
 const repeated=await Promise.all([createSoundSyncInvitation(),createSoundSyncInvitation()]);assert.equal(repeated[0].invitation.id,row.id);assert.equal(repeated[1].token,token);
 const owner=await makeUser(row.email),other=await makeUser("wrong@example.test");
 await assert.rejects(acceptPartnership("invalid",owner.id),/invalid/);
 await assert.rejects(acceptPartnership(token,other.id),/sign in/);
 await prisma.user.update({where:{id:owner.id},data:{status:"PAUSED"}});await assert.rejects(acceptPartnership(token,owner.id),/sign in/);await prisma.user.update({where:{id:owner.id},data:{status:"ACTIVE"}});
 await prisma.partnershipInvitation.update({where:{id:row.id},data:{status:"REVOKED"}});await assert.rejects(acceptPartnership(token,owner.id),/no longer available/);await prisma.partnershipInvitation.update({where:{id:row.id},data:{status:"INVITED"}});
 assert.equal(await prisma.subscription.count(),0);
 const outcomes=await Promise.all([acceptPartnership(token,owner.id),acceptPartnership(token,owner.id)]);
 assert.equal(outcomes[0].subscriptionExpiresAt?.toISOString(),outcomes[1].subscriptionExpiresAt?.toISOString());
 assert.equal(await prisma.auditLog.count({where:{action:"partnership.accepted",actorId:owner.id}}),1);
 const sub=await prisma.subscription.findUniqueOrThrow({where:{userId:owner.id}});
 assert.equal(sub.plan,"yearly_plus");assert.equal(sub.autoRenewal,false);assert.equal(sub.releaseLimit,null);assert.equal(sub.artistLimit,15);
 assert.ok((await prisma.user.findUniqueOrThrow({where:{id:owner.id}})).referralCode);
 assert.equal((await acceptPartnership(token,owner.id)).subscriptionExpiresAt?.getTime(),sub.expiryDate.getTime());
 await prisma.partnershipInvitation.update({where:{id:row.id},data:{expiresAt:new Date(0)}});assert.equal((await acceptPartnership(token,owner.id)).subscriptionExpiresAt?.getTime(),sub.expiryDate.getTime());
 assert.equal(await partnershipMinimumPayout(prisma,owner.id),0);assert.equal(await partnershipMinimumPayout(prisma,other.id),REFERRAL_MINIMUM_PAYOUT_MINOR);
 const expired=await invitation(other.email);await prisma.partnershipInvitation.update({where:{id:expired.row.id},data:{expiresAt:new Date(0)}});await assert.rejects(acceptPartnership(expired.token,other.id),/expired/);
 const changed=await invitation(other.email);await prisma.partnershipInvitation.update({where:{id:changed.row.id},data:{agreementHash:"changed"}});await assert.rejects(acceptPartnership(changed.token,other.id),/agreement has changed/);
 const paid=await invitation(other.email);await prisma.subscription.create({data:{userId:other.id,plan:"yearly",expiryDate:new Date(Date.now()+86400000),razorpaySubscriptionId:"sub_fixture",status:"active"}});await assert.rejects(acceptPartnership(paid.token,other.id),/automatic billing/);
 const future=new Date(Date.now()+700*86400000);await prisma.subscription.update({where:{userId:other.id},data:{status:"cancelled",expiryDate:future}});
 const reactivated=await acceptPartnership(paid.token,other.id);assert.ok(reactivated.subscriptionExpiresAt!.getTime()<future.getTime());
 const longer=await makeUser("longer@example.test"),longerInvite=await invitation(longer.email);await prisma.subscription.create({data:{userId:longer.id,plan:"yearly",expiryDate:future,status:"active"}});assert.equal((await acceptPartnership(longerInvite.token,longer.id)).subscriptionExpiresAt?.getTime(),future.getTime());
 await prisma.partnershipInvitation.update({where:{id:row.id},data:{status:"ENDED",endedAt:new Date()}});assert.equal((await prisma.subscription.findUniqueOrThrow({where:{userId:owner.id}})).expiryDate.getTime(),sub.expiryDate.getTime());
 await prisma.payoutCredential.create({data:{userId:owner.id,method:"upi",status:"verified",upiIdMasked:"f***@test"}});await assert.rejects(requestReferralPayout(owner.id),/positive cleared/);
 const referral=await prisma.referral.create({data:{userId:owner.id,referredUserId:other.id,signupEmail:other.email,referralCode:"FIXTURE",status:"REGISTERED",riskStatus:"clear",acceptedAt:new Date()}});
 await prisma.referralCommission.create({data:{referralId:referral.id,paymentId:"pay_fixture_payout",sourceType:"distribution_order",sourceId:"fixture-payout",category:"one_time",paidMinor:100,baseMinor:100,rateBps:200,originalMinor:1,netMinor:1,status:"AVAILABLE",eligibleAt:new Date(0),capturedAt:new Date()}});
 const income=(await getIncomeSummary(owner.id)).sources.find(source=>source.key==="referral")!;assert.equal(income.minimum,0);assert.equal(incomeWithdrawalBlock(income,false),null);
 const payout=await requestReferralPayout(owner.id);assert.equal(payout.amount,.01);await assert.rejects(requestReferralPayout(owner.id),/already pending/);
 const pdf=await PDFDocument.load(await buildPartnershipPdf());assert.equal(pdf.getPageCount(),4);
 assert.equal(reportReturnPath(`/partnerships/activate/${token}`),`/partnerships/activate/${token}`);for(const path of ["//evil.test","/partnerships/activate/../bad",`/partnerships/activate/${token}?next=https://evil.test`])assert.equal(reportReturnPath(path),undefined);
 console.log("PASS: real migration; wrong/inactive identity; invalid/revoked/expired/changed invitations; concurrent/repeated acceptance; expired-link replay after acceptance; one grant/audit; annual term; provider billing protection; longer entitlement; termination protection; income summary and one-paise payout; ordinary minimum retained; pending payout protection; four-page PDF; safe auth return paths.");
 // SMTP is replaced before enabling mail. No real email can leave this fixture.
 let sends=0;const original=nodemailer.createTransport;let fail:"none"|"connection"|"uncertain"="none";
 nodemailer.createTransport=(()=>({sendMail:async(message:{html:string;attachments:Array<{content:Buffer}>})=>{sends++;assert.ok(message.attachments[0].content.subarray(0,4).toString()==="%PDF");if(fail!=="none")throw Object.assign(Error("Fixture SMTP failure"),{command:fail==="connection"?"CONN":"DATA"});return {accepted:[row.email],messageId:"fixture-message"};}})) as unknown as typeof original;
 process.env.EMAIL_ENABLED="true";process.env.SMTP_USER="fixture@example.test";process.env.SMTP_APP_PASSWORD="fixture-only";
 try{
   await sendPartnershipInvitation(row,token);await assert.rejects(sendPartnershipInvitation(row,token));assert.equal(sends,1);
   await Promise.all([deliverPartnershipMail(),deliverPartnershipMail()]);assert.equal(await prisma.partnershipInvitation.count({where:{mailStatus:"SENT"}}),3);assert.equal(sends,4);
   const failedUser=await makeUser("failure@example.test"),failedInvite=await invitation(failedUser.email);await acceptPartnership(failedInvite.token,failedUser.id);fail="connection";await deliverPartnershipMail();assert.equal((await prisma.partnershipInvitation.findUniqueOrThrow({where:{id:failedInvite.row.id}})).mailStatus,"PENDING");await prisma.partnershipInvitation.update({where:{id:failedInvite.row.id},data:{mailAvailableAt:new Date(0)}});fail="uncertain";await deliverPartnershipMail();assert.equal((await prisma.partnershipInvitation.findUniqueOrThrow({where:{id:failedInvite.row.id}})).mailStatus,"REVIEW");const attempts=sends;await deliverPartnershipMail();assert.equal(sends,attempts);
   assert.equal((await acceptPartnership(failedInvite.token,failedUser.id)).status,"ACTIVE");
   console.log("PASS: HTML + PDF sends; invitation send-once reservation; concurrent confirmation workers; safe connection-failure retry; no blind duplicate on uncertain SMTP; activation survives mail failure.");
 }finally{nodemailer.createTransport=original;process.env.EMAIL_ENABLED="false";process.env.SMTP_USER="";process.env.SMTP_APP_PASSWORD="";}
 if(!process.argv.includes("--browser"))return;
 const origin=process.env.APP_URL!,browserInvite=await invitation("browser-partner@example.test");
 const server=spawn(process.execPath,["--max-old-space-size=4096","scripts/partnership-fixture-server.cjs"],{env:process.env,stdio:["ignore","ignore","pipe"],windowsHide:true});server.stderr?.on("data",chunk=>{const message=String(chunk);if(/Error|error/.test(message))process.stderr.write(message);});
 const browser=await chromium.launch();
 try{
   for(let n=0;n<90;n++){try{if((await fetch(origin+"/api/auth/email",{signal:AbortSignal.timeout(3000)})).ok)break;}catch{}if(n===89)throw Error("Fixture browser server unavailable");await new Promise(r=>setTimeout(r,1000));}
   const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(90000);page.setDefaultNavigationTimeout(120000);mkdirSync("artifacts/sound-sync-partnership",{recursive:true});
   const url=`${origin}/partnerships/activate/${browserInvite.token}`;
   await page.goto(url);await expect(page.getByRole("heading",{name:"Review. Accept. Begin."})).toBeVisible();assert.equal(await prisma.subscription.count({where:{user:{email:browserInvite.row.email}}}),0);
   assert.equal((await context.request.get(`${origin}/api/partnerships/${browserInvite.token}/activate`)).status(),405);
   assert.equal((await context.request.post(`${origin}/api/partnerships/${browserInvite.token}/activate`,{headers:{Origin:origin},data:{accepted:true}})).status(),401);
   for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await page.screenshot({path:`artifacts/sound-sync-partnership/activation-${width}.png`,fullPage:true});}
   await page.getByRole("link",{name:"Sign in or create your account"}).click();await expect(page.getByLabel("Email address",{exact:true})).toBeVisible();assert.ok(page.url().includes("next="));
   // Generate a genuine OTP challenge in the fixture, then exercise the live verification endpoint and redirect.
   let code="";const challenge=await requestEmailCode(browserInvite.row.email,"Browser Partner","127.0.0.1",async(_email,otp)=>{code=otp;});
   const verified=await context.request.post(`${origin}/api/auth/email`,{headers:{Origin:origin},data:{action:"verify",email:browserInvite.row.email,challenge:challenge.challenge,code,returnTo:`/partnerships/activate/${browserInvite.token}`}});assert.equal(verified.status(),200);const signed=await verified.json();assert.equal(signed.isNew,true);assert.equal(signed.redirectPath,`/partnerships/activate/${browserInvite.token}`);
   await page.goto(origin+signed.redirectPath);const button=page.getByRole("button",{name:"Accept agreement & activate Yearly+",exact:true});await expect(button).toBeDisabled();await page.getByRole("checkbox").check();await expect(button).toBeEnabled();
   assert.equal((await context.request.post(`${origin}/api/partnerships/${browserInvite.token}/activate`,{headers:{Origin:"https://evil.test"},data:{accepted:true}})).status(),403);
   assert.equal((await context.request.post(`${origin}/api/partnerships/${browserInvite.token}/activate`,{headers:{Origin:origin},data:{accepted:false}})).status(),400);
   await button.click();await expect(page.getByRole("heading",{name:"You’re part of HYMN."})).toBeVisible();await page.reload();await expect(page.getByRole("heading",{name:"You’re part of HYMN."})).toBeVisible();
   const dashboard=await context.request.get(origin+"/api/referrals/me");assert.equal(dashboard.status(),200);assert.equal((await dashboard.json()).referral.commission.minimumPayout,0);
   const calculator=await context.request.get(origin+"/api/referrals/calculator");assert.equal((await calculator.json()).policy.minimumPayoutMinor,0);
   const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(origin+"/api/admin/partnerships/sound-sync")).status(),401);
   const adminContext=await browser.newContext();await adminContext.addCookies([{name:"hymn_admin_session",value:jwt.sign({username:"admin",role:"admin"},process.env.ADMIN_JWT_SECRET!,{expiresIn:"1h"}),url:origin}]);assert.equal((await adminContext.request.get(origin+"/api/admin/partnerships/sound-sync")).status(),200);
   assert.equal((await adminContext.request.post(origin+"/api/admin/partnerships/sound-sync",{headers:{Origin:origin},data:{action:"send_invitation",recipient:"wrong@example.test"}})).status(),400);
   assert.equal((await adminContext.request.post(origin+"/api/admin/partnerships/sound-sync",{headers:{Origin:origin},data:{action:"send_invitation",recipient:"vanshikavohra14@gmail.com"}})).status(),503);
   const wrong=await browser.newContext();await wrong.addCookies([{name:"hymn_session",value:jwt.sign({sub:other.id,email:other.email,name:other.name,role:"customer"},process.env.JWT_SECRET!,{expiresIn:"1h"}),url:origin}]);assert.equal((await wrong.request.post(`${origin}/api/partnerships/${browserInvite.token}/activate`,{headers:{Origin:origin},data:{accepted:true}})).status(),409);
   await page.screenshot({path:"artifacts/sound-sync-partnership/activated-mobile.png",fullPage:true});
   const pdfResponse=await context.request.get(`${origin}/api/partnerships/${browserInvite.token}/agreement`);assert.equal(pdfResponse.status(),200);assert.equal((await PDFDocument.load(await pdfResponse.body())).getPageCount(),4);
   console.log("PASS: 320/390/1440 responsive invitation; scanner-safe GET; unauthenticated/cross-origin/missing-consent rejection; real OTP account creation + return; checkbox-gated activation; reload/replay; wrong account; live PDF; referral API zero minimum; confirmation fallback while SMTP disabled.");
 }finally{await browser.close();server.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
