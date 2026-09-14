import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { registerReferralForNewUser, qualifyReferralInTransaction } from "../lib/referrals";
import { approveRecurringReferral, qualifyRecurringReferral } from "../lib/referral-reward-policy";

async function main() {
  const target = new URL(process.env.DATABASE_URL || "");
  assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.pathname, "/growth_fixture", "Tests require the isolated fixture database.");
  const user = (name: string) => prisma.user.create({ data: { name, email: `${name}@growth.invalid`, googleId: name, referralCode: name.toUpperCase() } });
  const owner = await user("owner"); const recipient = await user("recipient");
  const referral = await prisma.$transaction(tx => registerReferralForNewUser(tx, { referredUserId: recipient.id, referredEmail: recipient.email, referralCode: owner.referralCode }));
  assert.ok(referral); assert.equal((referral.rewardPolicy as { amount: number }).amount, 100);
  const quick = await prisma.$transaction(tx => qualifyReferralInTransaction(tx, { referredUserId: recipient.id, transactionType: "distribution_order", transactionId: "quick", paymentId: "pay_quick", paidAmountInr: 99, source: "test" }));
  assert.equal(quick.qualified, false); assert.equal(await prisma.creditLedgerEntry.count(), 0);
  await assert.rejects(prisma.$transaction(tx => registerReferralForNewUser(tx, { referredUserId: owner.id, referredEmail: owner.email, referralCode: owner.referralCode })), /own referral/);
  const subscription = await prisma.subscription.create({ data: { userId: recipient.id, plan: "yearly", expiryDate: new Date(Date.now() + 365 * 86400000) } });
  const payment = await prisma.subscriptionPayment.create({ data: { subscriptionId: subscription.id, razorpayPaymentId: "pay_subscription", amount: 109900, status: "authorized" } });
  await qualifyRecurringReferral(payment.id); assert.equal((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).status, "PENDING");
  await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: "captured" } });
  await Promise.all([qualifyRecurringReferral(payment.id), qualifyRecurringReferral(payment.id)]);
  assert.equal((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).status, "QUALIFIED");
  await assert.rejects(approveRecurringReferral(referral.id, owner.id, "Fixture approval"), /verification period/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).referralCredits, 0);
  await prisma.referral.update({ where: { id: referral.id }, data: { qualifiedAt: new Date(Date.now() - 8 * 86400000) } });
  await prisma.growthRewardPolicy.update({ where: { id: 1 }, data: { artistCredit: 200 } });
  await approveRecurringReferral(referral.id, owner.id, "Fixture approval");
  await assert.rejects(approveRecurringReferral(referral.id, owner.id, "Duplicate approval"));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).referralCredits, 100, "Policy changes must not alter promised rewards.");
  assert.equal(await prisma.creditLedgerEntry.count(), 1);
  assert.equal((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).referredReward, 0);
  await prisma.growthEvent.createMany({ data: [{ key: "event-once", event: "payment_success", source: "server" }], skipDuplicates: true });
  await prisma.growthEvent.createMany({ data: [{ key: "event-once", event: "payment_success", source: "server" }], skipDuplicates: true });
  assert.equal(await prisma.growthEvent.count(), 1);
  const lead = await prisma.growthLead.create({ data: { kind: "contact", name: "Anonymous", email: "lead@growth.invalid", interest: "Distribution", message: "Please help with distribution" } });
  assert.equal(lead.userId, null);
  console.log("Isolated PostgreSQL: reward policy snapshots, recurring-only qualification, cooling period, duplicate approval, credit ledger and anonymous lead persistence passed.");
}
main().finally(() => prisma.$disconnect());
