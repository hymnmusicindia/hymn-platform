import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {previewReferral,approveReferral} from "../lib/referral-consent";
import { prisma } from "../lib/prisma";
import { createPasswordUser, upsertGoogleUser } from "../lib/db";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:55452\/referral_fixture/);
  const suffix = randomUUID().replaceAll("-", "");
  const owner = await prisma.user.create({ data: { name: "Inviter", email: `owner-${suffix}@fixture.invalid`, googleId: `owner-${suffix}`, referralCode: `AUTH${suffix}`.toUpperCase() } });
  const transaction = prisma.$transaction.bind(prisma);
  // Insert real database latency into the actual signup transaction, rather
  // than testing a separate transaction with different timeout options.
  prisma.$transaction = ((callback: unknown, options: unknown) => transaction(async tx => {
    await tx.$queryRaw`SELECT pg_sleep(5.5)::text`;
    return (callback as (client: typeof tx) => Promise<unknown>)(tx);
  }, options as { timeout: number; maxWait: number })) as typeof prisma.$transaction;
  try {
    const password = await createPasswordUser({ name: "Password invitee", email: `password-${suffix}@fixture.invalid`, passwordHash: "fixture-only", role: "customer", referralCode: owner.referralCode! });
    const google = await upsertGoogleUser({ name: "Google invitee", email: `google-${suffix}@fixture.invalid`, googleId: `google-${suffix}`, referralCode: owner.referralCode! });
    for (const user of [password, google]) {
      assert.ok(user);
      assert.equal(await prisma.referral.count({where:{referredUserId:user.id}}),0,"Signup waits for explicit customer approval.");
      const offer=await previewReferral(user.id,owner.referralCode!);
      await prisma.$transaction(tx=>approveReferral(tx,user.id,offer.proof),{timeout:30000});
      assert.equal(await prisma.referralMailJob.count({where:{userId:user.id}}),1);
    }
    const again = await upsertGoogleUser({ name: "Google invitee", email: `google-${suffix}@fixture.invalid`, googleId: `google-${suffix}`, referralCode: owner.referralCode! });
    assert.equal(again?.id, google?.id);
    assert.equal(await prisma.referral.count({ where: { userId: owner.id } }), 2, "Repeated login does not duplicate attribution.");
    assert.equal(await prisma.referralMailJob.count({ where: { userId: owner.id } }), 2, "Repeated login does not duplicate acceptance mail.");
    console.log("Password signup, Google signup and repeat login survive >5 seconds of database latency; explicit post-login approval and email queue remain atomic.");
  } finally {
    prisma.$transaction = transaction as typeof prisma.$transaction;
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
