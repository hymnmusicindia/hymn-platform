import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { completeCheckoutOrder, createOrder } from "../lib/db";
import { registerReferralForNewUser } from "../lib/referrals";

async function main() {
  assert.match(process.env.DATABASE_URL ?? "", /^postgres(?:ql)?:\/\//i, "Referral integration requires PostgreSQL.");
  const suffix = Date.now().toString(36).toUpperCase();
  const [referrer, referred, producer] = await Promise.all([
    prisma.user.create({ data: { googleId: `ref-owner-${suffix}`, name: "Referral Owner", email: `owner-${suffix}@referral.invalid`, referralCode: `OWNER${suffix}`.slice(0, 20) } }),
    prisma.user.create({ data: { googleId: `ref-friend-${suffix}`, name: "Referral Friend", email: `friend-${suffix}@referral.invalid`, referralCode: `FRIEND${suffix}`.slice(0, 20) } }),
    prisma.user.create({ data: { googleId: `ref-producer-${suffix}`, name: "Referral Producer", email: `producer-${suffix}@referral.invalid`, referralCode: `PROD${suffix}`.slice(0, 20) } })
  ]);
  await prisma.$transaction(tx => registerReferralForNewUser(tx, { referredUserId: referred.id, referredEmail: referred.email, referralCode: referrer.referralCode }));
  const upload = await prisma.upload.create({ data: { userId: producer.id, kind: "AUDIO", storageKey: `referrals/${suffix}`, fileName: "test.mp3", mimeType: "audio/mpeg", sizeBytes: 1 } });
  const beat = await prisma.beat.create({ data: { userId: producer.id, title: "Referral Test Beat", bpm: 100, genre: "test", mood: "test", keySignature: "C", priceCents: 1000, audioUploadId: upload.id } });
  const razorpayOrderId = `referral_order_${suffix}`; const paymentId = `referral_pay_${suffix}`;
  await createOrder({ userId: referred.id, productId: "beatstore", originalPrice: 10, discountApplied: 0, referralCreditsUsed: 0, finalAmount: 10, couponCode: null, razorpayOrderId, amount: 10, paymentStatus: "created", items: [{ beatId: beat.id, licenseType: "basic", price: 10 }] });

  const concurrent = await Promise.allSettled([completeCheckoutOrder(razorpayOrderId, paymentId), completeCheckoutOrder(razorpayOrderId, paymentId)]);
  assert.ok(concurrent.some(result => result.status === "fulfilled"), "At least one concurrent delivery must succeed.");
  await completeCheckoutOrder(razorpayOrderId, paymentId);

  const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referred.id } });
  assert.equal(referral.status, "REWARDED"); assert.equal(referral.earnings, 5); assert.equal(referral.referredReward, 3);
  assert.equal(await prisma.creditLedgerEntry.count({ where: { sourceType: "referral", sourceId: String(referral.id) } }), 2, "Duplicate fulfillment must not duplicate rewards.");
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })).referralCredits, 5);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).referralCredits, 3);
  console.log("Referral A→B→payment→reward duplicate-delivery verification passed.");
}

main().finally(() => prisma.$disconnect());
