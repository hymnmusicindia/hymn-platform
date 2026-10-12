import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
async function main() {
  assert.match(process.env.DATABASE_URL || "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55452\/referral_fixture$/, "Migration test is restricted to the disposable local fixture.");
  const owner = await prisma.user.create({ data: { name: "Migration owner", email: "migration-owner@fixture.invalid", googleId: "migration-owner" } });
  const friend = await prisma.user.create({ data: { name: "Migration friend", email: "migration-friend@fixture.invalid", googleId: "migration-friend" } });
  const oldPolicy = { version: 2, amount: 100, coolingDays: 7, plans: ["half_yearly", "yearly", "yearly_plus"] };
  const previous = await prisma.referral.create({ data: { userId: owner.id, referredUserId: friend.id, referralCode: "MIGRATION", signupEmail: friend.email, rewardPolicy: oldPolicy, status: "REWARDED", earnings: 100 } });
  // Start from the pre-change database structure, then run the actual release
  // SQL rather than relying only on Prisma db push for migration coverage.
  for (const sql of ["DROP TABLE referral_messages", "DROP TABLE referral_mail_jobs", "ALTER TABLE referrals DROP COLUMN owner_read_at, DROP COLUMN follower_read_at, DROP COLUMN owner_blocked, DROP COLUMN follower_blocked", "DROP TABLE referral_commission_payouts", "DROP TABLE referral_commissions", "DROP TABLE referral_program", "ALTER TABLE subscription_payments DROP COLUMN plan_snapshot", "ALTER TABLE referrals DROP COLUMN commission_rates"]) await prisma.$executeRawUnsafe(sql);
  const sql = readFileSync("prisma/migrations/20261012130000_lifetime_referral_commissions/migration.sql", "utf8");
  for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  assert.equal(await prisma.referralProgram.count(), 1);
  assert.ok((await prisma.referralProgram.findUniqueOrThrow({ where: { id: 1 }, select: { effectiveAt: true } })).effectiveAt.getTime() <= Date.now() + 1000, "Launch time is UTC even when PostgreSQL runs in Asia/Calcutta.");
  assert.equal(await prisma.referralCommission.count(), 0);
  const migrated = await prisma.referral.findUniqueOrThrow({ where: { id: previous.id }, select: { rewardPolicy: true, earnings: true, status: true, commissionRates: true } });
  assert.deepEqual(migrated.rewardPolicy, oldPolicy); assert.equal(migrated.earnings, 100); assert.equal(migrated.status, "REWARDED");
  assert.deepEqual(migrated.commissionRates, { one_time: 1000, half_yearly: 800, yearly: 700, yearly_plus: 500, beats: 2000, studio: 1500 }, "Existing referrals receive locked lifetime rates without changing old promises.");
  const next = readFileSync("prisma/migrations/20261012160000_referral_network_and_conversations/migration.sql", "utf8");
  for (const statement of next.split(";").map(value => value.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  assert.ok((await prisma.referralProgram.findUniqueOrThrow({ where: { id: 1 } })).networkEffectiveAt);
  console.log("PASS actual lifetime referral migration SQL, launch timestamp and ledger constraints on isolated database.");
}
main().finally(() => prisma.$disconnect());
