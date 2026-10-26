import { reconcileReferralQualifications } from "../lib/referral-reconciliation";
import { Prisma } from "@prisma/client";
import assert from "node:assert/strict";
import { receiveRazorpayEvent, processRazorpayEvent } from "../lib/payment-webhooks";
import { prisma } from "../lib/prisma";
import { registerReferralForNewUser as registerNewReferral, qualifyReferralInTransaction, reverseReferralForTransactionInTransaction } from "../lib/referrals";
import { approveRecurringReferral, qualifyRecurringReferral } from "../lib/referral-reward-policy";
import { referralOnboardingEligible, REFERRAL_ONBOARDING_WINDOW_MS } from "../lib/referral-eligibility";
import { reviewSubscriptionReferralPayment } from "../lib/referral-payment-review";
// Keep explicit historical v2 fixtures: new signups now use lifetime v3 terms.
async function registerReferralForNewUser(...args: Parameters<typeof registerNewReferral>) {
 const referral = await registerNewReferral(...args);
 if (referral) await args[0].referral.update({where:{id:referral.id},data:{rewardPolicy:{version:2,amount:100,coolingDays:7,plans:["half_yearly","yearly","yearly_plus"]}}});
 return referral;
}
async function main(){
 assert.match(process.env.DATABASE_URL||"", /127\.0\.0\.1:55452\/referral_fixture/,"Only the isolated referral database is allowed.");
 await prisma.growthRewardPolicy.create({data:{id:1,artistCredit:100,coolingDays:7}});
 const account=async(name:string)=>prisma.user.create({data:{name,email:`${name}@fixture.invalid`,googleId:name,referralCode:name.toUpperCase()}});
 const owner=await account("owner"), friend=await account("friend"),third=await account("third");
 const now=Date.now();const eligible={createdAt:new Date(now-1000),referredById:null,checkoutOrders:0,distributionOrders:0,subscriptionPayments:0};
 assert.ok(referralOnboardingEligible(eligible,now));assert.ok(!referralOnboardingEligible({...eligible,createdAt:new Date(now-REFERRAL_ONBOARDING_WINDOW_MS-1)},now));assert.ok(!referralOnboardingEligible({...eligible,subscriptionPayments:1},now));assert.ok(!referralOnboardingEligible({...eligible,checkoutOrders:1},now));
 await assert.rejects(prisma.$transaction(tx=>registerReferralForNewUser(tx,{referredUserId:owner.id,referredEmail:owner.email,referralCode:owner.referralCode})),/own referral/);
 const referral=await prisma.$transaction(tx=>registerReferralForNewUser(tx,{referredUserId:friend.id,referredEmail:friend.email,referralCode:owner.referralCode}));assert.ok(referral);
 await assert.rejects(prisma.$transaction(tx=>registerReferralForNewUser(tx,{referredUserId:friend.id,referredEmail:friend.email,referralCode:third.referralCode})),/already/);
 await prisma.$transaction(tx=>registerReferralForNewUser(tx,{referredUserId:third.id,referredEmail:third.email,referralCode:friend.referralCode}));
 await assert.rejects(prisma.$transaction(tx=>registerReferralForNewUser(tx,{referredUserId:owner.id,referredEmail:owner.email,referralCode:third.referralCode})),/Circular/);
 const sub=await prisma.subscription.create({data:{userId:friend.id,plan:"yearly",planName:"Yearly",expiryDate:new Date(now+86400000),status:"active"}});
 const payment=await prisma.subscriptionPayment.create({data:{subscriptionId:sub.id,razorpayPaymentId:"payment-fixture",amount:100000,status:"captured"}});
 await qualifyRecurringReferral(payment.id);await qualifyRecurringReferral(payment.id);
 assert.equal((await prisma.referral.findUniqueOrThrow({where:{id:referral!.id}})).status,"QUALIFIED");
 await assert.rejects(approveRecurringReferral(referral!.id,null,"fixture admin approval"),/verification period/);
 await prisma.referral.update({where:{id:referral!.id},data:{qualifiedAt:new Date(now-8*86400000)}});
 await prisma.growthRewardPolicy.update({where:{id:1},data:{artistCredit:500}});
 const results=await Promise.allSettled([approveRecurringReferral(referral!.id,null,"fixture approval one"),approveRecurringReferral(referral!.id,null,"fixture approval two")]);assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:owner.id}})).referralCredits,100,"Signup policy snapshot is retained.");assert.equal(await prisma.creditLedgerEntry.count({where:{sourceId:String(referral!.id),type:"REFERRAL_REWARD"}}),1);
 const payload={id:"partial-refund-event",event:"refund.processed",payload:{payment:{entity:{id:payment.razorpayPaymentId,amount:100000,status:"captured"}},refund:{entity:{id:"partial-refund",payment_id:payment.razorpayPaymentId,amount:10000}}}};
 const webhook=await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)),payload);assert.equal(webhook.amountMinor,10000,"Refund amount must come from the refund, not the attached original payment.");await processRazorpayEvent(webhook.id);await processRazorpayEvent(webhook.id);
 assert.equal((await prisma.referral.findUniqueOrThrow({where:{id:referral!.id}})).riskStatus,"review_required");
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:owner.id}})).referralCredits,100,"A partial refund cannot silently reverse the full reward.");
 await prisma.$transaction(tx=>reviewSubscriptionReferralPayment(tx,{id:2,paymentId:payment.razorpayPaymentId,eventType:"refund.processed",amountMinor:100000}));
 await prisma.$transaction(tx=>reviewSubscriptionReferralPayment(tx,{id:2,paymentId:payment.razorpayPaymentId,eventType:"refund.processed",amountMinor:100000}));
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:owner.id}})).referralCredits,0);
 assert.equal(await prisma.creditLedgerEntry.count({where:{sourceId:String(referral!.id),type:"REFERRAL_REVERSAL",userId:owner.id}}),1);
 const reversal=await prisma.creditLedgerEntry.findFirstOrThrow({where:{sourceId:String(referral!.id),type:"REFERRAL_REVERSAL",userId:owner.id}});assert.equal(reversal.bucket,"HYMN_CREDIT");
 // A second referral exercises refund-before-approval and spent-credit review.
 const sub2=await prisma.subscription.create({data:{userId:third.id,plan:"yearly",planName:"Yearly",expiryDate:new Date(now+86400000),status:"active"}});
 const pay2=await prisma.subscriptionPayment.create({data:{subscriptionId:sub2.id,razorpayPaymentId:"payment-fixture-2",amount:100000,status:"captured"}});
 const recovery=await reconcileReferralQualifications();assert.ok(recovery.checked>=1,"Missed qualification is recovered without growth analytics.");
 await prisma.$transaction(tx=>reviewSubscriptionReferralPayment(tx,{id:3,paymentId:pay2.razorpayPaymentId,eventType:"refund.processed",amountMinor:100000}));
 const other=await prisma.referral.findFirstOrThrow({where:{endedAt:null,referredUserId:third.id}});assert.equal(other.status,"REJECTED");await assert.rejects(approveRecurringReferral(other.id,null,"fixture invalid approval"));
 await prisma.referral.update({where:{id:other.id},data:{status:"REWARDED",earnings:100,referredReward:0}});
 const review=await prisma.$transaction(tx=>reverseReferralForTransactionInTransaction(tx,{transactionType:"subscription_payment",transactionId:pay2.id,reason:"refunded"}));assert.equal(review.reviewRequired,true);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:friend.id}})).referralCredits,0);
 await prisma.$transaction(tx=>reverseReferralForTransactionInTransaction(tx,{transactionType:"subscription_payment",transactionId:pay2.id,reason:"refunded"}));
 assert.equal(await prisma.fraudAlert.count({where:{entityType:"referral",entityId:String(other.id)}}),1,"Duplicate reversals must not duplicate fraud alerts.");
 const legacyOwner=await account("legacyowner"),legacyFriend=await account("legacyfriend");
 const legacy=await prisma.$transaction(tx=>registerReferralForNewUser(tx,{referredUserId:legacyFriend.id,referredEmail:legacyFriend.email,referralCode:legacyOwner.referralCode}));
 await prisma.referral.update({where:{id:legacy!.id},data:{rewardPolicy:Prisma.DbNull}});
 const purchase={referredUserId:legacyFriend.id,transactionType:"checkout_order" as const,transactionId:9001,paymentId:"legacy-payment",paidAmountInr:100,source:"isolated-fixture"};
 assert.equal((await prisma.$transaction(tx=>qualifyReferralInTransaction(tx,{...purchase,test:true}))).qualified,false);
 assert.equal((await prisma.$transaction(tx=>qualifyReferralInTransaction(tx,purchase))).qualified,true);
 assert.equal((await prisma.$transaction(tx=>qualifyReferralInTransaction(tx,purchase))).qualified,false);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:legacyOwner.id}})).referralCredits,5);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:legacyFriend.id}})).referralCredits,3);
 await prisma.$transaction(tx=>reverseReferralForTransactionInTransaction(tx,{transactionType:"checkout_order",transactionId:9001,reason:"refunded"}));
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:legacyOwner.id}})).referralCredits,0);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:legacyFriend.id}})).referralCredits,0);
 console.log("Referral verification passed: eligibility window, subscription lockout, self/duplicate/circular attribution, purchase qualification, policy snapshot, cooling period, concurrent approval, partial/full/duplicate refunds, pending rejection, and spent-credit review.");
}
main().finally(()=>prisma.$disconnect());
